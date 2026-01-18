import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Key, RefreshCw, ArrowRight, Check } from 'lucide-react';

// Hooks
import { useToast } from './hooks/useToast';
import { useIdentity } from './hooks/useIdentity';
import { useBalances } from './hooks/useBalances';
import { useOrders } from './hooks/useOrders';

// Components
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/Toast';
import BalancesDashboard from './components/BalancesDashboard';
import OrdersTab from './components/OrdersTab';
import TransferTab from './components/TransferTab';
import SwapTab from './components/SwapTab';

// Constants
import { cn, TABS } from './constants';

/**
 * Main Application Component
 * 
 * This is a slim orchestration layer that composes hooks and components.
 * Business logic is encapsulated in custom hooks, UI is in components.
 */
export default function App() {
  const [selectedTab, setSelectedTab] = useState('transfer');

  // Initialize hooks
  const { toasts, addToast, removeToast } = useToast();
  const { results, checkBalances, getChainBalance, hasInsufficientGas } = useBalances(addToast);

  const {
    inputValue,
    setInputValue,
    identity,
    derivedInfo,
    ethActor,
    solActor,
    matchingActor,
    handleSeedDerivation,
    loading
  } = useIdentity(checkBalances, setIntentDestAddress);

  const {
    orders,
    showAllOrders,
    setShowAllOrders,
    fetchOrders,
    handleCancelOrder
  } = useOrders(matchingActor, identity, selectedTab, addToast);

  // Auto-update intent dest address when derivedInfo changes
  useEffect(() => {
    if (derivedInfo) {
      setIntentDestAddress(derivedInfo.solAddress);
    }
  }, [derivedInfo]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl space-y-6">

        {/* ===== Connection Header ===== */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden">
          <div className="p-8 space-y-6">
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-xs text-slate-400 font-bold uppercase">Identity Seed</label>
            </div>
            <div className="relative">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. Alice"
                className="w-full bg-slate-900/50 border border-slate-700 rounded-2xl px-5 py-4 pl-12 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-200"
                onKeyDown={(e) => e.key === 'Enter' && handleSeedDerivation()}
              />
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <button
                onClick={handleSeedDerivation}
                disabled={loading || !inputValue}
                className={cn(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all disabled:opacity-50",
                  derivedInfo?.seed === inputValue
                    ? "bg-green-600/20 text-green-400 border border-green-500/30"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white"
                )}
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                  (derivedInfo?.seed === inputValue ? <Check className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />)}
              </button>
            </div>
          </div>
        </div>

        {/* ===== Connected State ===== */}
        {derivedInfo && (
          <div className="space-y-6">

            {/* Balances Dashboard */}
            <BalancesDashboard
              results={results}
              derivedInfo={derivedInfo}
              checkBalances={checkBalances}
              loading={loading}
            />

            {/* Tab Selector */}
            <div className="flex justify-center gap-2">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id)}
                  className={cn(
                    "px-4 py-2 rounded-xl font-medium transition-all text-sm",
                    selectedTab === tab.id
                      ? "bg-indigo-600 text-white shadow-lg"
                      : "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800"
                  )}
                >
                  {tab.name}
                </button>
              ))}
            </div>

            {/* Main Content Area */}
            <motion.div
              layout
              className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-xl overflow-hidden"
            >
              <AnimatePresence mode="popLayout" initial={false}>

                {/* Orders Tab */}
                {selectedTab === 'orders' && (
                  <ErrorBoundary>
                    <OrdersTab
                      orders={orders}
                      showAllOrders={showAllOrders}
                      setShowAllOrders={setShowAllOrders}
                      fetchOrders={fetchOrders}
                      handleCancelOrder={handleCancelOrder}
                    />
                  </ErrorBoundary>
                )}

                {/* Transfer Tab */}
                {selectedTab === 'transfer' && identity && (
                  <ErrorBoundary>
                    <TransferTab
                      identity={identity}
                      ethActor={ethActor}
                      solActor={solActor}
                      results={results}
                      getChainBalance={getChainBalance}
                      hasInsufficientGas={hasInsufficientGas}
                    />
                  </ErrorBoundary>
                )}

                {/* Swap Tab */}
                {selectedTab === 'swap' && identity && matchingActor && (
                  <ErrorBoundary>
                    <SwapTab
                      identity={identity}
                      derivedInfo={derivedInfo}
                      ethActor={ethActor}
                      solActor={solActor}
                      matchingActor={matchingActor}
                      results={results}
                      getChainBalance={getChainBalance}
                      hasInsufficientGas={hasInsufficientGas}
                    />
                  </ErrorBoundary>
                )}

              </AnimatePresence>
            </motion.div>
          </div>
        )}

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </div>
    </div>
  );
}
