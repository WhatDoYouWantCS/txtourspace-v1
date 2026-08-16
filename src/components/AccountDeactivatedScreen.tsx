import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Clock, RefreshCw, LogOut, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { User } from '../types';

interface AccountDeactivatedScreenProps {
  currentUser: User;
  onReactivateAccount: () => void;
  onLogout: () => void;
}

export default function AccountDeactivatedScreen({
  currentUser,
  onReactivateAccount,
  onLogout
}: AccountDeactivatedScreenProps) {
  const [timeLeft, setTimeLeft] = useState<{ hours: number; minutes: number; seconds: number; isExpired: boolean }>({
    hours: 24,
    minutes: 0,
    seconds: 0,
    isExpired: false
  });
  const [isReactivating, setIsReactivating] = useState(false);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const deactTime = currentUser.deactivatedAt 
        ? new Date(currentUser.deactivatedAt).getTime() 
        : Date.now();
      const expiresAt = deactTime + 24 * 60 * 60 * 1000;
      const diff = expiresAt - Date.now();

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds, isExpired: false });
      }
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [currentUser.deactivatedAt]);

  const handleReactivate = () => {
    setIsReactivating(true);
    setTimeout(() => {
      onReactivateAccount();
    }, 600);
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-6 z-[200] overflow-y-auto">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#1DB954]/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md bg-[#121212] border border-[#262626] rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col items-center text-center space-y-6"
      >
        {/* Animated Badge Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl">
            <ShieldAlert className="w-10 h-10" />
          </div>
          <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#1C1C1E] border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Clock className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Title & Status */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider">
            <span>Deactivated State</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Account Deactivated
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
            Your Txtorspace account <span className="text-white font-semibold">@{currentUser.username}</span> is currently inactive. You have <span className="text-amber-400 font-bold">24 hours</span> to recover your account before all chats and media are permanently purged by the system.
          </p>
        </div>

        {/* Countdown Timer Display Card */}
        <div className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-4 flex flex-col items-center space-y-2 shadow-inner">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Deletion Grace Period Remaining</span>
          </div>
          
          <div className="flex items-center justify-center gap-3 text-center">
            <div className="flex flex-col items-center bg-[#111] px-3.5 py-2 rounded-xl border border-zinc-800 min-w-[60px]">
              <span className="text-2xl font-black text-white font-mono">{String(timeLeft.hours).padStart(2, '0')}</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">Hours</span>
            </div>
            <span className="text-xl font-bold text-zinc-600">:</span>
            <div className="flex flex-col items-center bg-[#111] px-3.5 py-2 rounded-xl border border-zinc-800 min-w-[60px]">
              <span className="text-2xl font-black text-white font-mono">{String(timeLeft.minutes).padStart(2, '0')}</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">Mins</span>
            </div>
            <span className="text-xl font-bold text-zinc-600">:</span>
            <div className="flex flex-col items-center bg-[#111] px-3.5 py-2 rounded-xl border border-zinc-800 min-w-[60px]">
              <span className="text-2xl font-black text-amber-400 font-mono">{String(timeLeft.seconds).padStart(2, '0')}</span>
              <span className="text-[9px] text-zinc-500 uppercase font-semibold">Secs</span>
            </div>
          </div>
        </div>

        {/* Recovery Guarantee Info Box */}
        <div className="w-full bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-3.5 flex items-start gap-2.5 text-left text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-snug">
            All your contacts, messages, encrypted keys, and media remain intact and will be immediately restored when you reactivate.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-3 pt-1">
          <button
            type="button"
            disabled={isReactivating}
            onClick={handleReactivate}
            className="w-full py-3.5 px-5 bg-gradient-to-r from-[#1DB954] to-[#1ed760] hover:opacity-95 active:scale-[0.98] text-black font-extrabold text-sm rounded-2xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-2"
          >
            {isReactivating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Reactivating Account...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 stroke-[2.5]" />
                <span>Reactivate My Account</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full py-3 px-4 bg-[#1C1C1E] hover:bg-[#2C2C2E] text-zinc-400 hover:text-white font-bold text-xs rounded-2xl transition-colors cursor-pointer border border-[#262626] flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Log Out for Now</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
