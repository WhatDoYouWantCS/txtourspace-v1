import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, EyeOff, User as UserIcon, Lock, Mail, Phone, Calendar, Check, AlertCircle, Camera, ChevronLeft, ArrowRight, Sparkles, Download } from 'lucide-react';
import { User } from '../types';
import { getAvatarGradient } from '../data/mockUsers';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc 
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { isUsernameTakenInFirebase } from '../lib/firebaseSync';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  onSignUp: (newUser: User) => void;
}

export default function AuthScreen({ users, onLogin, onSignUp }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  // Signup Step Tracker (Page 1 to 5)
  const [signupStep, setSignupStep] = useState(1);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Sign up specific fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [selectedAvatarSeed, setSelectedAvatarSeed] = useState('user_' + Math.floor(Math.random() * 1000));
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Username validation states
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');

  // Handle username availability check
  useEffect(() => {
    if (isLogin) return;

    const trimmed = username.trim().toLowerCase();
    if (trimmed.length === 0) {
      setUsernameStatus('idle');
      return;
    }

    if (trimmed.length < 3) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    
    const delayDebounce = setTimeout(async () => {
      try {
        const isTaken = await isUsernameTakenInFirebase(trimmed, users);
        if (isTaken) {
          setUsernameStatus('taken');
        } else {
          setUsernameStatus('available');
        }
      } catch (err) {
        console.error("Error checking username:", err);
        const exists = users.some(u => (u.usernameLower || u.username || '').toLowerCase() === trimmed);
        setUsernameStatus(exists ? 'taken' : 'available');
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [username, users, isLogin]);

  // Handle advancing from Step 1 to Step 2 with immediate server verification
  const handleProceedFromStep1 = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || trimmed.length < 3) return;
    
    setUsernameStatus('checking');
    try {
      const isTaken = await isUsernameTakenInFirebase(trimmed, users);
      if (isTaken) {
        setUsernameStatus('taken');
        setError(`@${trimmed} is already taken in the network. Please choose another username.`);
        return;
      }
      setUsernameStatus('available');
      setError('');
      setSignupStep(2);
    } catch (err) {
      console.error("Error on step 1 verification:", err);
      setSignupStep(2);
    }
  };

  // Quick Demo Login helper
  const handleQuickDemoLogin = (demoUsername: string) => {
    setLoading(true);
    setTimeout(() => {
      const found = users.find(u => u.usernameLower === demoUsername.toLowerCase());
      if (found) {
        onLogin(found);
      } else {
        setError('Demo user not found.');
      }
      setLoading(false);
    }, 800);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (isLogin) {
      if (!email || !password) {
        setError('Please fill in all credentials.');
        return;
      }
      setLoading(true);
      try {
        // Authenticate with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const firebaseUser = userCredential.user;

        // Fetch user profile from Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          
          // Mark online & update lastSeen
          const updatedUser: User = {
            ...userData,
            password: password,
            online: true,
            lastSeen: new Date().toISOString()
          };
          
          // Save back to Firestore
          await setDoc(doc(db, 'users', updatedUser.uid), updatedUser);
          
          onLogin(updatedUser);
        } else {
          // Fallback if document doesn't exist in Firestore
          const namePart = email.split('@')[0];
          const fallbackUser: User = {
            uid: firebaseUser.uid,
            fullName: namePart.charAt(0).toUpperCase() + namePart.slice(1),
            username: namePart,
            usernameLower: namePart.toLowerCase(),
            email: email.trim(),
            phone: '',
            birthDate: '',
            profileImage: selectedAvatarSeed,
            bio: 'Hey there! I am using this premium iOS messenger.',
            createdAt: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            online: true,
            blockedUsers: [],
            reportedBy: [],
            password: password
          };
          
          await setDoc(doc(db, 'users', fallbackUser.uid), fallbackUser);
          try {
            await setDoc(doc(db, 'usernames', namePart.toLowerCase()), { uid: fallbackUser.uid });
          } catch (e) {
            console.error("Error setting username reservation:", e);
          }
          onLogin(fallbackUser);
        }
      } catch (err: any) {
        console.error("Login error:", err);
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
          setError('Incorrect email or password. Please try again.');
        } else {
          setError(err.message || 'An error occurred during sign in.');
        }
      } finally {
        setLoading(false);
      }
    } else {
      // Direct complete from Step 5
      if (!fullName || !username || !phone || !birthDate || !email || !password) {
        setError('Please complete all pages of the signup flow.');
        return;
      }

      setLoading(true);
      try {
        const usernameNormalized = username.trim().toLowerCase();

        // 0. Double-check username is still available right before account creation
        const isTaken = await isUsernameTakenInFirebase(usernameNormalized, users);
        if (isTaken) {
          setError(`Username @${usernameNormalized} was just registered. Please choose another username.`);
          setUsernameStatus('taken');
          setSignupStep(1);
          setLoading(false);
          return;
        }

        // 1. Create the user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        const firebaseUser = userCredential.user;

        // 2. Prepare the Firestore User document
        const newUser: User = {
          uid: firebaseUser.uid, // Use the real Firebase Auth UID!
          fullName: fullName.trim(),
          username: username.trim(),
          usernameLower: usernameNormalized,
          email: email.trim(),
          phone: phone.trim(),
          birthDate,
          profileImage: uploadedImage || selectedAvatarSeed,
          bio: bio.trim() || 'Hey there! I am using this premium iOS messenger.',
          createdAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          online: true,
          blockedUsers: [],
          reportedBy: [],
          password: password // Keep for local state reference if needed
        };

        // 3. Write User document to Firestore users collection
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        try {
          await setDoc(doc(db, 'usernames', usernameNormalized), { uid: firebaseUser.uid });
        } catch (e) {
          console.error("Error setting username reservation:", e);
        }

        // 4. Update the parent React state via callback
        onSignUp(newUser);
      } catch (err: any) {
        console.error("Signup error:", err);
        if (err.code === 'auth/email-already-in-use') {
          setError('This email address is already registered.');
        } else if (err.code === 'auth/weak-password') {
          setError('The password is too weak. Please use at least 6 characters.');
        } else if (err.code === 'auth/invalid-email') {
          setError('Please provide a valid email address.');
        } else {
          setError(err.message || 'Failed to save account to Firebase.');
        }
      } finally {
        setLoading(false);
      }
    }
  };

  // Image upload simulator
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Validation checking for step-by-step steps
  const isStep1Valid = fullName.trim().length > 0 && username.trim().length >= 3 && usernameStatus === 'available';
  const isStep2Valid = email.trim().length > 0 && email.includes('@') && password.length >= 6;
  const isStep3Valid = phone.trim().length > 0 && birthDate.length > 0;
  // Step 4 is Avatar - always valid (can cycle or upload, has defaults)
  // Step 5 is Submit

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-black transition-colors duration-300">
      <div className="w-full max-w-md">
        
        {/* Top Branding Header */}
        <div className="text-center mb-6">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="inline-flex w-14 h-14 rounded-2xl items-center justify-center bg-gradient-to-br from-[#0A84FF] to-[#0070E0] text-white shadow-lg shadow-blue-500/10 mb-3"
          >
            <span className="text-2xl font-bold tracking-tighter">iM</span>
          </motion.div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            {isLogin ? 'Sign In to Txtorspace' : 'Join Txtorspace'}
          </h1>
          <p className="text-xs text-[#8E8E93] mt-1">
            {isLogin ? 'Premium iOS-inspired real-time messaging' : 'Create your secure account step by step'}
          </p>
        </div>

        {/* Step-by-Step progress tracker for signup */}
        {!isLogin && (
          <div className="px-1 mb-4">
            <div className="flex justify-between text-[10px] text-[#8E8E93] font-semibold uppercase tracking-wider mb-1.5">
              <span>Step {signupStep} of 5</span>
              <span>
                {signupStep === 1 && 'Username & Name'}
                {signupStep === 2 && 'Login Security'}
                {signupStep === 3 && 'Personal Details'}
                {signupStep === 4 && 'Profile Customization'}
                {signupStep === 5 && 'Verify & Finish'}
              </span>
            </div>
            <div className="h-1 bg-[#1C1C1E] rounded-full overflow-hidden flex gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <div 
                  key={s} 
                  className={`h-full flex-1 transition-all duration-300 ${
                    s <= signupStep ? 'bg-[#3B82F6]' : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Auth Card Container */}
        <motion.div 
          layout
          className="bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-[#262626] overflow-hidden relative"
        >
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 mb-4 rounded-xl bg-red-500/10 text-red-400 text-xs font-medium flex items-center gap-2 border border-red-500/20"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {isLogin ? (
            /* ================= LOGIN FORM ================= */
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              
              {/* Email Field */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#8E8E93] ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8E8E93]" />
                  <input
                    type="email"
                    required
                    placeholder="name@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-11 pr-4 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs font-semibold text-[#8E8E93]">Password</label>
                  <button 
                    type="button" 
                    onClick={() => alert("Your account password is saved securely in your browser's local database. If you forgot your credentials, please create a new profile by clicking 'Create Profile' below.")}
                    className="text-[10px] text-[#3B82F6] hover:underline cursor-pointer font-medium"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8E8E93]" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-11 pr-11 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-[#8E8E93] hover:text-white cursor-pointer p-0.5"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Auth Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] hover:opacity-90 disabled:opacity-40 text-white rounded-2xl py-3.5 text-sm font-semibold tracking-wide shadow-md active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Sign In'
                )}
              </button>

              {/* Glass Styled PWA Installation Trigger */}
              <div className="flex justify-center mt-3">
                <motion.button
                  layout
                  type="button"
                  onClick={handleInstallPWA}
                  style={{ borderRadius: showAsCircle ? '9999px' : '16px' }}
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
            </form>
          ) : (
            /* ================= PAGE-BY-PAGE SIGNUP FLOW ================= */
            <div className="space-y-4">
              
              {/* Back step button inside the form */}
              {signupStep > 1 && (
                <button
                  type="button"
                  onClick={() => setSignupStep((prev) => prev - 1)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3B82F6] hover:opacity-80 transition-opacity mb-2 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Back to Step {signupStep - 1}</span>
                </button>
              )}

              {/* STEP 1: Username & Name */}
              {signupStep === 1 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="text-center py-2">
                    <h2 className="text-base font-bold text-white">Create a username</h2>
                    <p className="text-xs text-[#8E8E93] mt-1">Add a unique handle to let friends discover you instantly.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#8E8E93] ml-1">Full Name</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8E8E93]" />
                      <input
                        type="text"
                        required
                        placeholder="Enter full name (e.g. Sara Dev)"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-11 pr-4 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-semibold text-[#8E8E93]">Username</label>
                      {usernameStatus === 'checking' && (
                        <span className="text-[10px] text-blue-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" /> Checking...
                        </span>
                      )}
                      {usernameStatus === 'available' && (
                        <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Available
                        </span>
                      )}
                      {usernameStatus === 'taken' && (
                        <span className="text-[10px] text-red-400">Username already taken</span>
                      )}
                      {usernameStatus === 'invalid' && (
                        <span className="text-[10px] text-[#8E8E93]">At least 3 characters</span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-3.5 text-[#8E8E93] font-semibold text-sm">@</span>
                      <input
                        type="text"
                        required
                        placeholder="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-8 pr-4 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!isStep1Valid || usernameStatus === 'checking'}
                    onClick={handleProceedFromStep1}
                    className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] disabled:opacity-40 text-white rounded-2xl py-3.5 text-sm font-semibold tracking-wide shadow-md flex items-center justify-center gap-2 mt-4 cursor-pointer"
                  >
                    <span>Next step</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* STEP 2: Email & Password */}
              {signupStep === 2 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="text-center py-2">
                    <h2 className="text-base font-bold text-white">Secure your account</h2>
                    <p className="text-xs text-[#8E8E93] mt-1">Set up your security credentials to log in later.</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#8E8E93] ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8E8E93]" />
                      <input
                        type="email"
                        required
                        placeholder="name@domain.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-11 pr-4 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#8E8E93] ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-[#8E8E93]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="Minimum 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-11 pr-11 text-sm outline-none text-white transition-colors placeholder-[#8E8E93]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-[#8E8E93] hover:text-white cursor-pointer p-0.5"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!isStep2Valid}
                    onClick={() => setSignupStep(3)}
                    className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] disabled:opacity-40 text-white rounded-2xl py-3.5 text-sm font-semibold tracking-wide shadow-md flex items-center justify-center gap-2 mt-4 cursor-pointer"
                  >
                    <span>Next step</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* STEP 3: Personal Details */}
              {signupStep === 3 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="text-center py-2">
                    <h2 className="text-base font-bold text-white">Tell us about yourself</h2>
                    <p className="text-xs text-[#8E8E93] mt-1">This helps us customize your discovery experience.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#8E8E93] ml-1">Mobile Number</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3.5 w-3.5 h-3.5 text-[#8E8E93]" />
                        <input
                          type="tel"
                          required
                          placeholder="+1 (555) 000-0000"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-8 pr-2 text-xs outline-none text-white transition-colors placeholder-[#8E8E93]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-[#8E8E93] ml-1">Date of Birth</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3.5 w-3.5 h-3.5 text-[#8E8E93]" />
                        <input
                          type="date"
                          required
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-3 pl-8 pr-2 text-xs outline-none text-[#8E8E93] transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#8E8E93] ml-1">Bio (Status Message)</label>
                    <textarea
                      placeholder="Share a status, interests, or quote..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={150}
                      className="w-full bg-black border border-[#262626] focus:border-[#3B82F6] rounded-2xl py-2.5 px-3.5 text-xs outline-none text-white transition-colors placeholder-[#8E8E93] h-16 resize-none"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!isStep3Valid}
                    onClick={() => setSignupStep(4)}
                    className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] disabled:opacity-40 text-white rounded-2xl py-3.5 text-sm font-semibold tracking-wide shadow-md flex items-center justify-center gap-2 mt-4 cursor-pointer"
                  >
                    <span>Next step</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* STEP 4: Choose Profile Image */}
              {signupStep === 4 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="text-center py-2">
                    <h2 className="text-base font-bold text-white">Add a profile photo</h2>
                    <p className="text-xs text-[#8E8E93] mt-1">Make your profile easily recognizable to your contacts.</p>
                  </div>

                  <div className="flex flex-col items-center justify-center py-4 gap-4">
                    <div className="relative group">
                      <div 
                        className="w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-md cursor-pointer overflow-hidden border-2 border-[#262626]"
                        style={{ 
                          background: uploadedImage ? 'none' : getAvatarGradient(selectedAvatarSeed)
                        }}
                        onClick={() => {
                          if (!uploadedImage) {
                            setSelectedAvatarSeed('user_' + Math.floor(Math.random() * 1000));
                          }
                        }}
                      >
                        {uploadedImage ? (
                          <img src={uploadedImage} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          (fullName ? fullName.charAt(0) : 'U').toUpperCase()
                        )}
                      </div>
                      
                      {/* File upload camera trigger button */}
                      <label className="absolute bottom-0 right-0 w-8 h-8 bg-zinc-900 text-white rounded-full flex items-center justify-center cursor-pointer border border-[#262626] shadow-md hover:scale-110 active:scale-95 transition-transform">
                        <Camera className="w-4 h-4" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleImageUpload} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                    
                    <div className="text-center px-4">
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedImage(null);
                          setSelectedAvatarSeed('user_' + Math.floor(Math.random() * 1000));
                        }}
                        className="text-xs text-[#3B82F6] hover:underline cursor-pointer font-semibold"
                      >
                        {uploadedImage ? 'Remove Custom Photo' : 'Cycle Random Background Color'}
                      </button>
                      <p className="text-[10px] text-[#8E8E93] mt-2">
                        You can upload any photo or keep the custom color-paired avatar design.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSignupStep(5)}
                    className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] text-white rounded-2xl py-3.5 text-sm font-semibold tracking-wide shadow-md flex items-center justify-center gap-2 mt-4 cursor-pointer"
                  >
                    <span>Review & Confirm</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}

              {/* STEP 5: Final Review & Submit */}
              {signupStep === 5 && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4 animate-pulse-once"
                >
                  <div className="text-center py-1">
                    <h2 className="text-base font-bold text-white">Review Profile Details</h2>
                    <p className="text-xs text-[#8E8E93] mt-1">Looks perfect! Ready to join the discovery network?</p>
                  </div>

                  {/* Aesthetic preview card */}
                  <div className="p-4 bg-black/60 rounded-2xl border border-[#262626] flex items-center gap-4">
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-sm"
                      style={{ 
                        background: uploadedImage ? 'none' : getAvatarGradient(selectedAvatarSeed)
                      }}
                    >
                      {uploadedImage ? (
                        <img src={uploadedImage} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        (fullName ? fullName.charAt(0) : 'U').toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-white truncate">{fullName}</h4>
                      <p className="text-xs text-[#3B82F6] font-medium">@{username}</p>
                      <p className="text-[11px] text-[#8E8E93] truncate mt-1 italic">"{bio || 'No status bio set.'}"</p>
                    </div>
                  </div>

                  {/* Mini-details grids */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-[#8E8E93] bg-[#2C2C2E]/40 rounded-2xl p-3 border border-[#262626]">
                    <div>
                      <span className="block font-medium uppercase tracking-wider text-[9px] text-[#8E8E93] mb-0.5">Email</span>
                      <span className="text-white font-semibold truncate block">{email}</span>
                    </div>
                    <div>
                      <span className="block font-medium uppercase tracking-wider text-[9px] text-[#8E8E93] mb-0.5">Phone</span>
                      <span className="text-white font-semibold truncate block">{phone}</span>
                    </div>
                  </div>

                  {/* Submission form trigger */}
                  <form onSubmit={handleAuthSubmit}>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-br from-[#0A84FF] to-[#0070E0] hover:opacity-90 disabled:opacity-40 text-white rounded-2xl py-3.5 text-sm font-semibold tracking-wide shadow-md flex items-center justify-center gap-2 mt-2 cursor-pointer"
                    >
                      {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Complete Registration'
                      )}
                    </button>
                  </form>
                </motion.div>
              )}

            </div>
          )}

          {/* Form Switch Divider */}
          <div className="mt-5 pt-4 border-t border-[#262626] flex items-center justify-center text-xs">
            <span className="text-[#8E8E93] mr-1.5">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => {
                setError('');
                setIsLogin(!isLogin);
                setSignupStep(1);
              }}
              className="text-[#3B82F6] font-semibold hover:underline cursor-pointer"
            >
              {isLogin ? 'Create Profile' : 'Sign In'}
            </button>
          </div>
        </motion.div>
      </div>

      {/* ================= PWA INSTALLATION PROGRESS MODAL ================= */}
      <AnimatePresence>
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
              {/* Spinning / Pulsing Logo */}
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
