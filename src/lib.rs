mod chain;
mod config;
mod ethereum;
mod solana;
mod types;

pub use chain::ChainProvider;
pub use config::{ChainConfig, Config, TokenInfo};
pub use ethereum::EthereumProvider;
pub use solana::SolanaProvider;
pub use types::{Balance, Token};

use anyhow::{anyhow, Result};

/// Get balances for an address on a specific chain
pub async fn get_balances(chain_name: &str, address: &str) -> Result<Vec<Balance>> {
    let config = Config::load()?;
    let chain_config = config
        .get_chain(chain_name)
        .ok_or_else(|| anyhow!("Chain '{}' not found in configuration", chain_name))?;

    match chain_config.chain_type.as_str() {
        "evm" => get_evm_balances(chain_config, address).await,
        "solana" => get_solana_balances(chain_config, address).await,
        _ => Err(anyhow!(
            "Unsupported chain type: {}",
            chain_config.chain_type
        )),
    }
}

async fn get_evm_balances(config: &ChainConfig, address: &str) -> Result<Vec<Balance>> {
    let provider = EthereumProvider::new(config.rpc.clone());

    // Get native balance
    let mut balances = vec![provider.get_native_balance(address).await?];

    // Get token balances
    for (symbol, token_info) in &config.tokens {
        if let Some(token_address) = &token_info.address {
            let token = Token::Erc20 {
                address: token_address.clone(),
                symbol: symbol.clone(),
                decimals: token_info.decimals,
            };
            balances.push(provider.get_token_balance(address, &token).await?);
        }
    }

    Ok(balances)
}

async fn get_solana_balances(config: &ChainConfig, address: &str) -> Result<Vec<Balance>> {
    let provider = SolanaProvider::new(config.rpc.clone());

    // Get native balance
    let mut balances = vec![provider.get_native_balance(address).await?];

    // Get token balances
    for (symbol, token_info) in &config.tokens {
        if let Some(token_address) = &token_info.address {
            let token = Token::Erc20 {
                address: token_address.clone(),
                symbol: symbol.clone(),
                decimals: token_info.decimals,
            };
            balances.push(provider.get_token_balance(address, &token).await?);
        }
    }

    Ok(balances)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_loads() {
        let config = Config::load();
        assert!(config.is_ok());
    }

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_sepolia_balances() {
        let result = get_balances("sepolia", "0x78697a9cfc48c1e9d1040172d51833ef78083b10").await;

        assert!(result.is_ok());
        let balances = result.unwrap();
        assert!(!balances.is_empty()); // At least ETH balance
    }
}
