import { useState, useCallback, useEffect } from 'react';

/**
 * Custom hook for managing orders with visibility toggle.
 * @param {object} matchingActor - The matching engine canister actor.
 * @param {object} identity - The current user identity.
 * @param {string} selectedTab - Currently selected tab.
 * @param {Function} addToast - Toast notification function.
 * @returns {{ orders, showAllOrders, setShowAllOrders, fetchOrders, handleCancelOrder }}
 */
export function useOrders(matchingActor, identity, selectedTab, addToast) {
    const [orders, setOrders] = useState([]);
    const [showAllOrders, setShowAllOrders] = useState(false);

    const fetchOrders = useCallback(async () => {
        if (!matchingActor) return;
        try {
            const allOrders = await matchingActor.list_orders();
            let displayOrders = allOrders;

            if (!showAllOrders && identity) {
                const principal = identity.getPrincipal();
                const pStr = principal.toString();
                displayOrders = allOrders.filter(o => o.intent.user.toString() === pStr);
            }

            // Sort by ID desc
            displayOrders.sort((a, b) => Number(b.id) - Number(a.id));
            setOrders(displayOrders);
        } catch (e) {
            console.error("Error fetching orders:", e);
        }
    }, [matchingActor, identity, showAllOrders]);

    const handleCancelOrder = useCallback(async (id) => {
        if (!matchingActor) return;
        try {
            const orderId = BigInt(id);
            const result = await matchingActor.cancel_order(orderId);
            if (result && 'Ok' in result) {
                addToast('success', 'Order cancelled successfully');
                fetchOrders(); // Refresh after cancel
            } else {
                const errMsg = result?.Err ? JSON.stringify(result.Err) : 'Unknown error';
                addToast('error', `Cancel Failed: ${errMsg}`);
            }
        } catch (e) {
            addToast('error', `Cancel Error: ${e.message}`);
        }
    }, [matchingActor, addToast, fetchOrders]);

    // Auto-fetch and poll when on orders tab
    useEffect(() => {
        if (selectedTab === 'orders') {
            fetchOrders();
            const interval = setInterval(fetchOrders, 5000);
            return () => clearInterval(interval);
        }
    }, [selectedTab, fetchOrders]);

    return { orders, showAllOrders, setShowAllOrders, fetchOrders, handleCancelOrder };
}
