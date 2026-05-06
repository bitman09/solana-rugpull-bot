# solana-pumpfun-bundler
This Solana PumpFun Bundler Bot is your ultimate tool for seamless bundling on Pump.Fun, featuring advanced profile creation and anti-bubble mapping capabilities.


## Description
This open-source and free tool provides a highly efficient self-bundling script designed specifically for Pump.Fun, empowering users to launch tokens seamlessly using 20 distinct wallets and profiles.

With its robust features, the tool ensures your token launches are completely secure and protected against bubble map vulnerabilities and Photon SB marks, delivering unparalleled reliability for your projects.

For users requiring additional advanced functionalities or customization, we invite you to reach out via direct message for tailored solutions and expert support.

## Project Codebase
### main.ts
```
import { createKeypairs } from "./src/createKeys";
import { buyBundle } from "./src/jitoPool";
import { sender } from "./src/senderUI";
import { sellXPercentagePF } from "./src/sellFunc";
import promptSync from "prompt-sync";
import { sellXPercentagePumpSwap } from "./src/sellPumpSwap";

const prompt = promptSync();

async function main() {
	let running = true;

	while (running) {
		console.log("DM me for support");
		console.log("https://t.me/benorizz0");
		console.log("solana-scripts.com");
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
```

### src/clients
```
 - LookupTableProvider.ts
 - config.ts
 - jito.ts
```

### src/keypairs
```
 - keypair1.json
```

### src/
```
 - createKeys.ts
 - createLUT.ts
 - jitoPool.ts
 - keyInfo.json
 - sellFunc.ts
 - sellPumpSwap.ts
 - senderUI.ts
```


## Contact Info
Telegram: [@Dias](https://t.me/bitman09)

LinkedIn: [@Dias Ishbulatov](https://www.linkedin.com/in/dias-ishbulatov/)
