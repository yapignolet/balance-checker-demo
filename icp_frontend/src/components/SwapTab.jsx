import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Repeat, RefreshCw, CheckCircle, AlertCircle, ExternalLink, Send, ShieldCheck } from 'lucide-react';
import { sha256 } from 'js-sha256';
import { cn, INTENT_ASSETS } from '../constants';
import { isValidAddress } from '../utils/validation';
import { toBaseUnits, formatCHError, getExplorerTxUrl } from '../utils/formatters';
import { serializeIntentForSigning, encodeSecp256k1PublicKeyDer, secp256k1 } from '../utils/crypto';

/**
 * Swap tab component for submitting swap orders.
 */
export default function SwapTab({
    identity,
    derivedInfo,
    ethActor,
    solActor,
    matchingActor,
    results,
    getChainBalance,
    hasInsufficientGas
}) {
    // Form state
    const [intentSourceAsset, setIntentSourceAsset] = useState('ethereum:USDC');
    const [intentDestAsset, setIntentDestAsset] = useState('solana:USDC');
    const [intentAmount, setIntentAmount] = useState('');
    const [intentMinOutput, setIntentMinOutput] = useState('');
    const [intentDestAddress, setIntentDestAddress] = useState('');

    // Submission state
    const [submittingIntent, setSubmittingIntent] = useState(false);
    const [intentResult, setIntentResult] = useState(null);
    const [depositAddress, setDepositAddress] = useState(null);
    const [signedIntent, setSignedIntent] = useState(null);
    const [depositTx, setDepositTx] = useState(null);
    const [depositing, setDepositing] = useState(false);

    // Auto-fill dest address when dest asset changes
    useEffect(() => {
        if (derivedInfo) {
            const [destChain] = intentDestAsset.split(':');
            setIntentDestAddress(destChain === 'ethereum' ? derivedInfo.ethAddress : derivedInfo.solAddress);
        }
    }, [intentDestAsset, derivedInfo]);

    // Reset state when inputs change
    useEffect(() => {
        setIntentResult(null);
        setDepositAddress(null);
        setSignedIntent(null);
        setDepositTx(null);
    }, [intentSourceAsset, intentDestAsset, intentAmount, intentMinOutput]);

    const handleGetDepositAddress = useCallback(async () => {
        if (!identity || !matchingActor || !intentAmount || !intentDestAddress) return;

        const [sChain] = intentSourceAsset.split(':');
        const sourceActor = sChain === 'ethereum' ? ethActor : solActor;

        if (!sourceActor) {
            setIntentResult({ success: false, error: "Source chain actor not initialized" });
            return;
        }

        setSubmittingIntent(true);
        setIntentResult(null);
        setDepositAddress(null);

        try {
            const principal = identity.getPrincipal();
            const [sourceChain, sourceSymbol] = intentSourceAsset.split(':');
            const [destChain, destSymbol] = intentDestAsset.split(':');

            const amountBaseUnits = BigInt(Math.floor(parseFloat(intentAmount) * 1e6));
            const minOutputBaseUnits = BigInt(Math.floor(parseFloat(intentMinOutput || intentAmount) * 1e6));
            const sequenceNumber = await matchingActor.get_next_sequence_number(principal);

            const keyPair = identity.getKeyPair();
            const privateKey = keyPair.secretKey.slice(0, 32);
            const publicKeyDer = encodeSecp256k1PublicKeyDer(privateKey);

            const messageToSign = serializeIntentForSigning(
                principal, sourceChain, sourceSymbol, destChain, destSymbol,
                amountBaseUnits.toString(), minOutputBaseUnits.toString(),
                sequenceNumber.toString(), intentDestAddress
            );

            const msgHash = new Uint8Array(sha256.array(messageToSign));
            const signature = await secp256k1.sign(msgHash, privateKey, { der: false });

            const intent = {
                user: principal,
                source_asset: { chain: { [sourceChain === 'ethereum' ? 'Ethereum' : 'Solana']: null }, symbol: { [sourceSymbol]: null } },
                dest_asset: { chain: { [destChain === 'ethereum' ? 'Ethereum' : 'Solana']: null }, symbol: { [destSymbol]: null } },
                dest_address: intentDestAddress,
                amount: amountBaseUnits,
                min_output: minOutputBaseUnits,
                sequence_number: sequenceNumber,
                public_key: Array.from(publicKeyDer),
                signature: Array.from(signature),
                signature_type: { Secp256k1: null }
            };

            const result = await sourceActor.get_address_for_intent(intent);

            if (result && 'Ok' in result) {
                setDepositAddress(result.Ok);
                setSignedIntent(intent);
                setIntentResult({ success: true, message: "Deposit Address Generated" });
            } else {
                setIntentResult({ success: false, error: formatCHError(result?.Err) || 'Failed to get deposit address' });
            }
        } catch (e) {
            console.error("Error getting deposit address:", e);
            setIntentResult({ success: false, error: e.message || 'Error occurred' });
        } finally {
            setSubmittingIntent(false);
        }
    }, [identity, matchingActor, ethActor, solActor, intentSourceAsset, intentDestAsset, intentAmount, intentMinOutput, intentDestAddress]);

    const handleDeposit = useCallback(async () => {
        if (!depositAddress || !intentAmount) return;
        setDepositing(true);
        setDepositTx(null);

        try {
            const principal = identity.getPrincipal();
            const [sourceChain, sourceSymbol] = intentSourceAsset.split(':');
            const amountInBaseUnits = toBaseUnits(intentAmount, sourceSymbol, sourceChain);

            let result;
            if (sourceChain === 'ethereum') {
                if (sourceSymbol === 'ETH') {
                    result = await ethActor.transfer_native(principal, depositAddress, amountInBaseUnits);
                } else {
                    result = await ethActor.transfer({ [sourceSymbol]: null }, principal, depositAddress, amountInBaseUnits);
                }
            } else {
                if (sourceSymbol === 'SOL') {
                    result = await solActor.transfer_native(principal, depositAddress, amountInBaseUnits);
                } else {
                    result = await solActor.transfer({ [sourceSymbol]: null }, principal, depositAddress, amountInBaseUnits);
                }
            }

            if (result && 'Ok' in result) {
                setDepositTx(result.Ok);
                setIntentResult({ success: true, message: "Deposit Initiated via Canister" });
            } else {
                setIntentResult({ success: false, error: formatCHError(result?.Err) || "Deposit failed" });
            }
        } catch (e) {
            console.error("Deposit error:", e);
            setIntentResult({ success: false, error: e.message || "Deposit failed" });
        } finally {
            setDepositing(false);
        }
    }, [intentSourceAsset, intentAmount, depositAddress, ethActor, solActor, identity]);

    const handleFinalSubmitIntent = useCallback(async () => {
        if (!signedIntent || !matchingActor) return;
        setSubmittingIntent(true);
        try {
            const result = await matchingActor.submit_intent(signedIntent);
            if (result && 'Ok' in result) {
                setIntentResult({ success: true, orderId: result.Ok.toString() });
            } else {
                setIntentResult({ success: false, error: formatCHError(result?.Err) });
            }
        } catch (e) {
            setIntentResult({ success: false, error: e.message });
        } finally {
            setSubmittingIntent(false);
        }
    }, [matchingActor, signedIntent]);

    const [sourceChain, sourceSymbol] = intentSourceAsset.split(':');
    const [destChain] = intentDestAsset.split(':');
    const isValidDest = isValidAddress(intentDestAddress, destChain);
    const insufficientBalance = intentAmount && parseFloat(intentAmount) > getChainBalance(sourceChain, sourceSymbol);
    const insufficientGas = hasInsufficientGas(sourceChain);
    const canGetAddress = !submittingIntent && intentAmount && intentDestAddress && isValidDest && !depositAddress && !insufficientBalance && !insufficientGas;

    // SOL balance warning
    const solRes = results.find(r => r.chainType === 'solana');
    const solBal = solRes?.balances.find(b => b.symbol === 'SOL')?.amount;
    const lowSolWarning = solBal && parseFloat(solBal) < 0.002;

    return (
        <motion.div
            key="swap"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-6"
        >
            <div className="bg-slate-900/50 p-6 rounded-2xl border border-emerald-500/30 space-y-4">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold uppercase tracking-wider">
                    <Repeat className="w-4 h-4" /> Submit Swap Order
                </div>

                {/* Low SOL Warning */}
                {lowSolWarning && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3">
                        <AlertCircle className="w-4 h-4 text-yellow-500" />
                        <p className="text-yellow-500 text-xs">
                            Your SOL balance is low ({parseFloat(solBal).toFixed(6)} SOL). You need SOL for transaction fees.
                        </p>
                    </div>
                )}

                {/* Asset Selection */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase">Source Asset</label>
                        <select
                            value={intentSourceAsset}
                            onChange={(e) => setIntentSourceAsset(e.target.value)}
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        >
                            {INTENT_ASSETS.map(a => <option key={`${a.chain}:${a.symbol}`} value={`${a.chain}:${a.symbol}`}>{a.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase">Destination Asset</label>
                        <select
                            value={intentDestAsset}
                            onChange={(e) => setIntentDestAsset(e.target.value)}
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        >
                            {INTENT_ASSETS.map(a => <option key={`${a.chain}:${a.symbol}`} value={`${a.chain}:${a.symbol}`}>{a.label}</option>)}
                        </select>
                    </div>
                </div>

                {/* Amount and Min Output */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="flex justify-between items-center h-5">
                            <label className="text-xs text-slate-500 font-bold uppercase">Amount (source)</label>
                            <button
                                onClick={() => {
                                    const chainRes = results.find(r => r.chainType === sourceChain);
                                    if (chainRes) {
                                        const bal = chainRes.balances.find(b => b.symbol === sourceSymbol);
                                        if (bal) setIntentAmount(bal.amount);
                                    }
                                }}
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded"
                            >
                                MAX
                            </button>
                        </div>
                        <input
                            type="text"
                            value={intentAmount}
                            onChange={(e) => setIntentAmount(e.target.value)}
                            placeholder="100.00"
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                    </div>
                    <div>
                        <div className="flex items-center h-5">
                            <label className="text-xs text-slate-500 font-bold uppercase">Min Output</label>
                        </div>
                        <input
                            type="text"
                            value={intentMinOutput}
                            onChange={(e) => setIntentMinOutput(e.target.value)}
                            placeholder="99.00 (optional)"
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                    </div>
                </div>

                {/* Destination Address */}
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-xs text-slate-500 font-bold uppercase">Destination Address</label>
                        {derivedInfo && intentDestAddress === (destChain === 'ethereum' ? derivedInfo.ethAddress : derivedInfo.solAddress) && (
                            <span className="text-[10px] text-emerald-500 font-bold uppercase flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Auto-filled
                            </span>
                        )}
                    </div>
                    <input
                        type="text"
                        value={intentDestAddress}
                        onChange={(e) => setIntentDestAddress(e.target.value)}
                        placeholder="Destination address..."
                        className={cn(
                            "w-full bg-slate-900/50 border rounded-xl px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2",
                            intentDestAddress ? (isValidDest ? "border-green-500/50 focus:ring-green-500/50" : "border-red-500/50 focus:ring-red-500/50") : "border-slate-700 focus:ring-emerald-500/50"
                        )}
                    />
                    {intentDestAddress && !isValidDest && (
                        <p className="mt-1 text-[10px] text-red-500 font-medium">
                            Invalid {destChain === 'ethereum' ? 'Sepolia' : 'Devnet'} address format
                        </p>
                    )}
                </div>

                {/* Get Deposit Address Button */}
                <button
                    onClick={handleGetDepositAddress}
                    disabled={!canGetAddress}
                    className={cn(
                        "w-full py-3 text-white font-bold rounded-xl transition-all flex flex-col items-center justify-center gap-0.5",
                        depositAddress ? "bg-slate-700 cursor-not-allowed opacity-75" : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20"
                    )}
                >
                    <div className="flex items-center gap-2">
                        {submittingIntent && !depositAddress ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                            depositAddress ? <CheckCircle className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                        <span>{submittingIntent && !depositAddress ? 'Preparing Intent...' :
                            depositAddress ? 'Address Generated' : 'Get Deposit Address'}</span>
                    </div>
                    {!depositAddress && !submittingIntent && insufficientBalance && (
                        <span className="text-[10px] opacity-80">Insufficient {sourceSymbol} balance</span>
                    )}
                    {!depositAddress && !submittingIntent && insufficientGas && (
                        <span className="text-[10px] opacity-80">Insufficient {sourceChain === 'ethereum' ? 'ETH' : 'SOL'} for gas</span>
                    )}
                </button>

                {/* Deposit Flow */}
                {depositAddress && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-emerald-400 font-medium">
                                <CheckCircle className="w-4 h-4" /> Deposit Address Ready
                            </div>
                            <div className="bg-black/30 p-2 rounded text-slate-200 font-mono text-xs break-all select-all border border-emerald-500/10">
                                {depositAddress}
                            </div>
                            <div className="text-xs text-slate-400 text-center">
                                Send <b>{intentAmount} {sourceSymbol}</b> to this address.
                            </div>
                        </div>

                        <button
                            onClick={handleDeposit}
                            disabled={depositing || !!depositTx}
                            className={cn(
                                "w-full py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-bold shadow-lg",
                                depositTx ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20"
                            )}
                        >
                            {depositing ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                                depositTx ? <><CheckCircle className="w-4 h-4" /> Deposit Executed</> :
                                    <><Send className="w-4 h-4" /> Execute Deposit</>}
                        </button>

                        {depositTx && (
                            <div className="space-y-4 pt-4 border-t border-white/10 mt-4">
                                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                                    <ExternalLink className="w-4 h-4" />
                                    <a href={getExplorerTxUrl(depositTx, sourceChain)} target="_blank" rel="noreferrer" className="underline hover:text-indigo-300">
                                        View Deposit Transaction
                                    </a>
                                </div>

                                <button
                                    onClick={handleFinalSubmitIntent}
                                    disabled={submittingIntent || (intentResult?.success && intentResult?.orderId)}
                                    className={cn(
                                        "w-full py-3 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2",
                                        (intentResult?.success && intentResult?.orderId) ? "bg-slate-800 text-slate-400 cursor-default" : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20"
                                    )}
                                >
                                    {submittingIntent ? <><RefreshCw className="w-5 h-5 animate-spin" /> Submitting Order...</> :
                                        (intentResult?.success && intentResult?.orderId) ? <><CheckCircle className="w-5 h-5" /> Order submitted successfully</> : <><ShieldCheck className="w-5 h-5" /> Submit Swap Order</>}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Error Display */}
                {intentResult && !intentResult.success && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 mt-4">
                        <AlertCircle className="w-5 h-5 text-red-400" />
                        <p className="text-red-400 text-sm">{intentResult.error}</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
