import { connection, wallet, payer } from "../config";
import {
	PublicKey,
	VersionedTransaction,
	TransactionMessage,
	SystemProgram,
	Keypair,
	LAMPORTS_PER_SOL,
	TransactionInstruction,
} from "@solana/web3.js";
import { loadKeypairs } from "./createKeys";
import { searcherClient } from "./clients/jito";
import { Bundle as JitoBundle } from "jito-ts/dist/sdk/block-engine/types.js";
import promptSync from "prompt-sync";
import * as spl from "@solana/spl-token";
import path from "path";
import fs from "fs";
import { randomInt } from "crypto";
import { getRandomTipAccount } from "./clients/config";
import BN from "bn.js";
import {
	OnlinePumpAmmSdk,
	PUMP_AMM_SDK,
	canonicalPumpPoolPda,
} from "@pump-fun/pump-swap-sdk";

const prompt = promptSync();
const keyInfoPath = path.join(__dirname, "keyInfo.json");
const SLIPPAGE_PERCENT = 1;

function chunkArray<T>(array: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(array.length / size) }, (v, i) =>
		array.slice(i * size, i * size + size)
	);
}

async function sendBundle(bundledTxns: VersionedTransaction[]) {
	try {
		const bundleId = await searcherClient.sendBundle(
			new JitoBundle(bundledTxns, bundledTxns.length)
		);
		console.log(`Bundle ${bundleId} sent.`);
	} catch (error) {
		const err = error as any;
		console.error("Error sending bundle:", err.message);

		if (err?.message?.includes("Bundle Dropped, no connected leader up soon")) {
			console.error("Error sending bundle: Bundle Dropped, no connected leader up soon.");
		} else {
			console.error("An unexpected error occurred:", err.message);
		}
	}
}

/**
 * Sell a percentage of holdings after the token has migrated to Pump Swap
 * (canonical pool for this mint).
 */
export async function sellXPercentagePumpSwap() {
	const bundledTxns: VersionedTransaction[] = [];
	const keypairs = loadKeypairs();

	let poolInfo: { [key: string]: any } = {};
	if (fs.existsSync(keyInfoPath)) {
		const data = fs.readFileSync(keyInfoPath, "utf-8");
		poolInfo = JSON.parse(data);
	}

	const lut = new PublicKey(poolInfo.addressLUT.toString());
	const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;

	if (lookupTableAccount == null) {
		console.log("Lookup table account not found!");
		process.exit(0);
	}

	const mintPk = new PublicKey(poolInfo.mint);
	const poolKey = canonicalPumpPoolPda(mintPk);
	const ammOnline = new OnlinePumpAmmSdk(connection);

	let pool;
	try {
		pool = await ammOnline.fetchPool(poolKey);
	} catch {
		console.log("Pump Swap pool not found for this mint. Confirm the token has migrated.");
		return;
	}

	const supplyPercent = +prompt("Percentage to sell (Ex. 1 for 1%): ") / 100;
	const jitoTipAmt = +prompt("Jito tip in Sol (Ex. 0.01): ") * LAMPORTS_PER_SOL;

	if (supplyPercent > 0.25) {
		console.log("You cannot sell over 25% at a time.");
		console.log("The price impact is too high.");
		return;
	}

	const mintInfo = await connection.getTokenSupply(mintPk);

	let sellTotalAmount = 0;
	const chunkedKeypairs = chunkArray(keypairs, 6);
	const PayerTokenATA = await spl.getAssociatedTokenAddress(mintPk, payer.publicKey);
	const PayerwSolATA = await spl.getAssociatedTokenAddress(spl.NATIVE_MINT, payer.publicKey);

	const { blockhash } = await connection.getLatestBlockhash();

	for (let chunkIndex = 0; chunkIndex < chunkedKeypairs.length; chunkIndex++) {
		const chunk = chunkedKeypairs[chunkIndex];
		const instructionsForChunk: TransactionInstruction[] = [];
		const isFirstChunk = chunkIndex === 0;

		if (isFirstChunk) {
			const transferAmount = await getSellBalance(wallet, mintPk, supplyPercent);
			sellTotalAmount += transferAmount;
			console.log(`Sending ${transferAmount / 1e6} from dev wallet.`);

			const ataIx = spl.createAssociatedTokenAccountIdempotentInstruction(
				payer.publicKey,
				PayerTokenATA,
				payer.publicKey,
				mintPk
			);

			const TokenATA = await spl.getAssociatedTokenAddress(mintPk, wallet.publicKey);
			const transferIx = spl.createTransferInstruction(
				TokenATA,
				PayerTokenATA,
				wallet.publicKey,
				transferAmount
			);

			instructionsForChunk.push(ataIx, transferIx);
		}

		for (const keypair of chunk) {
			const transferAmount = await getSellBalance(keypair, mintPk, supplyPercent);
			sellTotalAmount += transferAmount;
			console.log(`Sending ${transferAmount / 1e6} from ${keypair.publicKey.toString()}.`);

			const TokenATA = await spl.getAssociatedTokenAddress(mintPk, keypair.publicKey);
			const transferIx = spl.createTransferInstruction(
				TokenATA,
				PayerTokenATA,
				keypair.publicKey,
				transferAmount
			);
			instructionsForChunk.push(transferIx);
		}

		if (instructionsForChunk.length > 0) {
			const message = new TransactionMessage({
				payerKey: payer.publicKey,
				recentBlockhash: blockhash,
				instructions: instructionsForChunk,
			}).compileToV0Message([lookupTableAccount]);

			const versionedTx = new VersionedTransaction(message);
			const serializedMsg = versionedTx.serialize();
			console.log("Txn size:", serializedMsg.length);
			if (serializedMsg.length > 1232) {
				console.log("tx too big");
			}

			versionedTx.sign([payer]);
			if (isFirstChunk) {
				versionedTx.sign([wallet]);
			}
			for (const keypair of chunk) {
				versionedTx.sign([keypair]);
			}

			bundledTxns.push(versionedTx);
		}
	}

	const payerNum = randomInt(0, 24);
	const payerKey = keypairs[payerNum];
	const sellPayerIxs: TransactionInstruction[] = [];

	console.log(`TOTAL: Selling ${sellTotalAmount / 1e6}.`);

	if (+mintInfo.value.amount * 0.25 <= sellTotalAmount) {
		console.log("Price impact too high.");
		console.log("Cannot sell more than 25% of supply at a time.");
		return;
	}

	let userBaseAta: PublicKey;
	let userQuoteAta: PublicKey;
	if (pool.baseMint.equals(mintPk)) {
		userBaseAta = PayerTokenATA;
		userQuoteAta = PayerwSolATA;
	} else if (pool.quoteMint.equals(mintPk)) {
		userBaseAta = PayerwSolATA;
		userQuoteAta = PayerTokenATA;
	} else {
		console.log("Canonical Pump Swap pool does not list this mint as base or quote.");
		return;
	}

	const swapState = await ammOnline.swapSolanaState(
		poolKey,
		payer.publicKey,
		userBaseAta,
		userQuoteAta
	);

	const sellAmountBn = new BN(sellTotalAmount);
	let swapIxs: TransactionInstruction[];
	if (pool.baseMint.equals(mintPk)) {
		swapIxs = await PUMP_AMM_SDK.sellBaseInput(swapState, sellAmountBn, SLIPPAGE_PERCENT);
	} else {
		swapIxs = await PUMP_AMM_SDK.buyQuoteInput(swapState, sellAmountBn, SLIPPAGE_PERCENT);
	}

	sellPayerIxs.push(
		spl.createAssociatedTokenAccountIdempotentInstruction(
			payer.publicKey,
			PayerwSolATA,
			payer.publicKey,
			spl.NATIVE_MINT
		),
		...swapIxs,
		SystemProgram.transfer({
			fromPubkey: payer.publicKey,
			toPubkey: getRandomTipAccount(),
			lamports: BigInt(jitoTipAmt),
		})
	);

	const sellMessage = new TransactionMessage({
		payerKey: payerKey.publicKey,
		recentBlockhash: blockhash,
		instructions: sellPayerIxs,
	}).compileToV0Message([lookupTableAccount]);

	const sellTx = new VersionedTransaction(sellMessage);
	const serializedMsg = sellTx.serialize();
	console.log("Txn size:", serializedMsg.length);
	if (serializedMsg.length > 1232) {
		console.log("tx too big");
	}

	sellTx.sign([payer, payerKey]);
	bundledTxns.push(sellTx);

	await sendBundle(bundledTxns);
}

async function getSellBalance(keypair: Keypair, mint: PublicKey, supplyPercent: number) {
	let amount;
	try {
		const tokenAccountPubKey = spl.getAssociatedTokenAddressSync(mint, keypair.publicKey);
		const balance = await connection.getTokenAccountBalance(tokenAccountPubKey);
		amount = Math.floor(Number(balance.value.amount) * supplyPercent);
	} catch {
		amount = 0;
	}
	return amount;
}
