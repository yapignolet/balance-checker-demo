import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, RefreshCw, ExternalLink } from 'lucide-react';
import { createPublicClient, http, formatUnits } from 'viem';
import { sepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { cn, CHAIN_ICONS, erc20Abi } from '../constants';
import config from '../config.json';

// Settlement Engine addresses
const SETTLEMENT_ENGINE = {
    eth: '0xB1a3d389cd05cd8540667EE8943bdB7A279EE91B',
    sol: 'EAbtcR4EKQRVgCoJGg2a8KMaWWjKWBbRjJCKMUSs7TLL'
};

/**
 * Admin Panel component showing Settlement Engine balances
 */
export default function AdminPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [ethBalances, setEthBalances] = useState(null);
    const [solBalances, setSolBalances] = useState(null);

    const fetchBalances = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch Ethereum balances
            const ethConfig = config.chains['sepolia'];
            const ethClient = createPublicClient({ chain: sepolia, transport: http(ethConfig.rpc) });

            const ethNative = await ethClient.getBalance({ address: SETTLEMENT_ENGINE.eth });
            const ethBalList = [{
                symbol: 'ETH',
                amount: formatUnits(ethNative, 18),
                isNative: true
            }];

            for (const [symbol, info] of Object.entries(ethConfig.tokens)) {
                try {
                    const balance = await ethClient.readContract({
                        address: info.address,
                        abi: erc20Abi,
                        functionName: 'balanceOf',
                        args: [SETTLEMENT_ENGINE.eth]
                    });
                    ethBalList.push({ symbol, amount: formatUnits(balance, info.decimals), isNative: false });
                } catch {
                    ethBalList.push({ symbol, amount: '0', isNative: false });
                }
            }
            setEthBalances(ethBalList);

            // Fetch Solana balances
            const solConfig = config.chains['solana-devnet'];
            const connection = new Connection(solConfig.rpc, 'confirmed');
            const pubKey = new PublicKey(SETTLEMENT_ENGINE.sol);

            const solNative = await connection.getBalance(pubKey);
            const solBalList = [{
                symbol: 'SOL',
                amount: (solNative / 1e9).toString(),
                isNative: true
            }];

            for (const [symbol, info] of Object.entries(solConfig.tokens)) {
                try {
                    const mint = new PublicKey(info.address);
                    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubKey, { mint });
                    let total = 0;
                    for (const { account } of tokenAccounts.value) {
                        total += account.data.parsed.info.tokenAmount.uiAmount || 0;
                    }
                    solBalList.push({ symbol, amount: total.toString(), isNative: false });
                } catch {
                    solBalList.push({ symbol, amount: '0', isNative: false });
                }
            }
            setSolBalances(solBalList);
        } catch (e) {
            console.error('Error fetching Settlement Engine balances:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen && !ethBalances) {
            fetchBalances();
        }
    }, [isOpen, ethBalances, fetchBalances]);

    return (
        <>
            {/* Admin Toggle Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 left-6 p-3 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-slate-400 hover:text-white transition-all shadow-xl backdrop-blur-md z-50"
                title="Admin Panel"
            >
                <Settings className="w-5 h-5" />
            </button>

            {/* Modal Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
                        onClick={() => setIsOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-900 border border-slate-700/50 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-6 border-b border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/10 rounded-xl">
                                        <Settings className="w-5 h-5 text-amber-400" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Admin Panel</h2>
                                        <p className="text-xs text-slate-500">Settlement Engine Balances</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={fetchBalances}
                                        disabled={loading}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                    >
                                        <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                                    </button>
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-6">
                                {/* Ethereum Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <img src={CHAIN_ICONS.ethereum} className="w-5 h-5" alt="ETH" />
                                            <span className="text-sm font-bold text-slate-300">Ethereum Sepolia</span>
                                        </div>
                                        <a
                                            href={`https://sepolia.etherscan.io/address/${SETTLEMENT_ENGINE.eth}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-slate-500 hover:text-indigo-400 font-mono flex items-center gap-1"
                                        >
                                            {SETTLEMENT_ENGINE.eth.slice(0, 6)}...{SETTLEMENT_ENGINE.eth.slice(-4)}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>

                                    {loading && !ethBalances ? (
                                        <div className="flex items-center justify-center py-4">
                                            <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                                        </div>
                                    ) : ethBalances ? (
                                        <div className="grid grid-cols-3 gap-2">
                                            {ethBalances.map(bal => (
                                                <div key={bal.symbol} className="bg-slate-800/50 border border-slate-700/30 p-3 rounded-xl">
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase">{bal.symbol}</div>
                                                    <div className="text-sm font-mono text-white">{parseFloat(bal.amount).toFixed(bal.isNative ? 4 : 2)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>

                                {/* Solana Section */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <img src={CHAIN_ICONS.solana} className="w-5 h-5" alt="SOL" />
                                            <span className="text-sm font-bold text-slate-300">Solana Devnet</span>
                                        </div>
                                        <a
                                            href={`https://explorer.solana.com/address/${SETTLEMENT_ENGINE.sol}?cluster=devnet`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-xs text-slate-500 hover:text-indigo-400 font-mono flex items-center gap-1"
                                        >
                                            {SETTLEMENT_ENGINE.sol.slice(0, 6)}...{SETTLEMENT_ENGINE.sol.slice(-4)}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>

                                    {loading && !solBalances ? (
                                        <div className="flex items-center justify-center py-4">
                                            <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                                        </div>
                                    ) : solBalances ? (
                                        <div className="grid grid-cols-3 gap-2">
                                            {solBalances.map(bal => (
                                                <div key={bal.symbol} className="bg-slate-800/50 border border-slate-700/30 p-3 rounded-xl">
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase">{bal.symbol}</div>
                                                    <div className="text-sm font-mono text-white">{parseFloat(bal.amount).toFixed(bal.isNative ? 4 : 2)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
