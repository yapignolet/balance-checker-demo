import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout } from '../utils/timeout';

describe('withTimeout', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should resolve with the promise result if it completes before timeout', async () => {
        const fastPromise = Promise.resolve('success');
        const result = await withTimeout(fastPromise, 1000);
        expect(result).toBe('success');
    });

    it('should reject with timeout error if promise takes too long', async () => {
        const slowPromise = new Promise((resolve) => {
            setTimeout(() => resolve('late'), 2000);
        });

        const timeoutPromise = withTimeout(slowPromise, 1000);

        // Advance timers past timeout
        vi.advanceTimersByTime(1500);

        await expect(timeoutPromise).rejects.toThrow('Request timed out');
    });

    it('should use default timeout of 30000ms', async () => {
        const slowPromise = new Promise((resolve) => {
            setTimeout(() => resolve('late'), 35000);
        });

        const timeoutPromise = withTimeout(slowPromise);

        // Advance past default timeout
        vi.advanceTimersByTime(31000);

        await expect(timeoutPromise).rejects.toThrow('Request timed out');
    });
});
