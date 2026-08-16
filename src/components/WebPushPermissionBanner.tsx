import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellRing, Sparkles, X, ShieldCheck, Check } from 'lucide-react';
import { requestWebPushPermission } from '../lib/webPush';
import { User } from '../types';

interface WebPushPermissionBannerProps {
  currentUser: User | null;
  onPermissionGranted: (token: string | null) => void;
  onDismissPrompt: () => void;
}

export default function WebPushPermissionBanner({
  currentUser,
  onPermissionGranted,
  onDismissPrompt
}: WebPushPermissionBannerProps) {
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleEnablePush = async () => {
    setLoading(true);
    setStatusMessage(null);

    const result = await requestWebPushPermission();
    setLoading(false);

    if (result.granted) {
      setIsSuccess(true);
      setStatusMessage('Web push notifications enabled successfully!');
      onPermissionGranted(result.token);
      setTimeout(() => {
        onDismissPrompt();
      }, 1500);
    } else {
      if (result.permission === 'denied') {
        setStatusMessage('Notifications are blocked in your browser settings. Please enable them in browser site settings.');
      } else {
        setStatusMessage(result.error || 'Permission was not granted.');
      }
      setTimeout(() => {
        onDismissPrompt();
      }, 4000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg bg-[#18181B] border border-zinc-700/80 rounded-3xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-[#0A84FF]/15 border border-[#0A84FF]/30 flex items-center justify-center text-[#0A84FF] flex-shrink-0 mt-0.5">
            {isSuccess ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <BellRing className="w-5 h-5 animate-pulse" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-tight">
                {isSuccess ? 'Web Push Notifications Active' : 'Enable Web Push Alerts'}
              </h3>
              <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#0A84FF]/10 text-[#0A84FF] border border-[#0A84FF]/20">
                FCM Push
              </span>
            </div>

            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
              {statusMessage ||
                'Receive instant desktop and mobile push notifications for direct messages, mentions, group activity, and chat requests.'}
            </p>

            {!isSuccess && (
              <div className="flex items-center gap-2.5 mt-3.5 flex-wrap">
                <button
                  onClick={handleEnablePush}
                  disabled={loading}
                  className="px-4 py-2 bg-[#0A84FF] hover:bg-[#0071E3] active:scale-95 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{loading ? 'Requesting Permission...' : 'Allow Notifications'}</span>
                </button>

                <button
                  onClick={onDismissPrompt}
                  disabled={loading}
                  className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs font-semibold rounded-xl cursor-pointer transition-all border border-zinc-700/50"
                >
                  Maybe Later
                </button>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onDismissPrompt}
          className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80 transition-all cursor-pointer"
          title="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
