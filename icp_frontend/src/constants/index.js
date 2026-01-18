import { parseAbi } from 'viem';

// ============================================================================
// Chain Configuration
// ============================================================================

export const CHAINS = [
    { id: 'ethereum', name: 'Ethereum Sepolia', tokens: ['ETH', 'USDC', 'EURC'] },
    { id: 'solana', name: 'Solana Devnet', tokens: ['SOL', 'USDC', 'EURC'] }
];

export const CHAIN_ICONS = {
    ethereum: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=026',
    solana: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=026'
};

// ============================================================================
// Tab Configuration
// ============================================================================

export const TABS = [
    { id: 'transfer', name: 'Transfer' },
    { id: 'swap', name: 'Swap' },
    { id: 'orders', name: 'Orders' }
];

// ============================================================================
// Intent/Swap Assets
// ============================================================================

export const INTENT_ASSETS = [
    { chain: 'ethereum', symbol: 'USDC', label: 'ETH USDC' },
    { chain: 'ethereum', symbol: 'EURC', label: 'ETH EURC' },
    { chain: 'solana', symbol: 'USDC', label: 'SOL USDC' },
    { chain: 'solana', symbol: 'EURC', label: 'SOL EURC' }
];

// ============================================================================
// Contract ABIs
// ============================================================================

export const erc20Abi = parseAbi([
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
]);

// ============================================================================
// Styling Utilities
// ============================================================================

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with clsx support.
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
