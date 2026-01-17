use anyhow::Result;
use async_trait::async_trait;

use crate::types::{Balance, Token};

/// Trait for chain providers - implement this for each blockchain
#[async_trait]
pub trait ChainProvider: Send + Sync {
    /// Get the native token balance for an address
    async fn get_native_balance(&self, address: &str) -> Result<Balance>;
    
    /// Get the balance of a specific token for an address
    async fn get_token_balance(&self, address: &str, token: &Token) -> Result<Balance>;
    
    /// Get all balances (native + specified tokens) for an address
    async fn get_all_balances(&self, address: &str, tokens: &[Token]) -> Result<Vec<Balance>> {
        let mut balances = Vec::new();
        
        // Get native balance
        balances.push(self.get_native_balance(address).await?);
        
        // Get token balances
        for token in tokens {
            balances.push(self.get_token_balance(address, token).await?);
        }
        
        Ok(balances)
    }
}
