import React, { useState, useEffect, useCallback } from 'react';
import { createPublicClient, createWalletClient, custom, http, formatUnits, parseAbi, encodeFunctionData } from 'viem';
import { sepolia } from 'viem/chains';
import { Connection, PublicKey } from '@solana/web3.js';
import { Secp256k1KeyIdentity } from '@dfinity/identity-secp256k1';
import { sha256 } from 'js-sha256';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, RefreshCw, AlertCircle, ArrowRight, ExternalLink, Key, User, ShieldCheck, Send, CheckCircle, Repeat, XCircle, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Actor, HttpAgent } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { ethTransferIdl, solTransferIdl, matchingEngineIdl } from './idl';
import * as secp256k1 from '@noble/secp256k1';
import config from './config.json';

// Configure hmacSha256Sync and sha256Sync not needed for v1.7.1

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Simple Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-slate-900/50 border border-red-500/20 rounded-3xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">Something went wrong</h3>
          <p className="text-slate-400 text-sm mb-4">This part of the app crashed, but others are still working.</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors text-sm">Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Timeout helper
const withTimeout = (promise, ms = 30000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms))
  ]);
};

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
  if (variant === 'Unauthorized') return 'Permission denied: Unauthorized action';
  if (variant === 'InvalidSignature') return 'Invalid or expired signature';
  if (variant === 'DeadlineExceeded') return 'Transaction deadline exceeded';
  if (variant === 'ChainError') return `Blockchain Error: ${value}`;
  if (variant === 'GenericError') return `Error: ${value}`;
  return typeof value === 'string' ? value : `${variant}${value ? ': ' + JSON.stringify(value) : ''}`;
}

// Address validation helper
function isValidAddress(addr, chain) {
  if (!addr) return null;
  if (chain === 'ethereum') return /^0x[a-fA-F0-9]{40}$/.test(addr);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]);

const CHAINS = [
  { id: 'ethereum', name: 'Ethereum Sepolia', tokens: ['ETH', 'USDC', 'EURC'] },
  { id: 'solana', name: 'Solana Devnet', tokens: ['SOL', 'USDC', 'EURC'] }
];

const TABS = [
  { id: 'transfer', name: 'Transfer', icon: Send },
  { id: 'swap', name: 'Swap', icon: Repeat },
  { id: 'orders', name: 'Orders', icon: RefreshCw }
];

// Intent-specific constants matching Rust serialization
const CHAIN_IDS = { ethereum: 1, solana: 2 };
const ASSET_IDS = { USDC: 1, EURC: 2 };
const INTENT_ASSETS = [
  { chain: 'ethereum', symbol: 'USDC', label: 'ETH USDC' },
  { chain: 'ethereum', symbol: 'EURC', label: 'ETH EURC' },
  { chain: 'solana', symbol: 'USDC', label: 'SOL USDC' },
  { chain: 'solana', symbol: 'EURC', label: 'SOL EURC' }
];

const CHAIN_ICONS = {
  ethereum: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=026',
  solana: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=026'
};

// Serialize intent for signing - must match Rust serialize_intent_for_signing
function serializeIntentForSigning(principal, sourceChain, sourceSymbol, destChain, destSymbol, amount, minOutput, sequenceNumber, destAddress) {
  const parts = [];

  // Principal bytes
  const principalBytes = principal.toUint8Array();
  parts.push(...principalBytes);

  // Chain and asset IDs (1 byte each)
  parts.push(CHAIN_IDS[sourceChain]);
  parts.push(ASSET_IDS[sourceSymbol]);
  parts.push(CHAIN_IDS[destChain]);
  parts.push(ASSET_IDS[destSymbol]);

  // amount (8 bytes, big endian)
  const amountBuf = new ArrayBuffer(8);
  new DataView(amountBuf).setBigUint64(0, BigInt(amount), false);
  parts.push(...new Uint8Array(amountBuf));

  // min_output (8 bytes, big endian)
  const minOutputBuf = new ArrayBuffer(8);
  new DataView(minOutputBuf).setBigUint64(0, BigInt(minOutput), false);
  parts.push(...new Uint8Array(minOutputBuf));

  // sequence_number (8 bytes, big endian)
  const seqBuf = new ArrayBuffer(8);
  new DataView(seqBuf).setBigUint64(0, BigInt(sequenceNumber), false);
  parts.push(...new Uint8Array(seqBuf));

  // dest_address (string bytes)
  const encoder = new TextEncoder();
  parts.push(...encoder.encode(destAddress));

  return new Uint8Array(parts);
}

// Encode public key in DER/SPKI format for Secp256k1
function encodeSecp256k1PublicKeyDer(privateKey) {
  // SPKI header for secp256k1 (OID 1.2.840.10045.2.1 + 1.3.132.0.10)
  const spkiHeader = new Uint8Array([
    0x30, 0x56, // SEQUENCE, 86 bytes
    0x30, 0x10, // SEQUENCE, 16 bytes (AlgorithmIdentifier)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a, // OID secp256k1
    0x03, 0x42, 0x00 // BIT STRING, 66 bytes, 0 unused bits
  ]);
  // Get uncompressed public key (65 bytes starting with 0x04)
  const uncompressedPubKey = secp256k1.getPublicKey(privateKey, false);

  const der = new Uint8Array(spkiHeader.length + uncompressedPubKey.length);
  der.set(spkiHeader);
  der.set(uncompressedPubKey, spkiHeader.length);
  return der;
}

export default function App() {
  const [selectedTab, setSelectedTab] = useState('transfer');
  const [inputValue, setInputValue] = useState('Alice');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [derivedInfo, setDerivedInfo] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [ethActor, setEthActor] = useState(null);
  const [solActor, setSolActor] = useState(null);
  const [matchingActor, setMatchingActor] = useState(null);
  const [orders, setOrders] = useState([]);
  const [showAllOrders, setShowAllOrders] = useState(false);

  // Toast system
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((type, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const getChainBalance = useCallback((chain, symbol) => {
    const res = results.find(r => r.chainType === chain);
    if (!res) return 0;
    const bal = res.balances.find(b => b.symbol === symbol);
    return bal ? parseFloat(bal.amount) : 0;
  }, [results]);

  const hasInsufficientGas = useCallback((chain) => {
    const nativeSymbol = chain === 'ethereum' ? 'ETH' : 'SOL';
    const balance = getChainBalance(chain, nativeSymbol);
    const minRequired = chain === 'ethereum' ? 0.001 : 0.002; // Example minimums
    return balance < minRequired;
  }, [getChainBalance]);

  const fetchOrders = useCallback(async () => {
    if (!matchingActor) return;
    try {
      const allOrders = await matchingActor.list_orders();
      let displayOrders = allOrders;

      if (!showAllOrders && identity) {
        const principal = identity.getPrincipal();
        const pStr = principal.toString();
        displayOrders = allOrders.filter(o => o.intent.user.toString() === pStr);
      }

      // Sort by ID desc
      displayOrders.sort((a, b) => Number(b.id) - Number(a.id));
      setOrders(displayOrders);
    } catch (e) {
      console.error("Error fetching orders:", e);
    }
  }, [matchingActor, identity, showAllOrders]);

  useEffect(() => {
    if (selectedTab === 'orders') {
      fetchOrders();
      const interval = setInterval(fetchOrders, 5000); // Polling
      return () => clearInterval(interval);
    }
  }, [selectedTab, fetchOrders]);

  // Transfer state
  const [transferChain, setTransferChain] = useState('ethereum');
  const [transferToken, setTransferToken] = useState('ETH');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDest, setTransferDest] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState(null);

  // Intent submission state
  const [intentSourceAsset, setIntentSourceAsset] = useState('ethereum:USDC');
  const [intentDestAsset, setIntentDestAsset] = useState('solana:USDC');
  const [intentAmount, setIntentAmount] = useState('');
  const [intentMinOutput, setIntentMinOutput] = useState('');
  const [intentDestAddress, setIntentDestAddress] = useState('');
  const [submittingIntent, setSubmittingIntent] = useState(false);
  const [intentResult, setIntentResult] = useState(null);
  const [depositAddress, setDepositAddress] = useState(null);
  const [signedIntent, setSignedIntent] = useState(null);
  const [depositTx, setDepositTx] = useState(null);
  const [depositing, setDepositing] = useState(false);
  const [orderStatus, setOrderStatus] = useState(null);

  // Reset intent result and deposit address when inputs change
  useEffect(() => {
    setIntentResult(null);
    setDepositAddress(null);
    setSignedIntent(null);
    setDepositTx(null);
    setOrderStatus(null);
  }, [intentSourceAsset, intentDestAsset, intentAmount, intentMinOutput]);

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
        const balances = await withTimeout(type === 'ethereum' ? fetchEthereumBalances(addr) : fetchSolanaBalances(addr), 15000);
        setResults(prev => prev.map(r => r.chainType === type ? { ...r, address: addr, balances, loading: false, error: null } : r));
      } catch (err) {
        console.error(`Error fetching ${type} balances:`, err);
        setResults(prev => prev.map(r => r.chainType === type ? { ...r, address: addr, loading: false, error: err.message || 'Fetch failed' } : r));
        addToast('error', `Failed to fetch ${type === 'ethereum' ? 'Sepolia' : 'Devnet'} balances`);
      }
    };

    const ethAddr = addressesToScan.find(a => a.startsWith('0x'));
    const solAddr = addressesToScan.find(a => !a.startsWith('0x'));

    if (ethAddr) fetchChain(ethAddr, 'ethereum');
    if (solAddr) fetchChain(solAddr, 'solana');
  }, [fetchEthereumBalances, fetchSolanaBalances, addToast]);

  const handleSeedDerivation = useCallback(async () => {
    if (!inputValue) return;
    try {
      setLoading(true);
      setTransferResult(null);
      setIntentResult(null);
      const seedBytes = new Uint8Array(sha256.array(inputValue));
      const icpId = Secp256k1KeyIdentity.fromSecretKey(seedBytes);
      const principal = icpId.getPrincipal();
      const principalText = principal.toText();

      const agent = new HttpAgent({ identity: icpId, host: "https://ic0.app" });
      const ethCanisterId = config.chains['sepolia'].canisterId;
      const solCanisterId = config.chains['solana-devnet'].canisterId;
      const matchingCanisterId = config.matchingEngine;
      const ethActorInstance = Actor.createActor(ethTransferIdl, { agent, canisterId: ethCanisterId });
      const solActorInstance = Actor.createActor(solTransferIdl, { agent, canisterId: solCanisterId });
      const matchingActorInstance = Actor.createActor(matchingEngineIdl, { agent, canisterId: matchingCanisterId });

      setIdentity(icpId);
      setEthActor(ethActorInstance);
      setSolActor(solActorInstance);
      setMatchingActor(matchingActorInstance);

      // Check cache
      const cacheKey = `address_cache_${inputValue}`;
      const cached = localStorage.getItem(cacheKey);
      let ethAddress, solAddress;

      if (cached) {
        const data = JSON.parse(cached);
        ethAddress = data.ethAddress;
        solAddress = data.solAddress;
        console.log("Using cached addresses for", inputValue);
      } else {
        const [ethRes, solRes] = await Promise.all([
          ethActorInstance.get_eth_address(principal),
          solActorInstance.get_sol_address(principal)
        ]);

        if (ethRes && 'Ok' in ethRes && solRes && 'Ok' in solRes) {
          ethAddress = ethRes.Ok;
          solAddress = solRes.Ok;
          // Store in cache
          localStorage.setItem(cacheKey, JSON.stringify({ ethAddress, solAddress }));
        } else {
          console.error("Failed to fetch addresses:", { ethRes, solRes });
          setLoading(false);
          return;
        }
      }

      setDerivedInfo({ principal: principalText, ethAddress, solAddress, seed: inputValue });
      // Auto-fill intent destination with Solana address (default dest is Solana)
      setIntentDestAddress(solAddress);
      checkBalances([ethAddress, solAddress]);

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

  // Handle intent submission with signing
  const handleGetDepositAddress = useCallback(async () => {
    if (!identity || !matchingActor || !intentAmount || !intentDestAddress) return;

    // Determine source actor
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

      // Convert amounts to base units (6 decimals for stablecoins)
      const amountBaseUnits = BigInt(Math.floor(parseFloat(intentAmount) * 1e6));
      const minOutputBaseUnits = BigInt(Math.floor(parseFloat(intentMinOutput || intentAmount) * 1e6));

      // Fetch sequence number from canister
      const sequenceNumber = await matchingActor.get_next_sequence_number(principal);

      // Get the private key from identity for signing
      const keyPair = identity.getKeyPair();
      const privateKey = keyPair.secretKey.slice(0, 32); // First 32 bytes is the private key
      const publicKeyDer = encodeSecp256k1PublicKeyDer(privateKey);

      // Serialize and sign the intent
      const messageToSign = serializeIntentForSigning(
        principal,
        sourceChain,
        sourceSymbol,
        destChain,
        destSymbol,
        amountBaseUnits.toString(),
        minOutputBaseUnits.toString(),
        sequenceNumber.toString(),
        intentDestAddress
      );

      // Hash the message first (secp256k1 expects 32-byte hash)
      const msgHash = new Uint8Array(sha256.array(messageToSign));

      // Sign (async) - v1.7.1
      const signature = await secp256k1.sign(msgHash, privateKey, { der: false });
      const signatureBytes = signature; // Already Uint8Array(64) in v1.7.1 with der: false

      // Build the intent object
      const intent = {
        user: principal,
        source_asset: { chain: { [sourceChain === 'ethereum' ? 'Ethereum' : 'Solana']: null }, symbol: { [sourceSymbol]: null } },
        dest_asset: { chain: { [destChain === 'ethereum' ? 'Ethereum' : 'Solana']: null }, symbol: { [destSymbol]: null } },
        dest_address: intentDestAddress,
        amount: amountBaseUnits,
        min_output: minOutputBaseUnits,
        sequence_number: sequenceNumber,
        public_key: Array.from(publicKeyDer),
        signature: Array.from(signatureBytes),
        signature_type: { Secp256k1: null }
      };

      // Call get_address_for_intent on the source chain canister
      console.log(`Calling get_address_for_intent on ${sourceChain}...`);
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
    } finally { setSubmittingIntent(false); }
  }, [identity, matchingActor, ethActor, solActor, intentSourceAsset, intentDestAsset, intentAmount, intentMinOutput, intentDestAddress]);

  const handleDeposit = useCallback(async () => {
    if (!depositAddress || !intentAmount) return;
    setDepositing(true);
    setDepositTx(null);

    try {
      const principal = identity.getPrincipal(); // The user's principal
      const [sourceChain, sourceSymbol] = intentSourceAsset.split(':');

      const amountInBaseUnits = toBaseUnits(intentAmount, sourceSymbol, sourceChain);

      let result;
      if (sourceChain === 'ethereum') {
        if (sourceSymbol === 'ETH') {
          result = await ethActor.transfer_native(principal, depositAddress, amountInBaseUnits);
        } else {
          const symbol = { [sourceSymbol]: null };
          result = await ethActor.transfer(symbol, principal, depositAddress, amountInBaseUnits);
        }
      } else { // Solana
        if (sourceSymbol === 'SOL') {
          result = await solActor.transfer_native(principal, depositAddress, amountInBaseUnits);
        } else {
          const symbol = { [sourceSymbol]: null };
          result = await solActor.transfer(symbol, principal, depositAddress, amountInBaseUnits);
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
    } finally { setSubmittingIntent(false); }
  }, [matchingActor, signedIntent]);

  const handleCheckStatus = useCallback(async (id) => {
    if (!matchingActor) return;
    try {
      const orderId = BigInt(id);
      const orderOpt = await matchingActor.get_order(orderId);
      if (orderOpt.length > 0) {
        const order = orderOpt[0];
        const statusKey = Object.keys(order.status)[0];
        const statusVal = order.status[statusKey];
        const statusStr = statusVal ? `${statusKey}: ${statusVal}` : statusKey;
        setOrderStatus(statusStr);
      } else {
        setOrderStatus("NotFound");
      }
    } catch (e) {
      console.error(e);
      setOrderStatus("Error checking status");
    }
  }, [matchingActor]);

  const handleCancelOrder = useCallback(async (id) => {
    if (!matchingActor) return;
    try {
      const orderId = BigInt(id);
      const result = await matchingActor.cancel_order(orderId);
      if (result && 'Ok' in result) {
        setOrderStatus("Cancelled");
        addToast('success', 'Order cancelled successfully');
      } else {
        addToast('error', "Cancel Failed: " + formatCHError(result?.Err));
      }
    } catch (e) {
      addToast('error', "Cancel Error: " + e.message);
    }
  }, [matchingActor]);

  // Update intent dest address when dest asset chain changes
  useEffect(() => {
    if (derivedInfo) {
      const [destChain] = intentDestAsset.split(':');
      setIntentDestAddress(destChain === 'ethereum' ? derivedInfo.ethAddress : derivedInfo.solAddress);
    }
  }, [intentDestAsset, derivedInfo]);

  const getExplorerTxUrl = (txHash, chain) => {
    if (chain === 'ethereum') return `https://sepolia.etherscan.io/tx/${txHash}`;
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  };

  const currentChainTokens = CHAINS.find(c => c.id === transferChain)?.tokens || [];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl space-y-6">
        {/* Connection Header */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden">
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-xs text-slate-400 font-bold uppercase">Identity Seed</label>
            </div>
            <div className="relative">
              <input type="text" value={inputValue} onChange={(e) => {
                setInputValue(e.target.value);
                setDerivedInfo(null);
                setResults([]);
                setIdentity(null);
              }}
                placeholder="e.g. Alice"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-200"
                onKeyDown={(e) => e.key === 'Enter' && handleSeedDerivation()} />
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <button onClick={handleSeedDerivation} disabled={loading || !inputValue}
                className={cn("absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all disabled:opacity-50",
                  derivedInfo?.seed === inputValue ? "bg-green-600/20 text-green-400 border border-green-500/30" : "bg-indigo-600 hover:bg-indigo-500 text-white")}>
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                  (derivedInfo?.seed === inputValue ? <Check className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />)}
              </button>
            </div>


          </div>
        </div>

        {derivedInfo && (
          <div className="space-y-6">
            {/* Persistent Balances Dashboard */}
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-lg overflow-hidden p-6">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Balances</h3>
                <button onClick={() => checkBalances([derivedInfo.ethAddress, derivedInfo.solAddress])} disabled={loading} className="text-indigo-400 hover:text-white transition-colors flex items-center gap-2 text-[10px] font-bold uppercase">
                  <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> {loading ? 'Refreshing...' : 'Refresh'}
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
                          <a href={res.chainType === 'ethereum' ? `https://sepolia.etherscan.io/address/${res.address}` : `https://explorer.solana.com/address/${res.address}?cluster=devnet`}
                            target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-400 transition-colors">
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
                            <div key={bal.symbol} className={cn("bg-slate-900/40 border border-slate-700/30 p-3 rounded-xl flex items-center justify-between transition-opacity", res.loading && "opacity-50")}>
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
              {!results.length && (
                <div className="text-center py-4 text-slate-500 text-sm italic">Connect to fetch balances...</div>
              )}
            </div>

            {/* Tab Selector */}
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden p-2 flex bg-slate-900/40">
              {TABS.map((tab) => (
                <button key={tab.id} onClick={() => setSelectedTab(tab.id)}
                  className={cn("flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl transition-all font-medium text-sm",
                    selectedTab === tab.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}>
                  <tab.icon className="w-4 h-4" />
                  {tab.name}
                </button>
              ))}
            </div>

            {/* Main Content Area */}
            <motion.div layout className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                {selectedTab === 'orders' && (
                  <ErrorBoundary>
                    <motion.div key="orders" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-6">
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2"><RefreshCw className="w-5 h-5" /> Orders</h3>

                          <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-700/50">
                            <button onClick={() => setShowAllOrders(false)}
                              className={cn("px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                !showAllOrders ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}>
                              My Orders
                            </button>
                            <button onClick={() => setShowAllOrders(true)}
                              className={cn("px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                showAllOrders ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}>
                              All Orders
                            </button>
                            <div className="w-px h-4 bg-slate-700 mx-1" />
                            <button onClick={fetchOrders} className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {orders.length === 0 ? (
                          <p className="text-slate-500 text-center py-8">No orders found.</p>
                        ) : (
                          <div className="space-y-3">
                            {orders.map(order => {
                              const statusKey = Object.keys(order.status)[0];
                              const isLocked = statusKey === 'Locked';
                              return (
                                <div key={order.id.toString()} className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex items-center justify-between">
                                  <div>
                                    <div className="text-sm text-slate-300 font-mono">Order #{order.id.toString()}</div>
                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                      <span className="flex items-center gap-1">
                                        {Number(order.intent.amount) / 1e6}
                                        <img src={CHAIN_ICONS[Object.keys(order.intent.source_asset.chain)[0].toLowerCase()]} alt="chain" className="w-3 h-3" />
                                        {Object.keys(order.intent.source_asset.symbol)[0]}
                                      </span>
                                      <ArrowRight className="w-3 h-3" />
                                      <span className="flex items-center gap-1">
                                        <img src={CHAIN_ICONS[Object.keys(order.intent.dest_asset.chain)[0].toLowerCase()]} alt="chain" className="w-3 h-3" />
                                        {Object.keys(order.intent.dest_asset.symbol)[0]}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={cn("text-xs px-2 py-1 rounded border",
                                      statusKey === 'Settled' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                        statusKey === 'Cancelled' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                          "bg-blue-500/10 text-blue-400 border-blue-500/20")}>
                                      {statusKey}
                                    </span>
                                    {isLocked && (
                                      <button onClick={() => handleCancelOrder(order.id)} className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Cancel Order">
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </ErrorBoundary>
                )}

                {selectedTab === 'transfer' && derivedInfo && identity && (
                  <ErrorBoundary>
                    <motion.div key="transfer" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-6">
                      <div className="bg-slate-900/50 p-6 rounded-2xl border border-indigo-500/30 space-y-4">
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
                          <div className="flex justify-between">
                            <label className="text-xs text-slate-500 font-bold uppercase">Amount</label>
                            <button onClick={() => {
                              const chainRes = results.find(r => r.chainType === transferChain);
                              if (chainRes) {
                                const bal = chainRes.balances.find(b => b.symbol === transferToken);
                                if (bal) setTransferAmount(bal.amount);
                              }
                            }} className="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase">Max</button>
                          </div>
                          <input type="text" value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)} placeholder="0.01"
                            className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 font-bold uppercase">Destination Address</label>
                          <input type="text" value={transferDest} onChange={(e) => setTransferDest(e.target.value)} placeholder={transferChain === 'ethereum' ? '0x...' : 'Solana address...'}
                            className={cn("w-full mt-1 bg-slate-900/50 border rounded-xl px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2",
                              transferDest ? (isValidAddress(transferDest, transferChain) ? "border-green-500/50 focus:ring-green-500/50" : "border-red-500/50 focus:ring-red-500/50") : "border-slate-700 focus:ring-indigo-500/50")} />
                          {transferDest && !isValidAddress(transferDest, transferChain) && (
                            <p className="mt-1 text-[10px] text-red-500 font-medium">Invalid {transferChain === 'ethereum' ? 'Sepolia' : 'Devnet'} address format</p>
                          )}
                        </div>
                        <button onClick={handleTransfer}
                          disabled={transferring || !transferAmount || !transferDest || !isValidAddress(transferDest, transferChain) || (parseFloat(transferAmount) > getChainBalance(transferChain, transferToken)) || hasInsufficientGas(transferChain)}
                          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex flex-col items-center justify-center gap-0.5">
                          <div className="flex items-center gap-2">
                            {transferring ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            <span>{transferring ? 'Submitting...' : 'Send Transfer'}</span>
                          </div>
                          {!transferring && transferAmount && parseFloat(transferAmount) > getChainBalance(transferChain, transferToken) && (
                            <span className="text-[10px] opacity-80">Insufficient {transferToken} balance</span>
                          )}
                          {!transferring && hasInsufficientGas(transferChain) && (
                            <span className="text-[10px] opacity-80">Insufficient {transferChain === 'ethereum' ? 'ETH' : 'SOL'} for gas</span>
                          )}
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
                      </div>
                    </motion.div>
                  </ErrorBoundary>
                )}

                {selectedTab === 'swap' && derivedInfo && identity && matchingActor && (
                  <ErrorBoundary>
                    <motion.div key="swap" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="p-6">
                      <div className="bg-slate-900/50 p-6 rounded-2xl border border-emerald-500/30 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold uppercase tracking-wider">
                          <Repeat className="w-4 h-4" /> Submit Swap Order
                        </div>
                        {(() => {
                          const solRes = results.find(r => r.chainType === 'solana');
                          const solBal = solRes?.balances.find(b => b.symbol === 'SOL')?.amount;
                          if (solBal && parseFloat(solBal) < 0.002) {
                            return (
                              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3">
                                <AlertCircle className="w-4 h-4 text-yellow-500" />
                                <p className="text-yellow-500 text-xs">
                                  Your SOL balance is low ({parseFloat(solBal).toFixed(6)} SOL). You need SOL to pay for transaction fees.
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs text-slate-500 font-bold uppercase">Source Asset</label>
                            <select value={intentSourceAsset} onChange={(e) => setIntentSourceAsset(e.target.value)}
                              className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                              {INTENT_ASSETS.map(a => <option key={`${a.chain}:${a.symbol}`} value={`${a.chain}:${a.symbol}`}>{a.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 font-bold uppercase">Destination Asset</label>
                            <select value={intentDestAsset} onChange={(e) => setIntentDestAsset(e.target.value)}
                              className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50">
                              {INTENT_ASSETS.map(a => <option key={`${a.chain}:${a.symbol}`} value={`${a.chain}:${a.symbol}`}>{a.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex justify-between items-center h-5">
                              <label className="text-xs text-slate-500 font-bold uppercase">Amount (source)</label>
                              <button onClick={() => {
                                if (!intentSourceAsset) return;
                                const [shouldBeChain, symbol] = intentSourceAsset.split(':');
                                const chainType = shouldBeChain.toLowerCase();
                                const chainRes = results.find(r => r.chainType === chainType);
                                if (chainRes) {
                                  const bal = chainRes.balances.find(b => b.symbol === symbol);
                                  if (bal) setIntentAmount(bal.amount);
                                }
                              }} className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded">MAX</button>
                            </div>
                            <input type="text" value={intentAmount} onChange={(e) => setIntentAmount(e.target.value)} placeholder="100.00"
                              className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          </div>
                          <div>
                            <div className="flex items-center h-5">
                              <label className="text-xs text-slate-500 font-bold uppercase">Min Output</label>
                            </div>
                            <input type="text" value={intentMinOutput} onChange={(e) => setIntentMinOutput(e.target.value)} placeholder="99.00 (optional)"
                              className="w-full mt-1 bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50" />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-xs text-slate-500 font-bold uppercase">Destination Address</label>
                            {derivedInfo && intentDestAddress === (intentDestAsset.split(':')[0] === 'ethereum' ? derivedInfo.ethAddress : derivedInfo.solAddress) && (
                              <span className="text-[10px] text-emerald-500 font-bold uppercase flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Auto-filled
                              </span>
                            )}
                          </div>
                          <input type="text" value={intentDestAddress} onChange={(e) => setIntentDestAddress(e.target.value)} placeholder="Destination address..."
                            className={cn("w-full bg-slate-900/50 border rounded-xl px-4 py-3 text-slate-200 font-mono text-sm focus:outline-none focus:ring-2",
                              intentDestAddress ? (isValidAddress(intentDestAddress, intentDestAsset.split(':')[0]) ? "border-green-500/50 focus:ring-green-500/50" : "border-red-500/50 focus:ring-red-500/50") : "border-slate-700 focus:ring-emerald-500/50")} />
                          {intentDestAddress && !isValidAddress(intentDestAddress, intentDestAsset.split(':')[0]) && (
                            <p className="mt-1 text-[10px] text-red-500 font-medium">Invalid {intentDestAsset.split(':')[0] === 'ethereum' ? 'Sepolia' : 'Devnet'} address format</p>
                          )}
                        </div>

                        {/* Get Deposit Address Button */}
                        <button onClick={handleGetDepositAddress}
                          disabled={submittingIntent || !intentAmount || !intentDestAddress || !isValidAddress(intentDestAddress, intentDestAsset.split(':')[0]) || !!depositAddress || (parseFloat(intentAmount) > getChainBalance(intentSourceAsset.split(':')[0], intentSourceAsset.split(':')[1])) || hasInsufficientGas(intentSourceAsset.split(':')[0])}
                          className={cn("w-full py-3 text-white font-bold rounded-xl transition-all flex flex-col items-center justify-center gap-0.5",
                            depositAddress ? "bg-slate-700 cursor-not-allowed opacity-75" : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/20")}>
                          <div className="flex items-center gap-2">
                            {submittingIntent && !depositAddress ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                              depositAddress ? <CheckCircle className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                            <span>{submittingIntent && !depositAddress ? 'Preparing Intent...' :
                              depositAddress ? 'Address Generated' : 'Get Deposit Address'}</span>
                          </div>
                          {!depositAddress && !submittingIntent && intentAmount && parseFloat(intentAmount) > getChainBalance(intentSourceAsset.split(':')[0], intentSourceAsset.split(':')[1]) && (
                            <span className="text-[10px] opacity-80">Insufficient {intentSourceAsset.split(':')[1]} balance</span>
                          )}
                          {!depositAddress && !submittingIntent && hasInsufficientGas(intentSourceAsset.split(':')[0]) && (
                            <span className="text-[10px] opacity-80">Insufficient {intentSourceAsset.split(':')[0] === 'ethereum' ? 'ETH' : 'SOL'} for gas</span>
                          )}
                        </button>

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
                                Send <b>{intentAmount} {intentSourceAsset.split(':')[1]}</b> to this address.
                              </div>
                            </div>

                            <button onClick={handleDeposit} disabled={depositing || !!depositTx}
                              className={cn("w-full py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-bold shadow-lg",
                                depositTx ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20")}>
                              {depositing ? <RefreshCw className="w-4 h-4 animate-spin" /> :
                                depositTx ? <><CheckCircle className="w-4 h-4" /> Deposit Executed</> :
                                  <><Send className="w-4 h-4" /> Execute Deposit</>}
                            </button>

                            {depositTx && (
                              <div className="space-y-4 pt-4 border-t border-white/10 mt-4">
                                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                                  <ExternalLink className="w-4 h-4" />
                                  <a href={getExplorerTxUrl(depositTx, intentSourceAsset.split(':')[0])} target="_blank" rel="noreferrer" className="underline hover:text-indigo-300">
                                    View Deposit Transaction
                                  </a>
                                </div>

                                <button onClick={handleFinalSubmitIntent} disabled={submittingIntent || (intentResult?.success && intentResult?.orderId)}
                                  className={cn("w-full py-3 text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2",
                                    (intentResult?.success && intentResult?.orderId) ? "bg-slate-800 text-slate-400 cursor-default" : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20")}>
                                  {submittingIntent ? <><RefreshCw className="w-5 h-5 animate-spin" /> Submitting Order...</> :
                                    (intentResult?.success && intentResult?.orderId) ? <><CheckCircle className="w-5 h-5" /> Order submitted successfully</> : <><ShieldCheck className="w-5 h-5" /> Submit Swap Order</>}
                                </button>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {intentResult && !intentResult.success && (
                          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 mt-4">
                            <AlertCircle className="w-5 h-5 text-red-400" />
                            <p className="text-red-400 text-sm">{intentResult.error}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </ErrorBoundary>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
        {/* Toast Notifications */}
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
          <AnimatePresence>
            {toasts.map(toast => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={cn("pointer-events-auto px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[300px] backdrop-blur-md",
                  toast.type === 'error' ? "bg-red-950/90 border-red-500/30 text-red-100" :
                    toast.type === 'success' ? "bg-green-950/90 border-green-500/30 text-green-100" :
                      "bg-slate-900/90 border-slate-700/50 text-slate-100")}
              >
                {toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-400" /> :
                  toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400" /> :
                    <RefreshCw className="w-5 h-5 text-indigo-400" />}
                <span className="text-sm font-medium">{toast.message}</span>
                <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="ml-auto p-1 hover:bg-white/10 rounded-lg transition-colors">
                  <XCircle className="w-4 h-4 opacity-50 hover:opacity-100" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
