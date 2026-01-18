import { describe, it, expect } from 'vitest';
import { formatCHError, getExplorerTxUrl } from '../utils/formatters';

describe('formatCHError', () => {
    it('should return string errors unchanged', () => {
        expect(formatCHError('Simple error')).toBe('Simple error');
    });

    it('should return "Unknown error" for null', () => {
        expect(formatCHError(null)).toBe('Unknown error');
    });

    it('should return "Unknown error" for undefined', () => {
        expect(formatCHError(undefined)).toBe('Unknown error');
    });

    it('should return "Unknown error" for empty object', () => {
        expect(formatCHError({})).toBe('Unknown error');
    });

    it('should format InsufficientBalance error', () => {
        const err = {
            InsufficientBalance: {
                asset: { USDC: null },
                requested: '100',
                available: '50'
            }
        };
        expect(formatCHError(err)).toBe('Insufficient USDC balance: requested 100, available 50');
    });

    it('should format Unauthorized error', () => {
        expect(formatCHError({ Unauthorized: null })).toBe('Permission denied: Unauthorized action');
    });

    it('should format InvalidSignature error', () => {
        expect(formatCHError({ InvalidSignature: null })).toBe('Invalid or expired signature');
    });

    it('should format DeadlineExceeded error', () => {
        expect(formatCHError({ DeadlineExceeded: null })).toBe('Transaction deadline exceeded');
    });

    it('should format ChainError with message', () => {
        expect(formatCHError({ ChainError: 'RPC timeout' })).toBe('Blockchain Error: RPC timeout');
    });

    it('should format GenericError with message', () => {
        expect(formatCHError({ GenericError: 'Something went wrong' })).toBe('Error: Something went wrong');
    });

    it('should format unknown variant with string value', () => {
        expect(formatCHError({ CustomError: 'Custom message' })).toBe('Custom message');
    });
});

describe('getExplorerTxUrl', () => {
    it('should return Etherscan Sepolia URL for ethereum chain', () => {
        const hash = '0x123abc';
        expect(getExplorerTxUrl(hash, 'ethereum')).toBe('https://sepolia.etherscan.io/tx/0x123abc');
    });

    it('should return Solana Explorer devnet URL for solana chain', () => {
        const hash = 'ABC123';
        expect(getExplorerTxUrl(hash, 'solana')).toBe('https://explorer.solana.com/tx/ABC123?cluster=devnet');
    });
});
