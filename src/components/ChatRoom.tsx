import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Shield, CornerDownRight, Check, Trash2, Edit2, Copy, Reply, X, 
  Users, UserPlus, LogOut, Info, ArrowLeft, Smile, Phone, Video, Forward, Lock,
  User as UserIcon, Bell, BellOff, ExternalLink, Share2, AlertTriangle, UserX, UserMinus,
  ChevronRight, Volume2, Clock, Calendar, UserCheck, Image, Camera, Download,
  MessageSquare, AtSign, ZoomIn, ZoomOut, CheckCircle2
} from 'lucide-react';
import { Chat, User, Message, Story, ChatRequest } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface ChatRoomProps {
  chat: Chat;
  messages: Message[];
  users: User[];
  chats: Chat[];
  currentUser: User;
  stories?: Story[];
  chatRequests?: ChatRequest[];
  onOpenStory?: (storyId: string) => void;
  onSendMessage: (text: string, replyToId?: string, image?: string) => void;
  onEditMessage: (messageId: string, newText: string) => void;
  onDeleteMessage: (messageId: string, forEveryone: boolean) => void;
  onLeaveGroup: (groupId: string) => void;
  onAddGroupMember: (groupId: string, memberId: string) => void;
  onRemoveGroupMember: (groupId: string, memberId: string) => void;
  onPromoteAdmin: (groupId: string, memberId: string) => void;
  onCloseChat: () => void;
  typingUsers: { [uid: string]: boolean };
  onForwardMessage: (targetChatId: string, text: string) => void;
  onUpdateGroupPermissions: (chatId: string, permissions: { allowAddMembers: boolean; allowInviteLink: boolean; allowEditSettings: boolean; allowSendMessages: boolean }) => void;
  onUpdateGroupDetails?: (chatId: string, name: string, image?: string) => void;
  onBlockUser?: (userId: string) => void;
  onUnblockUser?: (userId: string) => void;
  onUnfriendUser?: (userId: string) => void;
  onRefriendUser?: (userId: string) => void;
  onReportUser?: (userId: string) => void;
  onViewContact?: (userId: string) => void;
  onOpenDirectChat?: (userId: string) => void;
  onMuteChat?: (chatId: string) => void;
  onTyping?: (chatId: string, isTyping: boolean) => void;
  onToggleReaction?: (chatId: string, messageId: string, emoji: string) => void;
}

interface SwipeableMessageRowProps {
  key?: React.Key;
  msg: Message;
  isOwn: boolean;
  onSwipeReply: (msg: Message) => void;
  children: React.ReactNode;
}

function SwipeableMessageRow({ msg, isOwn, onSwipeReply, children }: SwipeableMessageRowProps) {
  const [dragX, setDragX] = useState(0);
  const threshold = 45;
  const isTriggered = isOwn ? dragX < -threshold : dragX > threshold;

  return (
    <div className="relative w-full overflow-visible my-0.5">
      {/* Background Reply Trigger Indicator Badge */}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-150 z-0 flex items-center justify-center ${
          isOwn ? 'right-3' : 'left-3'
        } ${Math.abs(dragX) > 8 ? 'opacity-100' : 'opacity-0'}`}
      >
        <motion.div 
          animate={{ 
            scale: isTriggered ? 1.2 : 0.85,
            rotate: isTriggered ? (isOwn ? -15 : 15) : 0,
            backgroundColor: isTriggered ? '#0A84FF' : '#27272A'
          }}
          transition={{ type: 'spring', stiffness: 450, damping: 25 }}
          className="w-7.5 h-7.5 rounded-full flex items-center justify-center text-white shadow-lg border border-white/10"
        >
          <Reply className="w-3.5 h-3.5" />
        </motion.div>
      </div>

      {/* Draggable Message Bubble */}
      <motion.div
        drag="x"
        dragConstraints={{ left: isOwn ? -80 : 0, right: isOwn ? 0 : 80 }}
        dragElastic={0.25}
        dragSnapToOrigin
        onDrag={(_, info) => {
          setDragX(info.offset.x);
        }}
        onDragEnd={(_, info) => {
          const reached = isOwn ? info.offset.x < -threshold : info.offset.x > threshold;
          if (reached) {
            try {
              if (navigator.vibrate) navigator.vibrate(25);
            } catch {}
            onSwipeReply(msg);
          }
          setDragX(0);
        }}
        initial={{ opacity: 0, x: isOwn ? 40 : -40, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 24, 
          mass: 0.8
        }}
        className={`flex flex-col relative z-10 ${isOwn ? 'items-end' : 'items-start'}`}
      >
        {children}
      </motion.div>
    </div>
  );
}

export default function ChatRoom({
  chat,
  messages,
  users,
  chats,
  currentUser,
  stories = [],
  chatRequests = [],
  onOpenStory,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onLeaveGroup,
  onAddGroupMember,
  onRemoveGroupMember,
  onPromoteAdmin,
  onCloseChat,
  typingUsers,
  onForwardMessage,
  onUpdateGroupPermissions,
  onUpdateGroupDetails,
  onBlockUser,
  onUnblockUser,
  onUnfriendUser,
  onRefriendUser,
  onReportUser,
  onViewContact,
  onOpenDirectChat,
  onMuteChat,
  onTyping,
  onToggleReaction
}: ChatRoomProps) {
  const [inputText, setInputText] = useState('');
  const [replyMessage, setReplyMessage] = useState<Message | null>(null);
  const [selectedChatImage, setSelectedChatImage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  
  // Forward message states
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);

  // Modals & Menu State
  const [showDetails, setShowDetails] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Manual media download state (default: manual blurry download when currentUser.autoDownloadMedia is false)
  const [downloadedMedia, setDownloadedMedia] = useState<{ [msgId: string]: boolean }>({});
  const [downloadingMediaId, setDownloadingMediaId] = useState<string | null>(null);

  // Fullscreen WhatsApp Lightbox state
  const [lightboxImage, setLightboxImage] = useState<{ url: string; senderName: string; timestamp: string } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  // Group Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursorIndex, setMentionCursorIndex] = useState<number | null>(null);

  // Contact Detail Options state (select user profile in chat)
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Tick state to update last seen displays instantly in real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);
  
  // iOS/Samsung Settings States
  const [showPreviews, setShowPreviews] = useState(true);
  const [disappearingTime, setDisappearingTime] = useState<'off' | '24h' | '7d'>('off');
  const [selectedTone, setSelectedTone] = useState('Classic Aero');
  const [showTonePicker, setShowTonePicker] = useState(false);
  const [showDisappearingPicker, setShowDisappearingPicker] = useState(false);
  
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [showMemberAddModal, setShowMemberAddModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-focus input when replying
  useEffect(() => {
    if (replyMessage) {
      inputRef.current?.focus();
    }
  }, [replyMessage]);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Click outside to close message contextual menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuMessageId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Format message sending timestamp
  const getFormattedMessageTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Check 3 minute rule
  const isWithin3Minutes = (isoString: string) => {
    const sentTime = new Date(isoString).getTime();
    const now = Date.now();
    const diffMins = (now - sentTime) / (1000 * 60);
    return diffMins <= 3;
  };

  const getChatPartner = (): User | undefined => {
    const partnerId = chat.members.find(id => id !== currentUser.uid);
    return users.find(u => u.uid === partnerId);
  };

  const getUserDetails = (uid: string): User | undefined => {
    return users.find(u => u.uid === uid);
  };

  const partner = !chat.isGroup ? getChatPartner() : undefined;
  const isPartnerBlocked = partner ? (currentUser.blockedUsers || []).includes(partner.uid) : false;
  const isPartnerUnfriended = partner ? ((currentUser.unfriendedUsers || []).includes(partner.uid) || (partner.unfriendedUsers || []).includes(currentUser.uid)) : false;
  const displayedName = chat.isGroup
    ? chat.name
    : isPartnerBlocked
    ? `${partner?.fullName || 'Contact'} (Blocked)`
    : partner?.fullName;
  const isRecentlyActive = partner?.lastSeen ? (Date.now() - new Date(partner.lastSeen).getTime() < 45000) : false;
  const displayedOnline = !chat.isGroup && partner && !isPartnerBlocked ? (partner.online && isRecentlyActive) : false;

  const formatLastSeen = (isoString?: string): string => {
    const fallbackIso = isoString || partner?.createdAt;
    if (!fallbackIso) return 'last seen recently';
    const date = new Date(fallbackIso);
    if (isNaN(date.getTime())) return 'last seen recently';
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return `last seen today at ${timeStr}`;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `last seen yesterday at ${timeStr}`;
    }
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `last seen on ${dateStr} at ${timeStr}`;
  };

  // Group sorting by dates
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { [dateStr: string]: Message[] } = {};
    
    msgs.forEach(msg => {
      const dateStr = new Date(msg.createdAt).toLocaleDateString([], { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(msg);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate(messages);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTypingState, setIsTypingState] = useState(false);

  // Clear typing state on unmount or chat change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingState && onTyping) {
        onTyping(chat.chatId, false);
      }
    };
  }, [chat.chatId, isTypingState, onTyping]);

  // Handle Input text change and detect @mentions in group chats
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart || val.length;
    setInputText(val);

    // If in a group chat, detect if user is typing a mention @
    if (chat.isGroup) {
      const textBeforeCursor = val.slice(0, cursor);
      const match = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
      if (match) {
        setMentionQuery(match[1]);
        setMentionCursorIndex(match.index !== undefined ? match.index : null);
      } else {
        setMentionQuery(null);
        setMentionCursorIndex(null);
      }
    } else {
      setMentionQuery(null);
      setMentionCursorIndex(null);
    }

    if (onTyping) {
      if (!isTypingState) {
        setIsTypingState(true);
        onTyping(chat.chatId, true);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTypingState(false);
        onTyping(chat.chatId, false);
      }, 4000);
    }
  };

  // Insert selected mention into input text
  const handleSelectMention = (user: User) => {
    if (mentionCursorIndex === null) {
      setInputText(prev => `${prev}@${user.username} `);
    } else {
      const before = inputText.slice(0, mentionCursorIndex);
      const after = inputText.slice(mentionCursorIndex + (mentionQuery?.length || 0) + 1);
      setInputText(`${before}@${user.username} ${after}`);
    }
    setMentionQuery(null);
    setMentionCursorIndex(null);
    inputRef.current?.focus();
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = !!inputText.trim();
    const hasImage = !!selectedChatImage;
    if (!hasText && !hasImage) return;

    if (onTyping && isTypingState) {
      setIsTypingState(false);
      onTyping(chat.chatId, false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }

    onSendMessage(inputText.trim(), replyMessage?.messageId, selectedChatImage || undefined);
    setInputText('');
    setSelectedChatImage(null);
    setReplyMessage(null);
    setMentionQuery(null);
    setMentionCursorIndex(null);
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setActiveMenuMessageId(null);
    setToastMessage('Message copied to clipboard');
  };

  const handleStartEdit = (msg: Message) => {
    setEditingMessage(msg);
    setEditText(msg.text);
    setActiveMenuMessageId(null);
  };

  const handleSaveEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage || !editText.trim()) return;

    onEditMessage(editingMessage.messageId, editText.trim());
    setEditingMessage(null);
    setEditText('');
  };

  // Group admin promotions/demotions and membership permissions
  const groupMembers = users.filter(u => chat.members.includes(u.uid));
  const isGroupAdmin = chat.isGroup && (chat.admins?.includes(currentUser.uid) || chat.ownerId === currentUser.uid);
  
  // Users have Share Group Link and Add Members option UNLESS admin disabled it in permissions
  const canAddMembers = chat.isGroup && (isGroupAdmin || chat.permissions?.allowAddMembers !== false);
  const canShareInviteLink = chat.isGroup && (isGroupAdmin || chat.permissions?.allowInviteLink !== false);
  
  // Find members that are not yet in this group
  const getAddableMembers = () => {
    return users.filter(u => u.uid !== currentUser.uid && !chat.members.includes(u.uid));
  };

  const addableMembers = getAddableMembers();

  // Filter members matching mention query
  const mentionMatchingMembers = chat.isGroup && mentionQuery !== null
    ? groupMembers.filter(m => 
        m.uid !== currentUser.uid && 
        (m.username.toLowerCase().includes(mentionQuery.toLowerCase()) || 
         m.fullName.toLowerCase().includes(mentionQuery.toLowerCase()))
      )
    : [];

  // Real-time typing indicators for other users in this chat
  const activeTypingUids = Object.keys(typingUsers || {}).filter(uid => uid !== currentUser.uid && typingUsers[uid]);
  const typingText = activeTypingUids.length === 1 
    ? `${users.find(u => u.uid === activeTypingUids[0])?.fullName || 'Someone'} is typing...`
    : activeTypingUids.length > 1 
    ? 'Several people are typing...'
    : null;

  // Shared media list in this conversation
  const sharedMediaMessages = messages.filter(m => !!m.image && !m.deleted);

  // Helper to render message text with interactive @mentions
  const renderMessageContent = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        const uname = part.slice(1);
        const mentioned = users.find(u => u.username.toLowerCase() === uname.toLowerCase());
        return (
          <span
            key={idx}
            onClick={(e) => {
              e.stopPropagation();
              if (mentioned) {
                setSelectedUser(mentioned);
              }
            }}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-[#1DB954]/25 text-[#1DB954] hover:bg-[#1DB954]/40 font-bold cursor-pointer transition-colors"
            title={mentioned ? `View @${uname}'s profile` : `@${uname}`}
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#111111] transition-colors duration-300 relative">
      
      {/* ================= GREEN CORRECT LOGO ALERT ================= */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -25, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-2.5 px-4 py-2.5 bg-[#1C1C1E] border border-emerald-500/50 rounded-full shadow-2xl backdrop-blur-md"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black shrink-0 shadow-sm">
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
            <span className="text-xs font-bold text-white tracking-wide">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= CHAT HEADER BAR ================= */}
      <div className="sticky top-0 p-4 bg-[#0A0A0A] flex items-center justify-between border-b border-[#262626] z-[40] shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          
          {/* Back button for mobile responsiveness */}
          <button 
            onClick={onCloseChat}
            className="md:hidden p-1.5 hover:bg-[#1C1C1E] rounded-full cursor-pointer text-[#3B82F6]"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {/* Chat Avatar with Story Status Ring */}
          {(() => {
            const partnerStories = !chat.isGroup && partner ? stories.filter(s => s.creatorId === partner.uid) : [];
            // Only consider active stories (within 24 hours)
            const activePartnerStories = partnerStories.filter(s => {
              const createdTime = new Date(s.createdAt).getTime();
              return (Date.now() - createdTime) < 24 * 60 * 60 * 1000;
            });
            const hasStory = activePartnerStories.length > 0;
            const hasSeenStory = hasStory && activePartnerStories.every(s => s.views && s.views.includes(currentUser.uid));
            const showRing = hasStory && !hasSeenStory;

            return (
              <div 
                onClick={(e) => {
                  if (chat.isGroup) {
                    setShowDetails(!showDetails);
                  } else if (showRing && onOpenStory) {
                    e.stopPropagation();
                    onOpenStory(activePartnerStories[0].storyId);
                  } else if (partner) {
                    setSelectedUser(partner);
                  }
                }}
                className={`relative flex-shrink-0 cursor-pointer hover:opacity-90 active:scale-95 transition-all ${
                  showRing 
                    ? 'p-[2.5px] rounded-full bg-gradient-to-tr from-[#0A84FF] via-rose-500 to-amber-400 shadow-md ring-1 ring-white/10'
                    : ''
                }`}
                title={showRing ? `View ${displayedName}'s New Story` : undefined}
              >
                {chat.isGroup ? (
                  chat.image?.startsWith('data:') ? (
                    <img src={chat.image} alt={chat.name} className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-[#1C1C1E] flex items-center justify-center text-[#8E8E93] border border-[#262626]">
                      <Users className="w-5 h-5 text-[#1DB954]" />
                    </div>
                  )
                ) : (
                  partner?.profileImage.startsWith('data:') && !isPartnerBlocked ? (
                    <img 
                      src={partner.profileImage} 
                      alt={displayedName} 
                      className={`w-10 h-10 rounded-full object-cover shadow-sm ${showRing ? 'border border-black' : ''}`} 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-inner ${showRing ? 'border border-black' : ''}`}
                      style={{ background: isPartnerBlocked ? '#4A4A4A' : getAvatarGradient(partner?.profileImage || 'user_default') }}
                    >
                      {(displayedName || 'U').charAt(0).toUpperCase()}
                    </div>
                  )
                )}

                {displayedOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0A0A0A]" />
                )}
              </div>
            );
          })()}

          {/* User Status / Group Members count text details */}
          <div 
            className="min-w-0 cursor-pointer" 
            onClick={() => {
              if (chat.isGroup) {
                setShowDetails(!showDetails);
              } else if (partner) {
                setSelectedUser(partner);
              }
            }}
          >
            <h3 className="text-sm font-bold text-white truncate flex items-center gap-1.5">
              <span>{displayedName}</span>
              {isPartnerBlocked && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/20 text-red-400 font-bold">
                  Blocked
                </span>
              )}
            </h3>
            <p className="text-[10px] text-[#8E8E93] font-medium truncate">
              {typingText ? (
                <span className="text-[#1DB954] font-semibold flex items-center gap-1.5">
                  <span className="flex items-center gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-[#1DB954] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[#1DB954] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[#1DB954] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span>{typingText}</span>
                </span>
              ) : chat.isGroup ? (
                `${chat.members.length} members • Tap for group info & media`
              ) : isPartnerBlocked ? (
                <span className="text-red-400">Blocked contact • Tap for profile</span>
              ) : displayedOnline ? (
                <span className="text-emerald-500 font-semibold">Online</span>
              ) : (
                formatLastSeen(partner?.lastSeen)
              )}
            </p>
          </div>
        </div>

        {/* Custom audio Web Data Call & details info icons */}
        <div className="flex items-center gap-1.5 text-[#3B82F6]">
          {!isPartnerBlocked && (
            <button 
              onClick={() => alert(`Initiating secure Web Data Call with ${displayedName}...\nConnecting over Peer-to-Peer WebRTC.`)}
              className="p-2 hover:bg-[#1C1C1E] rounded-full cursor-pointer flex items-center gap-1.5 text-xs font-semibold bg-[#1C1C1E] px-3.5 py-1.5 rounded-full"
              title="Secure Web Data Call"
            >
              <Phone className="w-4 h-4" />
              <span className="hidden sm:inline">Web Data Call</span>
            </button>
          )}
          <button 
            onClick={() => setShowDetails(!showDetails)}
            className={`p-2 rounded-full cursor-pointer ${showDetails ? 'bg-[#1C1C1E] text-[#3B82F6]' : 'hover:bg-[#1C1C1E]'}`}
            title="Chat info & settings"
          >
            <Info className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* ================= CHAT HISTORY WORKSPACE ================= */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        
        {/* WhatsApp-style lock notice */}
        <div className="flex justify-center my-2">
          <div className="max-w-[85%] bg-[#121212] rounded-2xl p-3.5 border border-[#262626] text-center flex items-start gap-2.5 text-[11px] text-amber-200/80 leading-relaxed shadow-sm">
            <Lock className="w-3.5 h-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
            <span className="text-left">
              Messages and calls are end-to-end encrypted. No one outside of this chat, not even Txtorspace, can read or listen to them.
            </span>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-4/5 text-center p-6">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1E] text-[#3B82F6] flex items-center justify-center mb-3 border border-[#262626]">
              <Smile className="w-6 h-6 animate-pulse" />
            </div>
            <h4 className="text-sm font-bold text-[#F2F2F7]">
              This is the beginning of your chat history.
            </h4>
            <p className="text-xs text-[#8E8E93] max-w-[240px] mt-1 leading-relaxed">
              Messages are secured and private. Say hello to get the conversation started!
            </p>
          </div>
        ) : (
          Object.keys(messageGroups).map((dateGroupStr) => (
            <div key={dateGroupStr} className="space-y-3">
              
              {/* Date Separation Divider bubble */}
              <div className="flex justify-center my-3">
                <span className="px-3 py-1 rounded-full bg-[#1C1C1E] text-[10px] font-semibold text-[#8E8E93] tracking-wide uppercase shadow-sm border border-[#262626]">
                  {dateGroupStr}
                </span>
              </div>

              {messageGroups[dateGroupStr].map((msg) => {
                const isOwn = msg.senderId === currentUser.uid;
                const sender = getUserDetails(msg.senderId);
                const isDeleted = msg.deleted;
                const showTicks = isOwn;

                // Handle System Message Badges (e.g. User added User)
                if (msg.isSystem || msg.text?.includes('added') || msg.text?.includes('removed') || msg.text?.includes('left the group') || msg.text?.includes('created the group')) {
                  return (
                    <div key={msg.messageId} className="flex justify-center my-2 select-none">
                      <span className="px-3.5 py-1 rounded-full bg-[#1C1C1E] text-[11px] font-semibold text-zinc-300 tracking-wide border border-[#262626] shadow-sm flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#1DB954]" />
                        <span>{msg.text}</span>
                      </span>
                    </div>
                  );
                }

                // Is contextual menu open for this message?
                const isMenuOpen = activeMenuMessageId === msg.messageId;

                return (
                  <SwipeableMessageRow
                    key={msg.messageId}
                    msg={msg}
                    isOwn={isOwn}
                    onSwipeReply={(targetMsg) => {
                      setReplyMessage(targetMsg);
                      inputRef.current?.focus();
                    }}
                  >
                    <div 
                      className={`flex flex-col relative group/bubble ${isOwn ? 'items-end' : 'items-start'} w-full`}
                    >
                      <div className="flex items-end gap-2 max-w-[85%] relative">
                      
                      {/* In Group Chat: Show member Avatar on the left for incoming messages (WhatsApp style) */}
                      {chat.isGroup && !isOwn && sender && (
                        <div
                          onClick={() => setSelectedUser(sender)}
                          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-sm mb-1"
                          style={{ background: getAvatarGradient(sender.profileImage || 'user_default') }}
                          title={`View @${sender.username}'s profile & chat`}
                        >
                          {sender.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Left edge reply indicator overlay if own */}
                      {isOwn && (
                        <div className="opacity-0 group-hover/bubble:opacity-100 flex items-center gap-1 absolute left-[-32px] top-1/2 -translate-y-1/2 transition-opacity">
                          <button
                            onClick={() => setReplyMessage(msg)}
                            className="p-1 hover:text-blue-500 text-zinc-400 bg-white dark:bg-zinc-900 border border-black/5 rounded shadow-sm cursor-pointer"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Bubble block */}
                      <div
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setActiveMenuMessageId(msg.messageId);
                        }}
                        onTouchStart={() => {
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = setTimeout(() => {
                            setActiveMenuMessageId(msg.messageId);
                          }, 450);
                        }}
                        onTouchEnd={() => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                        }}
                        onMouseDown={() => {
                          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = setTimeout(() => {
                            setActiveMenuMessageId(msg.messageId);
                          }, 450);
                        }}
                        onMouseUp={() => {
                          if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                        }}
                        onClick={() => setActiveMenuMessageId(isMenuOpen ? null : msg.messageId)}
                        className={`rounded-2xl p-3 shadow-lg backdrop-blur-md border cursor-pointer select-none transition-all relative overflow-hidden ${
                          isOwn 
                            ? 'bg-[#1DB954]/20 border-[#1DB954]/30 text-white rounded-tr-sm' 
                            : 'bg-zinc-900/60 border-zinc-800 text-zinc-100 rounded-tl-sm'
                        }`}
                      >
                        {/* Display Sender Name & Username inside bubble for group chat (WhatsApp style) */}
                        {chat.isGroup && !isOwn && sender && (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedUser(sender);
                            }}
                            className="flex items-center gap-1.5 mb-1 cursor-pointer hover:opacity-80 transition-opacity"
                            title="Tap to view member details & 1-on-1 chat"
                          >
                            <span className="text-[11px] font-bold text-[#1DB954]">
                              {sender.fullName}
                            </span>
                            <span className="text-[9px] text-zinc-400 font-medium">
                              @{sender.username}
                            </span>
                          </div>
                        )}

                        {/* If replying to another message inside bubble */}
                        {msg.replyTo && (
                          <div className={`p-2 rounded-lg mb-1.5 text-xs flex items-center gap-1 border-l-2 ${
                            isOwn 
                              ? 'bg-[#1DB954]/30 text-zinc-200 border-[#1DB954]' 
                              : 'bg-zinc-800 text-zinc-400 border-zinc-600'
                          }`}>
                            <CornerDownRight className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="truncate">
                              {messages.find(m => m.messageId === msg.replyTo)?.text || 'Original message'}
                            </span>
                          </div>
                        )}

                        {/* Display message image with WhatsApp Blurry effect when auto-download is off + Tap for Full-screen */}
                        {msg.image && !isDeleted && (
                          (() => {
                            const isDownloaded = isOwn || currentUser.autoDownloadMedia !== false || !!downloadedMedia[msg.messageId];
                            
                            return isDownloaded ? (
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLightboxImage({
                                    url: msg.image!,
                                    senderName: isOwn ? 'You' : (sender?.fullName || 'Contact'),
                                    timestamp: getFormattedMessageTime(msg.createdAt)
                                  });
                                }}
                                className="mb-2 max-w-sm rounded-xl overflow-hidden border border-[#262626] bg-[#141414] group/img relative cursor-pointer"
                                title="Tap to view full screen"
                              >
                                <img 
                                  src={msg.image} 
                                  alt="Chat attachment" 
                                  className="max-h-64 w-full object-cover rounded-xl hover:scale-102 transition-transform duration-200" 
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                  <span className="p-2 rounded-full bg-black/70 text-white backdrop-blur-sm shadow-md">
                                    <ZoomIn className="w-4 h-4" />
                                  </span>
                                </div>
                              </div>
                            ) : (
                              /* WhatsApp Blurry Preview with Centered Download Circle */
                              <div 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDownloadingMediaId(msg.messageId);
                                  setTimeout(() => {
                                    setDownloadedMedia(prev => ({ ...prev, [msg.messageId]: true }));
                                    setDownloadingMediaId(null);
                                  }, 450);
                                }}
                                className="mb-2 max-w-sm rounded-xl overflow-hidden border border-[#262626] bg-[#141414] relative cursor-pointer group/blur"
                                title="Tap to download media"
                              >
                                {/* Blurry background thumbnail like WhatsApp */}
                                <div className="relative max-h-56 w-full overflow-hidden">
                                  <img 
                                    src={msg.image} 
                                    alt="Blur preview" 
                                    className="w-full h-48 object-cover filter blur-lg brightness-50 scale-110" 
                                    referrerPolicy="no-referrer"
                                  />
                                </div>

                                {/* WhatsApp-style centered circular download button & size chip */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 backdrop-blur-xs">
                                  <div className="w-12 h-12 rounded-full bg-[#1DB954] hover:bg-[#1ed760] active:scale-95 text-black flex items-center justify-center shadow-2xl transition-all border-2 border-white/20">
                                    {downloadingMediaId === msg.messageId ? (
                                      <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Download className="w-5 h-5 stroke-[2.5]" />
                                    )}
                                  </div>
                                  <span className="px-2.5 py-0.5 rounded-full bg-black/80 text-[10px] font-bold text-white tracking-wide border border-white/10 shadow">
                                    {downloadingMediaId === msg.messageId ? 'Downloading...' : '320 KB • Tap to Download'}
                                  </span>
                                </div>
                              </div>
                            );
                          })()
                        )}

                        {/* Text or deleted placeholder with interactive mentions */}
                        {isDeleted ? (
                          <span className="text-xs italic text-zinc-400 dark:text-zinc-500">
                            This message was deleted
                          </span>
                        ) : (
                          msg.text ? (
                            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                              {renderMessageContent(msg.text)}
                            </p>
                          ) : null
                        )}

                        {/* Timestamp & edited markings */}
                        <div className={`flex items-center justify-end gap-1.5 text-[9px] mt-1.5 leading-none select-none ${
                          isOwn ? 'text-zinc-300' : 'text-zinc-400'
                        }`}>
                          {msg.edited && !isDeleted && <span>edited • </span>}
                          <span>{getFormattedMessageTime(msg.createdAt)}</span>
                          
                          {/* Seen / Delivered Custom Circular verified receipt markers */}
                          {showTicks && !isDeleted && (
                            (() => {
                              let isSeen = false;
                              if (!chat.isGroup) {
                                isSeen = !!(msg.readBy && msg.readBy.some(uid => uid !== msg.senderId));
                              } else {
                                const otherMembers = chat.members.filter(m => m !== currentUser.uid);
                                isSeen = otherMembers.length > 0 && otherMembers.every(m => msg.readBy && msg.readBy.includes(m));
                              }

                              return isSeen ? (
                                <div className="w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center text-[#111111] scale-90 shadow-sm" title={chat.isGroup ? "Seen by all members" : "Seen"}>
                                  <Check className="w-2.5 h-2.5 stroke-[4px]" />
                                </div>
                              ) : (
                                <div className="w-3.5 h-3.5 rounded-full border border-zinc-400 flex items-center justify-center scale-90" title="Delivered" />
                              );
                            })()
                          )}
                        </div>
                      </div>

                      {/* Right edge reply indicator overlay if incoming */}
                      {!isOwn && (
                        <div className="opacity-0 group-hover/bubble:opacity-100 flex items-center gap-1 absolute right-[-32px] top-1/2 -translate-y-1/2 transition-opacity">
                          <button
                            onClick={() => setReplyMessage(msg)}
                            className="p-1 hover:text-blue-500 text-zinc-400 bg-white dark:bg-zinc-900 border border-black/5 rounded shadow-sm cursor-pointer"
                            title="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Message Reactions Badges */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && !isDeleted && (
                        <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          {Object.entries(msg.reactions).map(([emoji, uids]) => {
                            if (!uids || uids.length === 0) return null;
                            const hasReacted = uids.includes(currentUser.uid);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleReaction?.(chat.chatId, msg.messageId, emoji);
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                                  hasReacted
                                    ? 'bg-[#1DB954]/20 border-[#1DB954] text-emerald-400 shadow-sm'
                                    : 'bg-[#1C1C1E] border-[#262626] text-zinc-300 hover:border-zinc-500'
                                }`}
                                title={hasReacted ? 'You reacted. Tap to remove.' : 'Tap to react'}
                              >
                                <span>{emoji}</span>
                                <span className="text-[10px] font-bold">{uids.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                    </div>

                    {/* Context Modal Overlay menu for a selected message */}
                    <AnimatePresence>
                      {isMenuOpen && !isDeleted && (
                        <motion.div
                          ref={menuRef}
                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={`absolute z-20 bg-[#1C1C1E] border border-[#262626] shadow-xl rounded-xl p-2 flex flex-col gap-1.5 w-52 mt-1 ${
                            isOwn ? 'right-0' : 'left-0'
                          }`}
                        >
                          {/* Quick Emoji Reaction Bar */}
                          <div className="flex items-center justify-between p-1 bg-[#2C2C2E]/60 rounded-lg border border-[#3A3A3C]">
                            {['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏'].map((emoji) => {
                              const uids = msg.reactions?.[emoji] || [];
                              const hasReacted = uids.includes(currentUser.uid);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => {
                                    onToggleReaction?.(chat.chatId, msg.messageId, emoji);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className={`p-1 text-sm rounded-md transition-all cursor-pointer ${
                                    hasReacted ? 'bg-[#1DB954]/30 border border-[#1DB954] scale-110' : 'hover:bg-zinc-700 hover:scale-110'
                                  }`}
                                  title={`React with ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </div>
                          <button
                            onClick={() => handleCopyText(msg.text)}
                            className="px-3 py-1.5 hover:bg-[#2C2C2E] text-zinc-200 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Copy Message</span>
                          </button>
                          
                          <button
                            onClick={() => {
                              setReplyMessage(msg);
                              setActiveMenuMessageId(null);
                            }}
                            className="px-3 py-1.5 hover:bg-[#2C2C2E] text-zinc-200 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                          >
                            <Reply className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Reply Message</span>
                          </button>

                          <button
                            onClick={() => {
                              setForwardingMessage(msg);
                              setActiveMenuMessageId(null);
                            }}
                            className="px-3 py-1.5 hover:bg-[#2C2C2E] text-zinc-200 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                          >
                            <Forward className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Forward Message</span>
                          </button>

                          {/* Edit: Only if own message AND within 3 mins */}
                          {isOwn && isWithin3Minutes(msg.createdAt) && (
                            <button
                              onClick={() => handleStartEdit(msg)}
                              className="px-3 py-1.5 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Edit Message</span>
                            </button>
                          )}

                          {/* Delete: Only if own message and within 3 mins allows 'Delete for everyone' */}
                          {isOwn ? (
                            isWithin3Minutes(msg.createdAt) ? (
                              <>
                                <button
                                  onClick={() => {
                                    onDeleteMessage(msg.messageId, true);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className="px-3 py-1.5 hover:bg-red-950/20 text-red-600 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                  <span>Delete for everyone</span>
                                </button>
                                <button
                                  onClick={() => {
                                    onDeleteMessage(msg.messageId, false);
                                    setActiveMenuMessageId(null);
                                  }}
                                  className="px-3 py-1.5 hover:bg-red-950/20 text-red-500 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                  <span>Delete for me</span>
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => {
                                  onDeleteMessage(msg.messageId, false);
                                  setActiveMenuMessageId(null);
                                }}
                                className="px-3 py-1.5 hover:bg-red-950/20 text-red-500 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span>Delete for me</span>
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => {
                                onDeleteMessage(msg.messageId, false);
                                setActiveMenuMessageId(null);
                              }}
                              className="px-3 py-1.5 hover:bg-red-950/20 text-red-500 text-xs font-semibold flex items-center gap-2 rounded-lg text-left cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              <span>Delete for me</span>
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </SwipeableMessageRow>
              );
            })}
            </div>
          ))
        )}

        {/* Real-time typing indicators with clean CSS bubble animation */}
        {activeTypingUids.length > 0 && (
          <div className="flex flex-col items-start space-y-1 my-1">
            <div className="bg-[#1C1C1E] rounded-2xl rounded-tl-sm py-3 px-4 shadow-sm flex items-center justify-center gap-1 border border-[#262626]">
              <div className="flex gap-1 items-center h-3 px-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#1DB954] animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ================= REPLY ATTACHMENT BOX ================= */}
      {replyMessage && (
        <div className="mx-4 mb-2 p-2 px-3 rounded-xl bg-[#1C1C1E] flex items-center justify-between gap-2 border-l-4 border-[#3B82F6]">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#3B82F6]">Replying to message</p>
            <p className="text-xs text-[#F2F2F7] truncate font-medium">"{replyMessage.text}"</p>
          </div>
          <button 
            onClick={() => setReplyMessage(null)}
            className="p-1 rounded-full bg-[#2C2C2E] hover:opacity-80 text-[#8E8E93] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================= MENTION AUTOCOMPLETE FLOATING DROPDOWN ================= */}
      <AnimatePresence>
        {chat.isGroup && mentionMatchingMembers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mx-4 mb-2 p-1.5 bg-[#1C1C1E] border border-[#262626] rounded-2xl shadow-2xl max-h-48 overflow-y-auto z-20"
          >
            <div className="px-2 py-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              <AtSign className="w-3 h-3 text-[#1DB954]" />
              <span>Mention Member</span>
            </div>
            <div className="space-y-0.5">
              {mentionMatchingMembers.map((member) => (
                <button
                  key={member.uid}
                  type="button"
                  onClick={() => handleSelectMention(member)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-[#2C2C2E] text-left transition-colors cursor-pointer"
                >
                  <div 
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{ background: getAvatarGradient(member.profileImage || 'user_default') }}
                  >
                    {member.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{member.fullName}</p>
                    <p className="text-[10px] text-zinc-400 truncate">@{member.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= BOTTOM MESSAGE INPUT FIELD OR BLOCKED NOTICE ================= */}
      <div className="p-4 bg-[#0A0A0A] border-t border-[#262626] z-10">
        
        {/* WhatsApp-Style Blocked Notice: User remains in chat page and can unblock directly */}
        {isPartnerBlocked ? (
          <div className="p-3 bg-[#1C1C1E] border border-red-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-lg animate-fade-in">
            <div className="flex items-center gap-2.5 text-zinc-300 min-w-0">
              <div className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                <UserX className="w-4 h-4" />
              </div>
              <p className="truncate">
                You blocked this contact. Tap <span className="font-semibold text-white">Unblock</span> to send messages.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (partner) {
                  onUnblockUser?.(partner.uid);
                  setToastMessage('Contact unblocked');
                }
              }}
              className="px-4 py-2 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold rounded-xl text-xs transition-all active:scale-95 cursor-pointer shrink-0 shadow-md"
            >
              Unblock
            </button>
          </div>
        ) : (
          <>
            {uploadProgress !== null && (
              <div className="mb-3 relative inline-block">
                <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-[#1C1C1E] px-4 py-2 flex items-center gap-2 shadow-lg">
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-[#1DB954] border-t-transparent" />
                  <span className="text-xs font-bold text-zinc-300">Decoding Image... {uploadProgress}%</span>
                  <div className="absolute bottom-0 left-0 h-0.5 bg-[#1DB954] transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {selectedChatImage && (
              <div className="mb-3 relative inline-block">
                <div className="relative rounded-xl overflow-hidden border border-[#262626] bg-[#1C1C1E]">
                  <img 
                    src={selectedChatImage} 
                    alt="Selected preview" 
                    className="max-h-24 w-auto object-cover rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedChatImage(null)}
                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-black text-white/95 transition-colors cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {editingMessage ? (
              <form onSubmit={handleSaveEditSubmit} className="flex gap-2 items-center">
                <input
                  type="text"
                  required
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 bg-[#1C1C1E] rounded-xl py-2 px-4 text-sm outline-none text-white border border-[#262626]"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-[#3B82F6] text-white font-semibold rounded-xl text-xs hover:bg-[#3B82F6]/80 transition-colors cursor-pointer"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessage(null);
                    setEditText('');
                  }}
                  className="px-3 py-2 bg-[#2C2C2E] text-white rounded-xl text-xs font-semibold cursor-pointer border border-[#262626]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              (() => {
                const isGroupAdmin = chat.isGroup && chat.admins?.includes(currentUser.uid);
                const canSendMessages = !chat.isGroup || isGroupAdmin || chat.permissions?.allowSendMessages !== false;
                const isUnfriended = !chat.isGroup && partner && (
                  (currentUser.unfriendedUsers || []).includes(partner.uid) || 
                  (partner.unfriendedUsers || []).includes(currentUser.uid)
                );

                if (isUnfriended) {
                  return (
                    <div className="text-center py-4 px-6 bg-[#1C1C1E] border border-[#262626] rounded-2xl text-xs text-orange-500 font-bold italic tracking-wide">
                      Unfriended: You can no longer send or receive messages from this contact.
                    </div>
                  );
                }

                const pendingReq = !chat.isGroup && partner && chatRequests.find(r => 
                  r.status === 'pending' && 
                  ((r.senderId === currentUser.uid && r.receiverId === partner.uid) ||
                   (r.senderId === partner.uid && r.receiverId === currentUser.uid))
                );

                if (pendingReq) {
                  const isSender = pendingReq.senderId === currentUser.uid;
                  return (
                    <div className="text-center py-4 px-6 bg-[#1C1C1E] border border-[#262626] rounded-2xl text-xs text-orange-500 font-bold italic tracking-wide">
                      {isSender ? "Refriending Request Sent: Waiting for contact to accept." : "Refriending Request Received: Accept request to chat."}
                    </div>
                  );
                }

                if (!canSendMessages) {
                  return (
                    <div className="text-center py-3 bg-[#1C1C1E] border border-[#262626] rounded-2xl text-xs text-[#8E8E93] font-bold italic tracking-wide">
                      🔒 Only administrators can send messages to this group.
                    </div>
                  );
                }

                return (
                  <form onSubmit={handleSend} className="flex items-center gap-2.5">
                    {/* Image upload button */}
                    <div className="flex-shrink-0">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              alert("File size exceeds 2MB limit. Please upload a smaller image!");
                              e.target.value = '';
                              return;
                            }
                            setUploadProgress(0);
                            const reader = new FileReader();
                            reader.onprogress = (event) => {
                              if (event.lengthComputable) {
                                const percent = Math.round((event.loaded / event.total) * 100);
                                setUploadProgress(percent);
                              }
                            };
                            reader.onloadend = () => {
                              let current = 80;
                              const interval = setInterval(() => {
                                current += 4;
                                setUploadProgress(current);
                                if (current >= 100) {
                                  clearInterval(interval);
                                  setSelectedChatImage(reader.result as string);
                                  setTimeout(() => setUploadProgress(null), 500);
                                }
                              }, 30);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                        id="chat-image-upload"
                      />
                      <label
                        htmlFor="chat-image-upload"
                        className="p-2.5 bg-[#1C1C1E] border border-[#262626] hover:bg-[#2C2C2E] text-zinc-400 hover:text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
                        title="Attach image"
                      >
                        <Image className="w-4 h-4 text-[#1DB954]" />
                      </label>
                    </div>

                    <div className="flex-1 relative">
                      <input
                        ref={inputRef}
                        type="text"
                        placeholder={chat.isGroup ? "Type a message (use @ to mention)..." : "Send a secure message..."}
                        value={inputText}
                        onChange={handleInputChange}
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                        className="w-full bg-[#1C1C1E] border border-transparent focus:border-[#1DB954] rounded-2xl py-2.5 px-4 text-sm outline-none text-white transition-all placeholder-[#8E8E93]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!inputText.trim() && !selectedChatImage}
                      className="p-2.5 bg-gradient-to-br from-[#1DB954] to-[#1ed760] hover:opacity-90 disabled:opacity-40 text-black rounded-full transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center"
                      title="Send message"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                );
              })()
            )}
          </>
        )}
      </div>

      {/* ================= DETAILS DRAWER MODAL (USER/GROUP DETAILS & MEDIA) ================= */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-xs z-30 flex justify-end"
          >
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: 'spring', damping: 25 }}
              className="w-full max-w-sm bg-zinc-950 border-l border-zinc-900 h-full shadow-2xl flex flex-col overflow-hidden text-white relative"
            >
              {/* Drawer Header */}
              <div className="p-4 border-b border-zinc-900 bg-zinc-900 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {chat.isGroup ? 'Group Details & Media' : 'Contact Profile & Media'}
                </span>
                <button 
                  onClick={() => setShowDetails(false)}
                  className="p-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5 no-scrollbar">
                
                {/* Visual Avatar detail */}
                <div className="text-center p-5 bg-zinc-900/60 rounded-2xl border border-zinc-800/80">
                  {chat.isGroup ? (
                    <div className="relative inline-block group/avatar">
                      {chat.image && (chat.image.startsWith('data:') || chat.image.startsWith('http')) ? (
                        <img src={chat.image} alt={chat.name} className="w-16 h-16 rounded-2xl object-cover mx-auto mb-2 border border-zinc-800" referrerPolicy="no-referrer" />
                      ) : (
                        <div 
                          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-2 border border-zinc-800"
                          style={{ background: getAvatarGradient(chat.image || 'group_default') }}
                        >
                          <Users className="w-8 h-8" />
                        </div>
                      )}
                      {(!chat.isGroup || isGroupAdmin || chat.permissions?.allowEditSettings !== false) && (
                        <label className="absolute bottom-1 right-[-4px] w-6 h-6 bg-zinc-900 text-white rounded-full flex items-center justify-center cursor-pointer border border-[#262626] shadow-sm hover:scale-110 transition-transform">
                          <Camera className="w-3 h-3 text-[#1DB954]" />
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file && onUpdateGroupDetails) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  onUpdateGroupDetails(chat.chatId, chat.name, reader.result as string);
                                  setToastMessage('Group image updated successfully!');
                                };
                                reader.readAsDataURL(file);
                              }
                            }} 
                            className="hidden" 
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    partner?.profileImage && (partner.profileImage.startsWith('data:') || partner.profileImage.startsWith('http')) ? (
                      <img src={partner.profileImage} alt={partner.fullName} className="w-16 h-16 rounded-full object-cover mx-auto mb-2" referrerPolicy="no-referrer" />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-inner mx-auto mb-2"
                        style={{ background: getAvatarGradient(partner?.profileImage || 'user_default') }}
                      >
                        {(partner?.fullName || 'U').charAt(0).toUpperCase()}
                      </div>
                    )
                  )}

                  {chat.isGroup && (!chat.isGroup || isGroupAdmin || chat.permissions?.allowEditSettings !== false) ? (
                    <div className="mt-1 flex flex-col items-center">
                      <input
                        type="text"
                        defaultValue={chat.name}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && val !== chat.name && onUpdateGroupDetails) {
                            onUpdateGroupDetails(chat.chatId, val, undefined);
                            setToastMessage('Group name updated successfully!');
                          }
                        }}
                        className="text-sm font-bold text-white text-center bg-transparent border-b border-zinc-800 focus:border-[#1DB954] outline-none px-2 py-0.5 max-w-[200px]"
                        placeholder="Group name"
                      />
                      <p className="text-[10px] text-zinc-500 mt-1">Tap above to edit name</p>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-sm font-bold text-white">
                        {chat.isGroup ? chat.name : partner?.fullName}
                      </h4>
                      <p className="text-[11px] text-[#1DB954] font-semibold mt-0.5">
                        {chat.isGroup ? 'Group Conversation' : `@${partner?.username}`}
                      </p>
                    </>
                  )}
                  
                  {!chat.isGroup && partner?.bio && (
                    <p className="text-xs text-zinc-400 mt-2.5 italic">
                      "{partner.bio}"
                    </p>
                  )}

                  {!chat.isGroup && partner && (
                    <div className="mt-4 text-left border-t border-zinc-800/80 pt-4 space-y-3">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                        Contact Info
                      </span>
                      <div className="bg-black/30 rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626] text-xs">
                        {/* Phone Row */}
                        <div className="p-3 flex items-center justify-between font-semibold">
                          <span className="text-zinc-400">Phone Number</span>
                          <span className="text-white tracking-wider">{partner.phone || '+1 555-019-2834'}</span>
                        </div>
                        {/* Status Row */}
                        <div className="p-3 flex items-center justify-between font-semibold">
                          <span className="text-zinc-400">Online Status</span>
                          {displayedOnline ? (
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Online
                            </span>
                          ) : (
                            <span className="text-zinc-500 font-medium">{formatLastSeen(partner.lastSeen)}</span>
                          )}
                        </div>
                      </div>

                      {/* View Full Profile action button */}
                      <button
                        onClick={() => {
                          setShowDetails(false);
                          onViewContact?.(partner.uid);
                        }}
                        className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-zinc-800 transition-colors cursor-pointer"
                      >
                        <UserIcon className="w-3.5 h-3.5 text-[#1DB954]" />
                        <span>View Full Profile</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* ================= SHARED MEDIA GALLERY SECTION ================= */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between ml-3 mr-1">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Shared Media ({sharedMediaMessages.length})
                    </span>
                  </div>

                  {sharedMediaMessages.length === 0 ? (
                    <div className="p-4 bg-[#1C1C1E] rounded-2xl border border-[#262626] text-center text-xs text-zinc-500">
                      No photos shared yet in this conversation.
                    </div>
                  ) : (
                    <div className="bg-[#1C1C1E] rounded-2xl p-2 border border-[#262626] grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto no-scrollbar">
                      {sharedMediaMessages.map((m) => (
                        <div
                          key={m.messageId}
                          onClick={() => {
                            setLightboxImage({
                              url: m.image!,
                              senderName: m.senderId === currentUser.uid ? 'You' : (getUserDetails(m.senderId)?.fullName || 'Contact'),
                              timestamp: getFormattedMessageTime(m.createdAt)
                            });
                          }}
                          className="aspect-square rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-opacity bg-black border border-zinc-800"
                        >
                          <img
                            src={m.image}
                            alt="Shared thumbnail"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ================= SECTION 1: NOTIFICATIONS ================= */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                    Notifications
                  </span>
                  <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                    
                    {/* Mute Row */}
                    {(() => {
                      const isMuted = chat.muted?.[currentUser.uid] === true;
                      return (
                        <div className="p-3.5 flex items-center justify-between text-sm">
                          <div className="flex items-center gap-3">
                            <div className={`w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 ${isMuted ? 'bg-orange-500' : 'bg-blue-500'}`}>
                              {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                            </div>
                            <span className="font-semibold text-white">Mute Conversation</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isMuted}
                            onChange={() => {
                              onMuteChat?.(chat.chatId);
                              setToastMessage(isMuted ? 'Notifications unmuted' : 'Notifications muted');
                            }}
                            className="rounded-full h-5 w-9 bg-[#2C2C2E] border-transparent text-[#1DB954] focus:ring-0 cursor-pointer appearance-none checked:bg-[#1DB954] relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:rounded-full after:bg-white checked:after:translate-x-4 after:transition-all"
                          />
                        </div>
                      );
                    })()}

                    {/* Show Previews */}
                    <div className="p-3.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-teal-500">
                          <ExternalLink className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-white">Show Previews</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={showPreviews}
                        onChange={(e) => {
                          setShowPreviews(e.target.checked);
                          setToastMessage(e.target.checked ? 'Message previews enabled' : 'Message previews disabled');
                        }}
                        className="rounded-full h-5 w-9 bg-[#2C2C2E] border-transparent text-[#1DB954] focus:ring-0 cursor-pointer appearance-none checked:bg-[#1DB954] relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:rounded-full after:bg-white checked:after:translate-x-4 after:transition-all"
                      />
                    </div>

                    {/* Alert Tone Row */}
                    <div className="p-3.5 text-sm">
                      <div 
                        onClick={() => setShowTonePicker(!showTonePicker)}
                        className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-violet-500">
                            <Volume2 className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-white">Alert Sound</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <span className="text-xs text-[#8E8E93]">{selectedTone}</span>
                          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${showTonePicker ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {showTonePicker && (
                        <div className="space-y-1.5 mt-3 p-2 bg-[#2C2C2E]/50 rounded-xl border border-zinc-800">
                          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider pl-1">Select Sound Profile</p>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            {['Classic Aero', 'Aurora Pop', 'Stardust Pulse', 'Silent Chord'].map((tone) => (
                              <button
                                key={tone}
                                type="button"
                                onClick={() => {
                                  setSelectedTone(tone);
                                  setToastMessage(`Tone changed to ${tone}`);
                                  setShowTonePicker(false);
                                }}
                                className={`p-2 rounded-lg font-semibold border transition-all ${
                                  selectedTone === tone 
                                    ? 'bg-[#1DB954]/20 text-[#1DB954] border-[#1DB954]/40' 
                                    : 'bg-black/30 text-zinc-400 border-transparent hover:text-white'
                                }`}
                              >
                                {tone}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* ================= SECTION 2: PRIVACY ================= */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                    Privacy & Security
                  </span>
                  <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                    
                    {/* End-to-end Encryption */}
                    <div 
                      onClick={() => alert(`End-to-End Encryption Secured\n\nAll conversations are fully encrypted using military-grade AES-256 with dynamic session keys. None of this content is readable by Txtorspace or any external network nodes.`)}
                      className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-[#2C2C2E] transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-emerald-500">
                          <Lock className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-white">Encryption</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                        <span>Secure</span>
                        <ChevronRight className="w-4 h-4 text-zinc-600" />
                      </div>
                    </div>

                    {/* Disappearing Messages */}
                    <div className="p-3.5 text-sm">
                      <div 
                        onClick={() => setShowDisappearingPicker(!showDisappearingPicker)}
                        className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-[#0A84FF]">
                            <Clock className="w-4 h-4" />
                          </div>
                          <span className="font-semibold text-white">Disappearing Messages</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <span className="text-xs text-[#8E8E93]">
                            {disappearingTime === 'off' ? 'Off' : disappearingTime === '24h' ? '24h' : '7d'}
                          </span>
                          <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${showDisappearingPicker ? 'rotate-90' : ''}`} />
                        </div>
                      </div>

                      {showDisappearingPicker && (
                        <div className="flex bg-black/40 p-1 rounded-xl text-xs gap-1 mt-3 border border-zinc-800">
                          {(['off', '24h', '7d'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                setDisappearingTime(t);
                                setToastMessage(`Disappearing messages set to ${t === 'off' ? 'Off' : t === '24h' ? '24 Hours' : '7 Days'}`);
                                setShowDisappearingPicker(false);
                              }}
                              className={`flex-1 py-1.5 font-bold text-center rounded-lg transition-all ${
                                disappearingTime === t 
                                  ? 'bg-[#3B82F6] text-white shadow' 
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              {t === 'off' ? 'Off' : t === '24h' ? '24 Hours' : '7 Days'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Block Contact (only private) */}
                    {!chat.isGroup && partner && (
                      (() => {
                        const isBlocked = (currentUser.blockedUsers || []).includes(partner.uid);
                        return (
                          <div 
                            onClick={() => {
                              if (isBlocked) {
                                onUnblockUser?.(partner.uid);
                                setToastMessage('Contact unblocked');
                              } else {
                                onBlockUser?.(partner.uid);
                                setToastMessage('Contact blocked');
                              }
                            }}
                            className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-red-950/10 transition-all text-red-500"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-red-600">
                                <UserX className="w-4 h-4" />
                              </div>
                              <span className="font-semibold">{isBlocked ? 'Unblock Contact' : 'Block Contact'}</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600" />
                          </div>
                        );
                      })()
                    )}

                    {/* Unfriend Contact (only private) */}
                    {!chat.isGroup && partner && (
                      (() => {
                        const isUnfriended = (currentUser.unfriendedUsers || []).includes(partner.uid) ||
                                              (partner.unfriendedUsers || []).includes(currentUser.uid);
                        if (isUnfriended) {
                          return (
                            <div 
                              onClick={() => {
                                const confirmRefriend = window.confirm(`Would you like to send a chat request to ${partner.fullName}?`);
                                if (confirmRefriend) {
                                  onRefriendUser?.(partner.uid);
                                  setToastMessage('Chat request sent!');
                                }
                              }}
                              className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-emerald-950/10 transition-all text-[#1DB954] border-t border-[#262626]"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-emerald-600">
                                  <UserPlus className="w-4 h-4" />
                                </div>
                                <span className="font-semibold">Send Chat Request</span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-zinc-600" />
                            </div>
                          );
                        } else {
                          return (
                            <div 
                              onClick={() => {
                                const confirmUnfriend = window.confirm(`Are you sure you want to unfriend ${partner.fullName}? You will not be able to chat with each other anymore.`);
                                if (confirmUnfriend) {
                                  onUnfriendUser?.(partner.uid);
                                  setToastMessage('Contact unfriended');
                                }
                              }}
                              className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-orange-950/10 transition-all text-orange-500 border-t border-[#262626]"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-orange-600">
                                  <UserMinus className="w-4 h-4" />
                                </div>
                                <span className="font-semibold">Unfriend Contact</span>
                              </div>
                              <ChevronRight className="w-4 h-4 text-zinc-600" />
                            </div>
                          );
                        }
                      })()
                    )}

                    {/* Report Abuse */}
                    <div 
                      onClick={() => {
                        if (chat.isGroup) {
                          alert('Safety report submitted regarding this conversation group. Txtorspace safety officers will inspect the logs.');
                        } else if (partner) {
                          onReportUser?.(partner.uid);
                          setToastMessage('Contact reported');
                        }
                      }}
                      className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-orange-950/10 transition-all text-orange-500 border-b-transparent"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-orange-600">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <span className="font-semibold">Report Safety Violation</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </div>

                  </div>
                </div>

                {/* ================= SECTION 3: MEMBER MANAGEMENT (GROUP ONLY) ================= */}
                {chat.isGroup ? (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                        Group Administration
                      </span>
                      <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                        
                        {/* Group Permissions list toggles */}
                        <div className="p-3.5 space-y-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-semibold">Allow members to add contacts</span>
                            <input
                              type="checkbox"
                              disabled={!isGroupAdmin}
                              checked={chat.permissions?.allowAddMembers !== false}
                              onChange={(e) => {
                                onUpdateGroupPermissions(chat.chatId, {
                                  allowAddMembers: e.target.checked,
                                  allowInviteLink: chat.permissions?.allowInviteLink !== false,
                                  allowEditSettings: chat.permissions?.allowEditSettings !== false,
                                  allowSendMessages: chat.permissions?.allowSendMessages !== false
                                });
                                setToastMessage('Group permissions updated');
                              }}
                              className="rounded bg-[#2C2C2E] text-[#1DB954] cursor-pointer disabled:opacity-45"
                            />
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-semibold">Allow invite links</span>
                            <input
                              type="checkbox"
                              disabled={!isGroupAdmin}
                              checked={chat.permissions?.allowInviteLink !== false}
                              onChange={(e) => {
                                onUpdateGroupPermissions(chat.chatId, {
                                  allowAddMembers: chat.permissions?.allowAddMembers !== false,
                                  allowInviteLink: e.target.checked,
                                  allowEditSettings: chat.permissions?.allowEditSettings !== false,
                                  allowSendMessages: chat.permissions?.allowSendMessages !== false
                                });
                                setToastMessage('Group permissions updated');
                              }}
                              className="rounded bg-[#2C2C2E] text-[#1DB954] cursor-pointer disabled:opacity-45"
                            />
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-semibold">Allow members to edit group info</span>
                            <input
                              type="checkbox"
                              disabled={!isGroupAdmin}
                              checked={chat.permissions?.allowEditSettings !== false}
                              onChange={(e) => {
                                onUpdateGroupPermissions(chat.chatId, {
                                  allowAddMembers: chat.permissions?.allowAddMembers !== false,
                                  allowInviteLink: chat.permissions?.allowInviteLink !== false,
                                  allowEditSettings: e.target.checked,
                                  allowSendMessages: chat.permissions?.allowSendMessages !== false
                                });
                                setToastMessage('Group permissions updated');
                              }}
                              className="rounded bg-[#2C2C2E] text-[#1DB954] cursor-pointer disabled:opacity-45"
                            />
                          </div>

                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-300 font-semibold">Allow general members to send messages</span>
                            <input
                              type="checkbox"
                              disabled={!isGroupAdmin}
                              checked={chat.permissions?.allowSendMessages !== false}
                              onChange={(e) => {
                                onUpdateGroupPermissions(chat.chatId, {
                                  allowAddMembers: chat.permissions?.allowAddMembers !== false,
                                  allowInviteLink: chat.permissions?.allowInviteLink !== false,
                                  allowEditSettings: chat.permissions?.allowEditSettings !== false,
                                  allowSendMessages: e.target.checked
                                });
                                setToastMessage('Group permissions updated');
                              }}
                              className="rounded bg-[#2C2C2E] text-[#1DB954] cursor-pointer disabled:opacity-45"
                            />
                          </div>
                        </div>

                        {/* Share Group Invite Link Row (Available until admin disables it) */}
                        {canShareInviteLink && (
                          <div 
                            onClick={() => {
                              const inviteUrl = `${window.location.origin}/group/${chat.chatId}`;
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(inviteUrl);
                              }
                              setToastMessage('Group invite link copied to clipboard!');
                              if (navigator.share) {
                                navigator.share({
                                  title: `Join ${chat.name || 'Group'} on Txtorspace`,
                                  text: `Join "${chat.name || 'Group'}" conversation on Txtorspace!`,
                                  url: inviteUrl
                                }).catch(() => {});
                              }
                            }}
                            className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-[#2C2C2E] text-emerald-400 font-semibold"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-emerald-600">
                                <Share2 className="w-4 h-4" />
                              </div>
                              <span>Share Group Invite Link</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600" />
                          </div>
                        )}

                        {/* Add Member Toggle Row (Available until admin disables it) */}
                        {canAddMembers && (
                          <div 
                            onClick={() => setShowMemberAddModal(!showMemberAddModal)}
                            className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-[#2C2C2E] text-blue-400 font-semibold"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-blue-500">
                                <UserPlus className="w-4 h-4" />
                              </div>
                              <span>Add New Member</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600" />
                          </div>
                        )}

                      </div>
                    </div>

                    {/* Member Add Overlay inside drawer */}
                    {showMemberAddModal && (
                      <div className="p-3.5 bg-[#1C1C1E] border border-zinc-800 rounded-2xl space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Select Contact to Add</p>
                        {addableMembers.length === 0 ? (
                          <p className="text-xs text-zinc-400 italic">All available members are already in the group.</p>
                        ) : (
                          <div className="space-y-1 max-h-[140px] overflow-y-auto no-scrollbar">
                            {addableMembers.map((m) => (
                              <button
                                key={m.uid}
                                type="button"
                                onClick={() => {
                                  onAddGroupMember(chat.chatId, m.uid);
                                  setShowMemberAddModal(false);
                                  setToastMessage(`${m.fullName} added successfully`);
                                }}
                                className="w-full text-left p-2 hover:bg-zinc-800 text-xs font-semibold rounded-lg flex items-center gap-2 text-zinc-200 cursor-pointer transition-colors"
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span className="truncate">{m.fullName} (@{m.username})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Group Members Section */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                        Members list ({chat.members.length})
                      </span>
                      <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626] max-h-[260px] overflow-y-auto no-scrollbar">
                        {groupMembers.map((member) => {
                          const isMemAdmin = chat.admins?.includes(member.uid);
                          const isMemOwner = chat.ownerId === member.uid;
                          const isMemSelf = member.uid === currentUser.uid;

                          return (
                            <div 
                              key={member.uid}
                              onClick={() => setSelectedUser(member)}
                              className="p-3 flex items-center justify-between text-xs hover:bg-[#2C2C2E] cursor-pointer transition-colors"
                              title="Click for Contact profile options & 1-on-1 chat"
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div 
                                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ background: getAvatarGradient(member.profileImage || 'user_default') }}
                                >
                                  {member.fullName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-white truncate block">
                                    {member.fullName} {isMemSelf && '(You)'}
                                  </span>
                                  <span className="text-[9px] text-[#8E8E93] block">
                                    @{member.username}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {isMemOwner && (
                                  <span className="text-[8px] font-bold bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded border border-amber-500/20">
                                    Owner
                                  </span>
                                )}
                                {isMemAdmin && !isMemOwner && (
                                  <span className="text-[8px] font-bold bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">
                                    Admin
                                  </span>
                                )}

                                {/* Admin Promotion Controls */}
                                {isGroupAdmin && !isMemSelf && !isMemOwner && (
                                  <div className="flex items-center gap-1.5 ml-1">
                                    {!isMemAdmin && (
                                      <button
                                        onClick={() => {
                                          onPromoteAdmin(chat.chatId, member.uid);
                                          setToastMessage(`${member.fullName} is now admin`);
                                        }}
                                        className="text-[9px] text-blue-400 hover:underline font-semibold cursor-pointer"
                                      >
                                        Promote
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        if (confirm(`Remove ${member.fullName} from group?`)) {
                                          onRemoveGroupMember(chat.chatId, member.uid);
                                          setToastMessage(`${member.fullName} removed`);
                                        }
                                      }}
                                      className="text-[9px] text-red-400 hover:underline font-semibold cursor-pointer"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )}
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Leave Group Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Leave group? You will no longer receive notifications or messages.')) {
                          onLeaveGroup(chat.chatId);
                          setShowDetails(false);
                        }
                      }}
                      className="w-full py-3.5 bg-red-950/20 hover:bg-red-950/40 border border-red-900/30 text-red-500 font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Leave Conversation Group</span>
                    </button>

                  </div>
                ) : (
                  /* ================= SECTION 3: MUTUAL INFO (PRIVATE CHAT ONLY) ================= */
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                      Conversation Information
                    </span>
                    <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                      
                      {/* View details */}
                      {partner && (
                        <div 
                          onClick={() => setSelectedUser(partner)}
                          className="p-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-[#2C2C2E] transition-all text-[#1DB954] font-semibold"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-black shrink-0 bg-[#1DB954]">
                              <UserIcon className="w-4 h-4" />
                            </div>
                            <span>View Full Profile Card</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-zinc-600" />
                        </div>
                      )}

                      {/* Connection date */}
                      <div className="p-3.5 flex items-center justify-between text-sm text-zinc-400">
                        <div className="flex items-center gap-3">
                          <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-white shrink-0 bg-zinc-800">
                            <Calendar className="w-4 h-4 text-zinc-400" />
                          </div>
                          <span className="font-semibold text-zinc-300">Connection Date</span>
                        </div>
                        <span className="text-xs font-semibold text-[#8E8E93]">
                          {new Date(chat.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                        </span>
                      </div>

                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= MODAL: FORWARD MESSAGE SELECTION ================= */}
      <AnimatePresence>
        {forwardingMessage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-sm bg-[#1C1C1E] border border-[#262626] rounded-3xl overflow-hidden p-6 relative"
            >
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-[#2C2C2E] text-zinc-400 hover:text-white border border-[#262626] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <h2 className="text-base font-bold text-white mb-1">Forward Message</h2>
              <p className="text-xs text-[#8E8E93] mb-4">Choose a contact or group conversation to forward this message to.</p>

              {/* Message preview snippet */}
              <div className="p-3 bg-black/40 border border-[#262626] rounded-xl text-xs text-[#8E8E93] italic mb-4 max-h-[80px] overflow-y-auto">
                "{forwardingMessage.text}"
              </div>

              {/* List of forward target chats */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
                {chats.filter(c => c.chatId !== chat.chatId).map((c) => {
                  let chatTitle = '';
                  let isGrp = c.isGroup;

                  if (isGrp) {
                    chatTitle = c.name || 'Group';
                  } else {
                    const partnerId = c.members.find(id => id !== currentUser.uid);
                    const partnerUser = users.find(u => u.uid === partnerId);
                    chatTitle = partnerUser?.fullName || 'Secure Contact';
                  }

                  return (
                    <button
                      key={c.chatId}
                      onClick={() => {
                        onForwardMessage(c.chatId, forwardingMessage.text);
                        setForwardingMessage(null);
                        setToastMessage('Message forwarded successfully');
                      }}
                      className="w-full text-left p-3 bg-[#2C2C2E]/40 hover:bg-[#2C2C2E] text-xs font-semibold rounded-xl flex items-center justify-between text-white border border-[#262626] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        {isGrp ? (
                          <Users className="w-4 h-4 text-[#1DB954]" />
                        ) : (
                          <UserIcon className="w-4 h-4 text-blue-400" />
                        )}
                        <span className="truncate">{chatTitle}</span>
                      </div>
                      <Forward className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  );
                })}

                {chats.filter(c => c.chatId !== chat.chatId).length === 0 && (
                  <p className="text-center text-xs text-zinc-500 py-4">No other active chat rooms available to forward to.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= FULL SCREEN WHATSAPP-STYLE IMAGE LIGHTBOX ================= */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/95 flex flex-col justify-between"
            onClick={() => setLightboxImage(null)}
          >
            {/* Top Navigation Bar */}
            <div 
              className="p-4 flex items-center justify-between bg-black/70 backdrop-blur-md border-b border-zinc-800 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer"
                  title="Close viewer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h4 className="text-sm font-bold text-white leading-none">{lightboxImage.senderName}</h4>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{lightboxImage.timestamp}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white cursor-pointer"
                  title={isZoomed ? "Zoom out" : "Zoom in"}
                >
                  {isZoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
                </button>
                <a
                  href={lightboxImage.url}
                  download="Txtorspace_Media.png"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold cursor-pointer"
                  title="Save / Download Image"
                >
                  <Download className="w-5 h-5 stroke-[2.5]" />
                </a>
              </div>
            </div>

            {/* Central Crisp Image Stage */}
            <div 
              className="flex-1 flex items-center justify-center p-4 overflow-hidden relative"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.img
                src={lightboxImage.url}
                alt="Full screen media"
                animate={{ scale: isZoomed ? 1.75 : 1 }}
                transition={{ type: "spring", damping: 25 }}
                className="max-h-[85vh] max-w-full object-contain rounded-lg shadow-2xl cursor-pointer"
                onDoubleClick={() => setIsZoomed(!isZoomed)}
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Bottom Caption / Action bar */}
            <div 
              className="p-3 text-center bg-black/60 backdrop-blur-md border-t border-zinc-800 text-xs text-zinc-400"
              onClick={(e) => e.stopPropagation()}
            >
              <span>Double tap or click zoom icon to toggle view • End-to-end encrypted media</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= SEAMLESS CHAT USER PROFILE SELECTION CARD MODAL ================= */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 pointer-events-auto"
            onClick={() => setSelectedUser(null)}
          >
            <motion.div
              initial={{ scale: 0.93, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.93, y: 20 }}
              transition={{ type: 'spring', damping: 24 }}
              className="w-full max-w-sm bg-[#1C1C1E] border border-[#262626] rounded-3xl overflow-hidden p-6 relative flex flex-col gap-4 shadow-2xl pointer-events-auto max-h-[90vh] overflow-y-auto no-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-[#2C2C2E] text-zinc-400 hover:text-white border border-[#262626] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Title Header */}
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Contact Details Options
                </p>
              </div>

              {/* Profile Main Badge */}
              <div className="text-center p-4 bg-black/40 rounded-2xl border border-zinc-850">
                {selectedUser.profileImage && (selectedUser.profileImage.startsWith('data:') || selectedUser.profileImage.startsWith('http')) ? (
                  <img src={selectedUser.profileImage} alt={selectedUser.fullName} className="w-16 h-16 rounded-full object-cover mx-auto mb-2" referrerPolicy="no-referrer" />
                ) : (
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-inner mx-auto mb-2"
                    style={{ background: getAvatarGradient(selectedUser.profileImage || 'user_default') }}
                  >
                    {selectedUser.fullName.charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="text-sm font-bold text-white">
                  {selectedUser.fullName}
                </h3>
                <p className="text-[11px] text-[#1DB954] font-semibold mt-0.5">
                  @{selectedUser.username}
                </p>
                {selectedUser.bio && (
                  <p className="text-xs text-zinc-400 mt-2 italic px-2">
                    "{selectedUser.bio}"
                  </p>
                )}
              </div>

              {/* Number and Core Info Segment */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                  Contact Info
                </span>
                <div className="bg-black/30 rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                  {/* Phone number row */}
                  <div className="p-3 flex items-center justify-between text-xs font-semibold">
                    <span className="text-zinc-400">Phone Number</span>
                    <span className="text-white tracking-wider">{selectedUser.phone || '+1 555-019-2834'}</span>
                  </div>
                  {/* Status row */}
                  <div className="p-3 flex items-center justify-between text-xs font-semibold">
                    <span className="text-zinc-400">Online Status</span>
                    {(() => {
                      const isSelUserRecentlyActive = selectedUser.lastSeen ? (Date.now() - new Date(selectedUser.lastSeen).getTime() < 45000) : false;
                      const isSelUserOnline = selectedUser.online && isSelUserRecentlyActive;
                      return isSelUserOnline ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Online
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-medium">
                          {formatLastSeen(selectedUser.lastSeen || selectedUser.createdAt)}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Core Actions Segment: Open 1-on-1 Chat & View Custom Profile */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                  Direct Communication
                </span>
                <div className="bg-black/30 rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                  
                  {/* Open 1-on-1 Chat button (Requested by user) */}
                  {selectedUser.uid !== currentUser.uid && (
                    <div 
                      onClick={() => {
                        setSelectedUser(null);
                        if (onOpenDirectChat) {
                          onOpenDirectChat(selectedUser.uid);
                        } else if (onViewContact) {
                          onViewContact(selectedUser.uid);
                        }
                      }}
                      className="p-3 flex items-center justify-between text-xs font-bold text-[#1DB954] cursor-pointer hover:bg-[#2C2C2E]/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-[#1DB954]/20 flex items-center justify-center text-[#1DB954]">
                          <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <span>Open 1-on-1 Private Chat</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                  )}

                  {/* View profile button */}
                  <div 
                    onClick={() => {
                      onViewContact?.(selectedUser.uid);
                      setSelectedUser(null);
                    }}
                    className="p-3 flex items-center justify-between text-xs font-semibold text-blue-400 cursor-pointer hover:bg-[#2C2C2E]/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                        <UserIcon className="w-3.5 h-3.5" />
                      </div>
                      <span>View Custom Profile Page</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                  </div>

                  {/* Share profile button */}
                  <div 
                    onClick={() => {
                      const profileLink = `${window.location.origin}/user/${selectedUser.username}`;
                      navigator.clipboard.writeText(profileLink);
                      setToastMessage(`Profile link copied: ${profileLink}`);
                      setSelectedUser(null);
                    }}
                    className="p-3 flex items-center justify-between text-xs font-semibold text-emerald-400 cursor-pointer hover:bg-[#2C2C2E]/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <Share2 className="w-3.5 h-3.5" />
                      </div>
                      <span>Share Contact Profile Link</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                  </div>

                </div>
              </div>

              {/* Security & Safety Segment */}
              {selectedUser.uid !== currentUser.uid && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider ml-3">
                    Safety & Protection
                  </span>
                  <div className="bg-black/30 rounded-2xl overflow-hidden border border-[#262626] divide-y divide-[#262626]">
                    
                    {/* Block / Unblock option */}
                    {(() => {
                      const isBlocked = (currentUser.blockedUsers || []).includes(selectedUser.uid);
                      return (
                        <div 
                          onClick={() => {
                            if (isBlocked) {
                              onUnblockUser?.(selectedUser.uid);
                              setToastMessage('Contact unblocked');
                            } else {
                              onBlockUser?.(selectedUser.uid);
                              setToastMessage('Contact blocked');
                            }
                            setSelectedUser(null);
                          }}
                          className={`p-3 flex items-center justify-between text-xs font-semibold cursor-pointer hover:bg-red-950/10 transition-colors ${
                            isBlocked ? 'text-emerald-400' : 'text-red-500'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {isBlocked ? <UserCheck className="w-4 h-4 text-emerald-400" /> : <UserX className="w-4 h-4 text-red-500" />}
                            <span>{isBlocked ? 'Unblock Contact' : 'Block Contact'}</span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                        </div>
                      );
                    })()}

                    {/* Unfriend / Refriend Option */}
                    {(() => {
                      const isUnfriended = (currentUser.unfriendedUsers || []).includes(selectedUser.uid) ||
                                            (selectedUser.unfriendedUsers || []).includes(currentUser.uid);
                      if (isUnfriended) {
                        return (
                          <div 
                            onClick={() => {
                              const confirmRefriend = window.confirm(`Would you like to send a chat request to ${selectedUser.fullName}?`);
                              if (confirmRefriend) {
                                onRefriendUser?.(selectedUser.uid);
                                setToastMessage('Chat request sent!');
                              }
                              setSelectedUser(null);
                            }}
                            className="p-3 flex items-center justify-between text-xs font-semibold text-emerald-400 cursor-pointer hover:bg-emerald-950/10 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <UserPlus className="w-4 h-4 text-emerald-400" />
                              <span>Send Chat Request</span>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                          </div>
                        );
                      } else {
                        return (
                          <div 
                            onClick={() => {
                              const confirmUnfriend = window.confirm(`Are you sure you want to unfriend ${selectedUser.fullName}? You will not be able to chat with each other anymore.`);
                              if (confirmUnfriend) {
                                onUnfriendUser?.(selectedUser.uid);
                                setToastMessage('Contact unfriended');
                              }
                              setSelectedUser(null);
                            }}
                            className="p-3 flex items-center justify-between text-xs font-semibold text-orange-500 cursor-pointer hover:bg-orange-950/10 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <UserMinus className="w-4 h-4 text-orange-500" />
                              <span>Unfriend Contact</span>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                          </div>
                        );
                      }
                    })()}

                    {/* Report option */}
                    <div 
                      onClick={() => {
                        onReportUser?.(selectedUser.uid);
                        setToastMessage('Safety report submitted');
                        setSelectedUser(null);
                      }}
                      className="p-3 flex items-center justify-between text-xs font-semibold text-orange-500 cursor-pointer hover:bg-orange-950/10 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                        <span>Report Contact Violation</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                    </div>

                  </div>
                </div>
              )}

              {/* iOS Style Cancel button */}
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="mt-1 w-full py-3 bg-[#2C2C2E] hover:opacity-90 text-white font-bold text-xs rounded-2xl cursor-pointer shadow transition-all active:scale-98 text-center animate-fade-in"
              >
                Close
              </button>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
