use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Configuration for all supported chains
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub chains: HashMap<String, ChainConfig>,
}

/// Configuration for a single chain
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChainConfig {
    #[serde(rename = "type")]
    pub chain_type: String,
    pub name: String,
    pub rpc: String,
    #[serde(rename = "chainId", skip_serializing_if = "Option::is_none")]
    pub chain_id: Option<u64>,
    #[serde(rename = "canisterId", skip_serializing_if = "Option::is_none")]
    pub canister_id: Option<String>,
    #[serde(rename = "nativeToken")]
    pub native_token: TokenInfo,
    pub tokens: HashMap<String, TokenInfo>,
}

/// Token information from config
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TokenInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    pub symbol: Option<String>,
    pub decimals: u8,
}

impl Config {
    /// Load configuration from embedded JSON
    pub fn load() -> Result<Self> {
        let config_str = include_str!("../config.json");
        let config: Config = serde_json::from_str(config_str)?;
        Ok(config)
    }

    /// Get a specific chain configuration
    pub fn get_chain(&self, chain_name: &str) -> Option<&ChainConfig> {
        self.chains.get(chain_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_config() {
        let config = Config::load().unwrap();
        assert!(config.chains.contains_key("sepolia"));
        assert!(config.chains.contains_key("solana-devnet"));
    }

    #[test]
    fn test_sepolia_config() {
        let config = Config::load().unwrap();
        let sepolia = config.get_chain("sepolia").unwrap();
        assert_eq!(sepolia.chain_type, "evm");
        assert_eq!(sepolia.native_token.decimals, 18);
        assert!(sepolia.tokens.contains_key("USDC"));
        assert!(sepolia.tokens.contains_key("EURC"));
    }

    #[test]
    fn test_solana_config() {
        let config = Config::load().unwrap();
        let solana = config.get_chain("solana-devnet").unwrap();
        assert_eq!(solana.chain_type, "solana");
        assert_eq!(solana.native_token.decimals, 9);
        assert!(solana.tokens.contains_key("USDC"));
    }
}
