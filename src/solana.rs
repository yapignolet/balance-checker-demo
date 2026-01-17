use anyhow::Result;
use async_trait::async_trait;
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_request::TokenAccountsFilter;
use solana_sdk::program_pack::Pack;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

use crate::chain::ChainProvider;
use crate::types::{Balance, Token};

/// Solana chain provider using JSON-RPC
pub struct SolanaProvider {
    client: RpcClient,
}

impl SolanaProvider {
    pub fn new(rpc_url: String) -> Self {
        Self {
            client: RpcClient::new(rpc_url),
        }
    }

    pub fn new_devnet() -> Self {
        Self::new("https://api.devnet.solana.com".to_string())
    }
}

#[async_trait]
impl ChainProvider for SolanaProvider {
    async fn get_native_balance(&self, address: &str) -> Result<Balance> {
        let pubkey = Pubkey::from_str(address)?;
        let lamports = self.client.get_balance(&pubkey)?;

        Ok(Balance::new(
            "SOL".to_string(),
            lamports.to_string(),
            9, // SOL has 9 decimals
        ))
    }

    async fn get_token_balance(&self, address: &str, token: &Token) -> Result<Balance> {
        let Token::Erc20 {
            address: token_address,
            symbol,
            decimals,
        } = token;

        let owner_pubkey = Pubkey::from_str(address)?;
        let mint_pubkey = Pubkey::from_str(token_address)?;

        // Get token accounts using the correct filter type
        let filter = TokenAccountsFilter::Mint(mint_pubkey);
        let token_accounts = self
            .client
            .get_token_accounts_by_owner(&owner_pubkey, filter)?;

        // Sum up balances from all token accounts
        let total_balance: u64 = token_accounts
            .iter()
            .filter_map(|account_info| {
                // Decode the token account data - need to handle UiAccountData
                use solana_account_decoder::UiAccountData;
                match &account_info.account.data {
                    UiAccountData::Binary(encoded, _) | UiAccountData::LegacyBinary(encoded) => {
                        // Decode base64 data
                        use base64::Engine;
                        let engine = base64::engine::general_purpose::STANDARD;
                        if let Ok(decoded) = engine.decode(encoded) {
                            if let Ok(account_data) = spl_token::state::Account::unpack(&decoded) {
                                return Some(account_data.amount);
                            }
                        }
                        None
                    }
                    UiAccountData::Json(parsed) => {
                        // Try to extract amount from parsed JSON
                        if let Some(info) = parsed.parsed.get("info") {
                            if let Some(token_amount) = info.get("tokenAmount") {
                                if let Some(amount_str) = token_amount.get("amount") {
                                    if let Some(amount_val) = amount_str.as_str() {
                                        if let Ok(amount) = amount_val.parse::<u64>() {
                                            return Some(amount);
                                        }
                                    }
                                }
                            }
                        }
                        None
                    }
                }
            })
            .sum();

        Ok(Balance::new(
            symbol.clone(),
            total_balance.to_string(),
            *decimals,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore] // Requires network access
    async fn test_solana_native_balance() {
        let provider = SolanaProvider::new_devnet();
        // Use a known devnet address (native token program)
        let result = provider
            .get_native_balance("So11111111111111111111111111111111111111112")
            .await;

        // Should not error, balance might be 0
        assert!(result.is_ok());
    }
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    #[ignore] // Requires network access
    async fn test_solana_specific_address_balances() {
        let provider = SolanaProvider::new_devnet();
        let address = "8vJ1EEeJBSX8UZetuHY7d2SiGjdw2AhfamzfxokPsCF4";

        // Check SOL Balance >= 0.49
        let sol_balance = provider.get_native_balance(address).await.unwrap();
        assert_eq!(sol_balance.token, "SOL");
        let sol_amount: f64 = sol_balance.formatted.parse().unwrap();
        assert!(
            sol_amount >= 0.49,
            "SOL balance {} should be >= 0.49",
            sol_amount
        );

        // Define expected tokens
        let usdc = Token::Erc20 {
            address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU".to_string(),
            symbol: "USDC".to_string(),
            decimals: 6,
        };

        let eurc = Token::Erc20 {
            address: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr".to_string(),
            symbol: "EURC".to_string(),
            decimals: 6,
        };

        // Check USDC Balance >= 0.02
        let usdc_balance = provider.get_token_balance(address, &usdc).await.unwrap();
        assert_eq!(usdc_balance.token, "USDC");
        let usdc_amount: f64 = usdc_balance.formatted.parse().unwrap();
        assert!(
            usdc_amount >= 0.02,
            "USDC balance {} should be >= 0.02",
            usdc_amount
        );

        // Check EURC Balance >= 0.01
        let eurc_balance = provider.get_token_balance(address, &eurc).await.unwrap();
        assert_eq!(eurc_balance.token, "EURC");
        let eurc_amount: f64 = eurc_balance.formatted.parse().unwrap();
        assert!(
            eurc_amount >= 0.01,
            "EURC balance {} should be >= 0.01",
            eurc_amount
        );
    }
}
