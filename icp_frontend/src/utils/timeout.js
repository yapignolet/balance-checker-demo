/**
 * Timeout helper - wraps a promise with a configurable timeout.
 * @param {Promise} promise - The promise to wrap.
 * @param {number} ms - Timeout in milliseconds (default: 30000).
 * @returns {Promise} - Resolves with the original promise or rejects on timeout.
 */
export const withTimeout = (promise, ms = 30000) => {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), ms)
        )
    ]);
};
