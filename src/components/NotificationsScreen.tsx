import React from 'react';
import { motion } from 'motion/react';
import { Bell, Check, Trash2, Heart, Sparkles, UserCheck, MessageSquare, Plus, X, Shield, ShieldCheck, UserPlus, Users, AtSign } from 'lucide-react';
import { NotificationItem, User, ChatRequest } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface NotificationsScreenProps {
  notifications: NotificationItem[];
  currentUser: User;
  onClearNotifications?: () => void;
  onDismissNotification?: (id: string) => void;
  chatRequests?: ChatRequest[];
  users?: User[];
  onAcceptRequest?: (requestId: string) => void;
  onDeclineRequest?: (requestId: string) => void;
  onViewUserProfile?: (uid: string) => void;
  onSelectChat?: (chatId: string) => void;
  onNavigateToTab?: (tab: string) => void;
}

export default function NotificationsScreen({
  notifications,
  currentUser,
  chatRequests = [],
  users = [],
  onAcceptRequest,
  onDeclineRequest,
  onViewUserProfile,
  onSelectChat,
  onNavigateToTab
}: NotificationsScreenProps) {
  
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getNotifIcon = (type: NotificationItem['type']) => {
    switch(type) {
      case 'mention':
        return <AtSign className="w-3.5 h-3.5 text-purple-400" />;
      case 'request_received':
        return <Plus className="w-3.5 h-3.5 text-orange-400" />;
      case 'request_accepted':
        return <UserCheck className="w-3.5 h-3.5 text-emerald-400" />;
      case 'new_message':
        return <MessageSquare className="w-3.5 h-3.5 text-blue-400" />;
      case 'story_liked':
        return <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />;
      case 'added_to_group':
        return <UserPlus className="w-3.5 h-3.5 text-emerald-400" />;
      case 'removed_from_group':
        return <X className="w-3.5 h-3.5 text-rose-400" />;
      case 'promoted_admin':
        return <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />;
      case 'permission_updated':
        return <Shield className="w-3.5 h-3.5 text-emerald-400" />;
      case 'system_alert':
        return <Bell className="w-3.5 h-3.5 text-blue-400" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-zinc-400" />;
    }
  };

  const incomingRequests = chatRequests.filter(
    (r) => r.receiverId === currentUser.uid && r.status === 'pending'
  );

  return (
    <div className="flex flex-col h-full bg-black transition-colors duration-300">
      
      {/* Notifications Header */}
      <div className="p-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Alerts & Notifications</span>
            <span className="text-xs bg-[#0A84FF]/10 text-[#0A84FF] rounded-full px-2 py-0.5 font-bold border border-[#0A84FF]/15">
              {notifications.length + incomingRequests.length}
            </span>
          </h1>
          <p className="text-xs text-[#8E8E93] mt-1">
            All mentions, group invites, and activity alerts sync live to your account.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Synced</span>
          </span>
        </div>
      </div>

      {/* Notifications Content scrolling box */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 no-scrollbar">
        
        {/* ================= PENDING CONTACT REQUESTS ================= */}
        {incomingRequests.length > 0 && (
          <div className="space-y-2 pb-2 border-b border-[#262626]">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-400 uppercase tracking-wider pl-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Pending Contact Requests ({incomingRequests.length})</span>
            </div>

            <div className="grid gap-2">
              {incomingRequests.map((req) => {
                const sender = users.find((u) => u.uid === req.senderId);
                if (!sender) return null;
                const isCustomImg = sender.profileImage.startsWith('data:');

                return (
                  <motion.div
                    key={req.requestId}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-[#1C1C1E] border border-[#262626] rounded-xl flex items-center gap-3"
                  >
                    <div 
                      className="relative flex-shrink-0 cursor-pointer hover:opacity-90"
                      onClick={() => onViewUserProfile && onViewUserProfile(sender.uid)}
                    >
                      {isCustomImg ? (
                        <img
                          src={sender.profileImage}
                          alt={sender.fullName}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ background: getAvatarGradient(sender.profileImage) }}
                        >
                          {sender.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 leading-snug">
                        <span 
                          className="font-bold text-white mr-1 hover:underline cursor-pointer"
                          onClick={() => onViewUserProfile && onViewUserProfile(sender.uid)}
                        >
                          {sender.fullName}
                        </span>
                        requested to connect with you.
                      </p>
                      <p className="text-[10px] text-[#8E8E93]">@{sender.username}</p>
                    </div>

                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => onAcceptRequest && onAcceptRequest(req.requestId)}
                        className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white text-[10.5px] font-bold rounded-lg cursor-pointer transition-all shadow-sm"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => onDeclineRequest && onDeclineRequest(req.requestId)}
                        className="px-3 py-1.5 bg-[#2C2C2E] hover:bg-red-500 hover:text-white text-zinc-300 text-[10.5px] font-bold rounded-lg cursor-pointer transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {notifications.length === 0 && incomingRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-4 border border-[#262626] bg-[#0A0A0A] rounded-3xl">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1E] border border-[#262626] flex items-center justify-center mb-3">
              <Bell className="w-5 h-5 text-zinc-500" />
            </div>
            <h3 className="text-sm font-semibold text-white">Your inbox is clear</h3>
            <p className="text-xs text-[#8E8E93] max-w-[220px] mt-1 leading-relaxed">
              When you send requests, get matches, or receive group invites, you'll see live alerts here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const isCustomImg = notif.senderImage.startsWith('data:');
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => {
                    if (notif.chatId && onSelectChat) {
                      onSelectChat(notif.chatId);
                    }
                  }}
                  className={`p-3.5 bg-[#1C1C1E] border border-[#262626] rounded-2xl flex items-start gap-3.5 relative group transition-colors ${
                    notif.chatId ? 'cursor-pointer hover:bg-[#252528] hover:border-zinc-700' : ''
                  }`}
                >
                  {/* Left avatar block */}
                  <div className="relative flex-shrink-0">
                    {isCustomImg ? (
                      <img 
                        src={notif.senderImage} 
                        alt={notif.senderName} 
                        className="w-10 h-10 rounded-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: getAvatarGradient(notif.senderImage) }}
                      >
                        {notif.senderName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Miniature overlay icon status */}
                    <span className="absolute -bottom-1 -right-1 w-5.5 h-5.5 rounded-full bg-black flex items-center justify-center border border-[#262626]">
                      {getNotifIcon(notif.type)}
                    </span>
                  </div>

                  {/* Text descriptions */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-white truncate">{notif.senderName}</h4>
                        {notif.type === 'mention' && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Mention
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-[#8E8E93]">{formatTime(notif.createdAt)}</span>
                    </div>
                    <p className="text-xs text-[#8E8E93] mt-1 font-medium leading-relaxed">
                      {notif.messageText}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}