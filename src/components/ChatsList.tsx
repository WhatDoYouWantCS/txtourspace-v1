import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Pin, VolumeX, Trash2, Users, MessageSquare, Flame, 
  MoreVertical, Settings, PlusCircle, Heart, UserX, User, 
  Check, CheckCheck, Info, Sparkles, CheckSquare, Shield, Circle, CircleDot,
  UserPlus, Plus
} from 'lucide-react';
import { Chat, User as UserType, Message, Story } from '../types';
import { getAvatarGradient } from '../data/mockUsers';

interface ChatsListProps {
  chats: Chat[];
  users: UserType[];
  messages: { [chatId: string]: Message[] };
  currentUser: UserType;
  stories?: Story[];
  onOpenStory?: (storyId: string) => void;
  activeChatId: string | null;
  typingUsers: { [chatId: string]: { [uid: string]: boolean } };
  onSelectChat: (chatId: string) => void;
  onPinChat: (chatId: string) => void;
  onMuteChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onOpenGroupCreation: () => void;
  onNavigateToSettings: () => void;
  onToggleFavoriteChat: (chatId: string) => void;
  onBlockUserToggle: (userId: string) => void;
  onViewContact: (userId: string) => void;
  onNavigateToDiscover?: () => void;
}

export default function ChatsList({
  chats,
  users,
  messages,
  currentUser,
  stories = [],
  onOpenStory,
  activeChatId,
  typingUsers,
  onSelectChat,
  onPinChat,
  onMuteChat,
  onDeleteChat,
  onOpenGroupCreation,
  onNavigateToSettings,
  onToggleFavoriteChat,
  onBlockUserToggle,
  onViewContact,
  onNavigateToDiscover
}: ChatsListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Header 3-dot dropdown state
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // Multi-Select and Floating Menu states
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [showFloatingMenu, setShowFloatingMenu] = useState(false);

  // Tick state to update last seen displays instantly in real-time
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  // Long press contextual sheet state
  const [selectedChatForOptions, setSelectedChatForOptions] = useState<Chat | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressActiveRef = useRef(false);

  // Scroll tracking to hide/reveal floating bottom navigation bar
  const lastScrollY = useRef(0);
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    if (Math.abs(currentScrollY - lastScrollY.current) > 12) {
      if (currentScrollY > lastScrollY.current && currentScrollY > 60) {
        window.dispatchEvent(new CustomEvent('hide-bottom-nav'));
      } else {
        window.dispatchEvent(new CustomEvent('show-bottom-nav'));
      }
      lastScrollY.current = currentScrollY;
    }
  };

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getChatPartner = (chat: Chat): UserType | undefined => {
    const partnerId = chat.members.find(id => id !== currentUser.uid);
    return users.find(u => u.uid === partnerId);
  };

  const getUnreadCount = (chat: Chat): number => {
    const chatMsgs = messages[chat.chatId] || [];
    return chatMsgs.filter(m => m.senderId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))).length;
  };

  const getTypingString = (chatId: string): string | null => {
    const typingMap = typingUsers[chatId];
    if (!typingMap) return null;
    
    const typingIds = Object.keys(typingMap).filter(uid => uid !== currentUser.uid && typingMap[uid]);
    if (typingIds.length === 0) return null;
    
    if (typingIds.length === 1) {
      const u = users.find(usr => usr.uid === typingIds[0]);
      return `${u?.fullName || 'Someone'} is typing...`;
    }
    return 'Several people are typing...';
  };

  // Deduplicate chats to prevent showing duplicate chats for same pair or duplicate chatIds
  const deduplicatedChats = React.useMemo(() => {
    const seenPrivatePartners = new Set<string>();
    const seenChatIds = new Set<string>();
    const result: Chat[] = [];

    // Sort by most recent first
    const sorted = [...chats].sort((a, b) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.updatedAt).getTime();
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });

    for (const chat of sorted) {
      if (seenChatIds.has(chat.chatId)) continue;
      seenChatIds.add(chat.chatId);

      if (!chat.isGroup) {
        const partnerId = chat.members.find(id => id !== currentUser.uid);
        if (partnerId) {
          if (seenPrivatePartners.has(partnerId)) continue;
          seenPrivatePartners.add(partnerId);
        }
      }
      result.push(chat);
    }
    return result;
  }, [chats, currentUser.uid]);

  // WhatsApp-style Search: Filters chats by name, username OR message text
  const processedChats = deduplicatedChats
    .filter(chat => {
      if (chat.deletedBy && chat.deletedBy[currentUser.uid]) return false;
      
      const queryLower = searchQuery.toLowerCase();
      
      let matchesName = false;
      if (chat.isGroup) {
        matchesName = chat.name?.toLowerCase().includes(queryLower) || false;
      } else {
        const partner = getChatPartner(chat);
        matchesName = partner ? (partner.fullName.toLowerCase().includes(queryLower) || partner.username.toLowerCase().includes(queryLower)) : false;
      }
      
      const chatMsgs = messages[chat.chatId] || [];
      const matchesMessage = chatMsgs.some(m => !m.deleted && m.text.toLowerCase().includes(queryLower));
      
      return matchesName || matchesMessage;
    })
    .sort((a, b) => {
      const aPinned = a.pinned?.[currentUser.uid] ? 1 : 0;
      const bPinned = b.pinned?.[currentUser.uid] ? 1 : 0;
      
      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }
      
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.updatedAt).getTime();
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });

  // Long press event handlers (custom gesture)
  const startPressTimer = (chat: Chat) => {
    isLongPressActiveRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      setSelectedChatForOptions(chat);
      // Trigger haptic vibration if available
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }
    }, 600); // 600ms hold
  };

  const cancelPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleItemClick = (chat: Chat) => {
    // If a long press was triggered, don't execute regular click actions
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      return;
    }
    if (isMultiSelectMode) {
      const copy = new Set(selectedChatIds);
      if (copy.has(chat.chatId)) {
        copy.delete(chat.chatId);
        if (copy.size === 0) {
          setIsMultiSelectMode(false);
        }
      } else {
        copy.add(chat.chatId);
      }
      setSelectedChatIds(copy);
      return;
    }
    onSelectChat(chat.chatId);
  };

  return (
    <div className="flex flex-col h-full bg-black transition-colors duration-300 relative select-none">
      
      {/* ================= HEADER MENU ================= */}
      <div className="p-6 pb-2 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>Chats</span>
          <span className="text-xs bg-[#1DB954]/15 text-[#1DB954] rounded-full px-2 py-0.5 font-bold border border-[#1DB954]/20">
            {chats.length}
          </span>
        </h1>
        
        {/* WhatsApp-style 3-Dot Options Action */}
        <div className="relative" ref={headerMenuRef}>
          <button
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="p-2 bg-[#1C1C1E] text-zinc-300 hover:text-white rounded-xl border border-[#262626] transition-all cursor-pointer"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showHeaderMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-[#1C1C1E] border border-[#262626] rounded-2xl p-1.5 shadow-2xl z-40">
              <button
                onClick={() => {
                  onOpenGroupCreation();
                  setShowHeaderMenu(false);
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-[#2C2C2E] text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-[#1DB954]" />
                <span>Create New Group</span>
              </button>
              <button
                onClick={() => {
                  onNavigateToSettings();
                  setShowHeaderMenu(false);
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-[#2C2C2E] text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-zinc-400" />
                <span>Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Header Action Bar / WhatsApp-style Search Input bar */}
      <div className="px-6 py-2">
        {isMultiSelectMode ? (
          <div className="bg-[#1C1C1E] border border-[#262626] rounded-xl p-2.5 flex items-center justify-between text-white shadow-lg">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsMultiSelectMode(false);
                  setSelectedChatIds(new Set());
                }}
                className="text-xs font-bold bg-[#2C2C2E] hover:bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <span className="text-xs font-extrabold text-[#1DB954]">{selectedChatIds.size} Selected</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  selectedChatIds.forEach(id => onPinChat(id));
                  setIsMultiSelectMode(false);
                  setSelectedChatIds(new Set());
                }}
                className="p-1.5 hover:bg-[#2C2C2E] text-zinc-200 rounded-lg transition-colors cursor-pointer"
                title="Toggle Pin Selected"
              >
                <Pin className="w-4 h-4 text-[#1DB954]" />
              </button>
              <button
                onClick={() => {
                  selectedChatIds.forEach(id => onMuteChat(id));
                  setIsMultiSelectMode(false);
                  setSelectedChatIds(new Set());
                }}
                className="p-1.5 hover:bg-[#2C2C2E] text-zinc-200 rounded-lg transition-colors cursor-pointer"
                title="Toggle Mute Selected"
              >
                <VolumeX className="w-4 h-4 text-orange-400" />
              </button>
              <button
                onClick={() => {
                  selectedChatIds.forEach(id => onDeleteChat(id));
                  setIsMultiSelectMode(false);
                  setSelectedChatIds(new Set());
                }}
                className="p-1.5 hover:bg-red-950/40 text-red-400 rounded-lg transition-colors cursor-pointer"
                title="Delete Selected"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#8E8E93]" />
            <input
              type="text"
              placeholder="Search chats, contacts, or messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1C1C1E] border border-transparent focus:border-[#1DB954] rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none text-white transition-all placeholder-[#8E8E93]"
            />
          </div>
        )}
      </div>

      {/* ================= CHATS SCROLL LIST ================= */}
      <div 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1 no-scrollbar"
      >
        {processedChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-[#1C1C1E] border border-[#262626] flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-zinc-500" />
            </div>
            <h3 className="text-sm font-semibold text-white">No active chats match</h3>
            <p className="text-xs text-[#8E8E93] max-w-[220px] mt-1 leading-relaxed">
              {searchQuery ? 'Check spelling or query.' : 'Tap the Discover tab to connect and start a chat!'}
            </p>
          </div>
        ) : (
          processedChats.map((chat) => {
            const isSelected = activeChatId === chat.chatId;
            const isPinned = chat.pinned?.[currentUser.uid];
            const isMuted = chat.muted?.[currentUser.uid];
            const isFavorite = chat.favorites?.[currentUser.uid];
            const unreadCount = getUnreadCount(chat);
            const typingString = getTypingString(chat.chatId);
            
            // Seen/Unseen detailed status
            const chatMsgs = messages[chat.chatId] || [];
            const lastMsgObj = chatMsgs[chatMsgs.length - 1];
            const isLastMsgFromMe = lastMsgObj?.senderId === currentUser.uid;
            let isLastMsgSeen = false;
            if (isLastMsgFromMe && lastMsgObj) {
              if (!chat.isGroup) {
                isLastMsgSeen = !!(lastMsgObj.readBy && lastMsgObj.readBy.some(uid => uid !== currentUser.uid));
              } else {
                const otherMembers = chat.members.filter(m => m !== currentUser.uid);
                isLastMsgSeen = otherMembers.length > 0 && otherMembers.every(m => lastMsgObj.readBy && lastMsgObj.readBy.includes(m));
              }
            }

            let title = '';
            let subtitle = chat.lastMessage || 'Tap to start secure chat';
            let isOnline = false;
            let avatarSeed = '';
            let isCustomImg = false;
            let customImgSrc = '';

            if (chat.isGroup) {
              title = chat.name || 'Group Chat';
              avatarSeed = chat.image || 'group_default';
              if (avatarSeed.startsWith('data:')) {
                isCustomImg = true;
                customImgSrc = avatarSeed;
              }
            } else {
              const partner = getChatPartner(chat);
              if (partner) {
                const isBlocked = currentUser.blockedUsers?.includes(partner.uid);
                if (isBlocked) {
                  title = "Blocked Contact";
                  isOnline = false;
                  avatarSeed = "user_blocked";
                  isCustomImg = false;
                } else {
                  title = partner.fullName;
                  const isUnfriended = (currentUser.unfriendedUsers || []).includes(partner.uid) || 
                                        (partner.unfriendedUsers || []).includes(currentUser.uid);
                  const isRecentlyActive = partner.lastSeen ? (Date.now() - new Date(partner.lastSeen).getTime() < 45000) : false;
                  isOnline = partner.online && isRecentlyActive;
                  avatarSeed = partner.profileImage;
                  if (avatarSeed.startsWith('data:')) {
                    isCustomImg = true;
                    customImgSrc = avatarSeed;
                  }
                }
              } else {
                title = 'Contact';
              }
            }

            if (chat.lastMessage && chat.lastMessage.startsWith('__DELETED__')) {
              subtitle = 'This message was deleted';
            }

            return (
              <div
                key={chat.chatId}
                onMouseDown={() => startPressTimer(chat)}
                onMouseUp={cancelPressTimer}
                onMouseLeave={cancelPressTimer}
                onTouchStart={() => startPressTimer(chat)}
                onTouchEnd={cancelPressTimer}
                onClick={() => handleItemClick(chat)}
                className={`group/item flex items-center p-3 rounded-2xl cursor-pointer transition-all border ${
                  isMultiSelectMode && selectedChatIds.has(chat.chatId)
                    ? 'bg-[#1DB954]/10 border-[#1DB954]/30'
                    : isSelected
                    ? 'bg-[#1C1C1E] border-[#262626]'
                    : 'bg-transparent hover:bg-[#1C1C1E]/30 border-transparent'
                }`}
              >
                {/* Checkbox indicator in multi-select mode */}
                {isMultiSelectMode && (
                  <div className="flex-shrink-0 mr-3">
                    {selectedChatIds.has(chat.chatId) ? (
                      <div className="w-5 h-5 rounded-full bg-[#1DB954] flex items-center justify-center text-black shadow-sm shadow-[#1DB954]/20">
                        <Check className="w-3.5 h-3.5 stroke-[3.5px]" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />
                    )}
                  </div>
                )}

                {/* Avatar with Online and Story Status indicator */}
                {(() => {
                  const partner = !chat.isGroup ? getChatPartner(chat) : null;
                  const isBlocked = partner ? (currentUser.blockedUsers || []).includes(partner.uid) || (partner.blockedUsers || []).includes(currentUser.uid) : false;
                  const isUnfriended = partner ? (currentUser.unfriendedUsers || []).includes(partner.uid) || (partner.unfriendedUsers || []).includes(currentUser.uid) : false;
                  const partnerStories = partner && !isBlocked && !isUnfriended ? stories.filter(s => s.creatorId === partner.uid) : [];
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
                        if (showRing && onOpenStory) {
                          e.stopPropagation();
                          onOpenStory(activePartnerStories[0].storyId);
                        }
                      }}
                      className={`relative flex-shrink-0 mr-3.5 ${
                        showRing
                          ? 'p-[2.5px] rounded-full bg-gradient-to-tr from-[#0A84FF] via-rose-500 to-amber-400 shadow-md cursor-pointer ring-1 ring-white/10'
                          : ''
                      }`}
                      title={showRing ? `View ${title}'s New Story` : undefined}
                    >
                      {chat.isGroup ? (
                        isCustomImg ? (
                          <img src={customImgSrc} alt={title} className="w-11.5 h-11.5 rounded-2xl object-cover" />
                        ) : (
                          <div className="w-11.5 h-11.5 rounded-2xl bg-[#1C1C1E] border border-[#262626] flex items-center justify-center text-zinc-400">
                            <Users className="w-5 h-5" />
                          </div>
                        )
                      ) : (
                        isCustomImg ? (
                          <img 
                            src={customImgSrc} 
                            alt={title} 
                            className={`w-11.5 h-11.5 rounded-full object-cover ${showRing ? 'border border-black' : ''}`} 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div 
                            className={`w-11.5 h-11.5 rounded-full flex items-center justify-center text-white text-sm font-semibold ${showRing ? 'border border-black' : ''}`} 
                            style={{ background: getAvatarGradient(avatarSeed) }}
                          >
                            {title.charAt(0).toUpperCase()}
                          </div>
                        )
                      )}

                      {!chat.isGroup && isOnline && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-black animate-pulse" />
                      )}
                    </div>
                  );
                })()}

                {/* Main Content Details */}
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{title}</h3>
                      {isFavorite && <Heart className="w-3 h-3 text-[#1DB954] fill-[#1DB954]" />}
                    </div>
                    <span className="text-[10px] text-[#8E8E93] flex-shrink-0">
                      {formatTime(chat.lastMessageAt || chat.updatedAt)}
                    </span>
                  </div>

                  {/* Subtitle / Message Text */}
                  {typingString ? (
                    <p className="text-xs text-[#1DB954] font-semibold animate-pulse truncate">{typingString}</p>
                  ) : (
                    <div className="flex items-center gap-1">
                      {/* Real-time seen/unseen circle indicator */}
                      {isLastMsgFromMe && (
                        <span className="flex-shrink-0 mr-1 flex items-center justify-center">
                          {isLastMsgSeen ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-white block shadow-xs" title={chat.isGroup ? "Seen by all members" : "Seen"} />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full border border-zinc-500 block" title="Delivered / Unseen" />
                          )}
                        </span>
                      )}

                      <p className={`text-xs truncate ${unreadCount > 0 ? 'text-white font-semibold' : 'text-[#8E8E93] font-normal'}`}>
                        {chat.lastMessageSenderId === currentUser.uid && !chat.isGroup && subtitle !== 'This message was deleted' ? (
                          <span className="text-zinc-500 mr-1">You:</span>
                        ) : null}
                        {subtitle}
                      </p>
                    </div>
                  )}
                </div>

                {/* Right badges & pin indicators */}
                <div className="flex flex-col items-end justify-between self-stretch flex-shrink-0 min-w-4">
                  <div className="flex items-center gap-0.5">
                    {isPinned && <Pin className="w-3 h-3 text-[#1DB954] fill-[#1DB954]" />}
                    {isMuted && <VolumeX className="w-3 h-3 text-zinc-500" />}
                  </div>

                  <div className="mt-1">
                    {unreadCount > 0 && (
                      <span className="min-w-4 h-4 rounded-full bg-[#1DB954] text-black text-[9px] font-bold flex items-center justify-center px-1">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* ================= MODAL: LONG PRESS ACTION DRAWER SHEET ================= */}
      <AnimatePresence>
        {selectedChatForOptions && (() => {
          const chat = selectedChatForOptions;
          const isPinned = chat.pinned?.[currentUser.uid];
          const isMuted = chat.muted?.[currentUser.uid];
          const isFavorite = chat.favorites?.[currentUser.uid];
          const partner = !chat.isGroup ? getChatPartner(chat) : undefined;

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedChatForOptions(null)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end justify-center p-0 md:p-4"
            >
              <motion.div
                initial={{ y: 200 }}
                animate={{ y: 0 }}
                exit={{ y: 200 }}
                transition={{ type: 'spring', damping: 25 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-[#1C1C1E] border-t md:border border-[#262626] rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl p-5 space-y-4"
              >
                {/* Header profile thumbnail */}
                <div className="flex items-center gap-3 pb-3 border-b border-[#262626]">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold" style={{ background: getAvatarGradient(partner?.profileImage || chat.image || 'group') }}>
                    {chat.isGroup ? <Users className="w-5 h-5" /> : partner?.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{chat.isGroup ? chat.name : partner?.fullName}</h4>
                    <p className="text-xs text-zinc-400">@{chat.isGroup ? 'Group channel' : partner?.username}</p>
                  </div>
                </div>

                {/* Options Grids */}
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-white">
                  
                  {/* Pin Option */}
                  <button
                    onClick={() => {
                      onPinChat(chat.chatId);
                      setSelectedChatForOptions(null);
                    }}
                    className="p-3 bg-[#2C2C2E]/50 hover:bg-[#2C2C2E] border border-[#262626] rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Pin className="w-4 h-4 text-[#1DB954]" />
                    <span>{isPinned ? 'Unpin Chat' : 'Pin to Top'}</span>
                  </button>

                  {/* Mute Option */}
                  <button
                    onClick={() => {
                      onMuteChat(chat.chatId);
                      setSelectedChatForOptions(null);
                    }}
                    className="p-3 bg-[#2C2C2E]/50 hover:bg-[#2C2C2E] border border-[#262626] rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <VolumeX className="w-4 h-4 text-[#1DB954]" />
                    <span>{isMuted ? 'Unmute Alerts' : 'Mute Chat'}</span>
                  </button>

                  {/* Favorite Option */}
                  <button
                    onClick={() => {
                      onToggleFavoriteChat(chat.chatId);
                      setSelectedChatForOptions(null);
                    }}
                    className="p-3 bg-[#2C2C2E]/50 hover:bg-[#2C2C2E] border border-[#262626] rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                    <span>{isFavorite ? 'Remove Fav' : 'Add Fav'}</span>
                  </button>

                  {/* View Contact Option */}
                  {!chat.isGroup && partner && (
                    <button
                      onClick={() => {
                        onViewContact(partner.uid);
                        setSelectedChatForOptions(null);
                      }}
                      className="p-3 bg-[#2C2C2E]/50 hover:bg-[#2C2C2E] border border-[#262626] rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <User className="w-4 h-4 text-zinc-400" />
                      <span>View Contact</span>
                    </button>
                  )}

                  {/* Block user Option */}
                  {!chat.isGroup && partner && (
                    <button
                      onClick={() => {
                        onBlockUserToggle(partner.uid);
                        setSelectedChatForOptions(null);
                      }}
                      className="p-3 bg-[#2C2C2E]/50 hover:bg-[#2C2C2E] border border-[#262626] rounded-xl flex items-center gap-2 transition-colors cursor-pointer text-red-400"
                    >
                      <UserX className="w-4 h-4 text-red-500" />
                      <span>{currentUser.blockedUsers.includes(partner.uid) ? 'Unblock User' : 'Block User'}</span>
                    </button>
                  )}

                  {/* Select All shortcut */}
                  <button
                    onClick={() => {
                      const allIds = processedChats.map(c => c.chatId);
                      setSelectedChatIds(new Set(allIds));
                      setIsMultiSelectMode(true);
                      setSelectedChatForOptions(null);
                    }}
                    className="p-3 bg-[#2C2C2E]/50 hover:bg-[#2C2C2E] border border-[#262626] rounded-xl flex items-center gap-2 transition-colors cursor-pointer col-span-2 text-white font-semibold"
                  >
                    <CheckSquare className="w-4 h-4 text-[#1DB954]" />
                    <span>Select All Conversations</span>
                  </button>

                  {/* Delete Option */}
                  <button
                    onClick={() => {
                      onDeleteChat(chat.chatId);
                      setSelectedChatForOptions(null);
                    }}
                    className="p-3 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 rounded-xl flex items-center gap-2 transition-colors cursor-pointer text-red-400 col-span-2"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                    <span>Delete Conversation</span>
                  </button>

                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Floating Action Button (FAB) with Glass styling */}
      <div className="absolute bottom-24 md:bottom-6 right-6 z-40">
        <AnimatePresence>
          {showFloatingMenu && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="absolute bottom-14 right-0 mb-2 w-48 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 z-50"
            >
              <button
                onClick={() => {
                  setShowFloatingMenu(false);
                  if (onNavigateToDiscover) {
                    onNavigateToDiscover();
                  }
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#1DB954]" />
                <span>Add New Contact</span>
              </button>
              <button
                onClick={() => {
                  setShowFloatingMenu(false);
                  onOpenGroupCreation();
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-[#1DB954]" />
                <span>Create Group</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setShowFloatingMenu(!showFloatingMenu)}
          className="w-12 h-12 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/40 backdrop-blur-md flex items-center justify-center text-[#1DB954] shadow-lg shadow-[#1DB954]/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title="Quick Actions"
        >
          <motion.div
            animate={{ rotate: showFloatingMenu ? 45 : 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <Plus className="w-6 h-6 stroke-[3px]" />
          </motion.div>
        </button>
      </div>

    </div>
  );
}