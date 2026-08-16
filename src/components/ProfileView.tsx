import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, MessageSquare, UserCheck, UserPlus, UserMinus, ShieldAlert, Flag, Calendar, Phone, Mail, Check, AlertCircle, Share2
} from 'lucide-react';
import { User, ChatRequest, Chat } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface ProfileViewProps {
  user: User;
  currentUser: User | null;
  chats: Chat[];
  chatRequests: ChatRequest[];
  onClose: () => void;
  onSendRequest: (userId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onCancelRequest: (requestId: string) => void;
  onBlockUser: (userId: string) => void;
  onUnblockUser: (userId: string) => void;
  onReportUser: (userId: string) => void;
  onSelectChat: (chatId: string) => void;
  onNavigateToView: (view: 'chats' | 'requests' | 'search' | 'profile' | 'settings') => void;
  onUnfriendUser?: (userId: string) => void;
  onRefriendUser?: (userId: string) => void;
}

export default function ProfileView({
  user,
  currentUser,
  chats,
  chatRequests,
  onClose,
  onSendRequest,
  onAcceptRequest,
  onCancelRequest,
  onBlockUser,
  onUnblockUser,
  onReportUser,
  onSelectChat,
  onNavigateToView,
  onUnfriendUser,
  onRefriendUser
}: ProfileViewProps) {
  
  const [shareCopied, setShareCopied] = useState(false);

  // Tick state to update last seen displays instantly in real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const isSelf = currentUser ? user.uid === currentUser.uid : false;
  const isBlocked = currentUser ? currentUser.blockedUsers.includes(user.uid) : false;
  const isCustomImg = user.profileImage.startsWith('data:') && !isBlocked;
  const hasReported = currentUser ? user.reportedBy.includes(currentUser.uid) : false;

  // Check relationship status
  const getRelationship = () => {
    if (!currentUser) return { type: 'none' };

    // 1. Chat Request Sent
    const outgoingReq = chatRequests.find(r => r.senderId === currentUser.uid && r.receiverId === user.uid && r.status === 'pending');
    if (outgoingReq) {
      return { type: 'outgoing', reqId: outgoingReq.requestId };
    }

    // 2. Chat Request Received
    const incomingReq = chatRequests.find(r => r.senderId === user.uid && r.receiverId === currentUser.uid && r.status === 'pending');
    if (incomingReq) {
      return { type: 'incoming', reqId: incomingReq.requestId };
    }

    // 3. Existing Active Chat (only if not currently unfriended)
    const isUnfriended = (currentUser.unfriendedUsers || []).includes(user.uid) || 
                          (user.unfriendedUsers || []).includes(currentUser.uid);
    const activeChat = chats.find(c => !c.isGroup && c.members.includes(user.uid));
    if (activeChat && !isUnfriended) {
      return { type: 'contact', chatId: activeChat.chatId };
    }

    return { type: 'none' };
  };

  const relation = getRelationship();

  // Resolved user credentials under block restrictions
  const displayedName = isBlocked ? "Blocked Contact" : user.fullName;
  const displayedUsername = isBlocked ? "blocked_contact" : user.username;
  const displayedBio = isBlocked ? "This profile is unavailable because you have blocked this contact." : (user.bio || 'This user has not set a status biography.');
  const isUnfriended = currentUser ? ((currentUser.unfriendedUsers || []).includes(user.uid) || (user.unfriendedUsers || []).includes(currentUser.uid)) : false;
  const isRecentlyActive = user.lastSeen ? (Date.now() - new Date(user.lastSeen).getTime() < 45000) : false;
  // Presence (online, offline, last seen) is visible as long as not blocked
  const canViewPresence = !isBlocked;
  const displayedOnline = (isBlocked || !canViewPresence) ? false : (user.online && isRecentlyActive);

  const handleMessageAction = () => {
    if (!currentUser) return;
    if (relation.type === 'contact' && relation.chatId) {
      onSelectChat(relation.chatId);
      onNavigateToView('chats');
      onClose();
    } else if (relation.type === 'incoming' && relation.reqId) {
      onAcceptRequest(relation.reqId);
    } else if (relation.type === 'outgoing' && relation.reqId) {
      onCancelRequest(relation.reqId);
    } else if (relation.type === 'none') {
      onSendRequest(user.uid);
    }
  };

  const formattedDate = (isoString?: string) => {
    if (!isoString) return 'Joined recently';
    const d = new Date(isoString);
    return `Joined ${d.toLocaleDateString([], { month: 'long', year: 'numeric' })}`;
  };

  const handleShareProfile = () => {
    // Generate clean link format
    const profileLink = `${window.location.origin}/user/${user.username}`;
    navigator.clipboard.writeText(profileLink).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const formatLastSeen = (isoString?: string): string => {
    const fallbackIso = isoString || user.createdAt;
    if (!fallbackIso) return 'Last seen recently';
    const date = new Date(fallbackIso);
    if (isNaN(date.getTime())) return 'Last seen recently';
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return `Last seen today at ${timeStr}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Last seen yesterday at ${timeStr}`;
    }
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `Last seen on ${dateStr} at ${timeStr}`;
  };

  return (
    <div className="flex flex-col h-full bg-black transition-colors duration-300">
      
      {/* iOS-Style Sticky Header bar */}
      <div className="p-4 flex items-center justify-between bg-[#0A0A0A] border-b border-[#262626]">
        <span className="text-sm font-semibold text-white">Profile Detail</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full bg-[#1C1C1E] hover:bg-[#2C2C2E] text-[#8E8E93] cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 no-scrollbar">
        
        {/* Profile Card Container */}
        <div className="bg-[#1C1C1E] rounded-3xl p-6 text-center border border-[#262626] shadow-sm">
          
          {/* Avatar and Online Bubble */}
          <div className="relative inline-block mx-auto mb-4">
            {isCustomImg ? (
              <img 
                src={user.profileImage} 
                alt={displayedName} 
                className="w-24 h-24 rounded-full object-cover shadow-md border-2 border-white dark:border-zinc-900" 
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-inner"
                style={{ background: isBlocked ? '#4A4A4A' : getAvatarGradient(user.profileImage) }}
              >
                {displayedName.charAt(0).toUpperCase()}
              </div>
            )}
            
            {displayedOnline && !isSelf && (
              <span className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-black animate-pulse" />
            )}
          </div>

          {/* User Names */}
          <h2 className="text-xl font-bold text-white">{displayedName}</h2>
          <p className="text-sm text-[#3B82F6] font-semibold mt-0.5">@{displayedUsername}</p>
          
          {/* Status Label (Online / Last Seen) - Only shown after chat request / connection */}
          {canViewPresence && (
            <div className="mt-2.5">
              {displayedOnline ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-semibold">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Active Now
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#2C2C2E]/60 text-[#8E8E93] rounded-full text-xs font-medium">
                  {formatLastSeen(user.lastSeen)}
                </span>
              )}
            </div>
          )}

          {/* Bio text block */}
          <p className="text-sm text-[#F2F2F7] mt-4 leading-relaxed px-2 italic">
            "{displayedBio}"
          </p>

          <div className="flex justify-center items-center gap-1.5 text-xs text-[#8E8E93] mt-4 border-t border-[#262626] pt-4">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formattedDate(user.createdAt)}</span>
          </div>
        </div>

        {/* Share Profile Button (Highly visible, available for guests as well) */}
        <button
          onClick={handleShareProfile}
          className={`w-full py-3.5 px-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer shadow-sm ${
            shareCopied
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-[#1C1C1E] hover:bg-[#2C2C2E] text-[#8E8E93] hover:text-white border border-[#262626]'
          }`}
        >
          {shareCopied ? (
            <>
              <Check className="w-4 h-4 text-emerald-400 animate-bounce" />
              <span>Link Copied to Clipboard!</span>
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 text-emerald-400" />
              <span>Share Contact Profile URL</span>
            </>
          )}
        </button>

        {/* Action Controls Group */}
        {!isSelf && (
          <div className="space-y-2.5">
            {!currentUser ? (
              /* Public / Guest Notice & Auth Prompt */
              <div className="bg-[#1C1C1E] border border-zinc-800/60 rounded-3xl p-5 space-y-4">
                <div className="flex gap-2 text-amber-500 text-xs font-semibold items-start">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Interactive Actions Restricted</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  You are viewing this profile as a guest. To secure contact, send chat requests, message, block or report, you must first register or log in.
                </p>
                <button
                  onClick={onClose}
                  className="w-full py-3 px-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-98 cursor-pointer text-center"
                >
                  Join Txtorspace / Log In
                </button>
              </div>
            ) : (
              /* Registered user actions */
              <>
                {/* Primary Action Button (Message/Request workflow) */}
                <button
                  onClick={handleMessageAction}
                  disabled={isBlocked}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98 cursor-pointer ${
                    isBlocked
                      ? 'bg-[#2C2C2E] text-[#8E8E93] cursor-not-allowed border border-[#262626]'
                      : relation.type === 'contact'
                      ? 'bg-gradient-to-br from-[#0A84FF] to-[#0070E0] text-white shadow-md'
                      : relation.type === 'incoming'
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : relation.type === 'outgoing'
                      ? 'bg-[#2C2C2E] hover:opacity-80 text-white border border-[#262626]'
                      : 'bg-white text-black hover:bg-zinc-100'
                  }`}
                >
                  {relation.type === 'contact' && (
                    <>
                       <MessageSquare className="w-4.5 h-4.5" />
                       <span>Send Message</span>
                    </>
                  )}
                  {relation.type === 'incoming' && (
                    <>
                       <UserCheck className="w-4.5 h-4.5" />
                       <span>Accept Contact Request</span>
                    </>
                  )}
                  {relation.type === 'outgoing' && (
                    <>
                       <Check className="w-4.5 h-4.5 text-emerald-400" />
                       <span className="text-emerald-400 font-extrabold">Request Sent ✓ (Cancel?)</span>
                    </>
                  )}
                  {relation.type === 'none' && (
                    <>
                       <UserPlus className="w-4.5 h-4.5" />
                       <span>Send Chat Request</span>
                    </>
                  )}
                </button>

                {/* Unfriend Contact Button (only if contact & not unfriended) */}
                {relation.type === 'contact' && !isUnfriended && !isSelf && (
                  <button
                    onClick={() => {
                      const confirmUnfriend = window.confirm(`Are you sure you want to unfriend ${user.fullName}? You will not be able to chat with each other anymore.`);
                      if (confirmUnfriend) {
                        onUnfriendUser?.(user.uid);
                      }
                    }}
                    className="w-full py-2.5 px-4 bg-orange-950/20 hover:bg-orange-950/40 border border-orange-900/30 text-orange-500 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserMinus className="w-4 h-4 text-orange-500" />
                    <span>Unfriend Contact</span>
                  </button>
                )}

                {/* Block & Report Group */}
                <div className="grid grid-cols-2 gap-2.5">
                  {isBlocked ? (
                    <button
                      onClick={() => onUnblockUser(user.uid)}
                      className="py-3 px-3 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#262626] text-emerald-400 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-4 h-4" />
                      <span>Unblock User</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onBlockUser(user.uid)}
                      className="py-3 px-3 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#262626] text-red-400 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserMinus className="w-4 h-4" />
                      <span>Block User</span>
                    </button>
                  )}

                  <button
                    onClick={() => onReportUser(user.uid)}
                    disabled={hasReported}
                    className="py-3 px-3 bg-[#1C1C1E] hover:bg-[#2C2C2E] border border-[#262626] text-[#8E8E93] disabled:opacity-40 text-xs font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Flag className="w-4 h-4" />
                    <span>{hasReported ? 'Reported ✓' : 'Report Abuse'}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Contact info grid details */}
        <div className="bg-[#1C1C1E] rounded-3xl p-5 border border-[#262626] space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E8E93]">Security & Credentials</h3>
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black border border-[#262626] flex items-center justify-center text-[#8E8E93]">
              <Mail className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Email Address</p>
              <p className="text-xs font-semibold text-white truncate">
                {(isSelf || relation.type === 'contact') && !isBlocked && !isUnfriended && currentUser ? user.email : '••••••••@••••.com'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black border border-[#262626] flex items-center justify-center text-[#8E8E93]">
              <Phone className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#8E8E93] uppercase tracking-wide">Phone Number</p>
              <p className="text-xs font-semibold text-white truncate">
                {(isSelf || relation.type === 'contact') && !isBlocked && !isUnfriended && currentUser ? user.phone : '• ••• ••• ••••'}
              </p>
            </div>
          </div>
        </div>

        {/* Warning card for blocked contacts */}
        {isBlocked && (
          <div className="p-3 bg-red-950/20 text-red-400 border border-red-900/30 rounded-2xl flex items-start gap-2 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              <strong>You have blocked this contact.</strong> You will not receive any incoming messages or notifications from them, and they cannot discover your email or phone number.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}