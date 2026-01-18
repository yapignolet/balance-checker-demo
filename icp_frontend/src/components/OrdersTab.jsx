import { motion } from 'framer-motion';
import { RefreshCw, ArrowRight, XCircle } from 'lucide-react';
import { cn, CHAIN_ICONS } from '../constants';

/**
 * Orders tab component with visibility toggle.
 * @param {{ orders, showAllOrders, setShowAllOrders, fetchOrders, handleCancelOrder }} props
 */
export default function OrdersTab({ orders, showAllOrders, setShowAllOrders, fetchOrders, handleCancelOrder }) {
    return (
        <motion.div
            key="orders"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="p-6"
        >
            <div className="space-y-4">
                {/* Header with toggle */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                        <RefreshCw className="w-5 h-5" /> Orders
                    </h3>

                    <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-700/50">
                        <button
                            onClick={() => setShowAllOrders(false)}
                            className={cn(
                                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                !showAllOrders ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            My Orders
                        </button>
                        <button
                            onClick={() => setShowAllOrders(true)}
                            className={cn(
                                "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                showAllOrders ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                            )}
                        >
                            All Orders
                        </button>
                        <div className="w-px h-4 bg-slate-700 mx-1" />
                        <button
                            onClick={fetchOrders}
                            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Orders list */}
                {orders.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No orders found.</p>
                ) : (
                    <div className="space-y-3">
                        {orders.map(order => {
                            const statusKey = Object.keys(order.status)[0];
                            const isLocked = statusKey === 'Locked';

                            return (
                                <div
                                    key={order.id.toString()}
                                    className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex items-center justify-between"
                                >
                                    <div>
                                        <div className="text-sm text-slate-300 font-mono">
                                            Order #{order.id.toString()}
                                        </div>
                                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                            <span className="flex items-center gap-1">
                                                {Number(order.intent.amount) / 1e6}
                                                <img
                                                    src={CHAIN_ICONS[Object.keys(order.intent.source_asset.chain)[0].toLowerCase()]}
                                                    alt="chain"
                                                    className="w-3 h-3"
                                                />
                                                {Object.keys(order.intent.source_asset.symbol)[0]}
                                            </span>
                                            <ArrowRight className="w-3 h-3" />
                                            <span className="flex items-center gap-1">
                                                <img
                                                    src={CHAIN_ICONS[Object.keys(order.intent.dest_asset.chain)[0].toLowerCase()]}
                                                    alt="chain"
                                                    className="w-3 h-3"
                                                />
                                                {Object.keys(order.intent.dest_asset.symbol)[0]}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={cn(
                                            "text-xs px-2 py-1 rounded border",
                                            statusKey === 'Settled' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                                                statusKey === 'Cancelled' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                                    "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                        )}>
                                            {statusKey}
                                        </span>
                                        {isLocked && (
                                            <button
                                                onClick={() => handleCancelOrder(order.id)}
                                                className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                                title="Cancel Order"
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
