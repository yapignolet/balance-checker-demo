import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../hooks/useToast';

describe('useToast', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should initialize with empty toasts array', () => {
        const { result } = renderHook(() => useToast());
        expect(result.current.toasts).toEqual([]);
    });

    it('should add a toast when addToast is called', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.addToast('success', 'Test message');
        });

        expect(result.current.toasts).toHaveLength(1);
        expect(result.current.toasts[0].type).toBe('success');
        expect(result.current.toasts[0].message).toBe('Test message');
    });

    it('should add multiple toasts', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.addToast('success', 'Success!');
            result.current.addToast('error', 'Error!');
        });

        expect(result.current.toasts).toHaveLength(2);
    });

    it('should remove toast manually via removeToast', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.addToast('success', 'Test');
        });

        const toastId = result.current.toasts[0].id;

        act(() => {
            result.current.removeToast(toastId);
        });

        expect(result.current.toasts).toHaveLength(0);
    });

    it('should auto-remove toast after 5 seconds', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.addToast('success', 'Auto-remove test');
        });

        expect(result.current.toasts).toHaveLength(1);

        act(() => {
            vi.advanceTimersByTime(5000);
        });

        expect(result.current.toasts).toHaveLength(0);
    });
});
