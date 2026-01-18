import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, RefreshCw, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { cn, CHAINS } from '../constants';
import { isValidAddress } from '../utils/validation';
import { toBaseUnits, formatCHError, getExplorerTxUrl } from '../utils/formatters';

/**
 * Transfer tab component for sending tokens.
 * @param {{ identity, ethActor, solActor, results, getChainBalance, hasInsufficientGas }} props
 */
export default function TransferTab({ identity, ethActor, solActor, results, getChainBalance, hasInsufficientGas }) {
    const [transferChain, setTransferChain] = useState('ethereum');
    const [transferToken, setTransferToken] = useState('ETH');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferDest, setTransferDest] = useState('');
    const [transferring, setTransferring] = useState(false);
    const [transferResult, setTransferResult] = useState(null);

    const currentChainTokens = CHAINS.find(c => c.id === transferChain)?.tokens || [];

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
        } finally {
            setTransferring(false);
        }
    }, [identity, transferAmount, transferDest, transferChain, transferToken, ethActor, solActor]);

    const isValidDest = isValidAddress(transferDest, transferChain);
    const insufficientBalance = transferAmount && parseFloat(transferAmount) > getChainBalance(transferChain, transferToken);
    const insufficientGas = hasInsufficientGas(transferChain);
    const canSubmit = !transferring && transferAmount && transferDest && isValidDest && !insufficientBalance && !insufficientGas;

    return (
        <motion.div
            key="transfer"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-6"
        >
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-indigo-500/30 space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 text-sm font-bold uppercase tracking-wider">
                    <Send className="w-4 h-4" /> Transfer Tokens
                </div>

                {/* Chain and Token Selection */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase">Chain</label>
                        <select
                            value={transferChain}
                            onChange={(e) => {
                                setTransferChain(e.target.value);
                                setTransferToken(e.target.value === 'ethereum' ? 'ETH' : 'SOL');
                            }}
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {CHAINS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase">Token</label>
                        <select
                            value={transferToken}
                            onChange={(e) => setTransferToken(e.target.value)}
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                        >
                            {currentChainTokens.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>

                {/* Amount */}
                <div>
                    <div className="flex justify-between">
                        <label className="text-xs text-slate-500 font-bold uppercase">Amount</label>
                        <button
                            onClick={() => {
                                const chainRes = results.find(r => r.chainType === transferChain);
                                if (chainRes) {
                                    const bal = chainRes.balances.find(b => b.symbol === transferToken);
                                    if (bal) setTransferAmount(bal.amount);
                                }
                            }}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase"
                        >
                            Max
                        </button>
                    </div>
                    <input
                        type="text"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="0.01"
                        className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    />
                </div>

                {/* Destination */}
                <div>
                    <label className="text-xs text-slate-500 font-bold uppercase">Destination Address</label>
                    <input
                        type="text"
                        value={transferDest}
                        onChange={(e) => setTransferDest(e.target.value)}
                        placeholder={transferChain === 'ethereum' ? '0x...' : 'Solana address...'}
                        className={cn(
                            "w-full mt-1 bg-slate-900/50 border rounded-xl px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2",
                            transferDest ? (isValidDest ? "border-green-500/50 focus:ring-green-500/50" : "border-red-500/50 focus:ring-red-500/50") : "border-slate-700 focus:ring-indigo-500/50"
                        )}
                    />
                    {transferDest && !isValidDest && (
                        <p className="mt-1 text-[10px] text-red-500 font-medium">
                            Invalid {transferChain === 'ethereum' ? 'Sepolia' : 'Devnet'} address format
                        </p>
                    )}
                </div>

                {/* Submit Button */}
                <button
                    onClick={handleTransfer}
                    disabled={!canSubmit}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-0.5"
                >
                    <div className="flex items-center gap-2">
                        {transferring ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        <span>{transferring ? 'Submitting...' : 'Send Transfer'}</span>
                    </div>
                    {!transferring && insufficientBalance && (
                        <span className="text-[10px] opacity-80">Insufficient {transferToken} balance</span>
                    )}
                    {!transferring && insufficientGas && (
                        <span className="text-[10px] opacity-80">Insufficient {transferChain === 'ethereum' ? 'ETH' : 'SOL'} for gas</span>
                    )}
                </button>

                {/* Result */}
                {transferResult && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={cn(
                            "p-4 rounded-xl flex items-center gap-3",
                            transferResult.success ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
                        )}
                    >
                        {transferResult.success ? (
                            <>
                                <CheckCircle className="w-5 h-5 text-green-400" />
                                <div className="flex-1">
                                    <p className="text-green-400 font-medium">Transfer Submitted!</p>
                                    <a
                                        href={getExplorerTxUrl(transferResult.txHash, transferResult.chain)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs font-mono text-slate-400 hover:text-indigo-400 flex items-center gap-1 mt-1"
                                    >
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
            </div>
        </motion.div>
    );
}
