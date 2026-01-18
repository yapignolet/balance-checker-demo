/**
 * Address validation helper.
 * @param {string} addr - The address to validate.
 * @param {string} chain - 'ethereum' or 'solana'.
 * @returns {boolean|null} - True if valid, false if invalid, null if empty.
 */
export function isValidAddress(addr, chain) {
    if (!addr) return null;
    if (chain === 'ethereum') return /^0x[a-fA-F0-9]{40}$/.test(addr);
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}
