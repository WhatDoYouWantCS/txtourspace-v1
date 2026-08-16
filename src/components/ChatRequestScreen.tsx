import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, X, ShieldAlert, ArrowUpRight, ArrowDownLeft, Clock, Search, 
  Compass, ArrowRight, UserPlus, Users, Sparkles, RefreshCw, CheckCircle2,
  Mail, PhoneCall, ExternalLink
} from 'lucide-react';
import { ChatRequest, User, Chat } from '../types';
import { getAvatarGradient } from '../data/mockUsers';
import { auth } from '../lib/firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

interface ChatRequestScreenProps {
  chatRequests: ChatRequest[];
  users: User[];
  chats: Chat[];
  currentUser: User;
  onAcceptRequest: (requestId: string) => void;
  onDeclineRequest: (requestId: string) => void;
  onCancelRequest: (requestId: string) => void;
  onViewUserProfile: (uid: string) => void;
  onUpdateProfile?: (fields: Partial<User>) => void;
}

export default function ChatRequestScreen({
  chatRequests,
  users,
  chats,
  currentUser,
  onAcceptRequest,
  onDeclineRequest,
  onCancelRequest,
  onViewUserProfile,
  onUpdateProfile
}: ChatRequestScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState('');
  const [showDomainHelp, setShowDomainHelp] = useState(false);
  const [authErrorType, setAuthErrorType] = useState<'unauthorized-domain' | 'operation-not-allowed' | null>(null);

  // Group requests by status
  const incomingRequests = chatRequests.filter(r => r.receiverId === currentUser.uid && r.status === 'pending');
  const outgoingRequests = chatRequests.filter(r => r.senderId === currentUser.uid && r.status === 'pending');

  const getUserDetails = (userId: string): User | undefined => {
    return users.find(u => u.uid === userId);
  };

  // Matched Google Contacts from registered users (strictly filtering by currentUser's synced contacts list)
  const googleContactsMatches = users.filter((u) => {
    if (u.uid === currentUser.uid) return false;
    if (currentUser.blockedUsers?.includes(u.uid) || u.blockedUsers?.includes(currentUser.uid)) return false;
    if (currentUser.unfriendedUsers?.includes(u.uid) || u.unfriendedUsers?.includes(currentUser.uid)) return false;
    
    // Check if the user's email or phone matches the current user's synced Google contacts lists
    const emails = (currentUser as any).googleContactEmails || [];
    const phones = (currentUser as any).googleContactPhones || [];
    
    const cleanPhone = (p: string) => p.replace(/[^0-9+]/g, '');
    
    const isMatchedEmail = u.email && emails.some((e: string) => e.toLowerCase() === u.email.toLowerCase());
    const isMatchedPhone = u.phone && phones.some((p: string) => cleanPhone(p) === cleanPhone(u.phone));
    
    return isMatchedEmail || isMatchedPhone;
  });

  // Filter users for Discovery network (only allow search by exact handle, name, or phone)
  const cleanQuery = searchQuery.trim().toLowerCase();
  const searchString = cleanQuery.startsWith('@') ? cleanQuery.slice(1) : cleanQuery;

  const filteredUsers = !searchString ? [] : users.filter((u) => {
    if (u.uid === currentUser.uid) return false;
    
    // Do not search blocked users
    if (currentUser.blockedUsers?.includes(u.uid) || u.blockedUsers?.includes(currentUser.uid)) {
      return false;
    }

    const cleanPhone = (p: string) => p.replace(/[^0-9+]/g, '');
    const uCleanPhone = u.phone ? cleanPhone(u.phone) : '';
    const searchCleanPhone = cleanQuery.replace(/[^0-9+]/g, '');

    return (
      u.usernameLower === searchString ||
      (uCleanPhone && searchCleanPhone && uCleanPhone === searchCleanPhone)
    );
  });

  const getRelationBadge = (otherUid: string) => {
    const hasChat = chats.some(c => !c.isGroup && c.members.includes(otherUid));
    if (hasChat) {
      return { text: 'Contact', style: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
    }

    const request = chatRequests.find(r => 
      r.status === 'pending' && 
      ((r.senderId === currentUser.uid && r.receiverId === otherUid) || 
       (r.senderId === otherUid && r.receiverId === currentUser.uid))
    );

    if (request) {
      if (request.senderId === currentUser.uid) {
        return { text: 'Sent Request', style: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' };
      } else {
        return { text: 'Received Request', style: 'bg-orange-500/10 text-orange-400 border border-orange-500/20' };
      }
    }

    return null;
  };

  const performGoogleSync = async (): Promise<{ emails: string[]; phones: string[] }> => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/contacts.readonly');
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('Access token not found in Google sign-in response');
    }

    const response = await fetch(
      'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=1000',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API returned an error: ${errorText}`);
    }

    const data = await response.json();
    const connections = data.connections || [];

    const emailsSet = new Set<string>();
    const phonesSet = new Set<string>();

    connections.forEach((person: any) => {
      if (person.emailAddresses) {
        person.emailAddresses.forEach((eObj: any) => {
          if (eObj.value) {
            emailsSet.add(eObj.value.toLowerCase().trim());
          }
        });
      }
      if (person.phoneNumbers) {
        person.phoneNumbers.forEach((pObj: any) => {
          if (pObj.value) {
            const rawVal = pObj.value.trim();
            const cleanVal = pObj.value.replace(/[^+\d]/g, '');
            if (cleanVal) phonesSet.add(cleanVal);
            phonesSet.add(rawVal);
          }
        });
      }
    });

    return {
      emails: Array.from(emailsSet),
      phones: Array.from(phonesSet)
    };
  };

  const handleQuickDemoSync = () => {
    setIsSyncing(true);
    // Take all registered users in our 'users' list who are not the currentUser
    const otherUserEmails = users
      .filter(u => u.uid !== currentUser.uid && u.email)
      .map(u => u.email!.toLowerCase().trim());
    const otherUserPhones = users
      .filter(u => u.uid !== currentUser.uid && u.phone)
      .map(u => u.phone!.trim());

    if (onUpdateProfile) {
      onUpdateProfile({
        syncGoogleContacts: true,
        googleContactsSyncedAt: new Date().toISOString(),
        googleContactEmails: otherUserEmails,
        googleContactPhones: otherUserPhones
      } as any);
    }
    
    setSyncToast('Demo Contacts Synced! Connected with active members.');
    setIsSyncing(false);
    setShowDomainHelp(false);
    setAuthErrorType(null);
    setTimeout(() => setSyncToast(''), 3500);
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const { emails, phones } = await performGoogleSync();
      if (onUpdateProfile) {
        onUpdateProfile({
          syncGoogleContacts: true,
          googleContactsSyncedAt: new Date().toISOString(),
          googleContactEmails: emails,
          googleContactPhones: phones
        } as any);
      }
      setSyncToast('Google Contacts synced with Txtorspace!');
    } catch (error: any) {
      console.error('Error syncing Google Contacts:', error);
      const isDomainErr = error?.code === 'auth/unauthorized-domain' || 
                          String(error?.message).includes('unauthorized-domain') ||
                          String(error).includes('unauthorized-domain');
      const isNotAllowedErr = error?.code === 'auth/operation-not-allowed' ||
                              String(error?.message).includes('operation-not-allowed') ||
                              String(error).includes('operation-not-allowed');
      if (isDomainErr) {
        setAuthErrorType('unauthorized-domain');
        setShowDomainHelp(true);
      } else if (isNotAllowedErr) {
        setAuthErrorType('operation-not-allowed');
        setShowDomainHelp(true);
      } else {
        alert(error.message || 'Failed to sync Google Contacts. Please try again.');
      }
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(''), 3500);
    }
  };

  const handleToggleGoogleSync = async () => {
    const nextVal = !currentUser.syncGoogleContacts;
    if (!nextVal) {
      if (onUpdateProfile) {
        onUpdateProfile({
          syncGoogleContacts: false,
          googleContactsSyncedAt: undefined,
          googleContactEmails: [],
          googleContactPhones: []
        } as any);
      }
      setSyncToast('Google Contacts sync disabled.');
      setTimeout(() => setSyncToast(''), 3500);
      return;
    }

    setIsSyncing(true);
    try {
      const { emails, phones } = await performGoogleSync();
      if (onUpdateProfile) {
        onUpdateProfile({
          syncGoogleContacts: true,
          googleContactsSyncedAt: new Date().toISOString(),
          googleContactEmails: emails,
          googleContactPhones: phones
        } as any);
      }
      setSyncToast('Google Contacts sync activated! Contacts discovered.');
    } catch (error: any) {
      console.error('Error activating Google Contacts sync:', error);
      const isDomainErr = error?.code === 'auth/unauthorized-domain' || 
                          String(error?.message).includes('unauthorized-domain') ||
                          String(error).includes('unauthorized-domain');
      const isNotAllowedErr = error?.code === 'auth/operation-not-allowed' ||
                              String(error?.message).includes('operation-not-allowed') ||
                              String(error).includes('operation-not-allowed');
      if (isDomainErr) {
        setAuthErrorType('unauthorized-domain');
        setShowDomainHelp(true);
      } else if (isNotAllowedErr) {
        setAuthErrorType('operation-not-allowed');
        setShowDomainHelp(true);
      } else {
        alert(error.message || 'Failed to activate Google Contacts sync. Please try again.');
      }
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(''), 3500);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black transition-colors duration-300 overflow-y-auto no-scrollbar">
      
      {/* Page Title */}
      <div className="p-6 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Discover</span>
            <span className="text-xs bg-[#1DB954]/10 text-[#1DB954] rounded-full px-2.5 py-1 font-bold border border-[#1DB954]/20">
              Secure Mode
            </span>
          </h1>
        </div>
        <p className="text-xs text-[#8E8E93] mt-1.5">
          Enter a username or phone to discover friends and start chats safely.
        </p>
      </div>

      {syncToast && (
        <div className="mx-6 mt-2 p-3 bg-[#1DB954]/10 border border-[#1DB954]/20 rounded-2xl flex items-center gap-2 text-xs font-bold text-[#1DB954] animate-fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Unified Search Input */}
      <div className="px-6 py-4">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by full username, name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1C1C1E] border border-[#262626] focus:border-[#1DB954] rounded-xl py-2.5 pl-10 pr-10 text-xs text-white placeholder-zinc-500 outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content Container */}
      <div className="px-6 pb-24 space-y-6">



        {/* ================= SECTION 1: INCOMING REQUESTS ================= */}
        {incomingRequests.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-400 mb-3 uppercase tracking-wider pl-1">
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Pending Requests Received ({incomingRequests.length})</span>
            </div>

            <div className="space-y-2">
              {incomingRequests.map((req) => {
                const sender = getUserDetails(req.senderId);
                if (!sender) return null;
                const isCustomImg = sender.profileImage.startsWith('data:');

                return (
                  <motion.div
                    key={req.requestId}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-[#1C1C1E] border border-[#262626] rounded-2xl flex items-center justify-between gap-3 shadow-md"
                  >
                    <div 
                      className="flex items-center gap-3 min-w-0 cursor-pointer"
                      onClick={() => onViewUserProfile(sender.uid)}
                    >
                      {isCustomImg ? (
                        <img src={sender.profileImage} alt={sender.fullName} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: getAvatarGradient(sender.profileImage) }}>
                          {sender.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate hover:underline">{sender.fullName}</h4>
                        <p className="text-[10px] text-zinc-400">@{sender.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onAcceptRequest(req.requestId)}
                        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-[11px] font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        onClick={() => onDeclineRequest(req.requestId)}
                        className="p-1.5 bg-[#2C2C2E] hover:bg-red-500 hover:text-white text-zinc-400 rounded-xl cursor-pointer transition-all"
                        title="Decline request"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= SECTION 2: OUTGOING REQUESTS ================= */}
        {outgoingRequests.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 mb-3 uppercase tracking-wider pl-1">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Pending Requests Sent ({outgoingRequests.length})</span>
            </div>

            <div className="space-y-2">
              {outgoingRequests.map((req) => {
                const receiver = getUserDetails(req.receiverId);
                if (!receiver) return null;
                const isCustomImg = receiver.profileImage.startsWith('data:');

                return (
                  <motion.div
                    key={req.requestId}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-[#1C1C1E]/50 border border-[#262626] rounded-2xl flex items-center justify-between gap-3"
                  >
                    <div 
                      className="flex items-center gap-3 min-w-0"
                      onClick={() => onViewUserProfile(receiver.uid)}
                    >
                      {isCustomImg ? (
                        <img src={receiver.profileImage} alt={receiver.fullName} className="w-9 h-9 rounded-full object-cover cursor-pointer hover:opacity-85" />
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer hover:opacity-85" style={{ background: getAvatarGradient(receiver.profileImage) }}>
                          {receiver.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-white truncate cursor-pointer hover:underline">{receiver.fullName}</h4>
                        <p className="text-[10px] text-zinc-400">@{receiver.username}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => onCancelRequest(req.requestId)}
                      className="text-[11px] text-red-400 hover:underline cursor-pointer font-semibold px-2.5 py-1 bg-[#2C2C2E]/30 rounded-lg"
                    >
                      Cancel
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= SECTION 3: MEMBERS NETWORK DISCOVERY ================= */}
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 mb-3 uppercase tracking-wider pl-1 pt-1">
            <Compass className="w-3.5 h-3.5" />
            <span>{searchQuery ? 'Search Results' : 'Direct Member Lookup'}</span>
          </div>

          <div className="space-y-2">
            {!searchQuery.trim() ? (
              <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-[#262626] rounded-2xl bg-[#1C1C1E]/20 p-6">
                <ShieldAlert className="w-7 h-7 text-[#1DB954] mb-2.5 opacity-80" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Private Lookup Active</h3>
                <p className="text-[11px] text-[#8E8E93] max-w-[280px] mt-1.5 leading-relaxed">
                  Type a member's username, full name, or phone number in the search bar above to look up their profile and connect securely.
                </p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-[#262626] rounded-2xl bg-black/40">
                <ShieldAlert className="w-5 h-5 text-zinc-600 mb-2" />
                <p className="text-xs text-[#8E8E93]">No members found matching "{searchQuery}"</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isCustomImg = user.profileImage.startsWith('data:');
                const relation = getRelationBadge(user.uid);

                return (
                  <div
                    key={user.uid}
                    onClick={() => onViewUserProfile(user.uid)}
                    className="p-3 bg-[#1C1C1E]/50 hover:bg-[#1C1C1E] border border-[#262626] rounded-2xl flex items-center justify-between cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        {isCustomImg ? (
                          <img src={user.profileImage} alt={user.fullName} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: getAvatarGradient(user.profileImage) }}>
                            {user.fullName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {user.online && relation !== null && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs font-bold text-white truncate">{user.fullName}</h4>
                          {relation && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${relation.style}`}>
                              {relation.text}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-blue-500">@{user.username}</p>
                        <p className="text-[10px] text-[#8E8E93] truncate mt-0.5">{user.bio}</p>
                      </div>
                    </div>

                    <div className="p-1.5 rounded-lg bg-[#2C2C2E] text-zinc-400 group-hover:text-blue-400 group-hover:bg-blue-500/10 border border-transparent group-hover:border-blue-500/20 transition-all ml-2">
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Firebase Unauthorized Domain Help Modal */}
      <AnimatePresence>
        {showDomainHelp && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
              
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 flex-shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    {authErrorType === 'operation-not-allowed' ? 'Google Provider Disabled' : 'Authorization Needed'}
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-bold">Firebase Auth Security Policy</p>
                </div>
              </div>

              <div className="space-y-3.5 text-xs text-zinc-300 leading-relaxed mb-6">
                {authErrorType === 'operation-not-allowed' ? (
                  <>
                    <p>
                      Google Authentication is not yet enabled as a Sign-in method in your Firebase project. To enable Google Contact synchronization, you must activate the Google sign-in provider.
                    </p>
                    <div className="space-y-1.5 pl-4 list-decimal text-zinc-300">
                      <div>1. Open your <span className="font-bold text-white">Firebase Console</span>.</div>
                      <div>2. Go to <span className="font-semibold text-zinc-200">Authentication</span> → <span className="font-semibold text-zinc-200">Sign-in method</span>.</div>
                      <div>3. Click <span className="font-semibold text-zinc-200">Add new provider</span>, select <span className="font-bold text-blue-400">Google</span>, toggle to <span className="font-bold text-emerald-400">Enable</span>, and click <span className="font-semibold text-zinc-200">Save</span>.</div>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      Because this is a secure sandbox development workspace, your Google Auth connection requires registering this domain in your Firebase authorized domains list.
                    </p>
                    
                    <div className="p-3 bg-black/40 border border-zinc-800 rounded-2xl flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Your Active Domain</span>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-xs text-blue-400 select-all font-mono break-all">{window.location.hostname}</code>
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.hostname);
                            alert('Domain copied!');
                          }}
                          className="px-2.5 py-1 text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md cursor-pointer active:scale-95 transition-all"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5 pl-4 list-decimal text-zinc-300">
                      <div>1. Open your <span className="font-bold text-white">Firebase Console</span>.</div>
                      <div>2. Go to <span className="font-semibold text-zinc-200">Authentication</span> → <span className="font-semibold text-zinc-200">Settings</span> → <span className="font-semibold text-zinc-200">Authorized domains</span>.</div>
                      <div>3. Click <span className="font-semibold text-zinc-200">Add domain</span> and paste the copied domain.</div>
                    </div>
                  </>
                )}

                <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                  <p className="text-[11px] text-zinc-400">
                    💡 <span className="font-bold text-blue-400">Testing shortcut:</span> You can instantly seed demo contacts below to test the matching network discovery directly without setting up anything!
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleQuickDemoSync}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-md shadow-emerald-950/40"
                >
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                  <span>Quick Sync Demo Contacts</span>
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDomainHelp(false);
                      handleManualSync();
                    }}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl cursor-pointer active:scale-95 transition-all border border-zinc-700"
                  >
                    Retry Google Auth
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDomainHelp(false);
                      setAuthErrorType(null);
                    }}
                    className="flex-1 py-2 bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white font-bold text-xs rounded-xl cursor-pointer active:scale-95 transition-all border border-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
