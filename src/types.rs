use serde::{Deserialize, Serialize};

/// Represents a token balance with amount and decimals
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Balance {
    pub token: String,
    pub amount: String,
    pub decimals: u8,
    pub formatted: String,
}

impl Balance {
    pub fn new(token: String, amount: String, decimals: u8) -> Self {
        let formatted = format_balance(&amount, decimals);
        Self {
            token,
            amount,
            decimals,
            formatted,
        }
    }
}

/// Represents different tokens that can be queried
#[derive(Debug, Clone)]
pub enum Token {
    Erc20 {
        address: String,
        symbol: String,
        decimals: u8,
    },
}

/// Format balance with proper decimal places
fn format_balance(amount: &str, decimals: u8) -> String {
    let value = amount.parse::<u128>().unwrap_or(0);
    let divisor = 10u128.pow(decimals as u32);
    let whole = value / divisor;
    let fractional = value % divisor;

    if fractional == 0 {
        format!("{}", whole)
    } else {
        let frac_str = format!("{:0width$}", fractional, width = decimals as usize);
        let trimmed = frac_str.trim_end_matches('0');
        format!("{}.{}", whole, trimmed)
    }
}
