import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Fingerprint, Delete, ShieldCheck, AlertCircle, LogOut, Sparkles, Check, KeyRound } from 'lucide-react';
import { User } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface AppLockScreenProps {
  currentUser: User;
  onUnlock: () => void;
  onLogout: () => void;
}

export default function AppLockScreen({ currentUser, onUnlock, onLogout }: AppLockScreenProps) {
  const security = currentUser.securitySettings || { pinEnabled: false, biometricEnabled: false };
  const hasPin = Boolean(security.pinEnabled && security.pinCode);
  const hasBiometric = Boolean(security.biometricEnabled);

  const [pinDigits, setPinDigits] = useState<string>('');
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isBiometricScanning, setIsBiometricScanning] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const isCustomImg = currentUser.profileImage.startsWith('data:');

  // Trigger tactile haptic vibration
  const triggerHaptic = (type: 'tap' | 'error' | 'success') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (type === 'tap') {
          navigator.vibrate(20);
        } else if (type === 'error') {
          navigator.vibrate([60, 40, 60, 40, 100]);
        } else if (type === 'success') {
          navigator.vibrate([25, 30, 45]);
        }
      }
    } catch {
      // Ignore vibration errors if restricted
    }
  };

  // Perform Biometric Verification
  const handleBiometricAuth = async () => {
    if (isBiometricScanning) return;
    setIsBiometricScanning(true);
    setBiometricStatus('Scanning fingerprint...');
    triggerHaptic('tap');

    // Attempt real WebAuthn if available or simulated biometric sensor
    try {
      if (
        window.PublicKeyCredential && 
        security.biometricCredentialId && 
        security.biometricCredentialId !== 'simulated' && 
        typeof navigator.credentials?.get === 'function'
      ) {
        // Decode base64 stored credential id back to raw binary bytes
        const binaryString = window.atob(security.biometricCredentialId);
        const rawId = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          rawId[i] = binaryString.charCodeAt(i);
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        
        await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 15000,
            userVerification: 'preferred',
            allowCredentials: [
              {
                type: 'public-key',
                id: rawId
              }
            ]
          }
        });

        // Success
        triggerHaptic('success');
        setIsSuccess(true);
        setBiometricStatus('Fingerprint recognized!');
        setTimeout(() => {
          onUnlock();
        }, 400);
      } else {
        // Smooth biometric simulation delay for manual scan triggers
        await new Promise((resolve) => setTimeout(resolve, 1500));
        triggerHaptic('success');
        setIsSuccess(true);
        setBiometricStatus('Unlocked!');
        setTimeout(() => {
          onUnlock();
        }, 400);
      }
    } catch (err) {
      console.warn("Biometric verification failed or cancelled:", err);
      triggerHaptic('error');
      setIsError(true);
      setBiometricStatus('Biometric scan failed or cancelled.');
      setTimeout(() => {
        setIsError(false);
        setPinDigits('');
        setBiometricStatus(null);
      }, 2500);
    } finally {
      setIsBiometricScanning(false);
    }
  };

  // Automatically trigger biometric if real biometric is enabled (not simulated fallback)
  const hasAutoPromptedRef = useRef(false);
  useEffect(() => {
    if (hasBiometric && !hasAutoPromptedRef.current && security.biometricCredentialId !== 'simulated') {
      hasAutoPromptedRef.current = true;
      const t = setTimeout(() => {
        handleBiometricAuth();
      }, 500);
      return () => clearTimeout(t);
    }
  }, [hasBiometric]);

  // Handle number pad button click
  const handleKeyPress = (num: string) => {
    if (isError || isSuccess || pinDigits.length >= 4) return;

    triggerHaptic('tap');
    const nextDigits = pinDigits + num;
    setPinDigits(nextDigits);

    if (nextDigits.length === 4) {
      validatePin(nextDigits);
    }
  };

  // Handle Backspace/Delete
  const handleDelete = () => {
    if (isError || isSuccess || pinDigits.length === 0) return;
    triggerHaptic('tap');
    setPinDigits(prev => prev.slice(0, -1));
  };

  // Validate 4-digit PIN
  const validatePin = (inputPin: string) => {
    if (inputPin === security.pinCode) {
      triggerHaptic('success');
      setIsSuccess(true);
      setTimeout(() => {
        onUnlock();
      }, 350);
    } else {
      triggerHaptic('error');
      setIsError(true);
      // Vibrate and display red dots then clear
      setTimeout(() => {
        setPinDigits('');
        setIsError(false);
      }, 700);
    }
  };

  // Support physical keyboard on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinDigits, isError, isSuccess]);

  // Layout partition:
  // If only Biometric is set: show dedicated Biometric screen.
  // If only PIN is set: show dedicated PIN screen.
  // If BOTH are set: show PIN keypad with biometric button.
  const isOnlyBiometric = hasBiometric && !hasPin;
  const isOnlyPin = hasPin && !hasBiometric;
  const isBoth = hasPin && hasBiometric;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-between p-6 select-none overflow-hidden font-sans">
      
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-[#0A84FF]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-[#1DB954]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header / Profile Info */}
      <div className="flex flex-col items-center pt-8 z-10">
        <div className="relative mb-3">
          {isCustomImg ? (
            <img
              src={currentUser.profileImage}
              alt={currentUser.fullName}
              className="w-20 h-20 rounded-full object-cover border-2 border-zinc-800 shadow-2xl"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-black border-2 border-zinc-800 shadow-2xl"
              style={{ background: getAvatarGradient(currentUser.profileImage) }}
            >
              {currentUser.fullName.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-emerald-400 shadow-md">
            <Lock className="w-3.5 h-3.5" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-white tracking-tight">{currentUser.fullName}</h2>
        <p className="text-xs text-zinc-400 font-medium">@{currentUser.username}</p>

        <div className="mt-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0A84FF]" />
          <span>Txtorspace Encrypted Lock</span>
        </div>
      </div>

      {/* ================= CENTER SECTION ================= */}
      <div className="w-full max-w-xs flex flex-col items-center z-10 my-auto">
        
        {/* Scenario 1: ONLY Biometric Screen */}
        {isOnlyBiometric && (
          <div className="flex flex-col items-center text-center space-y-6 py-6">
            <div className="relative">
              {/* Pulsing halo */}
              <div className={`absolute inset-0 rounded-full bg-[#0A84FF]/20 blur-xl ${isBiometricScanning ? 'animate-ping' : ''}`} />
              
              <button
                type="button"
                onClick={handleBiometricAuth}
                disabled={isBiometricScanning || isSuccess}
                className={`relative w-24 h-24 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 shadow-2xl ${
                  isSuccess 
                    ? 'bg-emerald-500 text-white scale-105' 
                    : isBiometricScanning
                    ? 'bg-[#0A84FF] text-white scale-105 ring-4 ring-[#0A84FF]/40'
                    : 'bg-zinc-900 text-[#0A84FF] hover:bg-zinc-800 border border-zinc-700 active:scale-95'
                }`}
                title="Tap to scan biometric"
              >
                {isSuccess ? (
                  <Check className="w-12 h-12 stroke-[3px]" />
                ) : (
                  <Fingerprint className={`w-12 h-12 stroke-[2px] ${isBiometricScanning ? 'animate-pulse' : ''}`} />
                )}
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">
                {isSuccess ? 'Verified!' : 'Biometric Security Active'}
              </h3>
              <p className="text-xs text-zinc-400">
                {biometricStatus || 'Touch the sensor or tap icon to unlock'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleBiometricAuth}
              className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl border border-zinc-700 transition-all cursor-pointer shadow-md"
            >
              Scan Fingerprint / Face ID
            </button>
          </div>
        )}

        {/* Scenario 2 & 3: PIN Keypad (PIN only or BOTH PIN & Biometric) */}
        {(isOnlyPin || isBoth) && (
          <div className="w-full flex flex-col items-center space-y-5">
            
            {/* Title */}
            <div className="text-center">
              <p className="text-xs font-bold text-zinc-300 tracking-wider uppercase">
                {isError ? 'Incorrect PIN' : 'Enter 4-Digit Passcode'}
              </p>
              {isError && (
                <p className="text-[11px] text-red-400 mt-0.5 animate-pulse font-semibold">
                  PIN does not match. Please try again.
                </p>
              )}
            </div>

            {/* 4 Dot Indicators with Shake & Error Animation */}
            <motion.div 
              animate={isError ? { x: [-12, 12, -10, 10, -6, 6, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-4 py-2"
            >
              {[0, 1, 2, 3].map((index) => {
                const isFilled = pinDigits.length > index;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full transition-all duration-200 ${
                      isError
                        ? 'bg-red-500 border-2 border-red-400 shadow-lg shadow-red-500/50 scale-110'
                        : isSuccess
                        ? 'bg-emerald-400 border-2 border-emerald-300 shadow-lg shadow-emerald-400/50 scale-110'
                        : isFilled
                        ? 'bg-white border-2 border-white shadow-md shadow-white/30 scale-105'
                        : 'bg-transparent border-2 border-zinc-600'
                    }`}
                  />
                );
              })}
            </motion.div>

            {/* iOS-Style Numeric Keypad */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-3.5 pt-2">
              {[
                { num: '1', sub: '' },
                { num: '2', sub: 'ABC' },
                { num: '3', sub: 'DEF' },
                { num: '4', sub: 'GHI' },
                { num: '5', sub: 'JKL' },
                { num: '6', sub: 'MNO' },
                { num: '7', sub: 'PQRS' },
                { num: '8', sub: 'TUV' },
                { num: '9', sub: 'WXYZ' },
              ].map((key) => (
                <button
                  key={key.num}
                  type="button"
                  onClick={() => handleKeyPress(key.num)}
                  className="w-17 h-17 rounded-full bg-zinc-900/90 hover:bg-zinc-800 active:bg-zinc-700/80 active:scale-95 text-white flex flex-col items-center justify-center border border-zinc-800/80 transition-all cursor-pointer shadow-lg"
                >
                  <span className="text-2xl font-semibold leading-none">{key.num}</span>
                  {key.sub && (
                    <span className="text-[9px] font-bold tracking-widest text-zinc-500 mt-0.5">
                      {key.sub}
                    </span>
                  )}
                </button>
              ))}

              {/* Bottom Row: Biometric icon (if enabled) / empty, 0, and Backspace */}
              {isBoth ? (
                <button
                  type="button"
                  onClick={handleBiometricAuth}
                  className="w-17 h-17 rounded-full bg-zinc-900/90 hover:bg-[#0A84FF]/20 active:scale-95 text-[#0A84FF] flex items-center justify-center border border-zinc-800 transition-all cursor-pointer shadow-lg"
                  title="Unlock with Fingerprint"
                >
                  <Fingerprint className="w-7 h-7 stroke-[2.2px]" />
                </button>
              ) : (
                <div className="w-17 h-17" />
              )}

              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="w-17 h-17 rounded-full bg-zinc-900/90 hover:bg-zinc-800 active:bg-zinc-700/80 active:scale-95 text-white flex items-center justify-center border border-zinc-800/80 transition-all cursor-pointer shadow-lg"
              >
                <span className="text-2xl font-semibold leading-none">0</span>
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="w-17 h-17 rounded-full bg-transparent hover:bg-zinc-900/60 active:scale-95 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                title="Delete digit"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

          </div>
        )}

      </div>

      {/* Bottom Footer Actions */}
      <div className="w-full flex items-center justify-between z-10 pt-4 max-w-xs text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-1.5 hover:text-red-400 transition-colors cursor-pointer py-2 px-1"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Log Out</span>
        </button>

        <span className="text-[10px] text-zinc-600 font-mono">
          {isBoth ? 'PIN & Biometric' : isOnlyBiometric ? 'Biometric 2FA' : '4-Digit Passcode'}
        </span>
      </div>

      {/* Logout Emergency Confirm Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mx-auto flex items-center justify-center">
                <LogOut className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Log out of session?</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  You can sign back in at any time with your account credentials.
                </p>
              </div>
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-lg"
                >
                  Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
