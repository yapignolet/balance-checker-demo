import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '../constants';

/**
 * Toast notification container component.
 * @param {{ toasts: Array, removeToast: Function }} props
 */
export default function ToastContainer({ toasts, removeToast }) {
    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        className={cn(
                            "pointer-events-auto px-5 py-3 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[300px] backdrop-blur-md",
                            toast.type === 'error' ? "bg-red-950/90 border-red-500/30 text-red-100" :
                                toast.type === 'success' ? "bg-green-950/90 border-green-500/30 text-green-100" :
                                    "bg-slate-900/90 border-slate-700/50 text-slate-100"
                        )}
                    >
                        {toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-400" /> :
                            toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-400" /> :
                                <RefreshCw className="w-5 h-5 text-indigo-400" />}
                        <span className="text-sm font-medium">{toast.message}</span>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="ml-auto p-1 hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <XCircle className="w-4 h-4 opacity-50 hover:opacity-100" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
