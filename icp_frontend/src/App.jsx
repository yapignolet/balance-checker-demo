import { useState } from 'react';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Search, RefreshCw, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import config from './config.json';

// Utility for Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ERC20 ABI for balance checking
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]);

export default function App() {
  const [address, setAddress] = useState('');
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chainType, setChainType] = useState(null);

  const checkBalances = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    setBalances([]);
    setChainType(null);

    try {
      // 1. Detect Chain
      let type = 'unknown';
      if (address.startsWith('0x') && address.length === 42) {
        type = 'ethereum';
      } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
        type = 'solana';
      } else {
        throw new Error('Invalid address format. Use 0x... for Ethereum or Base58 for Solana.');
      }
      setChainType(type);

      // 2. Fetch Balances
      if (type === 'ethereum') {
        await fetchEthereumBalances(address);
      } else {
        await fetchSolanaBalances(address);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to fetch balances');
    } finally {
      setLoading(false);
    }
  };

  const fetchEthereumBalances = async (addr) => {
    const chainConfig = config.chains['sepolia'];
    const client = createPublicClient({
      chain: sepolia,
      transport: http(chainConfig.rpc)
    });

    const results = [];

    // Native ETH
    try {
      const balance = await client.getBalance({ address: addr });
      results.push({
        symbol: chainConfig.nativeToken.symbol,
        amount: formatUnits(balance, chainConfig.nativeToken.decimals),
        isNative: true
      });
    } catch (e) {
      console.error("Failed to fetch ETH balance", e);
    }

    // Tokens
    const tokens = Object.entries(chainConfig.tokens);
    for (const [symbol, info] of tokens) {
      try {
        const balance = await client.readContract({
          address: info.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [addr]
        });
        results.push({
          symbol: symbol,
          amount: formatUnits(balance, info.decimals),
          isNative: false
        });
      } catch (e) {
        console.warn(`Failed to fetch ${symbol}`, e);
        // Add with 0 balance if failed
        results.push({ symbol, amount: '0', isNative: false });
      }
    }
    setBalances(results);
  };

  const fetchSolanaBalances = async (addr) => {
    const chainConfig = config.chains['solana-devnet'];
    const connection = new Connection(chainConfig.rpc, 'confirmed');
    const pubKey = new PublicKey(addr);
    const results = [];

    // Native SOL
    try {
      const balance = await connection.getBalance(pubKey);
      results.push({
        symbol: chainConfig.nativeToken.symbol,
        amount: (balance / Math.pow(10, chainConfig.nativeToken.decimals)).toString(),
        isNative: true
      });
    } catch (e) {
      console.error("Failed to fetch SOL balance", e);
    }

    // SPL Tokens
    const tokens = Object.entries(chainConfig.tokens);
    for (const [symbol, info] of tokens) {
      try {
        // Use getParsedTokenAccountsByOwner to match Logic (e.g. CLI)
        // Note: config.json has token addresses
        const mint = new PublicKey(info.address);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, { mint });

        let total = 0;
        for (const { account } of tokenAccounts.value) {
          const parsedInfo = account.data.parsed.info;
          const amount = parsedInfo.tokenAmount.uiAmount || 0;
          total += amount;
        }

        results.push({
          symbol: symbol,
          amount: total.toString(),
          isNative: false
        });
      } catch (e) {
        console.warn(`Failed to fetch ${symbol}`, e);
        results.push({ symbol, amount: '0', isNative: false });
      }
    }
    setBalances(results);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-8 border-b border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <Wallet className="w-6 h-6 text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
              Balance Checker
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Enter an Ethereum or Solana address to view portfolio.
          </p>
        </div>

        {/* Input */}
        <div className="p-8 space-y-6">
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x... or 8vJ..."
              className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-slate-200 placeholder-slate-500 font-mono text-sm"
              onKeyDown={(e) => e.key === 'Enter' && checkBalances()}
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

            <button
              onClick={checkBalances}
              disabled={loading || !address}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm"
              >
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          <div className="space-y-3">
            {chainType && !loading && !error && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", chainType === 'ethereum' ? 'bg-blue-400' : 'bg-purple-400')} />
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    {chainType === 'ethereum' ? 'Ethereum Sepolia' : 'Solana Devnet'}
                  </span>
                </div>
                <a
                  href={chainType === 'ethereum' ? `https://sepolia.etherscan.io/address/${address}` : `https://explorer.solana.com/address/${address}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <span>View explorer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {balances.map((balance, index) => (
                <motion.div
                  key={balance.symbol}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group flex items-center justify-between p-4 bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 hover:border-indigo-500/30 rounded-2xl transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg",
                      balance.isNative ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-800 text-slate-400"
                    )}>
                      {balance.symbol[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-200">{balance.symbol}</p>
                      <p className="text-xs text-slate-500">{balance.isNative ? 'Native Token' : 'Token'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-mono font-medium text-slate-200 tracking-tight">
                      {parseFloat(balance.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {!loading && balances.length === 0 && !error && chainType && (
              <div className="text-center py-10 text-slate-500">
                <p>No balances found.</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
