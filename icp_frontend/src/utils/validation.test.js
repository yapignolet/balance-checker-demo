import { describe, it, expect } from 'vitest';
import { isValidAddress } from '../utils/validation';

describe('isValidAddress', () => {
    describe('Ethereum addresses', () => {
        it('should return true for valid Ethereum address', () => {
            expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595916da2', 'ethereum')).toBe(true);
        });

        it('should return false for Ethereum address without 0x prefix', () => {
            expect(isValidAddress('742d35Cc6634C0532925a3b844Bc9e7595916da2', 'ethereum')).toBe(false);
        });

        it('should return false for Ethereum address with wrong length', () => {
            expect(isValidAddress('0x742d35Cc6634C0532925a3b844Bc9e7595916d', 'ethereum')).toBe(false);
        });

        it('should return false for Ethereum address with invalid characters', () => {
            expect(isValidAddress('0xZZZd35Cc6634C0532925a3b844Bc9e7595916da2', 'ethereum')).toBe(false);
        });
    });

    describe('Solana addresses', () => {
        it('should return true for valid Solana address', () => {
            expect(isValidAddress('7EYnhQoR9YM3N7UoaKRoA8ApuZc7g3vS2AwYeL9JFbBd', 'solana')).toBe(true);
        });

        it('should return false for Solana address with invalid characters (0, O, I, l)', () => {
            // Solana uses base58, which excludes 0, O, I, l
            expect(isValidAddress('0EYnhQoR9YM3N7UoaKRoA8ApuZc7g3vS2AwYeL9JFbBd', 'solana')).toBe(false);
        });

        it('should return false for too short Solana address', () => {
            expect(isValidAddress('7EYnhQoR9YM3N7Uoa', 'solana')).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('should return null for empty string', () => {
            expect(isValidAddress('', 'ethereum')).toBe(null);
        });

        it('should return null for undefined', () => {
            expect(isValidAddress(undefined, 'ethereum')).toBe(null);
        });
    });
});
