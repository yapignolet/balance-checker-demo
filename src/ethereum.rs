use alloy::primitives::{Address, U256};
use alloy::providers::{Provider, ProviderBuilder};
use alloy::rpc::types::BlockNumberOrTag;
use alloy::sol;
use anyhow::Result;
use async_trait::async_trait;

use crate::chain::ChainProvider;
use crate::types::{Balance, Token};

// ERC-20 ABI for balanceOf
sol! {
    #[sol(rpc)]
    interface IERC20 {
        function balanceOf(address account) external view returns (uint256);
    }
}

/// Ethereum chain provider using JSON-RPC
pub struct EthereumProvider {
    rpc_url: String,
}

impl EthereumProvider {
    pub fn new(rpc_url: String) -> Self {
        Self { rpc_url }
    }

    pub fn new_sepolia() -> Self {
        Self {
            // Using public Sepolia RPC endpoint
            rpc_url: "https://ethereum-sepolia-rpc.publicnode.com".to_string(),
        }
    }
}

#[async_trait]
impl ChainProvider for EthereumProvider {
    async fn get_native_balance(&self, address: &str) -> Result<Balance> {
        let provider = ProviderBuilder::new().on_http(self.rpc_url.parse()?);

        let addr: Address = address.parse()?;
        let balance = provider
            .get_balance(addr)
            .block_id(BlockNumberOrTag::Latest.into())
            .await?;

        Ok(Balance::new("ETH".to_string(), balance.to_string(), 18))
    }

    async fn get_token_balance(&self, address: &str, token: &Token) -> Result<Balance> {
        let Token::Erc20 {
            address: token_address,
            symbol,
            decimals,
        } = token;

        let provider = ProviderBuilder::new().on_http(self.rpc_url.parse()?);

        let addr: Address = address.parse()?;
        let token_addr: Address = token_address.parse()?;

        let contract = IERC20::new(token_addr, provider);
        let balance: U256 = contract.balanceOf(addr).call().await?._0;

        Ok(Balance::new(symbol.clone(), balance.to_string(), *decimals))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chain::ChainProvider;
    use crate::types::Token;

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_sepolia_specific_address_balances() {
        let provider = EthereumProvider::new_sepolia();
        let address = "0x78697a9cfc48C1e9d1040172d51833EF78083b10";

        // Check ETH Balance > 0
        let eth_balance = provider.get_native_balance(address).await.unwrap();
        assert_eq!(eth_balance.token, "ETH");
        let eth_amount: f64 = eth_balance.formatted.parse().unwrap();
        assert!(
            eth_amount > 0.0,
            "ETH balance {} should be > 0.007",
            eth_amount
        );

        // Define expected tokens
        let usdc = Token::Erc20 {
            address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238".to_string(),
            symbol: "USDC".to_string(),
            decimals: 6,
        };

        // Check USDC Balance >= 0.1
        let usdc_balance = provider.get_token_balance(address, &usdc).await.unwrap();
        assert_eq!(usdc_balance.token, "USDC");
        let usdc_amount: f64 = usdc_balance.formatted.parse().unwrap();
        assert!(
            usdc_amount >= 0.1,
            "USDC balance {} should be >= 0.1",
            usdc_amount
        );
    }
}
