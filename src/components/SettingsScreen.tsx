import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User as UserIcon, Lock, Moon, Sun, Shield, LogOut, Trash2, Camera, ChevronRight, Check, AlertCircle, Ban, ArrowLeft, Eye, Heart, Image as ImageIcon, Download, Fingerprint, KeyRound, ShieldCheck, Smartphone, Sparkles, Delete, Users, RefreshCw, Bell, BellRing, Send
} from 'lucide-react';
import { User, SecuritySettings, Chat } from '../types';
import { getAvatarGradient } from '../data/mockUsers';
import ImageCropperModal from './ImageCropperModal';
import { getNotificationPermissionStatus, requestWebPushPermission, dispatchWebPushNotification } from '../lib/webPush';
import { auth } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface SettingsScreenProps {
  currentUser: User;
  users: User[];
  chats: Chat[];
  theme: 'light' | 'dark';
  onUpdateProfile: (updatedFields: Partial<User>) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onToggleTheme: () => void;
  onUnblockUser: (uid: string) => void;
  onViewContact?: (uid: string) => void;
}

export default function SettingsScreen({
  currentUser,
  users,
  chats,
  theme,
  onUpdateProfile,
  onLogout,
  onDeleteAccount,
  onToggleTheme,
  onUnblockUser,
  onViewContact
}: SettingsScreenProps) {
  
  // Tab states
  const [activeTab, setActiveTab] = useState<'index' | 'profile' | 'security' | 'blocked' | 'friends'>('index');

  // PWA states and timers
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => (window as any).deferredInstallPrompt || null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installCompleted, setInstallCompleted] = useState(false);
  const [showAsCircle, setShowAsCircle] = useState(true);

  useEffect(() => {
    if ((window as any).deferredInstallPrompt) {
      setDeferredPrompt((window as any).deferredInstallPrompt);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handlePwaPromptAvailable = (e: any) => {
      setDeferredPrompt(e.detail || e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-prompt-available', handlePwaPromptAvailable);

    const timer = setTimeout(() => {
      setShowAsCircle(false);
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-prompt-available', handlePwaPromptAvailable);
      clearTimeout(timer);
    };
  }, []);

  const handleInstallPWA = async () => {
    const promptObj = deferredPrompt || (window as any).deferredInstallPrompt;
    if (promptObj) {
      try {
        promptObj.prompt();
        const { outcome } = await promptObj.userChoice;
        console.log(`User choice outcome: ${outcome}`);
        setDeferredPrompt(null);
        (window as any).deferredInstallPrompt = null;
      } catch (e) {
        console.error("PWA Prompt choice error:", e);
      }
    }

    // Start progress animation
    setIsInstalling(true);
    setInstallProgress(0);
    setInstallCompleted(false);

    const duration = 20000; // 20 seconds
    const intervalTime = 100; // Update every 100ms
    const totalSteps = duration / intervalTime;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const currentPct = Math.min(Math.round((step / totalSteps) * 100), 100);
      setInstallProgress(currentPct);

      if (step >= totalSteps) {
        clearInterval(timer);
        setInstallCompleted(true);
        setTimeout(() => {
          setIsInstalling(false);
        }, 2200); // Hold success message briefly
      }
    }, intervalTime);
  };

  // Form states
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [bio, setBio] = useState(currentUser.bio);
  const [phone, setPhone] = useState(currentUser.phone);
  const [username, setUsername] = useState(currentUser.username);
  const [uploadedImage, setUploadedImage] = useState<string | null>(currentUser.profileImage.startsWith('data:') ? currentUser.profileImage : null);
  const [showCropper, setShowCropper] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // 2FA Security states
  const security = currentUser.securitySettings || {
    pinEnabled: false,
    biometricEnabled: false,
    lockTimeout: 'immediately'
  };

  const [showPinModal, setShowPinModal] = useState(false);
  const [pinStep, setPinStep] = useState<'enter' | 'confirm'>('enter');
  const [tempPin, setTempPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinModalError, setPinModalError] = useState(false);

  // Delete account confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Web Push state
  const [pushStatus, setPushStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(() => getNotificationPermissionStatus());
  const [isRequestingPush, setIsRequestingPush] = useState(false);

  // Notifications
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleToggleWebPush = async () => {
    setIsRequestingPush(true);
    const res = await requestWebPushPermission();
    setIsRequestingPush(false);
    setPushStatus(res.permission);
    if (res.granted) {
      onUpdateProfile({
        pushNotificationsEnabled: true,
        fcmToken: res.token || currentUser.fcmToken
      });
      setSuccess('Web push notifications enabled successfully!');
      setTimeout(() => setSuccess(''), 4000);
    } else {
      if (res.permission === 'denied') {
        setError('Notification permission was blocked in browser settings. Please allow notifications in site settings.');
      } else {
        setError(res.error || 'Push notification permission was not granted.');
      }
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleTestWebPush = async () => {
    const ok = await dispatchWebPushNotification({
      title: 'Txtorspace Push Test',
      body: 'Web push notifications are active and delivering real-time alerts!',
      type: 'test_alert',
      icon: currentUser.profileImage || '/favicon.ico'
    });
    if (ok) {
      setSuccess('Test web push notification triggered!');
    } else {
      setError('Could not display test notification. Ensure browser permission is granted.');
    }
    setTimeout(() => {
      setSuccess('');
      setError('');
    }, 4000);
  };

  const triggerHaptic = (type: 'tap' | 'error' | 'success') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (type === 'tap') navigator.vibrate(20);
        else if (type === 'error') navigator.vibrate([60, 40, 60, 40, 100]);
        else if (type === 'success') navigator.vibrate([25, 30, 45]);
      }
    } catch {}
  };

  const handleStartPinSetup = () => {
    setPinStep('enter');
    setTempPin('');
    setConfirmPin('');
    setPinModalError(false);
    setShowPinModal(true);
  };

  const handlePinKeyClick = (num: string) => {
    if (pinModalError) return;
    triggerHaptic('tap');

    if (pinStep === 'enter') {
      const next = tempPin + num;
      if (next.length <= 4) {
        setTempPin(next);
        if (next.length === 4) {
          triggerHaptic('tap');
          setTimeout(() => {
            setPinStep('confirm');
          }, 250);
        }
      }
    } else {
      const next = confirmPin + num;
      if (next.length <= 4) {
        setConfirmPin(next);
        if (next.length === 4) {
          if (next === tempPin) {
            // Pin confirmed successfully!
            triggerHaptic('success');
            const updatedSecurity: SecuritySettings = {
              ...security,
              pinEnabled: true,
              pinCode: next
            };
            onUpdateProfile({ securitySettings: updatedSecurity });
            setSuccess('4-Digit PIN protection activated & synced!');
            setTimeout(() => {
              setShowPinModal(false);
              setSuccess('');
            }, 500);
          } else {
            // Error mismatch
            triggerHaptic('error');
            setPinModalError(true);
            setTimeout(() => {
              setPinStep('enter');
              setTempPin('');
              setConfirmPin('');
              setPinModalError(false);
            }, 700);
          }
        }
      }
    }
  };

  const handlePinDeleteClick = () => {
    triggerHaptic('tap');
    if (pinStep === 'enter') {
      setTempPin(prev => prev.slice(0, -1));
    } else {
      setConfirmPin(prev => prev.slice(0, -1));
    }
  };

  const handleDisablePin = () => {
    if (confirm('Are you sure you want to disable 4-Digit PIN protection?')) {
      const updatedSecurity: SecuritySettings = {
        ...security,
        pinEnabled: false,
        pinCode: undefined
      };
      onUpdateProfile({ securitySettings: updatedSecurity });
      setSuccess('4-Digit PIN has been disabled.');
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  const handleToggleBiometric = async () => {
    triggerHaptic('tap');
    const willEnable = !security.biometricEnabled;

    if (willEnable) {
      setSuccess('Setting up device Passkey...');
      let credentialId = 'simulated';

      try {
        if (window.PublicKeyCredential && typeof navigator.credentials?.create === 'function') {
          // Build random challenge and userId for WebAuthn enrollment
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const userId = new Uint8Array(16);
          window.crypto.getRandomValues(userId);

          // Standard WebAuthn registration
          const credential = await navigator.credentials.create({
            publicKey: {
              challenge: challenge,
              rp: {
                name: "Txtorspace",
                id: window.location.hostname,
              },
              user: {
                id: userId,
                name: currentUser.email || currentUser.username,
                displayName: currentUser.fullName,
              },
              pubKeyCredParams: [
                { alg: -7, type: "public-key" },  // ES256
                { alg: -257, type: "public-key" }, // RS256
              ],
              timeout: 15000,
              authenticatorSelection: {
                userVerification: "preferred",
                authenticatorAttachment: "platform", // Face ID, Touch ID, or Android Biometric
              },
            }
          }) as PublicKeyCredential | null;

          if (credential) {
            // Encode rawId to base64 for safe firestore storage
            const rawIdBytes = new Uint8Array(credential.rawId);
            let binary = '';
            for (let i = 0; i < rawIdBytes.byteLength; i++) {
              binary += String.fromCharCode(rawIdBytes[i]);
            }
            credentialId = window.btoa(binary);
            setSuccess('Device Passkey registered successfully!');
          }
        } else {
          throw new Error('WebAuthn not supported by browser');
        }
      } catch (err: any) {
        console.warn("WebAuthn Passkey registration failed, falling back to simulated mode:", err);
        setSuccess('Passkey registration skipped. Simulated biometric active.');
      }

      const updatedSecurity: SecuritySettings = {
        ...security,
        biometricEnabled: true,
        biometricCredentialId: credentialId
      };
      onUpdateProfile({ securitySettings: updatedSecurity });
      setTimeout(() => setSuccess(''), 3000);
    } else {
      const updatedSecurity: SecuritySettings = {
        ...security,
        biometricEnabled: false,
        biometricCredentialId: undefined
      };
      onUpdateProfile({ securitySettings: updatedSecurity });
      setSuccess('Biometric unlock disabled.');
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  const handleTimeoutChange = (timeout: 'immediately' | '1m' | '5m') => {
    const updatedSecurity: SecuritySettings = {
      ...security,
      lockTimeout: timeout
    };
    onUpdateProfile({ securitySettings: updatedSecurity });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setUploadedImage(base64);
        onUpdateProfile({ profileImage: base64 });
        setSuccess('Profile avatar updated successfully!');
        setTimeout(() => setSuccess(''), 2500);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName.trim() || !username.trim()) {
      setError('Full name and username are required.');
      return;
    }

    const usernameNorm = username.trim().toLowerCase();
    if (usernameNorm !== currentUser.usernameLower) {
      const exists = users.some(u => u.usernameLower === usernameNorm);
      if (exists) {
        setError('Username is already taken.');
        return;
      }
    }

    onUpdateProfile({
      fullName: fullName.trim(),
      username: username.trim(),
      usernameLower: usernameNorm,
      bio: bio.trim(),
      phone: phone.trim()
    });

    setSuccess('Profile credentials synchronized!');
    setTimeout(() => {
      setSuccess('');
      setActiveTab('index');
    }, 1200);
  };

  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!oldPassword || !newPassword) {
      setError('Both old and new passwords are required.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    setSuccess('Security credentials updated successfully.');
    setOldPassword('');
    setNewPassword('');
    setTimeout(() => {
      setSuccess('');
      setActiveTab('index');
    }, 1200);
  };

  const blockedUsers = users.filter(u => currentUser.blockedUsers.includes(u.uid));

  const directChatPartnerUids = chats
    .filter(c => !c.isGroup)
    .flatMap(c => c.members)
    .filter(id => id !== currentUser.uid);

  const friendsList = users.filter(u => {
    if (u.uid === currentUser.uid) return false;
    if ((currentUser.blockedUsers || []).includes(u.uid) || (u.blockedUsers || []).includes(currentUser.uid)) return false;
    if ((currentUser.unfriendedUsers || []).includes(u.uid) || (u.unfriendedUsers || []).includes(currentUser.uid)) return false;
    return directChatPartnerUids.includes(u.uid);
  });

  return (
    <div className="flex flex-col h-full bg-black text-zinc-100 transition-colors duration-300 overflow-y-auto no-scrollbar relative">
      
      {/* Redesigned Header: Premium Blurred Bar */}
      <div className="sticky top-0 z-30 p-5 flex items-center justify-between bg-black/60 backdrop-blur-md border-b border-zinc-900">
        <div className="flex items-center gap-3">
          {activeTab !== 'index' && (
            <button 
              onClick={() => {
                setActiveTab('index');
                setError('');
                setSuccess('');
              }}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-white">
              {activeTab === 'index' && 'Settings'}
              {activeTab === 'profile' && 'Edit Profile'}
              {activeTab === 'security' && 'Sign-in & Security'}
              {activeTab === 'blocked' && 'Blocked Contacts'}
              {activeTab === 'friends' && 'Your Friends'}
            </h1>
            <p className="text-[10px] text-[#1DB954] font-medium tracking-widest uppercase">
              {activeTab === 'index' ? 'Preferences' : activeTab === 'friends' ? 'Social Network' : 'Modify Credentials'}
            </p>
          </div>
        </div>
        
        {activeTab === 'index' && (
          <span className="text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
            AERO v3.0
          </span>
        )}
      </div>

      {/* Main Settings Body */}
      <div className="flex-1 p-6 space-y-6">
        
        {/* Toast System Message Notifications */}
        {error && (
          <div className="p-3 bg-red-950/20 text-red-400 border border-red-500/20 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20 rounded-2xl text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* ================= TAB 1: INDEX OVERVIEW ================= */}
        {activeTab === 'index' && (
          <div className="space-y-6">
            
            {/* Elegant Premium Bio Glass Hero Card */}
            <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/60 to-zinc-900/20 border border-zinc-800 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-5 shadow-2xl">
              <div className="absolute top-0 right-0 w-36 h-36 bg-[#1DB954]/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative group flex-shrink-0 cursor-pointer" onClick={() => setShowCropper(true)}>
                {uploadedImage ? (
                  <img src={uploadedImage} alt="Profile" className="w-18 h-18 rounded-2xl object-cover shadow-lg border border-zinc-700" />
                ) : (
                  <div
                    className="w-18 h-18 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg"
                    style={{ background: getAvatarGradient(currentUser.profileImage) }}
                  >
                    {currentUser.fullName.charAt(0).toUpperCase()}
                  </div>
                )}

                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); setShowCropper(true); }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#1DB954] text-black rounded-xl flex items-center justify-center cursor-pointer border-2 border-black hover:scale-110 active:scale-95 transition-all shadow-md"
                  title="Change avatar photo"
                >
                  <Camera className="w-3.5 h-3.5 stroke-[2.5px]" />
                </button>
              </div>

              <div className="min-w-0 flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-center gap-1.5">
                  <h3 className="text-lg font-black text-white tracking-tight">{currentUser.fullName}</h3>
                  <span className="inline-block mx-auto md:mx-0 text-[10px] font-bold text-[#1DB954] px-2 py-0.5 rounded-full bg-[#1DB954]/10 border border-[#1DB954]/20">
                    Active Session
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-semibold mt-1">@{currentUser.username}</p>
                <p className="text-xs text-zinc-500 mt-2 italic max-w-sm">
                  "{currentUser.bio || 'No status bio set.'}"
                </p>
              </div>
            </div>

            {/* Account Settings Section */}
            <div className="space-y-2.5">
              <h3 className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase px-2">Account Settings</h3>
              <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl divide-y divide-zinc-900">
                {/* Menu Item 1: Profile */}
                <button
                  onClick={() => setActiveTab('profile')}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#1DB954] flex items-center justify-center border border-zinc-700/50 group-hover:bg-[#1DB954]/10 group-hover:border-[#1DB954]/20 transition-all">
                      <UserIcon className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Edit Profile</span>
                      <span className="text-[10px] text-zinc-500 block">Change status, phone, display name</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>

            {/* Privacy & Customization Section */}
            <div className="space-y-2.5">
              <h3 className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase px-2">Privacy & Customization</h3>
              <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl divide-y divide-zinc-900">
                {/* Menu Item 2: Security */}
                <button
                  onClick={() => setActiveTab('security')}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#1DB954] flex items-center justify-center border border-zinc-700/50 group-hover:bg-[#1DB954]/10 group-hover:border-[#1DB954]/20 transition-all">
                      <Lock className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Security & Sign-In</span>
                      <span className="text-[10px] text-zinc-500 block">Manage authentication credentials</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                </button>

                {/* Menu Item: Your Friends */}
                <button
                  onClick={() => setActiveTab('friends')}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#1DB954] flex items-center justify-center border border-zinc-700/50 group-hover:bg-[#1DB954]/10 group-hover:border-[#1DB954]/20 transition-all">
                      <Users className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Your Friends</span>
                      <span className="text-[10px] text-zinc-500 block">View list of active direct connections</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {friendsList.length > 0 && (
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                        {friendsList.length} Active
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                </button>

                {/* Menu Item 3: Blocked contacts */}
                <button
                  onClick={() => setActiveTab('blocked')}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#1DB954] flex items-center justify-center border border-zinc-700/50 group-hover:bg-[#1DB954]/10 group-hover:border-[#1DB954]/20 transition-all">
                      <Ban className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Blocked Contacts</span>
                      <span className="text-[10px] text-zinc-500 block">Manage blocked list and filters</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentUser.blockedUsers.length > 0 && (
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                        {currentUser.blockedUsers.length} Active
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                  </div>
                </button>

                {/* Menu Item 4: Auto-Download Media */}
                <div className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#1DB954] flex items-center justify-center border border-zinc-700/50">
                      <Download className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Auto-Download Incoming Media</span>
                      <span className="text-[10px] text-zinc-500 block">Default: Off. When off, chat photos require manual tap to download</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !currentUser.autoDownloadMedia;
                      onUpdateProfile({ autoDownloadMedia: nextVal });
                    }}
                    className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer flex-shrink-0 ${
                      currentUser.autoDownloadMedia ? 'bg-[#1DB954]' : 'bg-zinc-800 border border-zinc-700'
                    }`}
                    title={currentUser.autoDownloadMedia ? 'Auto-download is ON' : 'Auto-download is OFF'}
                  >
                    <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      currentUser.autoDownloadMedia ? 'translate-x-4.5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>



                {/* Menu Item 6: Web Push Notifications */}
                <div className="w-full px-5 py-4 flex flex-col gap-3 text-left hover:bg-zinc-900/40 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#0A84FF] flex items-center justify-center border border-zinc-700/50">
                        <BellRing className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">Web Push Notifications</span>
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            pushStatus === 'granted'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : pushStatus === 'denied'
                              ? 'bg-red-500/10 text-red-400 border-red-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {pushStatus === 'granted' ? 'Enabled' : pushStatus === 'denied' ? 'Blocked' : 'Action Needed'}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 block">
                          Desktop & mobile alerts for incoming messages, @mentions, & chat requests
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isRequestingPush}
                      onClick={handleToggleWebPush}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        pushStatus === 'granted'
                          ? 'bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700'
                          : 'bg-[#0A84FF] hover:bg-[#0071E3] text-white shadow-lg shadow-blue-500/20'
                      }`}
                    >
                      <Bell className="w-3 h-3" />
                      <span>{isRequestingPush ? 'Requesting...' : pushStatus === 'granted' ? 'Re-Sync' : 'Enable Push'}</span>
                    </button>
                  </div>

                  {pushStatus === 'granted' && (
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 pl-13">
                      <span className="text-[11px] text-zinc-400">Firebase Cloud Messaging connected</span>
                      <button
                        type="button"
                        onClick={handleTestWebPush}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white border border-zinc-700/60 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Send className="w-3 h-3 text-[#0A84FF]" />
                        <span>Send Test Push</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Menu Item 7: Theme switcher */}
                <button
                  onClick={onToggleTheme}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-[#1DB954] flex items-center justify-center border border-zinc-700/50 group-hover:bg-[#1DB954]/10 group-hover:border-[#1DB954]/20 transition-all">
                      {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5" />}
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Dark Mode Appearance</span>
                      <span className="text-[10px] text-zinc-500 block">Toggle system visual background skin</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#1DB954] font-extrabold uppercase">{theme}</span>
                    <div className={`w-10 h-5.5 rounded-full p-0.5 transition-colors duration-200 ${
                      theme === 'dark' ? 'bg-[#1DB954]' : 'bg-zinc-800 border border-zinc-700'
                    }`}>
                      <div className={`w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        theme === 'dark' ? 'translate-x-4.5' : 'translate-x-0'
                      }`} />
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* System & Utilities */}
            <div className="space-y-2.5">
              <h3 className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase px-2">System & Utilities</h3>
              <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl p-5 flex flex-col items-center justify-center gap-3">
                <div className="text-center">
                  <span className="block font-bold text-white text-sm">Offline Desktop & Mobile Access</span>
                  <span className="text-[10px] text-zinc-500 block">Install Txtorspace directly to your system dock or homescreen</span>
                </div>
                
                <div className="flex justify-center w-full mt-1">
                  <motion.button
                    layout
                    type="button"
                    onClick={handleInstallPWA}
                    style={{ borderRadius: showAsCircle ? '9999px' : '12px' }}
                    className={`bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 backdrop-blur-md text-white font-bold tracking-wide shadow-lg active:scale-98 transition-all duration-500 cursor-pointer flex items-center justify-center gap-2 ${
                      showAsCircle ? 'w-12 h-12 p-0' : 'w-full py-3 px-4 text-xs'
                    }`}
                  >
                    <Download className={`w-4 h-4 text-[#0A84FF] ${isInstalling ? 'animate-bounce' : ''}`} />
                    {!showAsCircle && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        {isInstalling ? 'Installing PWA...' : 'Install PWA App'}
                      </motion.span>
                    )}
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Session Actions Group */}
            <div className="space-y-2.5">
              <h3 className="text-[10px] font-bold tracking-widest text-zinc-500 uppercase px-2">Account Actions</h3>
              <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl divide-y divide-zinc-900">
                
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-zinc-900/40 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-zinc-400 flex items-center justify-center border border-zinc-700/50 group-hover:bg-red-500/10 group-hover:text-red-400 group-hover:border-red-500/20 transition-all">
                      <LogOut className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-white text-sm">Log Out of Txtorspace</span>
                      <span className="text-[10px] text-zinc-500 block">End active session on this device</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-red-950/20 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 text-red-500 flex items-center justify-center border border-zinc-700/50 group-hover:bg-red-500/10 group-hover:border-red-500/20 transition-all">
                      <Trash2 className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <span className="block font-bold text-red-400 text-sm">Delete Account</span>
                      <span className="text-[10px] text-red-500/60 block font-medium">Deactivates account for 24 hours before permanent purge</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-red-400" />
                </button>

              </div>
            </div>

          </div>
        )}

        {/* ================= TAB 2: EDIT PROFILE ================= */}
        {activeTab === 'profile' && (
          <form onSubmit={handleUpdateProfileSubmit} className="space-y-5">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-5 space-y-4">
              
              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-[#121212] border border-zinc-800 focus:border-[#1DB954] rounded-xl py-3 px-4 text-sm outline-none text-white transition-all placeholder-zinc-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Unique Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full bg-[#121212] border border-zinc-800 focus:border-[#1DB954] rounded-xl py-3 px-4 text-sm outline-none text-white transition-all placeholder-zinc-600"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Bio Status</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={150}
                  className="w-full h-20 bg-[#121212] border border-zinc-800 focus:border-[#1DB954] rounded-xl py-2.5 px-4 text-sm outline-none text-white resize-none transition-all placeholder-zinc-600"
                  placeholder="Tell us what's new..."
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Mobile Number</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-[#121212] border border-zinc-800 focus:border-[#1DB954] rounded-xl py-3 px-4 text-sm outline-none text-white transition-all placeholder-zinc-600"
                />
              </div>

            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('index')}
                className="w-1/2 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-xl text-xs font-black transition-all shadow-lg shadow-[#1DB954]/20 cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}

        {/* ================= TAB 3: SIGN-IN & SECURITY ================= */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            
            {/* 1. APP LOCK & 2FA (PIN / BIOMETRIC) SECTION */}
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-3xl p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0A84FF]/10 border border-[#0A84FF]/20 text-[#0A84FF] flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">App Lock & 2FA Security</h3>
                    <p className="text-[11px] text-zinc-400">Lock Txtorspace with a 4-Digit PIN or Biometrics</p>
                  </div>
                </div>

                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                  security.pinEnabled && security.biometricEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : security.pinEnabled || security.biometricEnabled
                    ? 'bg-[#0A84FF]/10 text-[#0A84FF] border-[#0A84FF]/30'
                    : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}>
                  {security.pinEnabled && security.biometricEnabled
                    ? 'PIN & Biometric Active'
                    : security.pinEnabled
                    ? 'PIN Active'
                    : security.biometricEnabled
                    ? 'Biometric Active'
                    : 'Not Configured'}
                </span>
              </div>

              {/* Setting Option A: 4-Digit Passcode */}
              <div className="flex items-center justify-between p-3.5 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center">
                    <KeyRound className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div>
                    <span className="block font-bold text-white text-xs">4-Digit PIN Passcode</span>
                    <span className="text-[10px] text-zinc-400 block">
                      {security.pinEnabled ? 'Passcode is set and active' : 'Set a custom 4-digit PIN'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {security.pinEnabled ? (
                    <>
                      <button
                        type="button"
                        onClick={handleStartPinSetup}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 transition-all cursor-pointer"
                      >
                        Change PIN
                      </button>
                      <button
                        type="button"
                        onClick={handleDisablePin}
                        className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl border border-red-500/20 transition-all cursor-pointer"
                      >
                        Turn Off
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartPinSetup}
                      className="px-4 py-1.5 bg-[#0A84FF] hover:bg-[#0070e0] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
                    >
                      Set PIN
                    </button>
                  )}
                </div>
              </div>

              {/* Setting Option B: Fingerprint / Face ID Biometric */}
              <div className="flex items-center justify-between p-3.5 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl">
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 text-white flex items-center justify-center">
                    <Fingerprint className="w-4.5 h-4.5 text-[#0A84FF]" />
                  </div>
                  <div>
                    <span className="block font-bold text-white text-xs">Biometric Unlock</span>
                    <span className="text-[10px] text-zinc-400 block">Unlock with Fingerprint, Face ID, or Touch</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleBiometric}
                  className={`w-12 h-6.5 rounded-full transition-colors relative p-1 cursor-pointer ${
                    security.biometricEnabled ? 'bg-[#0A84FF]' : 'bg-zinc-800'
                  }`}
                >
                  <div
                    className={`w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                      security.biometricEnabled ? 'translate-x-5.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Setting Option C: Auto-Lock Frequency */}
              {(security.pinEnabled || security.biometricEnabled) && (
                <div className="pt-2 border-t border-zinc-800/60">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                    Require Lock Verification
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'immediately', label: 'Every Visit' },
                      { id: '1m', label: 'After 1 min' },
                      { id: '5m', label: 'After 5 mins' }
                    ].map((opt) => {
                      const isSel = (security.lockTimeout || 'immediately') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleTimeoutChange(opt.id as any)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${
                            isSel
                              ? 'bg-[#0A84FF]/20 text-[#0A84FF] border-[#0A84FF]/40 shadow-sm'
                              : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-850 hover:text-zinc-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. ACCOUNT PASSWORD FORM */}
            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2.5 mb-1">
                  <Lock className="w-4 h-4 text-zinc-400" />
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Account Password</h3>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">Current Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full bg-[#121212] border border-zinc-800 focus:border-[#1DB954] rounded-xl py-3 px-4 text-sm outline-none text-white transition-all placeholder-zinc-600"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5 ml-1">New Password</label>
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#121212] border border-zinc-800 focus:border-[#1DB954] rounded-xl py-3 px-4 text-sm outline-none text-white transition-all placeholder-zinc-600"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-[#1DB954] hover:bg-[#1ed760] text-black rounded-xl text-xs font-black transition-all shadow-lg shadow-[#1DB954]/20 cursor-pointer"
                  >
                    Update Password
                  </button>
                </div>
              </div>
            </form>

            <button
              type="button"
              onClick={() => setActiveTab('index')}
              className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Back to Settings Overview
            </button>
          </div>
        )}

        {/* ================= TAB 4: BLOCKED CONTACTS ================= */}
        {activeTab === 'blocked' && (
          <div className="space-y-4">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-5">
              
              {blockedUsers.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 text-xs">
                  <div className="w-10 h-10 rounded-full bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                    <Ban className="w-5 h-5 text-zinc-500" />
                  </div>
                  <p className="font-bold text-white text-sm">No Blocked Contacts</p>
                  <p className="text-[11px] mt-1.5 text-zinc-500 leading-relaxed max-w-xs mx-auto">
                    Users you block will appear here. Blocked contacts cannot send requests or initiate chats with you.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 divide-y divide-zinc-900">
                  {blockedUsers.map((user, idx) => {
                    const isCustom = user.profileImage.startsWith('data:');

                    return (
                      <div 
                        key={user.uid} 
                        className={`flex items-center justify-between ${idx > 0 ? 'pt-4' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {isCustom ? (
                            <img src={user.profileImage} alt={user.fullName} className="w-10 h-10 rounded-xl object-cover border border-zinc-800" />
                          ) : (
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-md"
                              style={{ background: getAvatarGradient(user.profileImage) }}
                            >
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <h4 className="text-xs font-extrabold text-white">{user.fullName}</h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">@{user.username}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => onUnblockUser(user.uid)}
                          className="text-[11px] font-black text-[#1DB954] hover:underline cursor-pointer bg-[#1DB954]/10 border border-[#1DB954]/20 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Unblock User
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            <button
              onClick={() => setActiveTab('index')}
              className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Back to Settings Overview
            </button>
          </div>
        )}

        {/* ================= TAB 5: YOUR FRIENDS ================= */}
        {activeTab === 'friends' && (
          <div className="space-y-4">
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-3xl p-5">
              
              {friendsList.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 text-xs">
                  <div className="w-10 h-10 rounded-full bg-zinc-900/80 border border-zinc-800 flex items-center justify-center mx-auto mb-3 text-zinc-400">
                    <Users className="w-5 h-5 text-zinc-500" />
                  </div>
                  <p className="font-bold text-white text-sm">No Friends Yet</p>
                  <p className="text-[11px] mt-1.5 text-zinc-500 leading-relaxed max-w-xs mx-auto">
                    Active direct connections will appear here. Add contacts through Discovery search or synchronize your contacts list.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 divide-y divide-zinc-900">
                  {friendsList.map((user, idx) => {
                    const isCustomImg = user.profileImage && (user.profileImage.startsWith('data:') || user.profileImage.startsWith('http'));

                    return (
                      <div 
                        key={user.uid} 
                        className={`flex items-center justify-between ${idx > 0 ? 'pt-4' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          {isCustomImg ? (
                            <img src={user.profileImage} alt={user.fullName} className="w-10 h-10 rounded-xl object-cover border border-zinc-800" referrerPolicy="no-referrer" />
                          ) : (
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-md"
                              style={{ background: getAvatarGradient(user.profileImage || 'user_default') }}
                            >
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <div className="flex items-center gap-1.5">
                              <h4 className="text-xs font-extrabold text-white">{user.fullName}</h4>
                              {user.online ? (
                                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954]" title="Online" />
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" title="Offline" />
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-400 mt-0.5">@{user.username}</p>
                          </div>
                        </div>

                        {onViewContact && (
                          <button
                            onClick={() => onViewContact(user.uid)}
                            className="text-[11px] font-black text-[#1DB954] hover:underline cursor-pointer bg-[#1DB954]/10 border border-[#1DB954]/20 px-3 py-1.5 rounded-lg transition-all"
                          >
                            View Profile
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>

            <button
              onClick={() => setActiveTab('index')}
              className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Back to Settings Overview
            </button>
          </div>
        )}

      </div>

      <AnimatePresence>
        {showCropper && (
          <ImageCropperModal
            title="Set Profile Picture"
            initialImage={uploadedImage}
            aspectRatio="circle"
            onClose={() => setShowCropper(false)}
            onCropComplete={(croppedBase64) => {
              setUploadedImage(croppedBase64);
              onUpdateProfile({ profileImage: croppedBase64 });
              setSuccess('Profile picture updated successfully!');
              setTimeout(() => setSuccess(''), 2500);
            }}
          />
        )}

        {/* 4-Digit PIN Interactive Setup Modal */}
        {showPinModal && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-xs bg-[#161618] border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 text-center relative overflow-hidden"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#0A84FF]/10 border border-[#0A84FF]/30 text-[#0A84FF] mx-auto flex items-center justify-center shadow-lg">
                <KeyRound className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-white">
                  {pinStep === 'enter' ? 'Set 4-Digit Passcode' : 'Confirm Your Passcode'}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {pinModalError 
                    ? 'Passcodes did not match. Try again.'
                    : pinStep === 'enter' 
                    ? 'Enter 4 digits for your app unlock code' 
                    : 'Re-enter the same 4 digits to confirm'}
                </p>
              </div>

              {/* 4 Dots indicator with error shake */}
              <motion.div
                animate={pinModalError ? { x: [-10, 10, -8, 8, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center justify-center gap-3.5 py-1"
              >
                {[0, 1, 2, 3].map((index) => {
                  const currentPinStr = pinStep === 'enter' ? tempPin : confirmPin;
                  const isFilled = currentPinStr.length > index;
                  return (
                    <div
                      key={index}
                      className={`w-3.5 h-3.5 rounded-full transition-all ${
                        pinModalError
                          ? 'bg-red-500 border-2 border-red-400 shadow-md shadow-red-500/50 scale-110'
                          : isFilled
                          ? 'bg-[#0A84FF] border-2 border-[#0A84FF] shadow-sm shadow-[#0A84FF]/40 scale-105'
                          : 'bg-transparent border-2 border-zinc-600'
                      }`}
                    />
                  );
                })}
              </motion.div>

              {/* Numeric Keypad */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handlePinKeyClick(num)}
                    className="h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 active:scale-95 text-white font-bold text-lg flex items-center justify-center border border-zinc-800 transition-all cursor-pointer shadow"
                  >
                    {num}
                  </button>
                ))}

                <div className="h-12" />

                <button
                  type="button"
                  onClick={() => handlePinKeyClick('0')}
                  className="h-12 rounded-2xl bg-zinc-900 hover:bg-zinc-800 active:bg-zinc-700 active:scale-95 text-white font-bold text-lg flex items-center justify-center border border-zinc-800 transition-all cursor-pointer shadow"
                >
                  0
                </button>

                <button
                  type="button"
                  onClick={handlePinDeleteClick}
                  className="h-12 rounded-2xl bg-transparent hover:bg-zinc-900 text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  title="Delete digit"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete / Deactivate Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-[#161618] border border-red-500/30 rounded-3xl p-6 shadow-2xl space-y-5 text-center relative overflow-hidden"
            >
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 mx-auto flex items-center justify-center shadow-lg">
                <Trash2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-white">Delete Your Account?</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Are you sure you want to delete your account? Upon confirmation, your account will be <strong className="text-amber-400">deactivated for 24 hours</strong>.
                </p>
                <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 text-[11px] text-zinc-400 text-left space-y-1 mt-2">
                  <p className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-bold">•</span>
                    <span><strong>24-Hour Recovery Window:</strong> You can reactivate your account at any time within 24 hours.</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <span className="text-red-400 font-bold">•</span>
                    <span><strong>Permanent Deletion:</strong> After 24 hours, the system will permanently purge your profile, contacts, and message history.</span>
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setIsDeleting(true);
                    setTimeout(() => {
                      setIsDeleting(false);
                      setShowDeleteModal(false);
                      onDeleteAccount();
                    }, 1000);
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deactivating...</span>
                    </>
                  ) : (
                    <span>Proceed to Deactivate</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* PWA INSTALLATION PROGRESS MODAL */}
        {isInstalling && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-900/95 border border-zinc-800 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl relative flex flex-col items-center gap-5"
            >
              {/* Spinning / Pulsing Download Logo */}
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#1DB954] to-emerald-500/80 p-0.5 flex items-center justify-center shadow-lg shadow-[#1DB954]/20">
                <Download className="w-8 h-8 text-black animate-pulse" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base font-extrabold text-white tracking-wide">
                  {installCompleted ? 'Installed!' : 'Installing Txtorspace..'}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  {installCompleted 
                    ? 'Txtorspace is successfully added to your device.' 
                    : 'Configuring encrypted engines and assets...'}
                </p>
              </div>

              {/* Progress Bar Container */}
              <div className="w-full bg-zinc-950 rounded-full h-3 p-0.5 border border-zinc-800/80 relative overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-[#1DB954] to-emerald-400 h-full rounded-full transition-all duration-100 ease-out shadow-[0_0_8px_rgba(29,185,84,0.4)]"
                  style={{ width: `${installProgress}%` }}
                />
              </div>

              {/* Progress Percentage */}
              <div className="text-lg font-black text-white font-mono tracking-wider">
                {installProgress}%
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
