# Solana Rugpull Bot

A command-line automation toolkit for Pump.Fun workflows on Solana.  
This project helps streamline keypair generation, launch preparation, pool bundle execution, and percentage-based selling actions through a simple interactive menu.

## Overview

Solana Rugpull Bot is designed for operators who need fast, repeatable execution across multiple wallets and launch steps.  
It focuses on practical scripting flows with minimal setup friction.

## Key Features

- Interactive CLI menu for guided operation
- Keypair generation utilities
- Pre-launch checklist and sender flow
- Pool bundle creation support
- Sell-by-percentage support for:
  - Pump.Fun
  - Pump Swap

## Prerequisites

- Node.js 18+ (recommended 20+)
- npm
- A configured `.env` file with required runtime values
- Solana wallet/key material appropriate for your workflow

## Installation

```bash
npm install
```

## Run

```bash
npm run start
```

After launch, select one of the menu options:

1. Create Keypairs
2. Pre Launch Checklist
3. Create Pool Bundle
4. Sell % of Supply on Pump.Fun
5. Sell % of Supply on Pump Swap

Type `exit` to quit.

## Project Structure

```text
.
├── main.ts
├── config.ts
├── src/
│   ├── createKeys.ts
│   ├── createLUT.ts
│   ├── jitoPool.ts
│   ├── keyInfo.json
│   ├── sellFunc.ts
│   ├── sellPumpSwap.ts
│   ├── senderUI.ts
│   ├── clients/
│   │   ├── LookupTableProvider.ts
│   │   ├── config.ts
│   │   └── jito.ts
│   └── keypairs/
│       └── keypair1.json
└── README.md
```

## Notes

- Keep sensitive secrets out of source control.
- Validate network, RPC, and key configuration before running live flows.
- Test with small amounts first before running larger operations.

## Support

For custom integrations or advanced workflow support, use your preferred project contact channel.