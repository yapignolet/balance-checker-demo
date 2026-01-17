import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { sha256 } from 'js-sha256';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Search, RefreshCw, AlertCircle, ArrowRight, ExternalLink, Key, User, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Actor, HttpAgent } from '@dfinity/agent';
import { ethTransferIdl, solTransferIdl } from './idl';
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
  seed: {
    id: 'seed',
    name: 'Connect Seed',
    addresses: []
  },
  custom: {
    id: 'custom',
    name: 'Manual',
    addresses: []
  }
};

export default function App() {
  const [selectedProfile, setSelectedProfile] = useState('seed'); // Default to Seed now
  const [inputValue, setInputValue] = useState('Alice'); // Default seed
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [derivedInfo, setDerivedInfo] = useState(null);

  const fetchEthereumBalances = useCallback(async (addr) => {
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
      } catch {
        balList.push({ symbol, amount: '0', isNative: false });
      }
    }
    return balList;
  }, []);

  const fetchSolanaBalances = useCallback(async (addr) => {
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
      } catch {
        balList.push({ symbol, amount: '0', isNative: false });
      }
    }
    return balList;
  }, []);

  const checkBalances = useCallback(async (addressesToScan) => {
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
  }, [fetchEthereumBalances, fetchSolanaBalances]);

  const handleSeedDerivation = useCallback(async () => {
    if (!inputValue) return;
    try {
      setLoading(true);
      // Deterministic Derivation
      const seedBytes = new Uint8Array(sha256.array(inputValue));

      // 1. ICP Principal
      const icpId = Secp256k1KeyIdentity.fromSecretKey(seedBytes);
      const principal = icpId.getPrincipal().toText();

      // 2. Fetch Addresses from Canisters
      const agent = new HttpAgent({ identity: icpId, host: "https://ic0.app" });

      const ethCanisterId = config.chains['sepolia'].canisterId;
      const solCanisterId = config.chains['solana-devnet'].canisterId;

      const ethActor = Actor.createActor(ethTransferIdl, { agent, canisterId: ethCanisterId });
      const solActor = Actor.createActor(solTransferIdl, { agent, canisterId: solCanisterId });

      const [ethRes, solRes] = await Promise.all([
        ethActor.get_eth_address(icpId.getPrincipal()),
        solActor.get_sol_address(icpId.getPrincipal())
      ]);

      if (ethRes && 'Ok' in ethRes && solRes && 'Ok' in solRes) {
        const ethAddress = ethRes.Ok;
        const solAddress = solRes.Ok;
        setDerivedInfo({ principal, ethAddress, solAddress, seed: inputValue });
        checkBalances([ethAddress, solAddress]);
      } else {
        console.error("Failed to fetch address from canisters:", { ethRes, solRes });
        setLoading(false);
      }
    } catch (e) {
      console.error("Derivation error:", e);
      setLoading(false);
    }
  }, [inputValue, checkBalances]);

  useEffect(() => {
    try {
      if (selectedProfile === 'oisy' || selectedProfile === 'alice') {
        checkBalances(PROFILES[selectedProfile].addresses);
        setDerivedInfo(null);
      } else if (selectedProfile === 'seed' && inputValue) {
        handleSeedDerivation();
      } else {
        setResults([]);
        setDerivedInfo(null);
      }
    } catch (e) {
      console.error("Effect error:", e);
    }
  }, [selectedProfile, inputValue, checkBalances, handleSeedDerivation]);

  const handleManualSubmit = () => {
    if (inputValue) checkBalances([inputValue]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
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
              {profile.id === 'custom' ? <Search className="w-4 h-4" /> :
                profile.id === 'seed' ? <Key className="w-4 h-4" /> : <User className="w-4 h-4" />}
              {profile.name}
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <motion.div
          layout
          className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden"
        >
          {/* Input Area */}
          <AnimatePresence mode="popLayout">
            {(selectedProfile === 'custom' || selectedProfile === 'seed') && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-8 border-b border-slate-700/50"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={selectedProfile === 'seed' ? "Enter a seed string (e.g. Alice)..." : "Enter 0x... or Solana address..."}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-slate-200"
                    onKeyDown={(e) => e.key === 'Enter' && (selectedProfile === 'seed' ? handleSeedDerivation() : handleManualSubmit())}
                  />
                  {selectedProfile === 'seed' ? <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" /> : <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />}
                  <button
                    onClick={selectedProfile === 'seed' ? handleSeedDerivation : handleManualSubmit}
                    disabled={loading || !inputValue}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                  </button>
                </div>

                {/* Identity Info Panel */}
                {derivedInfo && selectedProfile === 'seed' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-3"
                  >
                    <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4" />
                      Deterministic Identity for "{derivedInfo.seed}"
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">ICP Principal</span>
                        <span className="text-xs font-mono text-slate-300 truncate">{derivedInfo.principal}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
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
