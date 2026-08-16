import React from 'react';
import { motion } from 'motion/react';
import { Users, Lock, ShieldCheck, ArrowRight, LogIn, UserPlus, Share2, Sparkles, MessageCircle } from 'lucide-react';
import { Chat, User } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface GroupPreviewScreenProps {
  group: Chat;
  users: User[];
  currentUser: User | null;
  onJoinGroup: (groupId: string) => void;
  onOpenAuth: () => void;
  onClose: () => void;
}

export default function GroupPreviewScreen({
  group,
  users,
  currentUser,
  onJoinGroup,
  onOpenAuth,
  onClose
}: GroupPreviewScreenProps) {
  const memberList = (group.members || [])
    .map(uid => users.find(u => u.uid === uid))
    .filter(Boolean) as User[];

  const memberCount = group.members?.length || 0;
  const isAlreadyMember = currentUser ? group.members?.includes(currentUser.uid) : false;

  const handleShare = () => {
    const inviteUrl = `${window.location.origin}/group/${group.chatId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl);
    }
    if (navigator.share) {
      navigator.share({
        title: `Join ${group.name || 'Group'} on Txtorspace`,
        text: `Join the "${group.name || 'Group'}" conversation with ${memberCount} members on Txtorspace!`,
        url: inviteUrl
      }).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-fade-in">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        className="w-full max-w-md bg-[#121214] border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col"
      >
        {/* Glow ambient background effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-44 bg-[#1DB954]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top bar */}
        <div className="p-4 px-6 flex items-center justify-between border-b border-zinc-800/60 z-10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1DB954] animate-pulse" />
            <span className="text-xs font-black tracking-wider uppercase text-zinc-300">Group Invite Link</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Group Hero Info */}
        <div className="p-6 text-center flex flex-col items-center z-10">
          <div className="relative mb-4">
            {group.image ? (
              <img
                src={group.image}
                alt={group.name}
                className="w-24 h-24 rounded-3xl object-cover border-2 border-zinc-700 shadow-2xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-24 h-24 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-2xl border-2 border-zinc-700"
                style={{ background: getAvatarGradient(group.chatId || 'group_default') }}
              >
                {(group.name || 'Group').charAt(0).toUpperCase()}
              </div>
            )}

            <span className="absolute -bottom-2 -right-2 p-1.5 rounded-xl bg-[#1DB954] text-black shadow-lg border border-black">
              <Users className="w-4 h-4" />
            </span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight">
            {group.name || 'Group Chat'}
          </h2>

          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#1DB954]/10 text-[#1DB954] border border-[#1DB954]/20">
              <Users className="w-3.5 h-3.5" />
              <span>{memberCount} {memberCount === 1 ? 'member' : 'members'} joined</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Link</span>
            </span>
          </div>

          {/* Member Previews */}
          {memberList.length > 0 && (
            <div className="mt-5 w-full bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-3.5 text-left">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>Joined Members Preview</span>
                <span className="text-zinc-500 font-medium">({memberList.length} listed)</span>
              </div>
              
              <div className="flex items-center gap-1.5 flex-wrap">
                {memberList.slice(0, 6).map((m) => (
                  <div
                    key={m.uid}
                    className="flex items-center gap-1.5 bg-black/50 border border-zinc-800 rounded-full py-1 px-2 pr-2.5"
                    title={`@${m.username}`}
                  >
                    {m.profileImage?.startsWith('data:') ? (
                      <img src={m.profileImage} alt={m.fullName} className="w-4.5 h-4.5 rounded-full object-cover" />
                    ) : (
                      <div
                        className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ background: getAvatarGradient(m.profileImage) }}
                      >
                        {m.fullName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs font-semibold text-zinc-300 max-w-[90px] truncate">{m.fullName}</span>
                  </div>
                ))}
                {memberCount > 6 && (
                  <span className="text-xs text-zinc-500 font-semibold px-2">
                    +{memberCount - 6} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Guest restriction Notice */}
          {!currentUser ? (
            <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-left flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
                You are previewing this group as a guest. To view live messages, send replies, or join discussions, please log in or create an account.
              </p>
            </div>
          ) : (
            <div className="mt-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-left flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-200/90 leading-relaxed font-medium">
                Signed in as <strong className="text-white">{currentUser.fullName}</strong> (@{currentUser.username}). Tap below to enter and start chatting.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 pt-2 pb-6 border-t border-zinc-800/60 flex flex-col gap-2.5 z-10 bg-[#121214]">
          {currentUser ? (
            <button
              onClick={() => onJoinGroup(group.chatId)}
              className="w-full py-3.5 px-4 bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] text-black font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#1DB954]/20 transition-all"
            >
              <MessageCircle className="w-4.5 h-4.5" />
              <span>{isAlreadyMember ? 'Open Group Conversation' : 'Join Group & Start Chatting'}</span>
            </button>
          ) : (
            <>
              <button
                onClick={onOpenAuth}
                className="w-full py-3.5 px-4 bg-[#1DB954] hover:bg-[#1ed760] active:scale-[0.98] text-black font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#1DB954]/20 transition-all"
              >
                <LogIn className="w-4.5 h-4.5" />
                <span>Sign In or Sign Up to Join Group</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={handleShare}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-zinc-800 transition-all"
              >
                <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                <span>Share Group Link</span>
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
