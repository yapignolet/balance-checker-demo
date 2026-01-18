import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OrdersTab from '../components/OrdersTab';

const mockOrders = [
    {
        id: BigInt(1),
        status: { Locked: null },
        intent: {
            amount: BigInt(100000000),
            source_asset: { chain: { Ethereum: null }, symbol: { USDC: null } },
            dest_asset: { chain: { Solana: null }, symbol: { USDC: null } }
        }
    },
    {
        id: BigInt(2),
        status: { Settled: null },
        intent: {
            amount: BigInt(50000000),
            source_asset: { chain: { Solana: null }, symbol: { EURC: null } },
            dest_asset: { chain: { Ethereum: null }, symbol: { EURC: null } }
        }
    }
];

describe('OrdersTab', () => {
    const defaultProps = {
        orders: mockOrders,
        showAllOrders: false,
        setShowAllOrders: vi.fn(),
        fetchOrders: vi.fn(),
        handleCancelOrder: vi.fn()
    };

    it('should render orders list', () => {
        render(<OrdersTab {...defaultProps} />);

        expect(screen.getByText('Order #1')).toBeInTheDocument();
        expect(screen.getByText('Order #2')).toBeInTheDocument();
    });

    it('should display order status', () => {
        render(<OrdersTab {...defaultProps} />);

        expect(screen.getByText('Locked')).toBeInTheDocument();
        expect(screen.getByText('Settled')).toBeInTheDocument();
    });

    it('should show cancel button only for Locked orders', () => {
        render(<OrdersTab {...defaultProps} />);

        // Should have exactly one cancel button (for the Locked order)
        const cancelButtons = screen.getAllByTitle('Cancel Order');
        expect(cancelButtons).toHaveLength(1);
    });

    it('should call handleCancelOrder when cancel button is clicked', () => {
        const handleCancelOrder = vi.fn();
        render(<OrdersTab {...defaultProps} handleCancelOrder={handleCancelOrder} />);

        const cancelButton = screen.getByTitle('Cancel Order');
        fireEvent.click(cancelButton);

        expect(handleCancelOrder).toHaveBeenCalledWith(BigInt(1));
    });

    it('should show "No orders found" when orders array is empty', () => {
        render(<OrdersTab {...defaultProps} orders={[]} />);

        expect(screen.getByText('No orders found.')).toBeInTheDocument();
    });

    it('should toggle between My Orders and All Orders', () => {
        const setShowAllOrders = vi.fn();
        render(<OrdersTab {...defaultProps} setShowAllOrders={setShowAllOrders} />);

        const allOrdersButton = screen.getByText('All Orders');
        fireEvent.click(allOrdersButton);

        expect(setShowAllOrders).toHaveBeenCalledWith(true);
    });

    it('should call fetchOrders when refresh button is clicked', () => {
        const fetchOrders = vi.fn();
        render(<OrdersTab {...defaultProps} fetchOrders={fetchOrders} />);

        // The refresh button is the one after the toggle
        const refreshButtons = screen.getAllByRole('button');
        const refreshButton = refreshButtons.find(btn => btn.querySelector('svg.w-3\\.5'));
        fireEvent.click(refreshButton);

        expect(fetchOrders).toHaveBeenCalled();
    });
});
