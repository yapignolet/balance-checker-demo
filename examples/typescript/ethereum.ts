import { createPublicClient, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import config from '../../config.json' assert { type: 'json' };

// ERC-20 ABI (just the balanceOf function)
const erc20Abi = [
    {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
] as const;

interface Balance {
    token: string;
    amount: string;
    decimals: number;
    formatted: string;
}

async function getSepoliaBalances(address: `0x${string}`): Promise<Balance[]> {
    const chainConfig = config.chains.sepolia;

    const client = createPublicClient({
        chain: sepolia,
        transport: http(chainConfig.rpc),
    });

    const balances: Balance[] = [];

    // Get ETH balance
    const ethBalance = await client.getBalance({ address });
    balances.push({
        token: chainConfig.nativeToken.symbol!,
        amount: ethBalance.toString(),
        decimals: chainConfig.nativeToken.decimals,
        formatted: formatUnits(ethBalance, chainConfig.nativeToken.decimals),
    });

    // Get token balances
    for (const [symbol, tokenInfo] of Object.entries(chainConfig.tokens)) {
        const tokenBalance = await client.readContract({
            address: tokenInfo.address as `0x${string}`,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
        });

        balances.push({
            token: symbol,
            amount: tokenBalance.toString(),
            decimals: tokenInfo.decimals,
            formatted: formatUnits(tokenBalance, tokenInfo.decimals),
        });
    }

    return balances;
}

// Example usage
const address = '0x78697a9cfc48c1e9d1040172d51833ef78083b10';
const balances = await getSepoliaBalances(address as `0x${string}`);

console.log(`\nChain: ${config.chains.sepolia.name}`);
console.log('='.repeat(60));
balances.forEach((balance) => {
    console.log(`${balance.token.padEnd(6)} | ${balance.formatted.padStart(20)} (raw: ${balance.amount})`);
});
console.log('='.repeat(60));
