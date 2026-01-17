import { useState, useEffect } from 'react';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Search, RefreshCw, AlertCircle, ArrowRight, ExternalLink, Users, User } from 'lucide-react';
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

const PROFILES = {
  oisy: {
    id: 'oisy',
    name: 'Oisy',
    addresses: [
      '2LmLQpWuTfhmc1GkMxsBphZnC9zN4qPutGWoCQw9Kgbi',
      '0xd276501dBd43731C61ff775b21e80696c3c73645'
    ]
  },
  alice: {
    id: 'alice',
    name: 'Alice',
    addresses: [
      '8vJ1EEeJBSX8UZetuHY7d2SiGjdw2AhfamzfxokPsCF4',
      '0x78697a9cfc48C1e9d1040172d51833EF78083b10'
    ]
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    addresses: []
  }
};

export default function App() {
  const [selectedProfile, setSelectedProfile] = useState('oisy'); // Default to Oisy
  const [customAddress, setCustomAddress] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedProfile !== 'custom') {
      checkBalances(PROFILES[selectedProfile].addresses);
    } else {
      setResults([]);
    }
  }, [selectedProfile]);

  const checkBalances = async (addressesToScan) => {
    if (!addressesToScan || addressesToScan.length === 0) return;

    setLoading(true);
    setResults([]);

    try {
      const promises = addressesToScan.map(async (addr) => {
        // 1. Detect Chain
        let type = 'unknown';
        if (addr.startsWith('0x') && addr.length === 42) {
          type = 'ethereum';
        } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) {
          type = 'solana';
        } else {
          return { address: addr, error: 'Invalid address format', balances: [] };
        }

        // 2. Fetch Balances
        try {
          const balances = type === 'ethereum'
            ? await fetchEthereumBalances(addr)
            : await fetchSolanaBalances(addr);
          return { address: addr, chainType: type, balances };
        } catch (err) {
          return { address: addr, chainType: type, error: err.message || 'Fetch failed', balances: [] };
        }
      });

      const data = await Promise.all(promises);
      setResults(data);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = () => {
    if (customAddress) checkBalances([customAddress]);
  };

  const fetchEthereumBalances = async (addr) => {
    const chainConfig = config.chains['sepolia'];
    const client = createPublicClient({
      chain: sepolia,
      transport: http(chainConfig.rpc)
    });

    const balList = [];

    // Native ETH
    try {
      const balance = await client.getBalance({ address: addr });
      balList.push({
        symbol: chainConfig.nativeToken.symbol,
        amount: formatUnits(balance, chainConfig.nativeToken.decimals),
        isNative: true
      });
    } catch (e) { console.error(e); }

    // Tokens
    for (const [symbol, info] of Object.entries(chainConfig.tokens)) {
      try {
        const balance = await client.readContract({
          address: info.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [addr]
        });
        balList.push({
          symbol: symbol,
          amount: formatUnits(balance, info.decimals),
          isNative: false
        });
      } catch (e) {
        balList.push({ symbol, amount: '0', isNative: false });
      }
    }
    return balList;
  };

  const fetchSolanaBalances = async (addr) => {
    const chainConfig = config.chains['solana-devnet'];
    const connection = new Connection(chainConfig.rpc, 'confirmed');
    const pubKey = new PublicKey(addr);
    const balList = [];

    // Native SOL
    try {
      const balance = await connection.getBalance(pubKey);
      balList.push({
        symbol: chainConfig.nativeToken.symbol,
        amount: (balance / Math.pow(10, chainConfig.nativeToken.decimals)).toString(),
        isNative: true
      });
    } catch (e) { console.error(e); }

    // SPL Tokens
    for (const [symbol, info] of Object.entries(chainConfig.tokens)) {
      try {
        const mint = new PublicKey(info.address);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, { mint });
        let total = 0;
        for (const { account } of tokenAccounts.value) {
          total += account.data.parsed.info.tokenAmount.uiAmount || 0;
        }
        balList.push({
          symbol: symbol,
          amount: total.toString(),
          isNative: false
        });
      } catch (e) {
        balList.push({ symbol, amount: '0', isNative: false });
      }
    }
    return balList;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl space-y-6">

        {/* Header & Profile Selector */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden p-2 flex p-2 bg-slate-900/40">
          {Object.values(PROFILES).map((profile) => (
            <button
              key={profile.id}
              onClick={() => setSelectedProfile(profile.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl transition-all font-medium text-sm",
                selectedProfile === profile.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              {profile.id === 'custom' ? <Search className="w-4 h-4" /> : <User className="w-4 h-4" />}
              {profile.name}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <motion.div
          layout
          className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden"
        >
          {/* Custom Input */}
          <AnimatePresence mode="popLayout">
            {selectedProfile === 'custom' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-8 border-b border-slate-700/50"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={customAddress}
                    onChange={(e) => setCustomAddress(e.target.value)}
                    placeholder="Enter Ethereum (0x...) or Solana address..."
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-slate-200"
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                  />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <button
                    onClick={handleCustomSubmit}
                    disabled={loading || !customAddress}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results List */}
          <div className="p-8 space-y-8">
            {loading && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500 space-y-4">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                <p>Fetching balances...</p>
              </div>
            )}

            {!loading && results.length === 0 && selectedProfile === 'custom' && (
              <div className="text-center py-10 text-slate-500">
                Enter an address to get started
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {results.map((res, idx) => (
                <motion.div
                  key={res.address}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="space-y-4"
                >
                  {/* Address Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-700/30">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full ring-4 ring-opacity-20",
                        res.chainType === 'ethereum' ? 'bg-blue-400 ring-blue-400' :
                          res.chainType === 'solana' ? 'bg-purple-400 ring-purple-400' : 'bg-slate-500 ring-slate-500'
                      )} />
                      <div>
                        <p className="text-sm font-mono text-slate-300 break-all">{res.address}</p>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                          {res.chainType === 'ethereum' ? 'Ethereum Sepolia' : res.chainType === 'solana' ? 'Solana Devnet' : 'Unknown Chain'}
                        </p>
                      </div>
                    </div>
                    <a
                      href={res.chainType === 'ethereum'
                        ? `https://sepolia.etherscan.io/address/${res.address}`
                        : `https://explorer.solana.com/address/${res.address}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>

                  {/* Balances Grid */}
                  {res.error ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> {res.error}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {res.balances.map((bal) => (
                        <div key={bal.symbol} className="bg-slate-900/40 border border-slate-700/30 p-4 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                              bal.isNative ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-800 text-slate-400"
                            )}>
                              {bal.symbol[0]}
                            </div>
                            <span className="font-bold text-slate-200">{bal.symbol}</span>
                          </div>
                          <span className="font-mono text-slate-300">
                            {parseFloat(bal.amount).toLocaleString(undefined, { maximumFractionDigits: 5 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
