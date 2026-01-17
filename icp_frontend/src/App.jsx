import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, formatUnits, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { sha256 } from 'js-sha256';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, AlertCircle, ArrowRight, ExternalLink, Key, User, ShieldCheck, Send, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Actor, HttpAgent } from '@dfinity/agent';
import { ethTransferIdl, solTransferIdl } from './idl';
import config from './config.json';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Format CHError object to string for display
function formatCHError(err) {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return 'Unknown error';
  const keys = Object.keys(err);
  if (keys.length === 0) return 'Unknown error';
  const variant = keys[0];
  const value = err[variant];
  if (variant === 'InsufficientBalance') {
    const asset = Object.keys(value.asset || {})[0] || 'token';
    return `Insufficient ${asset} balance: requested ${value.requested}, available ${value.available}`;
  }
  return typeof value === 'string' ? value : `${variant}: ${JSON.stringify(value)}`;
}

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]);

const PROFILES = {
  oisy: { id: 'oisy', name: 'Oisy', addresses: ['2LmLQpWuTfhmc1GkMxsBphZnC9zN4qPutGWoCQw9Kgbi', '0xd276501dBd43731C61ff775b21e80696c3c73645'] },
  alice: { id: 'alice', name: 'Alice', addresses: ['8vJ1EEeJBSX8UZetuHY7d2SiGjdw2AhfamzfxokPsCF4', '0x78697a9cfc48C1e9d1040172d51833EF78083b10'] },
  seed: { id: 'seed', name: 'Connect Seed', addresses: [] },
  custom: { id: 'custom', name: 'Manual', addresses: [] }
};

const CHAINS = [
  { id: 'ethereum', name: 'Ethereum Sepolia', tokens: ['ETH', 'USDC', 'EURC'] },
  { id: 'solana', name: 'Solana Devnet', tokens: ['SOL', 'USDC', 'EURC'] }
];

export default function App() {
  const [selectedProfile, setSelectedProfile] = useState('seed');
  const [inputValue, setInputValue] = useState('Alice');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [derivedInfo, setDerivedInfo] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [ethActor, setEthActor] = useState(null);
  const [solActor, setSolActor] = useState(null);

  // Transfer state
  const [transferChain, setTransferChain] = useState('ethereum');
  const [transferToken, setTransferToken] = useState('ETH');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDest, setTransferDest] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState(null);

  const fetchEthereumBalances = useCallback(async (addr) => {
    const chainConfig = config.chains['sepolia'];
    const client = createPublicClient({ chain: sepolia, transport: http(chainConfig.rpc) });
    const balList = [];
    try {
      const balance = await client.getBalance({ address: addr });
      balList.push({ symbol: chainConfig.nativeToken.symbol, amount: formatUnits(balance, chainConfig.nativeToken.decimals), isNative: true });
    } catch (e) { console.error(e); }
    for (const [symbol, info] of Object.entries(chainConfig.tokens)) {
      try {
        const balance = await client.readContract({ address: info.address, abi: erc20Abi, functionName: 'balanceOf', args: [addr] });
        balList.push({ symbol, amount: formatUnits(balance, info.decimals), isNative: false });
      } catch { balList.push({ symbol, amount: '0', isNative: false }); }
    }
    return balList;
  }, []);

  const fetchSolanaBalances = useCallback(async (addr) => {
    const chainConfig = config.chains['solana-devnet'];
    const connection = new Connection(chainConfig.rpc, 'confirmed');
    const pubKey = new PublicKey(addr);
    const balList = [];
    try {
      const balance = await connection.getBalance(pubKey);
      balList.push({ symbol: chainConfig.nativeToken.symbol, amount: (balance / Math.pow(10, chainConfig.nativeToken.decimals)).toString(), isNative: true });
    } catch (e) { console.error(e); }
    for (const [symbol, info] of Object.entries(chainConfig.tokens)) {
      try {
        const mint = new PublicKey(info.address);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, { mint });
        let total = 0;
        for (const { account } of tokenAccounts.value) { total += account.data.parsed.info.tokenAmount.uiAmount || 0; }
        balList.push({ symbol, amount: total.toString(), isNative: false });
      } catch { balList.push({ symbol, amount: '0', isNative: false }); }
    }
    return balList;
  }, []);

  const checkBalances = useCallback(async (addressesToScan) => {
    if (!addressesToScan || addressesToScan.length === 0) return;
    setLoading(true);
    setResults([]);
    try {
      const promises = addressesToScan.map(async (addr) => {
        let type = 'unknown';
        if (addr.startsWith('0x') && addr.length === 42) type = 'ethereum';
        else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) type = 'solana';
        else return { address: addr, error: 'Invalid address format', balances: [] };
        try {
          const balances = type === 'ethereum' ? await fetchEthereumBalances(addr) : await fetchSolanaBalances(addr);
          return { address: addr, chainType: type, balances };
        } catch (err) { return { address: addr, chainType: type, error: err.message || 'Fetch failed', balances: [] }; }
      });
      const data = await Promise.all(promises);
      setResults(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [fetchEthereumBalances, fetchSolanaBalances]);

  const handleSeedDerivation = useCallback(async () => {
    if (!inputValue) return;
    try {
      setLoading(true);
      setTransferResult(null);
      const seedBytes = new Uint8Array(sha256.array(inputValue));
      const icpId = Secp256k1KeyIdentity.fromSecretKey(seedBytes);
      const principal = icpId.getPrincipal().toText();
      const agent = new HttpAgent({ identity: icpId, host: "https://ic0.app" });
      const ethCanisterId = config.chains['sepolia'].canisterId;
      const solCanisterId = config.chains['solana-devnet'].canisterId;
      const ethActorInstance = Actor.createActor(ethTransferIdl, { agent, canisterId: ethCanisterId });
      const solActorInstance = Actor.createActor(solTransferIdl, { agent, canisterId: solCanisterId });
      setIdentity(icpId);
      setEthActor(ethActorInstance);
      setSolActor(solActorInstance);
      const [ethRes, solRes] = await Promise.all([
        ethActorInstance.get_eth_address(icpId.getPrincipal()),
        solActorInstance.get_sol_address(icpId.getPrincipal())
      ]);
      if (ethRes && 'Ok' in ethRes && solRes && 'Ok' in solRes) {
        const ethAddress = ethRes.Ok;
        const solAddress = solRes.Ok;
        setDerivedInfo({ principal, ethAddress, solAddress, seed: inputValue });
        checkBalances([ethAddress, solAddress]);
      } else {
        console.error("Failed to fetch addresses:", { ethRes, solRes });
        setLoading(false);
      }
    } catch (e) { console.error("Derivation error:", e); setLoading(false); }
  }, [inputValue, checkBalances]);

  // Convert human-readable amount to base units (wei, lamports, etc.)
  const toBaseUnits = (amount, token, chain) => {
    const chainKey = chain === 'ethereum' ? 'sepolia' : 'solana-devnet';
    const chainConfig = config.chains[chainKey];
    let decimals;
    if (token === 'ETH' || token === 'SOL') {
      decimals = chainConfig.nativeToken.decimals;
    } else {
      decimals = chainConfig.tokens[token]?.decimals || 6;
    }
    // Use BigInt-safe conversion: split on decimal, pad/truncate
    const [whole, frac = ''] = amount.split('.');
    const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + fracPadded).toString();
  };

  const handleTransfer = useCallback(async () => {
    if (!identity || !transferAmount || !transferDest) return;
    setTransferring(true);
    setTransferResult(null);
    try {
      const principal = identity.getPrincipal();
      const amountInBaseUnits = toBaseUnits(transferAmount, transferToken, transferChain);
      let result;
      if (transferChain === 'ethereum') {
        if (transferToken === 'ETH') {
          result = await ethActor.transfer_native(principal, transferDest, amountInBaseUnits);
        } else {
          const symbol = { [transferToken]: null };
          result = await ethActor.transfer(symbol, principal, transferDest, amountInBaseUnits);
        }
      } else {
        if (transferToken === 'SOL') {
          result = await solActor.transfer_native(principal, transferDest, amountInBaseUnits);
        } else {
          const symbol = { [transferToken]: null };
          result = await solActor.transfer(symbol, principal, transferDest, amountInBaseUnits);
        }
      }
      if (result && 'Ok' in result) {
        setTransferResult({ success: true, txHash: result.Ok, chain: transferChain });
      } else {
        setTransferResult({ success: false, error: formatCHError(result?.Err) || 'Transfer failed' });
      }
    } catch (e) {
      console.error("Transfer error:", e);
      setTransferResult({ success: false, error: e.message || 'Transfer failed' });
    } finally { setTransferring(false); }
  }, [identity, transferAmount, transferDest, transferChain, transferToken, ethActor, solActor]);

  useEffect(() => {
    if (selectedProfile === 'oisy' || selectedProfile === 'alice') {
      checkBalances(PROFILES[selectedProfile].addresses);
      setDerivedInfo(null);
      setIdentity(null);
    } else {
      setResults([]);
      setDerivedInfo(null);
    }
  }, [selectedProfile, checkBalances]);

  const handleManualSubmit = () => { if (inputValue) checkBalances([inputValue]); };

  const getExplorerTxUrl = (txHash, chain) => {
    if (chain === 'ethereum') return `https://sepolia.etherscan.io/tx/${txHash}`;
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  };

  const currentChainTokens = CHAINS.find(c => c.id === transferChain)?.tokens || [];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl space-y-6">
        {/* Profile Selector */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden p-2 flex bg-slate-900/40">
          {Object.values(PROFILES).map((profile) => (
            <button key={profile.id} onClick={() => setSelectedProfile(profile.id)}
              className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl transition-all font-medium text-sm",
                selectedProfile === profile.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
              {profile.id === 'custom' ? <Search className="w-4 h-4" /> : profile.id === 'seed' ? <Key className="w-4 h-4" /> : <User className="w-4 h-4" />}
              {profile.name}
            </button>
          ))}
        </div>

        {/* Main Content */}
        <motion.div layout className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden">
          <AnimatePresence mode="popLayout">
            {(selectedProfile === 'custom' || selectedProfile === 'seed') && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="p-8 border-b border-slate-700/50">
                <div className="relative">
                  <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                    placeholder={selectedProfile === 'seed' ? "Enter a seed string (e.g. Alice)..." : "Enter 0x... or Solana address..."}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-200"
                    onKeyDown={(e) => e.key === 'Enter' && (selectedProfile === 'seed' ? handleSeedDerivation() : handleManualSubmit())} />
                  {selectedProfile === 'seed' ? <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" /> : <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />}
                  <button onClick={selectedProfile === 'seed' ? handleSeedDerivation : handleManualSubmit} disabled={loading || !inputValue}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50">
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                  </button>
                </div>

                {derivedInfo && selectedProfile === 'seed' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
                      <ShieldCheck className="w-4 h-4" /> Deterministic Identity for "{derivedInfo.seed}"
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">ICP Principal</span>
                      <span className="text-xs font-mono text-slate-300 truncate">{derivedInfo.principal}</span>
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
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" /><p>Fetching balances...</p>
              </div>
            )}
            <AnimatePresence mode="popLayout">
              {results.map((res, idx) => (
                <motion.div key={res.address} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-700/30">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-2 h-2 rounded-full ring-4 ring-opacity-20", res.chainType === 'ethereum' ? 'bg-blue-400 ring-blue-400' : res.chainType === 'solana' ? 'bg-purple-400 ring-purple-400' : 'bg-slate-500 ring-slate-500')} />
                      <div>
                        <p className="text-sm font-mono text-slate-300 break-all">{res.address}</p>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{res.chainType === 'ethereum' ? 'Ethereum Sepolia' : res.chainType === 'solana' ? 'Solana Devnet' : 'Unknown Chain'}</p>
                      </div>
                    </div>
                    <a href={res.chainType === 'ethereum' ? `https://sepolia.etherscan.io/address/${res.address}` : `https://explorer.solana.com/address/${res.address}?cluster=devnet`}
                      target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  {res.error ? (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {res.error}</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {res.balances.map((bal) => (
                        <div key={bal.symbol} className="bg-slate-900/40 border border-slate-700/30 p-4 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs", bal.isNative ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-800 text-slate-400")}>{bal.symbol[0]}</div>
                            <span className="font-bold text-slate-200">{bal.symbol}</span>
                          </div>
                          <span className="font-mono text-slate-300">{parseFloat(bal.amount).toLocaleString(undefined, { maximumFractionDigits: 5 })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Transfer Section */}
            {derivedInfo && identity && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-6 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border border-indigo-500/30 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold uppercase tracking-wider">
                  <Send className="w-4 h-4" /> Transfer Tokens
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase">Chain</label>
                    <select value={transferChain} onChange={(e) => { setTransferChain(e.target.value); setTransferToken(e.target.value === 'ethereum' ? 'ETH' : 'SOL'); }}
                      className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                      {CHAINS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-bold uppercase">Token</label>
                    <select value={transferToken} onChange={(e) => setTransferToken(e.target.value)}
                      className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                      {currentChainTokens.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase">Amount</label>
                  <input type="text" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0.01"
                    className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-bold uppercase">Destination Address</label>
                  <input type="text" value={transferDest} onChange={(e) => setTransferDest(e.target.value)} placeholder={transferChain === 'ethereum' ? '0x...' : 'Solana address...'}
                    className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <button onClick={handleTransfer} disabled={transferring || !transferAmount || !transferDest}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {transferring ? <><RefreshCw className="w-5 h-5 animate-spin" /> Submitting...</> : <><Send className="w-5 h-5" /> Send Transfer</>}
                </button>

                {transferResult && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className={cn("p-4 rounded-xl flex items-center gap-3", transferResult.success ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30")}>
                    {transferResult.success ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <div className="flex-1">
                          <p className="text-green-400 font-medium">Transfer Submitted!</p>
                          <a href={getExplorerTxUrl(transferResult.txHash, transferResult.chain)} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-slate-400 hover:text-indigo-400 flex items-center gap-1 mt-1">
                            {transferResult.txHash.slice(0, 20)}... <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <p className="text-red-400">{transferResult.error}</p>
                      </>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
