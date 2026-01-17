import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import config from '../../config.json' assert { type: 'json' };

interface Balance {
    token: string;
    amount: string;
    decimals: number;
    formatted: string;
}

function formatBalance(amount: string, decimals: number): string {
    const value = BigInt(amount);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = value / divisor;
    const fractional = value % divisor;

    if (fractional === BigInt(0)) {
        return whole.toString();
    } else {
        const fracStr = fractional.toString().padStart(decimals, '0');
        const trimmed = fracStr.replace(/0+$/, '');
        return `${whole}.${trimmed}`;
    }
}

async function getSolanaBalances(address: string): Promise<Balance[]> {
    const chainConfig = config.chains['solana-devnet'];
    const connection = new Connection(chainConfig.rpc, 'confirmed');
    const publicKey = new PublicKey(address);

    const balances: Balance[] = [];

    // Get SOL balance
    const lamports = await connection.getBalance(publicKey);
    balances.push({
        token: chainConfig.nativeToken.symbol!,
        amount: lamports.toString(),
        decimals: chainConfig.nativeToken.decimals,
        formatted: formatBalance(lamports.toString(), chainConfig.nativeToken.decimals),
    });

    // Get SPL token balances
    for (const [symbol, tokenInfo] of Object.entries(chainConfig.tokens)) {
        const mintPublicKey = new PublicKey(tokenInfo.address!);

        // Get token accounts for this mint
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: mintPublicKey,
        });

        // Sum balances from all token accounts
        const totalBalance = tokenAccounts.value.reduce((sum, accountInfo) => {
            const amount = accountInfo.account.data.parsed.info.tokenAmount.amount;
            return sum + BigInt(amount);
        }, BigInt(0));

        balances.push({
            token: symbol,
            amount: totalBalance.toString(),
            decimals: tokenInfo.decimals,
            formatted: formatBalance(totalBalance.toString(), tokenInfo.decimals),
        });
    }

    return balances;
}

// Example usage
const address = '8vJ1EEeJBSX8UZetuHY7d2SiGjdw2AhfamzfxokPsCF4';
const balances = await getSolanaBalances(address);

console.log(`\nChain: ${config.chains['solana-devnet'].name}`);
console.log('='.repeat(60));
balances.forEach((balance) => {
    console.log(`${balance.token.padEnd(6)} | ${balance.formatted.padStart(20)} (raw: ${balance.amount})`);
});
console.log('='.repeat(60));
