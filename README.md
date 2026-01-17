# Balance Checker

Multi-chain balance checker supporting Ethereum and Solana networks.

## Features

- ✅ **Ethereum Sepolia** - ETH, USDC, EURC balances
- ✅ **Solana Devnet** - SOL, USDC, EURC balances
- ✅ **Shared Configuration** - Single `config.json` for all platforms
- ✅ **Library + CLI** - Use as Rust library or standalone CLI
- ✅ **TypeScript Examples** - Direct RPC examples for web apps
- ✅ **Zero Warnings** - Clean compilation
- ✅ **Tested** - Unit and integration tests

## Quick Start

### Rust CLI

```bash
# Install
cargo build --release

# Ethereum Sepolia
cargo run -- --address 0x78697a9cfc48c1e9d1040172d51833ef78083b10 --chain sepolia

# Solana Devnet
cargo run -- --address 8vJ1EEeJBSX8UZetuHY7d2SiGjdw2AhfamzfxokPsCF4 --chain solana-devnet
```

### As Rust Library

```rust
use balance_checker;

#[tokio::main]
async fn main() {
    let balances = balance_checker::get_balances(
        "sepolia",
        "0x78697a9cfc48c1e9d1040172d51833ef78083b10"
    ).await.unwrap();
    
    for balance in balances {
        println!("{}: {}", balance.token, balance.formatted);
    }
}
```

### TypeScript

See [examples/typescript/](examples/typescript/) for viem and @solana/web3.js examples.

## Configuration

The `config.json` file contains all chain and token configurations:

```json
{
  "chains": {
    "sepolia": {
      "type": "evm",
      "rpc": "https://ethereum-sepolia-rpc.publicnode.com",
      "tokens": { "USDC": {...}, "EURC": {...} }
    },
    "solana-devnet": {
      "type": "solana",
      "rpc": "https://api.devnet.solana.com",
      "tokens": { "USDC": {...}, "EURC": {...} }
    }
  }
}
```

## Testing

```bash
# Run all tests
cargo test

# Run with network tests (requires internet)
cargo test -- --ignored
```

## Project Structure

```
├── config.json                 # Shared configuration
├── src/
│   ├── lib.rs                  # Public library API
│   ├── config.rs               # Config loading
│   ├── ethereum.rs             # Ethereum provider
│   ├── solana.rs               # Solana provider
│   ├── chain.rs                # ChainProvider trait
│   ├── types.rs                # Shared types
│   └── bin/cli.rs              # CLI binary
├── examples/
│   └── typescript/             # TypeScript examples
└── tests/                      # Integration tests
```

## Adding New Chains

1. Add chain config to `config.json`
2. Implement `ChainProvider` trait
3. Update `get_balances()` in `lib.rs`
4. Add tests

## License

MIT
