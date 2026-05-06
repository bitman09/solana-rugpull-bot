import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

function keypairFromEnv(name: string, value: string | undefined): Keypair {
	const trimmed = (value ?? "").trim();
	if (!trimmed) {
		throw new Error(
			`Missing ${name} in .env (or dotenv did not load). Put ${name}=... in .env at the project root.`
		);
	}
	let bytes: Uint8Array;
	try {
		bytes = bs58.decode(trimmed);
	} catch {
		throw new Error(`${name} is not valid base58.`);
	}
	if (bytes.length === 64) {
		return Keypair.fromSecretKey(bytes);
	}
	if (bytes.length === 32) {
		return Keypair.fromSeed(bytes);
	}
	throw new Error(
		`${name} decodes to ${bytes.length} bytes; Solana expects base58 of a 64-byte secret key or 32-byte seed.`
	);
}

// PRIV KEY OF DEPLOYER (base58, 64-byte secret or 32-byte seed)
export const wallet = keypairFromEnv("WALLET_PRIVATE_KEY", process.env.WALLET_PRIVATE_KEY);

// PRIV KEY OF FEEPAYER
export const payer = keypairFromEnv("PAYER_PRIVATE_KEY", process.env.PAYER_PRIVATE_KEY);

// RPC HTTPS URL
export const rpc = (process.env.RPC_URL ?? "").trim();

if (!rpc) {
	throw new Error("Missing RPC_URL in .env");
}

/* DONT TOUCH ANYTHING BELOW THIS */

export const connection = new Connection(rpc, "confirmed");

export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const global = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");

export const mintAuthority = new PublicKey("TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM");

export const MPL_TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export const eventAuthority = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");

export const feeRecipient = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
