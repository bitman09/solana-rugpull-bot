import { connection, wallet, payer } from "../config";
import {
	PublicKey,
	VersionedTransaction,
	TransactionInstruction,
	TransactionMessage,
	SystemProgram,
	Keypair,
	LAMPORTS_PER_SOL,
	AddressLookupTableAccount,
} from "@solana/web3.js";
import { loadKeypairs } from "./createKeys";
import { searcherClient } from "./clients/jito";
import { Bundle as JitoBundle } from "jito-ts/dist/sdk/block-engine/types.js";
import promptSync from "prompt-sync";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import bs58 from "bs58";
import path from "path";
import fs from "fs";
import { getRandomTipAccount } from "./clients/config";
import BN from "bn.js";
import axios from "axios";
import type { Global } from "@pump-fun/pump-sdk";
import { PUMP_SDK, OnlinePumpSdk, bondingCurvePda } from "@pump-fun/pump-sdk";

const prompt = promptSync();
const keyInfoPath = path.join(__dirname, "keyInfo.json");

export async function buyBundle() {
	const onlineSdk = new OnlinePumpSdk(connection);

	// Start create bundle
	const bundledTxns: VersionedTransaction[] = [];
	const keypairs: Keypair[] = loadKeypairs();

	let keyInfo: { [key: string]: any } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	const lut = new PublicKey(keyInfo.addressLUT.toString());

	const lookupTableAccount = (await connection.getAddressLookupTable(lut)).value;

	if (lookupTableAccount == null) {
		console.log("Lookup table account not found!");
		process.exit(0);
	}

	// -------- step 1: ask nessesary questions for pool build --------
	const name = prompt("Name of your token: ");
	const symbol = prompt("Symbol of your token: ");
	const description = prompt("Description of your token: ");
	const twitter = prompt("Twitter of your token: ");
	const telegram = prompt("Telegram of your token: ");
	const website = prompt("Website of your token: ");
	const tipAmt = +prompt("Jito tip in SOL: ") * LAMPORTS_PER_SOL;

	// -------- step 2: build pool init + dev snipe --------
	const files = await fs.promises.readdir("./img");
	// if (files.length == 0) {
	// 	console.log("No image found in the img folder");
	// 	return;
	// }
	// if (files.length > 1) {
	// 	console.log("Multiple images found in the img folder, please only keep one image");
	// 	return;
	// }
	const data: Buffer = fs.readFileSync(`./img/${files[0]}`);

	let formData = new FormData();
	if (data) {
		formData.append("file", new Blob([new Uint8Array(data)], { type: "image/jpeg" }));
	} else {
		console.log("No image found");
		return;
	}

	formData.append("name", name);
	formData.append("symbol", symbol);
	formData.append("description", description);
	formData.append("twitter", twitter);
	formData.append("telegram", telegram);
	formData.append("website", website);
	formData.append("showName", "true");

	let metadata_uri;
	try {
		const response = await axios.post("https://pump.fun/api/ipfs", formData, {
			headers: {
				"Content-Type": "multipart/form-data",
			},
		});
		metadata_uri = response.data.metadataUri;
		console.log("Metadata URI: ", metadata_uri);
	} catch (error) {
		console.error("Error uploading metadata:", error);
	}

	if (!metadata_uri) {
		console.log("Missing metadata URI; aborting.");
		return;
	}

	const mintKp = Keypair.fromSecretKey(Uint8Array.from(bs58.decode(keyInfo.mintPk)));
	console.log(`Mint: ${mintKp.publicKey.toBase58()}`);

	const globalState = await onlineSdk.fetchGlobal();

	const keypairInfo = keyInfo[wallet.publicKey.toString()];
	if (!keypairInfo) {
		console.log(`No key info found for dev wallet: ${wallet.publicKey.toString()}`);
		return;
	}

	const amount = new BN(keypairInfo.tokenAmount);
	const solAmount = new BN(100000 * keypairInfo.solAmount * LAMPORTS_PER_SOL);

	const createAndBuyIxs = await PUMP_SDK.createAndBuyInstructions({
		global: globalState,
		mint: mintKp.publicKey,
		name,
		symbol,
		uri: metadata_uri,
		creator: wallet.publicKey,
		user: wallet.publicKey,
		amount,
		solAmount,
	});

	const tipIxn = SystemProgram.transfer({
		fromPubkey: wallet.publicKey,
		toPubkey: getRandomTipAccount(),
		lamports: BigInt(tipAmt),
	});

	const initIxs: TransactionInstruction[] = [...createAndBuyIxs, tipIxn];

	const { blockhash } = await connection.getLatestBlockhash();

	const messageV0 = new TransactionMessage({
		payerKey: wallet.publicKey,
		instructions: initIxs,
		recentBlockhash: blockhash,
	}).compileToV0Message();

	const fullTX = new VersionedTransaction(messageV0);
	fullTX.sign([wallet, mintKp]);

	bundledTxns.push(fullTX);

	// -------- step 3: create swap txns --------
	const txMainSwaps: VersionedTransaction[] = await createWalletSwaps(
		blockhash,
		keypairs,
		lookupTableAccount,
		mintKp.publicKey,
		globalState
	);
	bundledTxns.push(...txMainSwaps);

	// -------- step 4: send bundle --------
	/*
        // Simulate each transaction
        for (const tx of bundledTxns) {
            try {
                const simulationResult = await connection.simulateTransaction(tx, { commitment: "processed" });
                console.log(simulationResult);

                if (simulationResult.value.err) {
                    console.error("Simulation error for transaction:", simulationResult.value.err);
                } else {
                    console.log("Simulation success for transaction. Logs:");
                    simulationResult.value.logs?.forEach(log => console.log(log));
                }
            } catch (error) {
                console.error("Error during simulation:", error);
            }
        }
        */

	await sendBundle(bundledTxns);
}

async function createWalletSwaps(
	blockhash: string,
	keypairs: Keypair[],
	lut: AddressLookupTableAccount,
	mint: PublicKey,
	globalState: Global
): Promise<VersionedTransaction[]> {
	const txsSigned: VersionedTransaction[] = [];
	const chunkedKeypairs = chunkArray(keypairs, 6);

	let keyInfo: { [key: string]: { solAmount: number; tokenAmount: string; percentSupply: number } } = {};
	if (fs.existsSync(keyInfoPath)) {
		const existingData = fs.readFileSync(keyInfoPath, "utf-8");
		keyInfo = JSON.parse(existingData);
	}

	const bondingCurvePk = bondingCurvePda(mint);
	const bondingCurveAccountInfo = await connection.getAccountInfo(bondingCurvePk);
	if (!bondingCurveAccountInfo) {
		console.log("Bonding curve account not found for mint.");
		return txsSigned;
	}
	const bondingCurve = PUMP_SDK.decodeBondingCurve(bondingCurveAccountInfo);

	for (let chunkIndex = 0; chunkIndex < chunkedKeypairs.length; chunkIndex++) {
		const chunk = chunkedKeypairs[chunkIndex];
		const instructionsForChunk: TransactionInstruction[] = [];

		for (let i = 0; i < chunk.length; i++) {
			const keypair = chunk[i];
			console.log(`Processing keypair ${i + 1}/${chunk.length}:`, keypair.publicKey.toString());

			const keypairInfo = keyInfo[keypair.publicKey.toString()];
			if (!keypairInfo) {
				console.log(`No key info found for keypair: ${keypair.publicKey.toString()}`);
				continue;
			}

			const amount = new BN(keypairInfo.tokenAmount);
			const solAmount = new BN(100000 * keypairInfo.solAmount * LAMPORTS_PER_SOL);

			const associatedUser = getAssociatedTokenAddressSync(mint, keypair.publicKey, true, TOKEN_PROGRAM_ID);
			const associatedUserAccountInfo = await connection.getAccountInfo(associatedUser);

			const buyIxs = await PUMP_SDK.buyInstructions({
				global: globalState,
				bondingCurveAccountInfo,
				bondingCurve,
				associatedUserAccountInfo,
				mint,
				user: keypair.publicKey,
				amount,
				solAmount,
				slippage: 1,
				tokenProgram: TOKEN_PROGRAM_ID,
			});

			instructionsForChunk.push(...buyIxs);
		}

		if (instructionsForChunk.length === 0) {
			continue;
		}

		const message = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: instructionsForChunk,
		}).compileToV0Message([lut]);

		const versionedTx = new VersionedTransaction(message);
		const serializedMsg = versionedTx.serialize();
		console.log("Txn size:", serializedMsg.length);
		if (serializedMsg.length > 1232) {
			console.log("tx too big");
		}

		console.log(
			"Signing transaction with chunk signers",
			chunk.map((kp) => kp.publicKey.toString())
		);

		versionedTx.sign([payer, ...chunk]);
		txsSigned.push(versionedTx);
	}

	return txsSigned;
}

function chunkArray<T>(array: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(array.length / size) }, (v, i) => array.slice(i * size, i * size + size));
}

export async function sendBundle(bundledTxns: VersionedTransaction[]) {
	/*
    // Simulate each transaction
    for (const tx of bundledTxns) {
        try {
            const simulationResult = await connection.simulateTransaction(tx, { commitment: "processed" });

            if (simulationResult.value.err) {
                console.error("Simulation error for transaction:", simulationResult.value.err);
            } else {
                console.log("Simulation success for transaction. Logs:");
                simulationResult.value.logs?.forEach(log => console.log(log));
            }
        } catch (error) {
            console.error("Error during simulation:", error);
        }
    }
    //*/

	try {
		const bundleId = await searcherClient.sendBundle(new JitoBundle(bundledTxns, bundledTxns.length));
		console.log(`Bundle ${bundleId} sent.`);

		///*
		// Assuming onBundleResult returns a Promise<BundleResult>
		const result = await new Promise((resolve, reject) => {
			searcherClient.onBundleResult(
				(result) => {
					console.log("Received bundle result:", result);
					resolve(result); // Resolve the promise with the result
				},
				(e: Error) => {
					console.error("Error receiving bundle result:", e);
					reject(e); // Reject the promise if there's an error
				}
			);
		});

		console.log("Result:", result);
		//*/
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
