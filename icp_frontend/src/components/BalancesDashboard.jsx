import { RefreshCw, ExternalLink, AlertCircle } from 'lucide-react';
import { cn, CHAIN_ICONS } from '../constants';

/**
 * Persistent balances dashboard component.
 * @param {{ results, derivedInfo, checkBalances, loading }} props
 */
export default function BalancesDashboard({ results, derivedInfo, checkBalances, loading }) {
    if (!derivedInfo) return null;

    return (
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-lg overflow-hidden p-6">
            <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Balances</h3>
                <button
                    onClick={() => checkBalances([derivedInfo.ethAddress, derivedInfo.solAddress])}
                    disabled={loading}
                    className="text-indigo-400 hover:text-white transition-colors flex items-center gap-2 text-[10px] font-bold uppercase"
                >
                    <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                    {loading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['ethereum', 'solana'].map(chain => {
                    const res = results.find(r => r.chainType === chain);
                    if (!res) return null;

                    return (
                        <div key={chain} className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <div className="flex items-center gap-2">
                                    <img src={CHAIN_ICONS[chain]} className="w-4 h-4" alt={chain} />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                        {chain === 'ethereum' ? 'Sepolia' : 'Devnet'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {res.loading && <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />}
                                    <a
                                        href={chain === 'ethereum'
                                            ? `https://sepolia.etherscan.io/address/${res.address}`
                                            : `https://explorer.solana.com/address/${res.address}?cluster=devnet`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-slate-500 hover:text-indigo-400 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            </div>

                            {res.error ? (
                                <div className="bg-red-500/5 border border-red-500/20 p-3 rounded-xl flex items-center gap-2 text-[10px] text-red-400 italic">
                                    <AlertCircle className="w-3.5 h-3.5" /> {res.error}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {res.balances.filter(b => b.symbol === 'USDC' || b.symbol === 'EURC').map(bal => (
                                        <div
                                            key={bal.symbol}
                                            className={cn(
                                                "bg-slate-900/40 border border-slate-700/30 p-3 rounded-xl flex items-center justify-between transition-opacity",
                                                res.loading && "opacity-50"
                                            )}
                                        >
                                            <span className="text-[11px] font-bold text-slate-300">{bal.symbol}</span>
                                            <span className="text-sm font-mono text-white">{parseFloat(bal.amount).toFixed(6)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
