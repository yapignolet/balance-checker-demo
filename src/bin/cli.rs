use anyhow::Result;
use clap::Parser;

#[derive(Parser, Debug)]
#[command(name = "balance-checker")]
#[command(about = "Query blockchain balances for multiple chains and tokens", long_about = None)]
struct Args {
    /// The blockchain address to query
    #[arg(short, long)]
    address: String,

    /// Chain to query (sepolia, solana-devnet, etc.)
    #[arg(short, long, default_value = "sepolia")]
    chain: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    println!("Querying balances for address: {}\n", args.address);

    // Use the library API
    match balance_checker::get_balances(&args.chain, &args.address).await {
        Ok(balances) => {
            println!("Chain: {}", args.chain);
            println!("{}", "=".repeat(60));

            for balance in balances {
                println!(
                    "{:6} | {:>20} (raw: {})",
                    balance.token, balance.formatted, balance.amount
                );
            }

            println!("{}", "=".repeat(60));
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
    }

    Ok(())
}
