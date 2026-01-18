import config from '../config.json';

/**
 * Format CHError object to a user-friendly string.
 * @param {object|string} err - The error object from canister calls.
 * @returns {string} - Human-readable error message.
 */
export function formatCHError(err) {
    if (typeof err === 'string') return err;
    if (!err || typeof err !== 'object') return 'Unknown error';

    const keys = Object.keys(err);
    if (keys.length === 0) return 'Unknown error';

    const variant = keys[0];
    const value = err[variant];

    // Handle specific error variants
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

/**
 * Convert human-readable amount to base units (wei, lamports, etc.).
 * @param {string} amount - Human-readable amount (e.g., "1.5").
 * @param {string} token - Token symbol (e.g., 'ETH', 'USDC').
 * @param {string} chain - Chain identifier ('ethereum' or 'solana').
 * @returns {string} - Amount in base units as a string.
 */
export function toBaseUnits(amount, token, chain) {
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
}

/**
 * Get the block explorer URL for a transaction.
 * @param {string} txHash - The transaction hash.
 * @param {string} chain - 'ethereum' or 'solana'.
 * @returns {string} - Full explorer URL.
 */
export function getExplorerTxUrl(txHash, chain) {
    if (chain === 'ethereum') return `https://sepolia.etherscan.io/tx/${txHash}`;
    return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
}
