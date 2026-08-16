import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, UserPlus, CheckCircle, Group } from 'lucide-react';
import { NotificationItem } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface NotificationBannerProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
  onSelectChat: (chatId: string) => void;
}

function NotificationBannerItem({
  notif,
  onDismiss,
  onSelectChat
}: {
  key?: string;
  notif: NotificationItem;
  onDismiss: (id: string) => void;
  onSelectChat: (chatId: string) => void;
}) {
  const isGradient = notif.senderImage && !notif.senderImage.startsWith('data:') && !notif.senderImage.startsWith('http');

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notif.id);
    }, 5500); // Auto-dismiss after 5.5 seconds
    return () => clearTimeout(timer);
  }, [notif.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -80, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      onClick={() => {
        if (notif.chatId) {
          onSelectChat(notif.chatId);
        }
        onDismiss(notif.id);
      }}
      className="pointer-events-auto w-full glass-panel shadow-xl rounded-2xl p-3.5 flex items-start gap-3 cursor-pointer border border-black/[0.05] dark:border-white/[0.08]"
      style={{
        boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      {/* Notification Type Icon Badge */}
      <div className="relative flex-shrink-0">
        {isGradient ? (
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-inner"
            style={{ background: getAvatarGradient(notif.senderImage) }}
          >
            {notif.senderName.charAt(0).toUpperCase()}
          </div>
        ) : (
          <img
            src={notif.senderImage || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&fit=crop&q=80'}
            alt={notif.senderName}
            className="w-10 h-10 rounded-full object-cover shadow-inner"
            referrerPolicy="no-referrer"
          />
        )}
        
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center border-2 border-white dark:border-zinc-900">
          {notif.type === 'request_received' && <UserPlus className="w-3 h-3" />}
          {(notif.type === 'request_accepted' || notif.type === 'request_sent') && <CheckCircle className="w-3 h-3 text-emerald-300" />}
          {notif.type === 'new_message' && <MessageSquare className="w-2.5 h-2.5" />}
          {(notif.type === 'added_to_group' || notif.type === 'removed_from_group') && <Group className="w-3 h-3" />}
        </div>
      </div>

      {/* Notification text details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            {notif.type === 'request_received' && 'Contact Request'}
            {notif.type === 'request_accepted' && 'Request Accepted'}
            {notif.type === 'request_sent' && 'Request Sent Successfully'}
            {notif.type === 'new_message' && 'New Message'}
            {notif.type === 'added_to_group' && 'Group Update'}
            {notif.type === 'removed_from_group' && 'Group Update'}
          </span>
          <span className="text-[10px] text-zinc-400">Just now</span>
        </div>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white mt-0.5">
          {notif.senderName}
        </h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate mt-0.5">
          {notif.messageText}
        </p>
      </div>
    </motion.div>
  );
}

export default function NotificationBanner({
  notifications,
  onDismiss,
  onSelectChat
}: NotificationBannerProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 pointer-events-none flex flex-col gap-2">
      <AnimatePresence>
        {notifications.map((notif) => (
          <NotificationBannerItem
            key={notif.id}
            notif={notif}
            onDismiss={onDismiss}
            onSelectChat={onSelectChat}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
