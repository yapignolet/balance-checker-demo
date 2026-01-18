import { useState, useCallback } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { withTimeout } from '../utils/timeout';
import { erc20Abi } from '../constants';
import config from '../config.json';

/**
 * Custom hook for managing multi-chain balance fetching.
 * @param {Function} addToast - Toast notification function.
 * @returns {{ results, loading, checkBalances, getChainBalance, hasInsufficientGas }}
 */
export function useBalances(addToast) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch Ethereum balances
    const fetchEthereumBalances = useCallback(async (addr) => {
        const chainConfig = config.chains['sepolia'];
        const client = createPublicClient({ chain: sepolia, transport: http(chainConfig.rpc) });
        const balList = [];

        try {
            const balance = await client.getBalance({ address: addr });
            balList.push({
                symbol: chainConfig.nativeToken.symbol,
                amount: formatUnits(balance, chainConfig.nativeToken.decimals),
                isNative: true
            });
        } catch (e) {
            console.error('ETH balance error:', e);
        }

        for (const [symbol, info] of Object.entries(chainConfig.tokens)) {
            try {
                const balance = await client.readContract({
                    address: info.address,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [addr]
                });
                balList.push({ symbol, amount: formatUnits(balance, info.decimals), isNative: false });
            } catch {
                balList.push({ symbol, amount: '0', isNative: false });
            }
        }
        return balList;
    }, []);

    // Fetch Solana balances
    const fetchSolanaBalances = useCallback(async (addr) => {
        const chainConfig = config.chains['solana-devnet'];
        const connection = new Connection(chainConfig.rpc, 'confirmed');
        const pubKey = new PublicKey(addr);
        const balList = [];

        try {
            const balance = await connection.getBalance(pubKey);
            balList.push({
                symbol: chainConfig.nativeToken.symbol,
                amount: (balance / Math.pow(10, chainConfig.nativeToken.decimals)).toString(),
                isNative: true
            });
        } catch (e) {
            console.error('SOL balance error:', e);
        }

        for (const [symbol, info] of Object.entries(chainConfig.tokens)) {
            try {
                const mint = new PublicKey(info.address);
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, { mint });
                let total = 0;
                for (const { account } of tokenAccounts.value) {
                    total += account.data.parsed.info.tokenAmount.uiAmount || 0;
                }
                balList.push({ symbol, amount: total.toString(), isNative: false });
            } catch {
                balList.push({ symbol, amount: '0', isNative: false });
            }
        }
        return balList;
    }, []);

    // Check balances for given addresses (granular per-chain)
    const checkBalances = useCallback(async (addressesToScan) => {
        if (!addressesToScan || addressesToScan.length === 0) return;

        // Initialize or preserve results structure
        setResults(prev => {
            const initial = prev.length > 0 ? [...prev] : [
                { chainType: 'ethereum', balances: [], loading: true },
                { chainType: 'solana', balances: [], loading: true }
            ];
            return initial.map(r => ({ ...r, loading: true, error: null }));
        });

        const fetchChain = async (addr, type) => {
            try {
                const balances = await withTimeout(
                    type === 'ethereum' ? fetchEthereumBalances(addr) : fetchSolanaBalances(addr),
                    15000
                );
                setResults(prev => prev.map(r =>
                    r.chainType === type ? { ...r, address: addr, balances, loading: false, error: null } : r
                ));
            } catch (err) {
                console.error(`Error fetching ${type} balances:`, err);
                setResults(prev => prev.map(r =>
                    r.chainType === type ? { ...r, address: addr, loading: false, error: err.message || 'Fetch failed' } : r
                ));
                addToast('error', `Failed to fetch ${type === 'ethereum' ? 'Sepolia' : 'Devnet'} balances`);
            }
        };

        const ethAddr = addressesToScan.find(a => a.startsWith('0x'));
        const solAddr = addressesToScan.find(a => !a.startsWith('0x'));

        if (ethAddr) fetchChain(ethAddr, 'ethereum');
        if (solAddr) fetchChain(solAddr, 'solana');
    }, [fetchEthereumBalances, fetchSolanaBalances, addToast]);

    // Get balance for a specific chain and symbol
    const getChainBalance = useCallback((chain, symbol) => {
        const res = results.find(r => r.chainType === chain);
        if (!res) return 0;
        const bal = res.balances.find(b => b.symbol === symbol);
        return bal ? parseFloat(bal.amount) : 0;
    }, [results]);

    // Check if gas is insufficient for a chain
    const hasInsufficientGas = useCallback((chain) => {
        const nativeSymbol = chain === 'ethereum' ? 'ETH' : 'SOL';
        const balance = getChainBalance(chain, nativeSymbol);
        const minRequired = chain === 'ethereum' ? 0.001 : 0.002;
        return balance < minRequired;
    }, [getChainBalance]);

    return { results, loading, checkBalances, getChainBalance, hasInsufficientGas };
}
