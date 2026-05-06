import { createKeypairs } from "./src/createKeys";
import { buyBundle } from "./src/jitoPool";
import { sender } from "./src/senderUI";
import { sellXPercentagePF } from "./src/sellFunc";
import promptSync from "prompt-sync";
import { logger } from "pretty-pino-loggers";
import { sellXPercentagePumpSwap } from "./src/sellPumpSwap";

const prompt = promptSync();

async function main() {
	await new Promise((resolve) => setTimeout(resolve, 1500));

	let running = true;

	while (running) {
		logger.info("\nsolana rugpull bot:");
		console.log("\nMenu:");
		console.log("1. Create Keypairs");
		console.log("2. Pre Launch Checklist");
		console.log("3. Create Pool Bundle");
		console.log("4. Sell % of Supply on Pump.Fun");
		console.log("5. Sell % of Supply on Pump Swap");
		console.log("Type 'exit' to quit.");

		const answer = prompt("Choose an option or 'exit': "); // Use prompt-sync for user input

		switch (answer) {
			case "1":
				await createKeypairs();
				break;
			case "2":
				await sender();
				break;
			case "3":
				await buyBundle();
				break;
			case "4":
				await sellXPercentagePF();
				break;
			case "5":
				await sellXPercentagePumpSwap();
				break;
			case "exit":
				running = false;
				break;
			default:
				console.log("Invalid option, please choose again.");
		}
	}

	console.log("Exiting...");
	process.exit(0);
}

main().catch((err) => {
	console.error("Error:", err);
});
