# TypeScript Examples

These examples demonstrate how to use the balance checker functionality in TypeScript using the shared `config.json`.

## Prerequisites

```bash
npm install viem @solana/web3.js @solana/spl-token
```

## Usage

### Ethereum Sepolia

```bash
node --loader ts-node/esm ethereum.ts
```

or with Bun:
```bash
bun run ethereum.ts
```

### Solana Devnet

```bash
node --loader ts-node/esm solana.ts
```

or with Bun:
```bash
bun run solana.ts
```

## Shared Configuration

Both examples use the same `config.json` file as the Rust implementation, ensuring consistency across platforms.
