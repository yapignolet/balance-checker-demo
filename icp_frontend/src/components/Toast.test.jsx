import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToastContainer from '../components/Toast';

describe('ToastContainer', () => {
    const mockToasts = [
        { id: 1, type: 'success', message: 'Success message' },
        { id: 2, type: 'error', message: 'Error message' },
        { id: 3, type: 'info', message: 'Info message' }
    ];

    it('should render nothing when toasts array is empty', () => {
        const { container } = render(<ToastContainer toasts={[]} removeToast={() => { }} />);
        expect(container.querySelector('.fixed')).toBeInTheDocument();
    });

    it('should render all toast messages', () => {
        render(<ToastContainer toasts={mockToasts} removeToast={() => { }} />);

        expect(screen.getByText('Success message')).toBeInTheDocument();
        expect(screen.getByText('Error message')).toBeInTheDocument();
        expect(screen.getByText('Info message')).toBeInTheDocument();
    });

    it('should call removeToast when close button is clicked', () => {
        const removeToast = vi.fn();
        render(<ToastContainer toasts={[{ id: 1, type: 'success', message: 'Test' }]} removeToast={removeToast} />);

        const closeButtons = screen.getAllByRole('button');
        fireEvent.click(closeButtons[0]);

        expect(removeToast).toHaveBeenCalledWith(1);
    });

    it('should apply correct styling for success toast', () => {
        render(<ToastContainer toasts={[{ id: 1, type: 'success', message: 'Success' }]} removeToast={() => { }} />);

        const toast = screen.getByText('Success').closest('div');
        expect(toast).toHaveClass('bg-green-950/90');
    });

    it('should apply correct styling for error toast', () => {
        render(<ToastContainer toasts={[{ id: 1, type: 'error', message: 'Error' }]} removeToast={() => { }} />);

        const toast = screen.getByText('Error').closest('div');
        expect(toast).toHaveClass('bg-red-950/90');
    });
});
