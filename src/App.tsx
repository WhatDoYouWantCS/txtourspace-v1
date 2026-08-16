import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, Compass, Bell, Settings, LogOut, Sun, Moon, 
  Users, UserPlus, Info, Check, ShieldAlert, ChevronRight, Sparkles, BookOpen
} from 'lucide-react';

import { User, Chat, ChatRequest, Message, NotificationItem, Story } from './types';
import { MOCK_USERS, getAvatarGradient, getSimulatedResponse } from './data/mockUsers';

// Firebase imports
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  writeUser, 
  writeChat, 
  writeMessage, 
  writeChatRequest, 
  removeChatRequest, 
  writeStory,
  writeNotification,
  removeNotification,
  syncNotifications,
  syncUsers,
  syncChats,
  syncChatRequests,
  syncMessages,
  syncStories
} from './lib/firebaseSync';

// Component imports
import AuthScreen from './components/AuthScreen';
import ChatsList from './components/ChatsList';
import ChatRequestScreen from './components/ChatRequestScreen';
import StoriesView from './components/StoriesView';
import NotificationsScreen from './components/NotificationsScreen';
import ProfileView from './components/ProfileView';
import GroupChatCreation from './components/GroupChatCreation';
import SettingsScreen from './components/SettingsScreen';
import ChatRoom from './components/ChatRoom';
import NotificationBanner from './components/NotificationBanner';
import AccountDeactivatedScreen from './components/AccountDeactivatedScreen';
import AppLockScreen from './components/AppLockScreen';
import GroupPreviewScreen from './components/GroupPreviewScreen';
import WebPushPermissionBanner from './components/WebPushPermissionBanner';
import { 
  registerServiceWorker, 
  dispatchWebPushNotification, 
  getNotificationPermissionStatus, 
  listenToForegroundPushMessages 
} from './lib/webPush';
import { safeStorage } from './lib/safeStorage';

export default function App() {
  // --- STATE ---
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<any>(null);

  // 2FA PIN and Biometric Lock State
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const backgroundTimeRef = useRef<number | null>(null);

  const currentUserRef = useRef<User | null>(null);
  const notifiedMessageIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    currentUserRef.current = currentUser;
    if (currentUser) {
      const hasSecurity = currentUser.securitySettings?.pinEnabled || currentUser.securitySettings?.biometricEnabled;
      if (!hasSecurity) {
        setIsAppUnlocked(true);
      }
    }
  }, [currentUser]);

  // Handle visibility changes for lock timeout
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        backgroundTimeRef.current = Date.now();
      } else {
        if (backgroundTimeRef.current && currentUser?.securitySettings) {
          const timeout = currentUser.securitySettings.lockTimeout || 'immediately';
          const elapsed = Date.now() - backgroundTimeRef.current;
          const isEnabled = currentUser.securitySettings.pinEnabled || currentUser.securitySettings.biometricEnabled;
          if (isEnabled) {
            if (timeout === 'immediately') {
              setIsAppUnlocked(false);
            } else if (timeout === '1m' && elapsed > 60000) {
              setIsAppUnlocked(false);
            } else if (timeout === '5m' && elapsed > 300000) {
              setIsAppUnlocked(false);
            }
          }
        }
        backgroundTimeRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [currentUser]);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCurrentUser(null);
        safeStorage.removeItem('aero_current_user');
        knownNotificationIdsRef.current.clear();
        knownRequestIdsRef.current.clear();
        notifiedMessageIdsRef.current.clear();
      }
    });
    return () => unsubscribe();
  }, []);
  const [users, setUsers] = useState<User[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<{ [chatId: string]: Message[] }>({});
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeToasts, setActiveToasts] = useState<NotificationItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  
  // Web Push Notification State & Tracking Refs
  const [showPushBanner, setShowPushBanner] = useState(false);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const knownRequestIdsRef = useRef<Set<string>>(new Set());
  const messageSyncUnsubsRef = useRef<Record<string, () => void>>({});
  const activeChatIdRef = useRef<string | null>(null);
  const activeViewRef = useRef<string>('chats');
  const usersRef = useRef<User[]>([]);

  // Initialize Service Worker & Web Push listeners on mount
  useEffect(() => {
    registerServiceWorker();

    const unsubForeground = listenToForegroundPushMessages((payload) => {
      console.log('[App] Foreground push message received:', payload);
    });

    const handleOpenChatEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.chatId) {
        handleSelectChat(customEvent.detail.chatId);
        setActiveView('chats');
      }
    };

    window.addEventListener('open-chat', handleOpenChatEvent);

    return () => {
      unsubForeground();
      window.removeEventListener('open-chat', handleOpenChatEvent);
    };
  }, []);

  // Prompt for Web Push Notification permissions when user logs in if not yet requested
  useEffect(() => {
    if (!currentUser) {
      setShowPushBanner(false);
      return;
    }

    const dismissed = sessionStorage.getItem('push_prompt_dismissed');
    const perm = getNotificationPermissionStatus();

    if (perm === 'default' && !dismissed) {
      const timer = setTimeout(() => {
        setShowPushBanner(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [currentUser?.uid]);
  
  // Navigation & focus state
  const [activeView, setActiveView] = useState<'chats' | 'requests' | 'stories' | 'notifications' | 'profile' | 'settings'>('chats');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [viewedUserUid, setViewedUserUid] = useState<string | null>(null);
  const [showGroupCreation, setShowGroupCreation] = useState(false);
  
  // Typing indicators: Record<chatId, Record<uid, boolean>>
  const [typingUsers, setTypingUsers] = useState<{ [chatId: string]: { [uid: string]: boolean } }>({});

  // Synchronize state references for non-blocking snapshot events
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    usersRef.current = users;
  }, [users]);

  // Deep-linking guest profile & group invite state
  const [deeplinkUsername, setDeeplinkUsername] = useState<string | null>(null);
  const [deeplinkGroupId, setDeeplinkGroupId] = useState<string | null>(null);

  // Parse deeplink on mount
  useEffect(() => {
    const parseDeeplink = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      let targetUsername: string | null = null;
      let targetGroupId: string | null = null;

      // 1. Check path format (e.g. /user/username or /profile/username or /group/groupId or /join/groupId)
      if (path.startsWith('/user/')) {
        targetUsername = path.substring(6);
      } else if (path.startsWith('/profile/')) {
        targetUsername = path.substring(9);
      } else if (path.startsWith('/group/')) {
        targetGroupId = path.substring(7);
      } else if (path.startsWith('/join/')) {
        targetGroupId = path.substring(6);
      }
      
      // 2. Check search param format (e.g. ?profile=username or ?user=username or ?group=groupId or ?join=groupId)
      if (!targetUsername) {
        targetUsername = searchParams.get('profile') || searchParams.get('user');
      }
      if (!targetGroupId) {
        targetGroupId = searchParams.get('group') || searchParams.get('join') || searchParams.get('groupId');
      }

      // 3. Check hash format (e.g. #/user/username or #profile=username or #/group/groupId)
      if (!targetUsername && window.location.hash) {
        const hash = window.location.hash;
        if (hash.startsWith('#/user/')) {
          targetUsername = hash.substring(7);
        } else if (hash.includes('profile=')) {
          targetUsername = hash.split('profile=')[1]?.split('&')[0];
        } else if (hash.includes('user=')) {
          targetUsername = hash.split('user=')[1]?.split('&')[0];
        }
      }

      if (!targetGroupId && window.location.hash) {
        const hash = window.location.hash;
        if (hash.startsWith('#/group/')) {
          targetGroupId = hash.substring(8);
        } else if (hash.startsWith('#/join/')) {
          targetGroupId = hash.substring(7);
        } else if (hash.includes('group=')) {
          targetGroupId = hash.split('group=')[1]?.split('&')[0];
        } else if (hash.includes('join=')) {
          targetGroupId = hash.split('join=')[1]?.split('&')[0];
        }
      }

      if (targetUsername) {
        // Remove trailing slashes or queries from username
        targetUsername = targetUsername.split('?')[0].split('#')[0].replace(/\/$/, '');
        setDeeplinkUsername(targetUsername);
      }

      if (targetGroupId) {
        targetGroupId = targetGroupId.split('?')[0].split('#')[0].replace(/\/$/, '');
        setDeeplinkGroupId(targetGroupId);
      }
    };

    parseDeeplink();
    window.addEventListener('popstate', parseDeeplink);
    return () => window.removeEventListener('popstate', parseDeeplink);
  }, []);

  // Automatically open deep-linked contact profile once users database is seeded/loaded and session resolved
  useEffect(() => {
    if (currentUser && deeplinkUsername && users.length > 0) {
      const foundUser = users.find(u => u.usernameLower === deeplinkUsername.toLowerCase() || u.username.toLowerCase() === deeplinkUsername.toLowerCase());
      if (foundUser) {
        setViewedUserUid(foundUser.uid);
        setDeeplinkUsername(null);
        window.history.replaceState({}, '', '/');
      }
    }
  }, [currentUser, deeplinkUsername, users]);

  // Automatically open deep-linked group chat if already a member and logged in
  useEffect(() => {
    if (currentUser && deeplinkGroupId && chats.length > 0) {
      const targetGroup = chats.find(c => c.chatId === deeplinkGroupId && c.isGroup);
      if (targetGroup) {
        if (targetGroup.members.includes(currentUser.uid)) {
          setActiveChatId(deeplinkGroupId);
          setActiveView('chats');
          setDeeplinkGroupId(null);
          window.history.replaceState({}, '', '/');
        }
      }
    }
  }, [currentUser, deeplinkGroupId, chats]);

  // --- LOCALSTORAGE INITIALIZATION & SYNC ---
  useEffect(() => {
    // 1. Theme sync
    const storedTheme = safeStorage.getItem('aero_theme') as 'light' | 'dark' | null;
    const initialTheme = storedTheme || 'dark';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }

    // 2. Load users database or seed defaults
    const storedUsers = safeStorage.getItem('aero_users');
    let loadedUsers: User[] = [];
    if (storedUsers && storedUsers !== 'undefined' && storedUsers !== 'null') {
      try {
        loadedUsers = JSON.parse(storedUsers).filter((u: User) => !u.uid.startsWith('mock_'));
      } catch (err) {
        console.error("Error parsing aero_users from localStorage:", err);
      }
    }
    setUsers(loadedUsers);
    safeStorage.setItem('aero_users', JSON.stringify(loadedUsers));

    // 3. Load other states
    const storedRequests = safeStorage.getItem('aero_requests');
    let loadedRequests: ChatRequest[] = [];
    if (storedRequests && storedRequests !== 'undefined' && storedRequests !== 'null') {
      try {
        loadedRequests = JSON.parse(storedRequests).filter((r: ChatRequest) => !r.requestId.startsWith('req_seed_') && !r.senderId.startsWith('mock_') && !r.receiverId.startsWith('mock_'));
      } catch (err) {
        console.error("Error parsing aero_requests from localStorage:", err);
      }
    }
    setChatRequests(loadedRequests);
    safeStorage.setItem('aero_requests', JSON.stringify(loadedRequests));

    const storedChats = safeStorage.getItem('aero_chats');
    let loadedChats: Chat[] = [];
    if (storedChats && storedChats !== 'undefined' && storedChats !== 'null') {
      try {
        loadedChats = JSON.parse(storedChats).filter((c: Chat) => !c.chatId.startsWith('chat_seed_') && !c.members.some(m => m.startsWith('mock_')));
      } catch (err) {
        console.error("Error parsing aero_chats from localStorage:", err);
      }
    }
    setChats(loadedChats);
    safeStorage.setItem('aero_chats', JSON.stringify(loadedChats));

    const storedMessages = safeStorage.getItem('aero_messages');
    if (storedMessages && storedMessages !== 'undefined' && storedMessages !== 'null') {
      try {
        const parsedMsgs = JSON.parse(storedMessages);
        // Clean up messages from seed chats
        Object.keys(parsedMsgs).forEach(key => {
          if (key.startsWith('chat_seed_')) {
            delete parsedMsgs[key];
          }
        });
        setMessages(parsedMsgs);
        safeStorage.setItem('aero_messages', JSON.stringify(parsedMsgs));
      } catch (err) {
        console.error("Error parsing aero_messages from localStorage:", err);
      }
    }

    // 4. Load stories or seed defaults
    const storedStories = safeStorage.getItem('aero_stories');
    let loadedStories: Story[] = [];
    if (storedStories && storedStories !== 'undefined' && storedStories !== 'null') {
      try {
        loadedStories = JSON.parse(storedStories).filter((s: Story) => !s.storyId.startsWith('story_seed_') && !s.creatorId.startsWith('mock_'));
      } catch (err) {
        console.error("Error parsing aero_stories from localStorage:", err);
      }
    }
    setStories(loadedStories);
    safeStorage.setItem('aero_stories', JSON.stringify(loadedStories));

    // 5. Load alerts/notifications history from localStorage
    const storedNotifs = safeStorage.getItem('aero_notifications');
    if (storedNotifs && storedNotifs !== 'undefined' && storedNotifs !== 'null') {
      try {
        const loadedNotifs: NotificationItem[] = JSON.parse(storedNotifs);
        setNotifications(loadedNotifs);
      } catch (err) {
        console.error("Error parsing aero_notifications from localStorage:", err);
      }
    }

    // 6. Load login session if persistent
    const storedCurrentUser = safeStorage.getItem('aero_current_user');
    if (storedCurrentUser && storedCurrentUser !== 'undefined' && storedCurrentUser !== 'null') {
      try {
        const parsedUser: User = JSON.parse(storedCurrentUser);
        if (parsedUser.uid.startsWith('mock_')) {
          // Log out mock users
          setCurrentUser(null);
          safeStorage.removeItem('aero_current_user');
        } else {
          // Ensure online status is accurate on boot
          parsedUser.online = true;
          parsedUser.lastSeen = new Date().toISOString();
          setCurrentUser(parsedUser);
          
          // Update in global list
          const updatedUsers = loadedUsers.map(u => u.uid === parsedUser.uid ? parsedUser : u);
          setUsers(updatedUsers);
          safeStorage.setItem('aero_users', JSON.stringify(updatedUsers));
        }
      } catch (err) {
        console.error("Error parsing aero_current_user from localStorage:", err);
      }
    }
  }, []);

  // Save states to localstorage when they change
  useEffect(() => {
    if (users.length > 0) {
      safeStorage.setItem('aero_users', JSON.stringify(users));
    }
  }, [users]);

  useEffect(() => {
    safeStorage.setItem('aero_requests', JSON.stringify(chatRequests));
  }, [chatRequests]);

  useEffect(() => {
    safeStorage.setItem('aero_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    safeStorage.setItem('aero_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    safeStorage.setItem('aero_stories', JSON.stringify(stories));
  }, [stories]);

  useEffect(() => {
    safeStorage.setItem('aero_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    if (currentUser) {
      safeStorage.setItem('aero_current_user', JSON.stringify(currentUser));
    } else {
      safeStorage.removeItem('aero_current_user');
    }
  }, [currentUser]);

  // --- GLOBAL USERS DIRECTORY REAL-TIME SYNC ---
  useEffect(() => {
    const unsubUsers = syncUsers((updatedUsers) => {
      setUsers(updatedUsers.filter(u => !u.uid.startsWith('mock_')));
    });
    return () => {
      unsubUsers();
    };
  }, []);

  // --- REAL-TIME FIRESTORE SUBSCRIPTIONS (USER-SPECIFIC) ---
  useEffect(() => {
    if (!currentUserRef.current || !firebaseUser) return;

    const uid = currentUserRef.current.uid;

    // 1. Sync Chats
    const unsubChats = syncChats(uid, (updatedChats) => {
      setChats(updatedChats);
    });

    // 3. Sync Chat Requests
    const unsubRequests = syncChatRequests(uid, (updatedRequests) => {
      if (knownRequestIdsRef.current.size > 0) {
        updatedRequests.forEach(r => {
          if (!knownRequestIdsRef.current.has(r.requestId) && r.receiverId === uid && r.status === 'pending') {
            const sender = users.find(u => u.uid === r.senderId);
            const senderName = sender?.fullName || 'New Connection';
            dispatchWebPushNotification({
              title: 'Direct Chat Request',
              body: `${senderName} sent you a connection request`,
              icon: sender?.profileImage || '/favicon.ico',
              type: 'request_received'
            });
          }
        });
      }
      updatedRequests.forEach(r => knownRequestIdsRef.current.add(r.requestId));
      setChatRequests(updatedRequests);
    });

    // 4. Sync Stories
    const unsubStories = syncStories((updatedStories) => {
      setStories(updatedStories);
    });

    // 5. Sync Persistent Notifications
    const unsubNotifications = syncNotifications(uid, (updatedNotifs) => {
      if (knownNotificationIdsRef.current.size > 0) {
        updatedNotifs.forEach(n => {
          if (!knownNotificationIdsRef.current.has(n.id)) {
            // Display floating in-app push toast
            setActiveToasts(prev => [n, ...prev.slice(0, 3)]);
            // Fire native OS/browser web push notification
            dispatchWebPushNotification({
              title: n.senderName || 'Txtorspace Alert',
              body: n.messageText,
              icon: n.senderImage || '/favicon.ico',
              chatId: n.chatId,
              type: n.type
            });
          }
        });
      }
      updatedNotifs.forEach(n => knownNotificationIdsRef.current.add(n.id));
      setNotifications(updatedNotifs);
    });

    return () => {
      unsubChats();
      unsubRequests();
      unsubStories();
      unsubNotifications();
    };
  }, [currentUser?.uid, firebaseUser?.uid]);

  // Sync all joined chats' messages dynamically to detect incoming messages and show received notifications
  useEffect(() => {
    if (!currentUser?.uid || !firebaseUser) return;

    const currentChatIds = new Set(chats.map(c => c.chatId));

    // 1. Unsubscribe from chats we are no longer a member of
    Object.keys(messageSyncUnsubsRef.current).forEach(chatId => {
      if (!currentChatIds.has(chatId)) {
        const u = messageSyncUnsubsRef.current[chatId];
        if (typeof u === 'function') {
          u();
        }
        delete messageSyncUnsubsRef.current[chatId];
      }
    });

    // 2. Subscribe to any newly joined chats
    chats.forEach(chat => {
      if (!messageSyncUnsubsRef.current[chat.chatId]) {
        const unsub = syncMessages(chat.chatId, (updatedMsgs) => {
          setMessages(prev => {
            const prevMsgs = prev[chat.chatId] || [];

            // Only trigger received notifications if we had messages already and a new one has arrived
            if (prevMsgs.length > 0 && updatedMsgs.length > prevMsgs.length) {
              const latestMsg = updatedMsgs[updatedMsgs.length - 1];

              // Only notify if message is from another user and not read by us yet
              const isFromOther = latestMsg.senderId !== currentUser.uid;
              const isUnreadByMe = !latestMsg.readBy || !latestMsg.readBy.includes(currentUser.uid);

              if (isFromOther && isUnreadByMe) {
                // Read from refs to avoid triggering re-subscribes
                const isActivelyViewing = activeChatIdRef.current === chat.chatId && activeViewRef.current === 'chats';

                if (!isActivelyViewing && !notifiedMessageIdsRef.current.has(latestMsg.messageId)) {
                  notifiedMessageIdsRef.current.add(latestMsg.messageId);

                  const sender = usersRef.current.find(u => u.uid === latestMsg.senderId);
                  const senderName = sender?.fullName || 'New Message';
                  const senderImage = sender?.profileImage || '';

                  triggerNotification(
                    'new_message',
                    senderName,
                    senderImage,
                    latestMsg.text || 'Sent an attachment',
                    chat.chatId
                  );
                }
              }
            }

            // Pre-populate read messages in cache so they don't trigger notifications in future sessions
            updatedMsgs.forEach(m => {
              const isUnread = !m.readBy || !m.readBy.includes(currentUser.uid);
              if (m.senderId === currentUser.uid || !isUnread) {
                notifiedMessageIdsRef.current.add(m.messageId);
              }
            });

            return {
              ...prev,
              [chat.chatId]: updatedMsgs
            };
          });
        });
        messageSyncUnsubsRef.current[chat.chatId] = unsub;
      }
    });
  }, [chats.map(c => c.chatId).join(','), currentUser?.uid, firebaseUser]);

  // Clean up all persistent message listeners on unmount or session logout
  useEffect(() => {
    return () => {
      Object.values(messageSyncUnsubsRef.current).forEach(unsub => {
        if (typeof unsub === 'function') {
          unsub();
        }
      });
      messageSyncUnsubsRef.current = {};
    };
  }, [currentUser?.uid, firebaseUser]);

  // Automatically mark messages in active chat as read dynamically
  useEffect(() => {
    if (!currentUser || !activeChatId) return;

    const chatMsgs = messages[activeChatId] || [];
    const unreadMsgs = chatMsgs.filter(
      m => m.senderId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))
    );

    if (unreadMsgs.length > 0) {
      setMessages(prev => {
        const currentMsgs = prev[activeChatId] || [];
        const updated = currentMsgs.map(m => {
          if (m.senderId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) {
            const updatedMsg = {
              ...m,
              readBy: [...(m.readBy || []), currentUser.uid]
            };
            // Persist read status securely
            writeMessage(activeChatId, updatedMsg);
            return updatedMsg;
          }
          return m;
        });
        return {
          ...prev,
          [activeChatId]: updated
        };
      });
    }

    // Dismiss any active toast notifications for this active chat (preserves permanent alerts tab)
    setActiveToasts(prev => prev.filter(n => n.chatId !== activeChatId));
  }, [activeChatId, messages[activeChatId]?.length, currentUser?.uid]);

  // --- REAL-TIME USER PRESENCE ENGINE ---
  useEffect(() => {
    if (!currentUser?.uid || currentUser.uid.startsWith('mock_')) return;

    const updatePresence = async (online: boolean) => {
      const curr = currentUserRef.current;
      if (!curr) return;
      const nowIso = new Date().toISOString();
      const updatedUser: User = {
        ...curr,
        online,
        lastSeen: nowIso
      };

      try {
        await writeUser(updatedUser);
      } catch (err) {
        console.error("Failed to write presence status to Firestore:", err);
      }
    };

    // 1. Mark online true immediately on mount / tab regain focus
    updatePresence(true);

    // 2. Heartbeat timer every 15 seconds while active
    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        updatePresence(true);
      }
    }, 15000);

    // 3. Tab visibility listener (instantly marks offline when tab hidden or minimized)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updatePresence(false);
      } else if (document.visibilityState === 'visible') {
        updatePresence(true);
      }
    };

    // 4. Page hide / Before unload listener (closing tab, closing browser, or navigating away)
    const handlePageHide = () => {
      updatePresence(false);
    };

    const handleOnline = () => updatePresence(true);
    const handleOffline = () => updatePresence(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [currentUser?.uid]);

  // --- ACTIONS ---

  // Handle Theme switching
  const handleToggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    safeStorage.setItem('aero_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  };

  // Login handler
  const handleLogin = (user: User) => {
    const onlineUser = { ...user, online: true, lastSeen: new Date().toISOString() };
    setCurrentUser(onlineUser);
    writeUser(onlineUser);
    setUsers(prev => prev.map(u => u.uid === user.uid ? onlineUser : u));

    if (deeplinkGroupId) {
      setTimeout(() => {
        handleJoinGroupViaLink(deeplinkGroupId, onlineUser);
      }, 300);
    }
  };

  const handleJoinGroupViaLink = (groupId: string, overrideUser?: User) => {
    const userToJoin = overrideUser || currentUser;
    if (!userToJoin) return;
    const targetGroup = chats.find(c => c.chatId === groupId && c.isGroup);
    if (!targetGroup) return;

    if (targetGroup.members.includes(userToJoin.uid)) {
      setActiveChatId(groupId);
      setActiveView('chats');
      setDeeplinkGroupId(null);
      return;
    }

    const joinName = userToJoin.fullName || 'New member';
    const sysMsgText = `${joinName} joined via group invite link`;

    const updatedGroup: Chat = {
      ...targetGroup,
      members: [...targetGroup.members, userToJoin.uid],
      lastMessage: sysMsgText,
      lastMessageAt: new Date().toISOString(),
      lastMessageSenderId: userToJoin.uid,
      updatedAt: new Date().toISOString()
    };
    writeChat(updatedGroup);

    const sysMsg: Message = {
      messageId: 'msg_sys_' + Date.now() + Math.random().toString(36).substr(2, 4),
      senderId: userToJoin.uid,
      text: sysMsgText,
      createdAt: new Date().toISOString(),
      isSystem: true
    };
    writeMessage(groupId, sysMsg);

    setChats(prev => prev.map(c => c.chatId === groupId ? updatedGroup : c));
    setMessages(prev => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []), sysMsg]
    }));

    setActiveChatId(groupId);
    setActiveView('chats');
    setDeeplinkGroupId(null);
  };

  // Signup profile registration
  const handleSignUp = (newUser: User) => {
    setUsers(prev => [...prev, newUser]);
    handleLogin(newUser);
  };

  // Logout session
  const handleLogout = async () => {
    if (currentUser) {
      const offlineUser = { ...currentUser, online: false, lastSeen: new Date().toISOString() };
      await writeUser(offlineUser);
      setUsers(prev => prev.map(u => u.uid === currentUser.uid ? offlineUser : u));
    }
    setCurrentUser(null);
    setActiveChatId(null);
    setViewedUserUid(null);
    setShowGroupCreation(false);
  };

  // Delete account: 24h grace period deactivation with instant reactivation option
  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    const deactivatedUser: User = {
      ...currentUser,
      accountStatus: 'deactivated',
      deactivatedAt: new Date().toISOString(),
      online: false,
      lastSeen: new Date().toISOString()
    };
    await writeUser(deactivatedUser);
    setCurrentUser(deactivatedUser);
    setUsers(prev => prev.map(u => u.uid === currentUser.uid ? deactivatedUser : u));
  };

  // Edit current profile credentials
  const handleUpdateProfile = (updatedFields: Partial<User>) => {
    if (!currentUser) return;
    
    const updated: User = {
      ...currentUser,
      ...updatedFields
    };

    // Sync to Firestore
    writeUser(updated);

    setCurrentUser(updated);
    setUsers(prev => prev.map(u => u.uid === currentUser.uid ? updated : u));

    // Update stories created by user so new name and avatar show everywhere
    if (updatedFields.fullName || updatedFields.profileImage) {
      setStories(prev => prev.map(s => {
        if (s.creatorId === currentUser.uid) {
          const updatedStory = {
            ...s,
            creatorName: updated.fullName,
            creatorImage: updated.profileImage
          };
          writeStory(updatedStory);
          return updatedStory;
        }
        return s;
      }));
    }
  };

  // Dismiss only transient top popup toast banner (preserves persistent alerts in tab)
  const handleDismissToast = (id: string) => {
    setActiveToasts(prev => prev.filter(t => t.id !== id));
  };

  // Trigger push notification popup & persist perpetually in Alert tab
  const triggerNotification = (
    type: NotificationItem['type'],
    senderName: string,
    senderImage: string,
    messageText: string,
    chatId?: string
  ) => {
    const newNotif: NotificationItem = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      type,
      senderName,
      senderImage,
      messageText,
      chatId,
      createdAt: new Date().toISOString(),
      userId: currentUser?.uid,
      recipientId: currentUser?.uid
    };
    
    // Only persist and store in Alerts tab if it is NOT a new chat message
    if (type !== 'new_message') {
      if (currentUser) {
        writeNotification(currentUser.uid, newNotif);
      }
      // Always store permanently in notifications history (never cleared)
      setNotifications(prev => [newNotif, ...prev.filter(n => n.id !== newNotif.id)]);
    }

    // Display floating push banner
    setActiveToasts(prev => [newNotif, ...prev.slice(0, 3)]);

    // Dispatch Native Web Push Notification (FCM / Browser Web Push)
    dispatchWebPushNotification({
      title: senderName,
      body: messageText,
      icon: senderImage || '/favicon.ico',
      chatId,
      type
    });
  };

  // --- STORIES & INTERACTIONS ---
  const handleAddStory = (text: string, bgColor: string, image?: string, mentions?: string[]) => {
    if (!currentUser) return;
    const newStory: Story = {
      storyId: 'story_' + Date.now(),
      creatorId: currentUser.uid,
      creatorName: currentUser.fullName,
      creatorImage: currentUser.profileImage,
      text,
      bgColor,
      createdAt: new Date().toISOString(),
      likes: [],
      replies: [],
      image,
      mentions: mentions && mentions.length > 0 ? mentions : undefined
    };
    
    // Write to Firestore
    writeStory(newStory);

    // If any contacts were tagged/mentioned, notify them
    if (mentions && mentions.length > 0) {
      mentions.forEach(username => {
        const cleanUname = username.replace(/^@/, '').toLowerCase();
        const taggedUser = users.find(u => u.username.toLowerCase() === cleanUname || (u.usernameLower && u.usernameLower.toLowerCase() === cleanUname));
        if (taggedUser && taggedUser.uid !== currentUser.uid) {
          const mentionNotif: NotificationItem = {
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            type: 'mention',
            senderName: currentUser.fullName,
            senderImage: currentUser.profileImage,
            messageText: `Tagged you in a Story status: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`,
            createdAt: new Date().toISOString(),
            userId: taggedUser.uid,
            recipientId: taggedUser.uid
          };
          writeNotification(taggedUser.uid, mentionNotif);
        }
      });
    }

    setStories(prev => [newStory, ...prev]);
  };

  const handleLikeStory = (storyId: string) => {
    if (!currentUser) return;
    
    const storyToUpdate = stories.find(s => s.storyId === storyId);
    if (storyToUpdate) {
      const alreadyLiked = storyToUpdate.likes.includes(currentUser.uid);
      const updatedLikes = alreadyLiked 
        ? storyToUpdate.likes.filter(id => id !== currentUser.uid)
        : [...storyToUpdate.likes, currentUser.uid];
      const updatedStory = { ...storyToUpdate, likes: updatedLikes };
      
      // Write to Firestore
      writeStory(updatedStory);
    }

    setStories(prev => prev.map(s => {
      if (s.storyId !== storyId) return s;
      const alreadyLiked = s.likes.includes(currentUser.uid);
      const updatedLikes = alreadyLiked 
        ? s.likes.filter(id => id !== currentUser.uid)
        : [...s.likes, currentUser.uid];
      return { ...s, likes: updatedLikes };
    }));
  };

  const handleViewStory = (storyId: string) => {
    if (!currentUser) return;
    
    const storyToUpdate = stories.find(s => s.storyId === storyId);
    if (storyToUpdate) {
      const viewsList = storyToUpdate.views || [];
      if (!viewsList.includes(currentUser.uid)) {
        const updatedViews = [...viewsList, currentUser.uid];
        const updatedStory = { ...storyToUpdate, views: updatedViews };
        
        // Write to Firestore
        writeStory(updatedStory);
        
        // Update local state instantly
        setStories(prev => prev.map(s => s.storyId === storyId ? updatedStory : s));
      }
    }
  };

  const prevStoriesRef = useRef<Story[]>([]);
  useEffect(() => {
    if (!currentUser) {
      prevStoriesRef.current = stories;
      return;
    }
    
    // Find if any of my stories got liked
    stories.forEach(story => {
      if (story.creatorId === currentUser.uid) {
        const prevStory = prevStoriesRef.current.find(s => s.storyId === story.storyId);
        if (prevStory) {
          // Check for new likes
          const newLikes = story.likes.filter(uid => !prevStory.likes.includes(uid));
          newLikes.forEach(likeUid => {
            // Find the user who liked it
            const likingUser = users.find(u => u.uid === likeUid);
            if (likingUser) {
              alert(`Story Liked! ${likingUser.fullName} liked your story status: "${story.text}"`);
              triggerNotification(
                'story_liked',
                likingUser.fullName,
                likingUser.profileImage,
                `Liked your story status: "${story.text}"`
              );
            }
          });
        }
      }
    });
    
    prevStoriesRef.current = stories;
  }, [stories, currentUser, users]);

  const notifiedRequestIdsRef = useRef<Set<string>>(new Set());
  const isFirstRequestSyncRef = useRef(true);

  // Monitor incoming chat requests and alert the user
  useEffect(() => {
    if (!currentUser || chatRequests.length === 0) {
      if (chatRequests.length === 0) {
        isFirstRequestSyncRef.current = true;
      }
      return;
    }

    if (isFirstRequestSyncRef.current) {
      // On first load, record existing pending requests so we don't alert old ones
      chatRequests.forEach(req => {
        if (req.receiverId === currentUser.uid && req.status === 'pending') {
          notifiedRequestIdsRef.current.add(req.requestId);
        }
      });
      isFirstRequestSyncRef.current = false;
      return;
    }

    chatRequests.forEach(req => {
      if (req.receiverId === currentUser.uid && req.status === 'pending') {
        if (!notifiedRequestIdsRef.current.has(req.requestId)) {
          notifiedRequestIdsRef.current.add(req.requestId);

          // Find sender name
          const sender = users.find(u => u.uid === req.senderId);
          const senderName = sender?.fullName || 'Someone';

          // Alert user!
          alert(`New Chat Request: You received a secure messaging request from ${senderName}!`);
        }
      }
    });
  }, [chatRequests, currentUser, users]);

  const handleReplyStory = (storyId: string, replyText: string) => {
    if (!currentUser) return;
    const story = stories.find(s => s.storyId === storyId);
    if (!story) return;

    // Must be a chat friend (accepted request or active chat)
    const isAccepted = chatRequests.some(r => 
      r.status === 'accepted' && 
      ((r.senderId === currentUser.uid && r.receiverId === story.creatorId) ||
       (r.senderId === story.creatorId && r.receiverId === currentUser.uid))
    );

    let existingChat = chats.find(c => !c.isGroup && c.members.includes(story.creatorId) && c.members.includes(currentUser.uid));

    if (!isAccepted && !existingChat) {
      alert("You cannot reply to this story until a contact request is accepted.");
      return;
    }

    let targetChatId = '';

    if (existingChat) {
      targetChatId = existingChat.chatId;
      const updatedChat: Chat = {
        ...existingChat,
        lastMessage: `🎨 Story Reply: "${replyText}"`,
        lastMessageAt: new Date().toISOString(),
        lastMessageSenderId: currentUser.uid,
        updatedAt: new Date().toISOString()
      };
      writeChat(updatedChat);
    } else {
      targetChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const newChat: Chat = {
        chatId: targetChatId,
        isGroup: false,
        members: [currentUser.uid, story.creatorId],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: `🎨 Story Reply: "${replyText}"`,
        lastMessageAt: new Date().toISOString(),
        lastMessageSenderId: currentUser.uid,
        pinned: {},
        muted: {},
        favorites: {}
      };
      writeChat(newChat);
      setChats(prev => [newChat, ...prev]);
    }

    const newMsg: Message = {
      messageId: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderId: currentUser.uid,
      text: `🎨 Replied to your story status: "${replyText}"`,
      createdAt: new Date().toISOString(),
      readBy: []
    };

    writeMessage(targetChatId, newMsg);

    setMessages(prev => ({
      ...prev,
      [targetChatId]: [...(prev[targetChatId] || []), newMsg]
    }));

    if (story.creatorId.startsWith('mock_')) {
      setTimeout(() => {
        const responseText = getSimulatedResponse(replyText, story.creatorId);
        const replyMsg: Message = {
          messageId: 'msg_sim_' + Date.now(),
          senderId: story.creatorId,
          text: responseText,
          createdAt: new Date().toISOString(),
          readBy: []
        };
        
        writeMessage(targetChatId, replyMsg);

        setMessages(p => ({
          ...p,
          [targetChatId]: [...(p[targetChatId] || []), replyMsg]
        }));
        
        setChats(prevChats => prevChats.map(c => {
          if (c.chatId === targetChatId) {
            const updatedChat = {
              ...c,
              lastMessage: responseText,
              lastMessageAt: new Date().toISOString(),
              lastMessageSenderId: story.creatorId,
              updatedAt: new Date().toISOString()
            };
            writeChat(updatedChat);
            return updatedChat;
          }
          return c;
        }));
      }, 1500);
    }
  };

  const handleToggleFavoriteChat = (chatId: string) => {
    if (!currentUser) return;
    setChats(prev => prev.map(c => {
      if (c.chatId !== chatId) return c;
      const favorites = c.favorites || {};
      const isFav = !!favorites[currentUser.uid];
      const updatedFavorites = { ...favorites, [currentUser.uid]: !isFav };
      return { ...c, favorites: updatedFavorites };
    }));
  };

  const handleBlockUserToggle = (targetUid: string) => {
    if (!currentUser) return;
    const isBlocked = (currentUser.blockedUsers || []).includes(targetUid);
    const updatedBlocked = isBlocked 
      ? (currentUser.blockedUsers || []).filter(id => id !== targetUid)
      : [...(currentUser.blockedUsers || []), targetUid];

    const updatedUser = { ...currentUser, blockedUsers: updatedBlocked };
    setCurrentUser(updatedUser);

    setUsers(prev => prev.map(u => u.uid === currentUser.uid ? updatedUser : u));
    alert(isBlocked ? 'User has been unblocked.' : 'User has been blocked. They can no longer search or message you.');
  };

  const handleToggleReaction = (chatId: string, messageId: string, emoji: string) => {
    if (!currentUser) return;

    setMessages(prev => {
      const chatMsgs = prev[chatId] || [];
      const updatedMsgs = chatMsgs.map(m => {
        if (m.messageId !== messageId) return m;

        const currentReactions = (m.reactions || {}) as { [key: string]: string[] };
        const newReactions: { [key: string]: string[] } = {};

        // 1 emoji limit per user: remove user from any other emoji on this message
        let wasAlreadyThisEmoji = false;
        for (const [eKey, uids] of Object.entries(currentReactions)) {
          const list = Array.isArray(uids) ? uids : [];
          const filtered = list.filter((id: string) => id !== currentUser.uid);
          if (eKey === emoji && list.includes(currentUser.uid)) {
            wasAlreadyThisEmoji = true;
          }
          if (filtered.length > 0) {
            newReactions[eKey] = filtered;
          }
        }

        // If user didn't already have this emoji active, add them to this emoji
        if (!wasAlreadyThisEmoji) {
          newReactions[emoji] = [...(newReactions[emoji] || []), currentUser.uid];
        }

        const updatedMsg: Message = { ...m, reactions: newReactions };
        writeMessage(chatId, updatedMsg);
        return updatedMsg;
      });

      return {
        ...prev,
        [chatId]: updatedMsgs
      };
    });
  };

  const handleForwardMessage = (targetChatId: string, text: string) => {
    if (!currentUser) return;
    const newMsg: Message = {
      messageId: 'msg_forward_' + Date.now(),
      senderId: currentUser.uid,
      text: `↪️ Forwarded message:\n\n${text}`,
      createdAt: new Date().toISOString(),
      readBy: []
    };

    setMessages(prev => ({
      ...prev,
      [targetChatId]: [...(prev[targetChatId] || []), newMsg]
    }));

    setChats(prev => prev.map(c => {
      if (c.chatId === targetChatId) {
        return {
          ...c,
          lastMessage: `↪️ Forwarded: ${text}`,
          lastMessageSenderId: currentUser.uid,
          lastMessageAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
      return c;
    }));
  };

  const handleUpdateGroupPermissions = (chatId: string, permissions: any) => {
    setChats(prev => prev.map(c => {
      if (c.chatId === chatId) {
        const updatedChat = { 
          ...c, 
          permissions,
          updatedAt: new Date().toISOString()
        };
        writeChat(updatedChat);
        return updatedChat;
      }
      return c;
    }));
  };

  const handleUpdateGroupDetails = (chatId: string, name: string, image?: string) => {
    setChats(prev => prev.map(c => {
      if (c.chatId === chatId) {
        const updatedChat = { 
          ...c, 
          name, 
          image: image !== undefined ? image : c.image,
          updatedAt: new Date().toISOString()
        };
        writeChat(updatedChat);
        return updatedChat;
      }
      return c;
    }));
  };

  // --- CHAT & MESSAGING INTERACTIONS ---

  // Select/open a chat room
  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    
    // Dismiss notifications for this opened chat
    setNotifications(prev => prev.filter(n => n.chatId !== chatId));

    // Mark messages in this chat as read
    if (currentUser) {
      setMessages(prev => {
        const chatMsgs = prev[chatId] || [];
        const updated = chatMsgs.map(m => {
          if (m.senderId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))) {
            const readMsg = {
              ...m,
              readBy: [...(m.readBy || []), currentUser.uid]
            };
            writeMessage(chatId, readMsg);
            return readMsg;
          }
          return m;
        });
        return {
          ...prev,
          [chatId]: updated
        };
      });
    }
  };

  // Pin a conversation to top of chats list
  const handlePinChat = (chatId: string) => {
    if (!currentUser) return;
    setChats(prev => prev.map(c => {
      if (c.chatId === chatId) {
        const currentPinned = c.pinned?.[currentUser.uid] || false;
        return {
          ...c,
          pinned: {
            ...(c.pinned || {}),
            [currentUser.uid]: !currentPinned
          }
        };
      }
      return c;
    }));
  };

  // Synchronize typing indicators from Firestore chats
  useEffect(() => {
    const nextTyping: { [chatId: string]: { [uid: string]: boolean } } = {};
    chats.forEach(c => {
      if (c.typing) {
        const othersTyping: { [uid: string]: boolean } = {};
        Object.keys(c.typing).forEach(uid => {
          if (uid !== currentUser?.uid && c.typing?.[uid] === true) {
            othersTyping[uid] = true;
          }
        });
        if (Object.keys(othersTyping).length > 0) {
          nextTyping[c.chatId] = othersTyping;
        }
      }
    });
    setTypingUsers(nextTyping);
  }, [chats, currentUser?.uid]);

  const handleTyping = (chatId: string, isTyping: boolean) => {
    if (!currentUser) return;
    const chatToUpdate = chats.find(c => c.chatId === chatId);
    if (!chatToUpdate) return;

    const currentTypingMap = chatToUpdate.typing || {};
    const isCurrentlyTyping = !!currentTypingMap[currentUser.uid];

    if (isCurrentlyTyping !== isTyping) {
      const updatedTypingMap = {
        ...currentTypingMap,
        [currentUser.uid]: isTyping
      };
      const updatedChat: Chat = {
        ...chatToUpdate,
        typing: updatedTypingMap
      };
      writeChat(updatedChat);
    }
  };

  // Mute a conversation's notifications
  const handleMuteChat = (chatId: string) => {
    if (!currentUser) return;
    setChats(prev => prev.map(c => {
      if (c.chatId === chatId) {
        const currentMuted = c.muted?.[currentUser.uid] || false;
        return {
          ...c,
          muted: {
            ...(c.muted || {}),
            [currentUser.uid]: !currentMuted
          }
        };
      }
      return c;
    }));
  };

  // Hide/Clear a conversation for oneself
  const handleDeleteChat = (chatId: string) => {
    if (!currentUser) return;
    if (!confirm('Are you sure you want to delete this chat conversation? It will be cleared for you.')) {
      return;
    }

    setChats(prev => prev.map(c => {
      if (c.chatId === chatId) {
        return {
          ...c,
          deletedBy: {
            ...(c.deletedBy || {}),
            [currentUser.uid]: true
          }
        };
      }
      return c;
    }));

    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
  };

  // Send a real-time message
  const handleSendMessage = (text: string, replyToId?: string, image?: string) => {
    if (!currentUser || !activeChatId) return;

    const newMessage: Message = {
      messageId: 'msg_' + Date.now() + Math.floor(Math.random() * 1000),
      senderId: currentUser.uid,
      text,
      createdAt: new Date().toISOString(),
      readBy: [currentUser.uid],
      replyTo: replyToId,
      image
    };

    // Update messages locally (optimistic)
    setMessages(prev => {
      const chatMsgs = prev[activeChatId] || [];
      return {
        ...prev,
        [activeChatId]: [...chatMsgs, newMessage]
      };
    });

    // Write to Firestore
    writeMessage(activeChatId, newMessage);

    // Detect @mentions in message text and trigger mention notifications
    if (text) {
      const mentionMatches = text.match(/@([a-zA-Z0-9_]+)/g);
      if (mentionMatches && mentionMatches.length > 0) {
        const currentChat = chats.find(c => c.chatId === activeChatId);
        const groupOrChatName = currentChat?.isGroup ? (currentChat.name || 'group') : (currentChat?.name || 'chat');

        mentionMatches.forEach(tag => {
          const cleanUsername = tag.slice(1).toLowerCase();
          const taggedUser = users.find(u => u.username.toLowerCase() === cleanUsername || (u.usernameLower && u.usernameLower.toLowerCase() === cleanUsername));
          if (taggedUser && taggedUser.uid !== currentUser.uid) {
            const notifMsg = currentChat?.isGroup
              ? `${currentUser.fullName} mentioned you in "${groupOrChatName}": "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`
              : `${currentUser.fullName} mentioned you: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`;

            const mentionNotif: NotificationItem = {
              id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              type: 'mention',
              senderName: currentUser.fullName,
              senderImage: currentUser.profileImage,
              messageText: notifMsg,
              createdAt: new Date().toISOString(),
              userId: taggedUser.uid,
              recipientId: taggedUser.uid,
              chatId: activeChatId
            };
            writeNotification(taggedUser.uid, mentionNotif);
          }
        });
      }
    }

    const displayLastMsg = image ? (text ? `📷 Photo: ${text}` : '📷 Photo') : text;

    // Update last message in Chat meta and write to Firestore
    const chatToUpdate = chats.find(c => c.chatId === activeChatId);
    if (chatToUpdate) {
      const updatedChat: Chat = {
        ...chatToUpdate,
        lastMessage: displayLastMsg,
        lastMessageAt: newMessage.createdAt,
        lastMessageSenderId: currentUser.uid,
        updatedAt: newMessage.createdAt,
        deletedBy: {}
      };
      writeChat(updatedChat);
    }

    // Update last message in Chat meta locally
    setChats(prev => prev.map(c => {
      if (c.chatId === activeChatId) {
        return {
          ...c,
          lastMessage: displayLastMsg,
          lastMessageAt: newMessage.createdAt,
          lastMessageSenderId: currentUser.uid,
          updatedAt: newMessage.createdAt,
          // If deleted previously, restore for everyone
          deletedBy: {}
        };
      }
      return c;
    }));

    // --- REAL-TIME AI-POWERED CHAT PARTNERS ---
    const chat = chats.find(c => c.chatId === activeChatId);
    if (chat && !chat.isGroup) {
      // Find the virtual user partner
      const partnerId = chat.members.find(id => id !== currentUser.uid);
      const partnerUser = users.find(u => u.uid === partnerId);
      
      if (partnerUser && partnerUser.uid.startsWith('mock_')) {
        const chatId = activeChatId;

        // Set simulated typing state in Firestore after 600ms
        setTimeout(() => {
          const currentChat = chats.find(c => c.chatId === chatId);
          if (currentChat) {
            writeChat({
              ...currentChat,
              typing: {
                ...(currentChat.typing || {}),
                [partnerId]: true
              }
            });
          }
        }, 600);

        // Deliver automated reply after 2200ms
        setTimeout(async () => {
          try {
            // Fetch some recent context messages
            const chatMsgs = messages[chatId] || [];
            // Map senderId for Gemini API route (convert user's id to "me")
            const mappedHistory = [...chatMsgs, newMessage].slice(-6).map(m => ({
              senderId: m.senderId === currentUser.uid ? "me" : "partner",
              text: m.text
            }));

            const response = await fetch("/api/gemini-chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                partnerName: partnerUser.fullName,
                partnerBio: partnerUser.bio,
                messages: mappedHistory
              })
            });

            const data = await response.json();
            const replyText = data.reply || "Connection is a bit spotty right now!";

            // Remove typing indicator in Firestore
            const currentChat = chats.find(c => c.chatId === chatId);
            if (currentChat) {
              const updatedTyping = { ...(currentChat.typing || {}) };
              delete updatedTyping[partnerId];
              writeChat({
                ...currentChat,
                typing: updatedTyping
              });
            }

            const replyMessage: Message = {
              messageId: 'msg_' + Date.now() + Math.floor(Math.random() * 1000),
              senderId: partnerId,
              text: replyText,
              createdAt: new Date().toISOString(),
              readBy: [] // starts unread by user
            };

            // Add message
            setMessages(prev => {
              const chatMsgs = prev[chatId] || [];
              return {
                ...prev,
                [chatId]: [...chatMsgs, replyMessage]
              };
            });

            // Update chat header meta
            setChats(prev => prev.map(c => {
              if (c.chatId === chatId) {
                return {
                  ...c,
                  lastMessage: replyText,
                  lastMessageAt: replyMessage.createdAt,
                  lastMessageSenderId: partnerId,
                  updatedAt: replyMessage.createdAt
                };
              }
              return c;
            }));

            // Trigger a beautiful push banner if they are looking elsewhere!
            const isUserMuted = chat.muted?.[currentUser.uid] || false;
            if (!isUserMuted && (activeChatId !== chatId || activeView !== 'chats')) {
              triggerNotification(
                'new_message',
                partnerUser.fullName,
                partnerUser.profileImage,
                replyText,
                chatId
              );
            }
          } catch (err) {
            console.error("Failed to generate partner response:", err);
            // Fallback to typing removal in Firestore
            const currentChat = chats.find(c => c.chatId === chatId);
            if (currentChat) {
              const updatedTyping = { ...(currentChat.typing || {}) };
              delete updatedTyping[partnerId];
              writeChat({
                ...currentChat,
                typing: updatedTyping
              });
            }
          }
        }, 2200);
      }
    }
  };

  // Edit message (if within 3 mins)
  const handleEditMessage = (messageId: string, newText: string) => {
    if (!activeChatId) return;

    setMessages(prev => {
      const chatMsgs = prev[activeChatId] || [];
      const updated = chatMsgs.map(m => {
        if (m.messageId === messageId) {
          return {
            ...m,
            text: newText,
            edited: true
          };
        }
        return m;
      });
      return {
        ...prev,
        [activeChatId]: updated
      };
    });

    // Update last message preview if needed
    setChats(prev => prev.map(c => {
      if (c.chatId === activeChatId && c.lastMessage) {
        // Find if this was the last message
        const chatMsgs = messages[activeChatId] || [];
        const lastMsg = chatMsgs[chatMsgs.length - 1];
        if (lastMsg && lastMsg.messageId === messageId) {
          return {
            ...c,
            lastMessage: newText
          };
        }
      }
      return c;
    }));
  };

  // Delete message
  const handleDeleteMessage = (messageId: string, forEveryone: boolean) => {
    if (!activeChatId || !currentUser) return;

    setMessages(prev => {
      const chatMsgs = prev[activeChatId] || [];
      const updated = chatMsgs.map(m => {
        if (m.messageId === messageId) {
          if (forEveryone) {
            return {
              ...m,
              text: '__DELETED__',
              deleted: true
            };
          } else {
            // Delete only for current user -> hide using a tag
            return {
              ...m,
              hiddenFor: [...(m.readBy || []), currentUser.uid] // simplistic mockup
            };
          }
        }
        return m;
      });
      return {
        ...prev,
        [activeChatId]: updated
      };
    });

    // Update last message if it matches deleted
    setChats(prev => prev.map(c => {
      if (c.chatId === activeChatId) {
        const chatMsgs = messages[activeChatId] || [];
        const lastMsg = chatMsgs[chatMsgs.length - 1];
        if (lastMsg && lastMsg.messageId === messageId) {
          return {
            ...c,
            lastMessage: forEveryone ? 'This message was deleted' : c.lastMessage
          };
        }
      }
      return c;
    }));
  };

  // --- CHAT REQUESTS WORKFLOW ---

  // Sender clicks "Send Chat Request"
  const handleSendRequest = (otherUid: string) => {
    if (!currentUser) return;

    const targetUser = users.find(u => u.uid === otherUid);
    // If previously unfriended, dynamically clear it on our profile to allow a fresh connection
    const currentUnfriended = currentUser.unfriendedUsers || [];
    if (currentUnfriended.includes(otherUid)) {
      const updatedUnfriended = currentUnfriended.filter(id => id !== otherUid);
      handleUpdateProfile({ unfriendedUsers: updatedUnfriended });
    }

    // Check for duplicates
    const duplicate = chatRequests.find(r => 
      r.status === 'pending' && 
      ((r.senderId === currentUser.uid && r.receiverId === otherUid) ||
       (r.senderId === otherUid && r.receiverId === currentUser.uid))
    );

    if (duplicate) {
      alert('A pending request already exists between you.');
      return;
    }

    const newRequest: ChatRequest = {
      requestId: 'req_' + Date.now() + Math.floor(Math.random() * 1000),
      senderId: currentUser.uid,
      receiverId: otherUid,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Write to Firestore
    writeChatRequest(newRequest);

    setChatRequests(prev => [newRequest, ...prev]);

    // Push a success toast notification
    const successNotif: NotificationItem = {
      id: 'notif_' + Date.now(),
      type: 'request_sent',
      senderName: targetUser ? targetUser.fullName : 'Contact',
      senderImage: targetUser ? (targetUser.profileImage || 'user_default') : 'user_default',
      messageText: 'Request Sent Successfully! Check the discover page to find more contacts.',
      createdAt: new Date().toISOString()
    };
    setActiveToasts(prev => [successNotif, ...prev.slice(0, 3)]);

    // --- REAL-TIME SIMULATE REQUEST APPROVALS ---
    if (targetUser && targetUser.uid.startsWith('mock_')) {
      // Simulate target accepting request after 3.5 seconds
      setTimeout(() => {
        // Move to accepted status
        const updatedReq = { ...newRequest, status: 'accepted' as const };
        writeChatRequest(updatedReq);

        setChatRequests(prev => prev.map(r => r.requestId === newRequest.requestId ? { ...r, status: 'accepted' } : r));
        
        // Check if a chat already exists between these users
        const existingChat = chats.find(c => 
          !c.isGroup && 
          c.members.includes(currentUser.uid) && 
          c.members.includes(targetUser.uid)
        );

        if (existingChat) {
          const updatedChat = {
            ...existingChat,
            deletedBy: (existingChat.deletedBy || []).filter(id => id !== currentUser.uid && id !== targetUser.uid),
            lastMessage: `Hey, nice to connect! Send a secure message to start talking.`,
            lastMessageAt: new Date().toISOString(),
            lastMessageSenderId: targetUser.uid,
            updatedAt: new Date().toISOString()
          };
          const firstMessage: Message = {
            messageId: 'msg_welcome_' + Date.now(),
            senderId: targetUser.uid,
            text: `Hey, nice to connect! Send a secure message to start talking.`,
            createdAt: new Date().toISOString()
          };

          writeChat(updatedChat);
          writeMessage(existingChat.chatId, firstMessage);

          setChats(prev => prev.map(c => c.chatId === existingChat.chatId ? updatedChat : c));
          setMessages(prev => ({
            ...prev,
            [existingChat.chatId]: [...(prev[existingChat.chatId] || []), firstMessage]
          }));

          triggerNotification(
            'request_accepted',
            targetUser.fullName,
            targetUser.profileImage,
            'Accepted your request! Let\'s chat.',
            existingChat.chatId
          );
        } else {
          // Build the new active chat conversation
          const newChatId = 'chat_' + Date.now();
          const newChat: Chat = {
            chatId: newChatId,
            isGroup: false,
            members: [currentUser.uid, targetUser.uid],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastMessage: `Hey, nice to connect! Send a secure message to start talking.`,
            lastMessageAt: new Date().toISOString(),
            lastMessageSenderId: targetUser.uid,
            pinned: {},
            muted: {}
          };

          const firstMessage: Message = {
            messageId: 'msg_welcome_' + Date.now(),
            senderId: targetUser.uid,
            text: `Hey, nice to connect! Send a secure message to start talking.`,
            createdAt: new Date().toISOString()
          };

          writeChat(newChat);
          writeMessage(newChatId, firstMessage);

          setChats(prev => [newChat, ...prev.filter(c => c.chatId !== newChatId)]);
          setMessages(prev => ({ ...prev, [newChatId]: [firstMessage] }));

          // Trigger gorgeous banner notification
          triggerNotification(
            'request_accepted',
            targetUser.fullName,
            targetUser.profileImage,
            'Accepted your request! Let\'s chat.',
            newChatId
          );
        }
      }, 3500);
    }
  };

    // Receiver clicks "Accept Request"
  const handleAcceptRequest = async (requestId: string) => {
    if (!currentUser) return;

    const request = chatRequests.find(r => r.requestId === requestId);
    if (!request) return;

    // Clear any previous unfriended record on request acceptance
    const currentUnfriended = currentUser.unfriendedUsers || [];
    if (currentUnfriended.includes(request.senderId)) {
      const updatedUnfriended = currentUnfriended.filter(id => id !== request.senderId);
      handleUpdateProfile({ unfriendedUsers: updatedUnfriended });
    }

    // 1. Mark request status as accepted
    const updatedRequest = { ...request, status: 'accepted' as const };
    await writeChatRequest(updatedRequest);

    setChatRequests(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'accepted' } : r));

    // 2. Check if a private chat already exists between these users to prevent duplicate chats
    const existingChat = chats.find(c => 
      !c.isGroup && 
      c.members.includes(request.senderId) && 
      c.members.includes(request.receiverId)
    );

    if (existingChat) {
      const updatedChat = {
        ...existingChat,
        deletedBy: (existingChat.deletedBy || []).filter(id => id !== currentUser.uid && id !== request.senderId),
        lastMessage: 'Accepted your chat request. Safe chatting!',
        lastMessageAt: new Date().toISOString(),
        lastMessageSenderId: currentUser.uid,
        updatedAt: new Date().toISOString()
      };
      const firstMsg: Message = {
        messageId: 'msg_accept_' + Date.now(),
        senderId: currentUser.uid,
        text: 'Accepted your chat request. Let\'s talk!',
        createdAt: new Date().toISOString()
      };

      try {
        await writeChat(updatedChat);
        await writeMessage(existingChat.chatId, firstMsg);
      } catch (err) {
        console.error("Failed updating existing chat room on accept request:", err);
      }

      setChats(prev => prev.map(c => c.chatId === existingChat.chatId ? updatedChat : c));
      setMessages(prev => ({
        ...prev,
        [existingChat.chatId]: [...(prev[existingChat.chatId] || []), firstMsg]
      }));

      const sender = users.find(u => u.uid === request.senderId);
      if (sender) {
        triggerNotification(
          'request_accepted',
          sender.fullName,
          sender.profileImage,
          'Request Accepted! Chat channel active.',
          existingChat.chatId
        );
      }
    } else {
      const newChatId = 'chat_' + Date.now();
      const newChat: Chat = {
        chatId: newChatId,
        isGroup: false,
        members: [request.senderId, request.receiverId],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastMessage: 'Your chat request has been accepted. Safe chatting!',
        lastMessageAt: new Date().toISOString(),
        lastMessageSenderId: currentUser.uid,
        pinned: {},
        muted: {}
      };

      const firstMsg: Message = {
        messageId: 'msg_accept_' + Date.now(),
        senderId: currentUser.uid,
        text: 'Accepted your chat request. Let\'s talk!',
        createdAt: new Date().toISOString()
      };

      try {
        await writeChat(newChat);
        await writeMessage(newChatId, firstMsg);
      } catch (err) {
        console.error("Failed creating chat room on accept request:", err);
      }

      setChats(prev => [newChat, ...prev.filter(c => c.chatId !== newChatId)]);
      setMessages(prev => ({ 
        ...prev, 
        [newChatId]: [firstMsg] 
      }));

      // Trigger toast success
      const sender = users.find(u => u.uid === request.senderId);
      if (sender) {
        triggerNotification(
          'request_accepted',
          sender.fullName,
          sender.profileImage,
          'Request Accepted! Chat channel active.',
          newChatId
        );
      }
    }
  };

  // Decline a contact request
  const handleDeclineRequest = (requestId: string) => {
    const request = chatRequests.find(r => r.requestId === requestId);
    if (request) {
      const updatedRequest = { ...request, status: 'declined' as const };
      writeChatRequest(updatedRequest);
    }
    setChatRequests(prev => prev.map(r => r.requestId === requestId ? { ...r, status: 'declined' } : r));
  };

  // Cancel an outgoing request
  const handleCancelRequest = (requestId: string) => {
    setChatRequests(prev => prev.filter(r => r.requestId !== requestId));
  };

  // --- DIRECT 1-ON-1 CHAT NAVIGATOR ---
  const handleSelectDirectChat = async (targetUserId: string) => {
    if (!currentUser || currentUser.uid === targetUserId) return;

    // Ensure we can't start a chat without request accept
    const isAccepted = chatRequests.some(r => 
      r.status === 'accepted' && 
      ((r.senderId === currentUser.uid && r.receiverId === targetUserId) ||
       (r.senderId === targetUserId && r.receiverId === currentUser.uid))
    );

    const existing = chats.find(c => !c.isGroup && c.members.includes(currentUser.uid) && c.members.includes(targetUserId));

    if (!isAccepted && !existing) {
      alert("You cannot start a chat with this user until they accept your contact request or you accept theirs. Please visit the Discover tab to send or accept requests.");
      return;
    }

    // 1. Find if an existing 1-on-1 chat already exists
    if (existing) {
      // Unhide if previously marked deletedBy
      if (existing.deletedBy?.[currentUser.uid]) {
        const updatedChat = {
          ...existing,
          deletedBy: { ...(existing.deletedBy || {}), [currentUser.uid]: false }
        };
        writeChat(updatedChat);
        setChats(prev => prev.map(c => c.chatId === existing.chatId ? updatedChat : c));
      }
      setActiveChatId(existing.chatId);
      setActiveView('chats');
      return;
    }

    // 2. Otherwise create a clean direct chat channel
    const targetUser = users.find(u => u.uid === targetUserId);
    const newChatId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newChat: Chat = {
      chatId: newChatId,
      isGroup: false,
      members: [currentUser.uid, targetUserId],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: `Conversation with ${targetUser?.fullName || 'User'}`,
      lastMessageAt: new Date().toISOString(),
      lastMessageSenderId: currentUser.uid,
      pinned: {},
      muted: {},
      favorites: {}
    };

    await writeChat(newChat);
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChatId);
    setActiveView('chats');
  };

  // --- BLOCKS & REPORTS ---

  const handleBlockUser = (userId: string) => {
    if (!currentUser) return;
    if (currentUser.blockedUsers.includes(userId)) return;

    const updatedBlocked = [...currentUser.blockedUsers, userId];
    handleUpdateProfile({ blockedUsers: updatedBlocked });

    alert('Contact blocked. You can still view past history and unblock at any time.');
  };

  const handleUnblockUser = (userId: string) => {
    if (!currentUser) return;
    const updatedBlocked = currentUser.blockedUsers.filter(id => id !== userId);
    handleUpdateProfile({ blockedUsers: updatedBlocked });
    alert('Contact unblocked successfully.');
  };

  const handleUnfriendUser = (userId: string) => {
    if (!currentUser) return;
    const currentUnfriended = currentUser.unfriendedUsers || [];
    if (currentUnfriended.includes(userId)) return;

    const updatedUnfriended = [...currentUnfriended, userId];
    handleUpdateProfile({ unfriendedUsers: updatedUnfriended });

    // Delete all chat requests between these two users (sender or receiver) to make it a completely fresh state
    chatRequests.forEach(r => {
      if ((r.senderId === currentUser.uid && r.receiverId === userId) ||
          (r.senderId === userId && r.receiverId === currentUser.uid)) {
        removeChatRequest(r.requestId);
      }
    });

    setChatRequests(prev => prev.filter(r => 
      !((r.senderId === currentUser.uid && r.receiverId === userId) ||
        (r.senderId === userId && r.receiverId === currentUser.uid))
    ));

    alert('You have unfriended this contact. You can no longer send or receive messages from each other.');
  };

  const handleRefriendUser = (userId: string) => {
    if (!currentUser) return;
    const currentUnfriended = currentUser.unfriendedUsers || [];
    
    // 1. Remove from current user's profile
    const updatedUnfriended = currentUnfriended.filter(id => id !== userId);
    handleUpdateProfile({ unfriendedUsers: updatedUnfriended });

    // 2. Delete all existing chat requests (sender or receiver) to make it a completely fresh state
    chatRequests.forEach(r => {
      if ((r.senderId === currentUser.uid && r.receiverId === userId) ||
          (r.senderId === userId && r.receiverId === currentUser.uid)) {
        removeChatRequest(r.requestId);
      }
    });

    // 3. Create and send a brand new chat request
    const newRequest: ChatRequest = {
      requestId: 'req_' + Date.now() + Math.floor(Math.random() * 1000),
      senderId: currentUser.uid,
      receiverId: userId,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    writeChatRequest(newRequest);
    setChatRequests(prev => [newRequest, ...prev.filter(r => 
      !((r.senderId === currentUser.uid && r.receiverId === userId) ||
        (r.senderId === userId && r.receiverId === currentUser.uid))
    )]);

    // --- REAL-TIME SIMULATE RE-FRIEND REQUEST APPROVALS FOR MOCK USERS ---
    const otherUser = users.find(u => u.uid === userId);
    if (otherUser && otherUser.uid.startsWith('mock_')) {
      setTimeout(() => {
        handleAcceptRequest(newRequest.requestId);
      }, 3500);
    }

    // Push a success toast notification
    const successNotif: NotificationItem = {
      id: 'notif_' + Date.now(),
      type: 'request_sent',
      senderName: otherUser ? otherUser.fullName : 'Contact',
      senderImage: otherUser ? (otherUser.profileImage || 'user_default') : 'user_default',
      messageText: 'Request Sent Successfully! Check the discover page to find more contacts.',
      createdAt: new Date().toISOString()
    };
    setActiveToasts(prev => [successNotif, ...prev.slice(0, 3)]);
  };

  const handleReportUser = (userId: string) => {
    if (!currentUser) return;
    
    // Update target user's reportedBy list in state
    setUsers(prev => prev.map(u => {
      if (u.uid === userId) {
        const currentReports = u.reportedBy || [];
        if (!currentReports.includes(currentUser.uid)) {
          return {
            ...u,
            reportedBy: [...currentReports, currentUser.uid]
          };
        }
      }
      return u;
    }));

    alert('Thank you. We have received your safety report regarding this user. Txtorspace trust and safety officers will inspect their chat history shortly.');
  };

  // --- GROUP CHATS OPERATIONS ---

  const handleCreateGroup = async (name: string, imageSeed: string, memberIds: string[]) => {
    if (!currentUser) return;

    const newGroupId = 'group_' + Date.now();
    const allMembers = [currentUser.uid, ...memberIds];

    const newGroupChat: Chat = {
      chatId: newGroupId,
      isGroup: true,
      members: allMembers,
      name,
      image: imageSeed,
      ownerId: currentUser.uid,
      admins: [currentUser.uid],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessage: `Group created by ${currentUser.fullName}`,
      lastMessageAt: new Date().toISOString(),
      lastMessageSenderId: currentUser.uid
    };

    const welcomeMsg: Message = {
      messageId: 'msg_g_create_' + Date.now(),
      senderId: currentUser.uid,
      text: `Welcome to the "${name}" group chat conversation!`,
      createdAt: new Date().toISOString()
    };

    try {
      await writeChat(newGroupChat);
      await writeMessage(newGroupId, welcomeMsg);
    } catch (err) {
      console.error("Failed creating group chat in Firestore:", err);
    }

    setChats(prev => [newGroupChat, ...prev]);
    setMessages(prev => ({
      ...prev,
      [newGroupId]: [welcomeMsg]
    }));

    setShowGroupCreation(false);
    setActiveChatId(newGroupId);
    setActiveView('chats');

    // Trigger individual push alerts for other members
    memberIds.forEach(mId => {
      const u = users.find(usr => usr.uid === mId);
      if (u) {
        triggerNotification(
          'added_to_group',
          name,
          imageSeed,
          `You were added to the "${name}" group chat.`
        );
      }
    });
  };

  const handleLeaveGroup = (groupId: string) => {
    if (!currentUser) return;

    const leaverName = currentUser.fullName;
    const sysMsgText = `${leaverName} left the group`;

    // 1. Update the chat's members list by removing currentUser.uid
    setChats(prev => prev.map(c => {
      if (c.chatId === groupId) {
        const nextMembers = c.members.filter(uid => uid !== currentUser.uid);
        const updated = {
          ...c,
          members: nextMembers,
          lastMessage: sysMsgText,
          lastMessageAt: new Date().toISOString(),
          lastMessageSenderId: currentUser.uid,
          updatedAt: new Date().toISOString()
        };
        writeChat(updated);
        return updated;
      }
      return c;
    }).filter(c => c.chatId !== groupId)); // remove from leaving user's view

    // 2. Post system message to the chat
    const sysMsg: Message = {
      messageId: 'msg_sys_' + Date.now() + Math.floor(Math.random() * 1000),
      senderId: currentUser.uid,
      text: sysMsgText,
      createdAt: new Date().toISOString(),
      isSystem: true
    };
    writeMessage(groupId, sysMsg);

    setMessages(prev => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []), sysMsg]
    }));

    if (activeChatId === groupId) {
      setActiveChatId(null);
    }
    alert('You have left the group.');
  };

  const handleAddGroupMember = (groupId: string, memberId: string) => {
    const u = users.find(usr => usr.uid === memberId);
    const adderName = currentUser?.fullName || 'User';
    const addedName = u?.fullName || 'a new member';
    const sysMsgText = `${adderName} added ${addedName}`;

    setChats(prev => prev.map(c => {
      if (c.chatId === groupId) {
        const nextMembers = [...c.members, memberId];
        const updated = {
          ...c,
          members: nextMembers,
          lastMessage: sysMsgText,
          lastMessageAt: new Date().toISOString(),
          lastMessageSenderId: currentUser?.uid || 'system',
          updatedAt: new Date().toISOString()
        };
        writeChat(updated);
        return updated;
      }
      return c;
    }));

    const sysMsg: Message = {
      messageId: 'msg_sys_' + Date.now() + Math.random().toString(36).substr(2, 4),
      senderId: currentUser?.uid || 'system',
      text: sysMsgText,
      createdAt: new Date().toISOString(),
      isSystem: true
    };
    writeMessage(groupId, sysMsg);
    setMessages(prev => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []), sysMsg]
    }));

    if (u) {
      triggerNotification(
        'added_to_group',
        addedName,
        u.profileImage,
        `${adderName} added ${addedName} to the group.`,
        groupId
      );
    }
  };

  const handleRemoveGroupMember = (groupId: string, memberId: string) => {
    const u = users.find(usr => usr.uid === memberId);
    const removerName = currentUser?.fullName || 'Admin';
    const removedName = u?.fullName || 'a member';
    const sysMsgText = `${removerName} removed ${removedName}`;

    setChats(prev => prev.map(c => {
      if (c.chatId === groupId) {
        const nextMembers = c.members.filter(id => id !== memberId);
        const nextAdmins = c.admins?.filter(id => id !== memberId);
        const updated = {
          ...c,
          members: nextMembers,
          admins: nextAdmins,
          lastMessage: sysMsgText,
          lastMessageAt: new Date().toISOString(),
          lastMessageSenderId: currentUser?.uid || 'system',
          updatedAt: new Date().toISOString()
        };
        writeChat(updated);
        return updated;
      }
      return c;
    }));

    const sysMsg: Message = {
      messageId: 'msg_sys_' + Date.now() + Math.random().toString(36).substr(2, 4),
      senderId: currentUser?.uid || 'system',
      text: sysMsgText,
      createdAt: new Date().toISOString(),
      isSystem: true
    };
    writeMessage(groupId, sysMsg);
    setMessages(prev => ({
      ...prev,
      [groupId]: [...(prev[groupId] || []), sysMsg]
    }));

    if (u) {
      triggerNotification(
        'removed_from_group',
        removedName,
        u.profileImage,
        `${removerName} removed ${removedName} from the group.`,
        groupId
      );
    }
  };

  const handlePromoteAdmin = (groupId: string, memberId: string) => {
    setChats(prev => prev.map(c => {
      if (c.chatId === groupId) {
        const currentAdmins = c.admins || [];
        if (!currentAdmins.includes(memberId)) {
          const updated = {
            ...c,
            admins: [...currentAdmins, memberId],
            updatedAt: new Date().toISOString()
          };
          writeChat(updated);
          return updated;
        }
      }
      return c;
    }));

    const u = users.find(usr => usr.uid === memberId);
    if (u) {
      triggerNotification(
        'promoted_admin',
        u.fullName,
        u.profileImage,
        `${u.fullName} was promoted to Group Administrator.`,
        groupId
      );
    }
  };

  // --- AUTOMATED INBOX RE-ENGAGEMENTS ---
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(() => {
      // Pick a random online contact to re-engage with a message simulation
      const myContacts = users.filter(u => u.uid.startsWith('mock_') && u.online);
      if (myContacts.length === 0) return;

      const randomContact = myContacts[Math.floor(Math.random() * myContacts.length)];
      
      // Find if we have an active chat with them
      const myChat = chats.find(c => !c.isGroup && c.members.includes(randomContact.uid));
      if (!myChat) return;

      // Simulate sending a small, friendly random message update
      const randomPrompt = [
        "Hey! Just looking at some new UI animations. Hope your code is building smoothly!",
        "Stunning sunset here today. Wish you could see this gradient!",
        "Remember to stand up and stretch if you're deep in a coding session!",
        "Listening to some deep focus track. Hit me up if you want the link!",
        "Quick question: are we sticking to Perfect Fourth scales for display typography?"
      ];

      const chosenText = randomPrompt[Math.floor(Math.random() * randomPrompt.length)];
      const chatId = myChat.chatId;

      // Set typing indicator in Firestore
      const chatToUpdate = chats.find(c => c.chatId === chatId);
      if (chatToUpdate) {
        writeChat({
          ...chatToUpdate,
          typing: {
            ...(chatToUpdate.typing || {}),
            [randomContact.uid]: true
          }
        });
      }

      setTimeout(() => {
        // Clear typing in Firestore
        const chatToClear = chats.find(c => c.chatId === chatId);
        if (chatToClear) {
          const updatedTyping = { ...(chatToClear.typing || {}) };
          delete updatedTyping[randomContact.uid];
          writeChat({
            ...chatToClear,
            typing: updatedTyping
          });
        }

        // Add message
        const mockMsg: Message = {
          messageId: 'msg_auto_' + Date.now(),
          senderId: randomContact.uid,
          text: chosenText,
          createdAt: new Date().toISOString()
        };

        setMessages(prev => {
          const chatMsgs = prev[chatId] || [];
          return { ...prev, [chatId]: [...chatMsgs, mockMsg] };
        });

        setChats(prev => prev.map(c => c.chatId === chatId ? {
          ...c,
          lastMessage: chosenText,
          lastMessageAt: mockMsg.createdAt,
          lastMessageSenderId: randomContact.uid,
          updatedAt: mockMsg.createdAt
        } : c));

        // Notification banner check
        const isMuted = myChat.muted?.[currentUser.uid] || false;
        if (!isMuted && (activeChatId !== chatId || activeView !== 'chats')) {
          triggerNotification(
            'new_message',
            randomContact.fullName,
            randomContact.profileImage,
            chosenText,
            chatId
          );
        }

      }, 2500);

    }, 55000); // trigger re-engagement occasionally (every 55 secs)

    return () => clearInterval(interval);
  }, [currentUser, chats, users, activeChatId, activeView]);


  // Floating bottom navigation bar visibility on scroll
  const [showFloatingNav, setShowFloatingNav] = useState(true);

  useEffect(() => {
    const handleHide = () => setShowFloatingNav(false);
    const handleShow = () => setShowFloatingNav(true);
    window.addEventListener('hide-bottom-nav', handleHide);
    window.addEventListener('show-bottom-nav', handleShow);

    // Global scroll gesture detection to hide/show navigation on ANY view
    let lastY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0].clientY;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (activeChatId) return; // Ignore inside active chats
      const currentY = e.touches[0].clientY;
      const diff = currentY - lastY;
      if (Math.abs(diff) > 12) {
        if (diff < 0) {
          setShowFloatingNav(false);
        } else {
          setShowFloatingNav(true);
        }
        lastY = currentY;
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (activeChatId) return; // Ignore inside active chats
      if (Math.abs(e.deltaY) > 8) {
        if (e.deltaY > 0) {
          setShowFloatingNav(false);
        } else {
          setShowFloatingNav(true);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('hide-bottom-nav', handleHide);
      window.removeEventListener('show-bottom-nav', handleShow);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [activeChatId]);


  // Calculate total unread count for badge
  const getTotalUnreadCount = (): number => {
    if (!currentUser) return 0;
    let sum = 0;
    chats.forEach(chat => {
      // Don't count muted chats or deleted chats
      const isMuted = chat.muted?.[currentUser.uid];
      const isDeleted = chat.deletedBy?.[currentUser.uid];
      if (isMuted || isDeleted) return;

      const chatMsgs = messages[chat.chatId] || [];
      const unread = chatMsgs.filter(m => m.senderId !== currentUser.uid && (!m.readBy || !m.readBy.includes(currentUser.uid))).length;
      sum += unread;
    });
    return sum;
  };

  const totalUnread = getTotalUnreadCount();
  const totalPendingRequests = chatRequests.filter(r => r.receiverId === currentUser?.uid && r.status === 'pending').length;

  const [lastViewedNotificationsAt, setLastViewedNotificationsAt] = useState<string>(() => {
    return safeStorage.getItem('lastViewedNotificationsAt') || new Date(0).toISOString();
  });

  useEffect(() => {
    if (activeView === 'notifications') {
      const nowStr = new Date().toISOString();
      setLastViewedNotificationsAt(nowStr);
      safeStorage.setItem('lastViewedNotificationsAt', nowStr);
    }
  }, [activeView]);

  const unreadNotificationsCount = notifications.filter(
    n => n.createdAt > lastViewedNotificationsAt
  ).length;

  const alertsBadgeCount = activeView === 'notifications' ? 0 : (unreadNotificationsCount + totalPendingRequests);

  // --- RENDERING MAIN APP LAYOUTS ---

  if (!currentUser) {
    const deeplinkUser = deeplinkUsername && users.length > 0
      ? users.find(u => u.usernameLower === deeplinkUsername.toLowerCase() || u.username.toLowerCase() === deeplinkUsername.toLowerCase())
      : null;

    const deeplinkGroup = deeplinkGroupId
      ? chats.find(c => c.chatId === deeplinkGroupId && c.isGroup) || {
          chatId: deeplinkGroupId,
          name: 'Group Conversation',
          isGroup: true,
          members: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          groupDescription: 'Join this group on Txtorspace to chat securely.',
          pinned: {},
          muted: {}
        }
      : null;

    return (
      <div className="h-screen w-screen relative bg-black">
        <AuthScreen 
          users={users} 
          onLogin={handleLogin} 
          onSignUp={handleSignUp} 
        />
        
        {/* Guest Group Preview overlay */}
        <AnimatePresence>
          {deeplinkGroup && (
            <GroupPreviewScreen
              group={deeplinkGroup}
              users={users}
              currentUser={null}
              onJoinGroup={() => {
                // Keep deeplinkGroupId so after auth user is joined directly
              }}
              onOpenAuth={() => {
                // Focus auth screen
              }}
              onClose={() => {
                setDeeplinkGroupId(null);
                window.history.replaceState({}, '', '/');
              }}
            />
          )}
        </AnimatePresence>

        {/* Guest Profile View overlay */}
        <AnimatePresence>
          {deeplinkUser && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-0 md:p-4"
              onClick={() => {
                setDeeplinkUsername(null);
                window.history.replaceState({}, '', '/');
              }}
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="w-full md:max-w-sm h-full md:h-[85vh] overflow-hidden md:rounded-3xl rounded-none shadow-2xl pointer-events-auto border border-[#262626]"
                onClick={(e) => e.stopPropagation()}
              >
                <ProfileView
                  user={deeplinkUser}
                  currentUser={null}
                  chats={[]}
                  chatRequests={[]}
                  onClose={() => {
                    setDeeplinkUsername(null);
                    window.history.replaceState({}, '', '/');
                  }}
                  onSendRequest={() => {}}
                  onAcceptRequest={() => {}}
                  onCancelRequest={() => {}}
                  onBlockUser={() => {}}
                  onUnblockUser={() => {}}
                  onReportUser={() => {}}
                  onSelectChat={() => {}}
                  onNavigateToView={() => {}}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Handle Deactivated Account State with 24-hour Reactivation Grace Period
  if (currentUser.accountStatus === 'deactivated') {
    return (
      <AccountDeactivatedScreen
        currentUser={currentUser}
        onReactivateAccount={async () => {
          const reactivatedUser: User = {
            ...currentUser,
            accountStatus: 'active',
            deactivatedAt: undefined,
            online: true,
            lastSeen: new Date().toISOString()
          };
          await writeUser(reactivatedUser);
          setCurrentUser(reactivatedUser);
          setUsers(prev => prev.map(u => u.uid === currentUser.uid ? reactivatedUser : u));
        }}
        onLogout={handleLogout}
      />
    );
  }

  // Handle 2FA Biometric / 4-Digit PIN App Lock Gate
  const hasSecurityEnabled = currentUser.securitySettings?.pinEnabled || currentUser.securitySettings?.biometricEnabled;
  if (hasSecurityEnabled && !isAppUnlocked) {
    return (
      <AppLockScreen
        currentUser={currentUser}
        onUnlock={() => setIsAppUnlocked(true)}
        onLogout={handleLogout}
      />
    );
  }

  // Find chat detailed object for chatroom rendering
  const activeChat = chats.find(c => c.chatId === activeChatId);
  const activeChatMessages = activeChatId ? (messages[activeChatId] || []) : [];

  return (
    <div className="fixed inset-0 w-screen h-full overflow-hidden flex flex-col md:flex-row bg-black text-white transition-colors duration-300">
      
      {/* Push notifications banners dispatcher */}
      <NotificationBanner 
        notifications={activeToasts} 
        onDismiss={handleDismissToast} 
        onSelectChat={(cId) => {
          handleSelectChat(cId);
          setActiveView('chats');
        }}
      />

      {/* Web Push Native Permission Prompt Modal / Banner */}
      <AnimatePresence>
        {showPushBanner && currentUser && (
          <WebPushPermissionBanner
            currentUser={currentUser}
            onPermissionGranted={(token) => {
              setShowPushBanner(false);
              sessionStorage.setItem('push_prompt_dismissed', 'true');
              if (token && currentUser) {
                const updated: User = {
                  ...currentUser,
                  fcmToken: token,
                  pushNotificationsEnabled: true
                };
                setCurrentUser(updated);
                writeUser(updated);
              }
            }}
            onDismissPrompt={() => {
              setShowPushBanner(false);
              sessionStorage.setItem('push_prompt_dismissed', 'true');
            }}
          />
        )}
      </AnimatePresence>

      {/* ================= DESKTOP/MOBILE PRIMARY SIDEBAR NAVIGATOR ================= */}
      <div className={`w-full md:w-80 flex-shrink-0 flex flex-col flex-1 h-0 md:h-full bg-black border-r border-[#262626] mb-[80px] md:mb-0 transition-all duration-300 ${
        activeChatId ? 'hidden md:flex' : 'flex'
      }`}>
        
        {/* Main List Area Router based on tab navigation */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            
            {/* View 1: Chats active list */}
            {activeView === 'chats' && !showGroupCreation && (
              <motion.div 
                key="view_chats"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full"
              >
                <ChatsList
                  chats={chats}
                  users={users}
                  messages={messages}
                  currentUser={currentUser}
                  activeChatId={activeChatId}
                  typingUsers={typingUsers}
                  stories={stories}
                  onOpenStory={() => setActiveView('stories')}
                  onSelectChat={handleSelectChat}
                  onPinChat={handlePinChat}
                  onMuteChat={handleMuteChat}
                  onDeleteChat={handleDeleteChat}
                  onOpenGroupCreation={() => setShowGroupCreation(true)}
                  onNavigateToSettings={() => setActiveView('settings')}
                  onToggleFavoriteChat={handleToggleFavoriteChat}
                  onBlockUserToggle={handleBlockUserToggle}
                  onViewContact={setViewedUserUid}
                  onNavigateToDiscover={() => setActiveView('requests')}
                />
              </motion.div>
            )}

            {/* Group creation modal layer */}
            {showGroupCreation && (
              <motion.div
                key="view_group_create"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className="h-full w-full"
              >
                <GroupChatCreation
                  users={users}
                  chats={chats}
                  currentUser={currentUser}
                  onClose={() => setShowGroupCreation(false)}
                  onCreateGroup={handleCreateGroup}
                />
              </motion.div>
            )}

            {/* View 2: Contact requests inbox & Discovery */}
            {activeView === 'requests' && (
              <motion.div 
                key="view_requests"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full"
              >
                <ChatRequestScreen
                  chatRequests={chatRequests}
                  users={users}
                  chats={chats}
                  currentUser={currentUser}
                  onAcceptRequest={handleAcceptRequest}
                  onDeclineRequest={handleDeclineRequest}
                  onCancelRequest={handleCancelRequest}
                  onViewUserProfile={setViewedUserUid}
                  onUpdateProfile={handleUpdateProfile}
                />
              </motion.div>
            )}

            {/* View 3: Spotify-inspired expiring 24h Stories */}
            {activeView === 'stories' && (
              <motion.div 
                key="view_stories"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full"
              >
                <StoriesView
                  stories={stories}
                  users={users}
                  currentUser={currentUser}
                  chats={chats}
                  chatRequests={chatRequests}
                  onAddStory={handleAddStory}
                  onLikeStory={handleLikeStory}
                  onReplyStory={handleReplyStory}
                  onViewStory={handleViewStory}
                  onOpenChat={handleSelectDirectChat}
                  onViewUserProfile={setViewedUserUid}
                />
              </motion.div>
            )}

            {/* View 4: System Alerts & Requests Status Notifications */}
            {activeView === 'notifications' && (
              <motion.div 
                key="view_notifications"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full"
              >
                <NotificationsScreen
                  notifications={notifications}
                  currentUser={currentUser}
                  chatRequests={chatRequests}
                  users={users}
                  onAcceptRequest={handleAcceptRequest}
                  onDeclineRequest={handleDeclineRequest}
                  onViewUserProfile={setViewedUserUid}
                  onSelectChat={(cId) => {
                    handleSelectChat(cId);
                    setActiveView('chats');
                  }}
                  onNavigateToTab={(tab) => {
                    if (tab === 'requests') setActiveView('requests');
                  }}
                />
              </motion.div>
            )}

            {/* View 4: Settings screen list */}
            {activeView === 'settings' && (
              <motion.div 
                key="view_settings"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full w-full"
              >
                <SettingsScreen
                  currentUser={currentUser}
                  users={users}
                  chats={chats}
                  theme={theme}
                  onUpdateProfile={handleUpdateProfile}
                  onLogout={handleLogout}
                  onDeleteAccount={handleDeleteAccount}
                  onToggleTheme={handleToggleTheme}
                  onUnblockUser={handleUnblockUser}
                  onViewContact={setViewedUserUid}
                />
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* BOTTOM NAV BAR: Translucent Glass Navigation (Desktop-only) */}
        <div className="glass-nav hidden md:flex items-center justify-around pt-2 pb-[max(8px,env(safe-area-inset-bottom,8px))] px-1 text-zinc-400 border-t border-zinc-200 dark:border-zinc-900 flex-shrink-0">
          
          <button
            onClick={() => { setActiveView('chats'); setShowGroupCreation(false); }}
            className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all relative ${
              activeView === 'chats' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5.5 h-5.5" />
              {totalUnread > 0 && (
                <span className="absolute -top-1 -right-2 bg-[#1DB954] text-black font-bold text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 border border-white dark:border-zinc-950">
                  {totalUnread}
                </span>
              )}
            </div>
            <span className="text-[9px] font-semibold tracking-wide">Chats</span>
          </button>

          <button
            onClick={() => setActiveView('requests')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
              activeView === 'requests' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
            }`}
          >
            <div className="relative">
              <UserPlus className="w-5.5 h-5.5" />
              {totalPendingRequests > 0 && (
                <span className="absolute -top-1 -right-2 bg-orange-500 text-white font-bold text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 border border-white dark:border-zinc-950 animate-bounce">
                  {totalPendingRequests}
                </span>
              )}
            </div>
            <span className="text-[9px] font-semibold tracking-wide">Discover</span>
          </button>

          <button
            onClick={() => setActiveView('stories')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
              activeView === 'stories' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-5.5 h-5.5" />
            <span className="text-[9px] font-semibold tracking-wide">Stories</span>
          </button>

          <button
            onClick={() => setActiveView('notifications')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
              activeView === 'notifications' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
            }`}
          >
            <div className="relative">
              <Bell className="w-5.5 h-5.5" />
              {alertsBadgeCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-500 text-white font-bold text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 border border-white dark:border-zinc-950">
                  {alertsBadgeCount}
                </span>
              )}
            </div>
            <span className="text-[9px] font-semibold tracking-wide">Alerts</span>
          </button>

          <button
            onClick={() => setActiveView('settings')}
            className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
              activeView === 'settings' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
            }`}
          >
            <Settings className="w-5.5 h-5.5" />
            <span className="text-[9px] font-semibold tracking-wide">Settings</span>
          </button>

        </div>
      </div>

      {/* ================= DESKTOP/MOBILE SECONDARY CHATROOM WINDOW ================= */}
      <div className={`flex-1 flex flex-col flex-1 h-0 md:h-full bg-[#111111] relative mb-0 transition-all duration-300 ${
        activeChatId ? 'flex' : 'hidden md:flex'
      }`}>
        {activeChat ? (
          <ChatRoom
            chat={activeChat}
            messages={activeChatMessages}
            users={users}
            chats={chats}
            currentUser={currentUser}
            stories={stories}
            chatRequests={chatRequests}
            onOpenStory={() => setActiveView('stories')}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onLeaveGroup={handleLeaveGroup}
            onAddGroupMember={handleAddGroupMember}
            onRemoveGroupMember={handleRemoveGroupMember}
            onPromoteAdmin={handlePromoteAdmin}
            onCloseChat={() => setActiveChatId(null)}
            typingUsers={typingUsers[activeChat.chatId] || {}}
            onForwardMessage={handleForwardMessage}
            onUpdateGroupPermissions={handleUpdateGroupPermissions}
            onUpdateGroupDetails={handleUpdateGroupDetails}
            onBlockUser={handleBlockUser}
            onUnblockUser={handleUnblockUser}
            onUnfriendUser={handleUnfriendUser}
            onRefriendUser={handleRefriendUser}
            onReportUser={handleReportUser}
            onViewContact={setViewedUserUid}
            onOpenDirectChat={handleSelectDirectChat}
            onMuteChat={handleMuteChat}
            onTyping={handleTyping}
            onToggleReaction={handleToggleReaction}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#111111] transition-colors duration-300">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="max-w-xs flex flex-col items-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-[#1C1C1E] shadow-sm flex items-center justify-center mb-4 border border-[#262626]">
                <MessageSquare className="w-7 h-7 text-blue-500" />
              </div>
              <h2 className="text-base font-bold text-white">Txtorspace Messaging App</h2>
              <p className="text-xs text-[#8E8E93] mt-1.5 leading-relaxed">
                Connect with contacts, create collaborative group chats, and discover profiles securely. Select an active chat to get started!
              </p>
            </motion.div>
          </div>
        )}
      </div>

      {/* ================= SEAMLESS MODAL PROFILE OVERLAYS ================= */}
      <AnimatePresence>
        {viewedUserUid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-0 md:p-4"
            onClick={() => setViewedUserUid(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full md:max-w-sm h-full md:h-[85vh] overflow-hidden md:rounded-3xl rounded-none shadow-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const viewedUser = users.find(u => u.uid === viewedUserUid);
                if (!viewedUser) return null;

                return (
                  <ProfileView
                    user={viewedUser}
                    currentUser={currentUser}
                    chats={chats}
                    chatRequests={chatRequests}
                    onClose={() => setViewedUserUid(null)}
                    onSendRequest={handleSendRequest}
                    onAcceptRequest={handleAcceptRequest}
                    onCancelRequest={handleCancelRequest}
                    onBlockUser={handleBlockUser}
                    onUnblockUser={handleUnblockUser}
                    onReportUser={handleReportUser}
                    onSelectChat={handleSelectChat}
                    onNavigateToView={setActiveView}
                    onUnfriendUser={handleUnfriendUser}
                    onRefriendUser={handleRefriendUser}
                  />
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logged-in Group Preview/Join overlay */}
      <AnimatePresence>
        {currentUser && deeplinkGroupId && (
          (() => {
            const groupToPreview = chats.find(c => c.chatId === deeplinkGroupId && c.isGroup) || {
              chatId: deeplinkGroupId,
              name: 'Group Conversation',
              isGroup: true,
              members: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              groupDescription: 'Join this group on Txtorspace to chat securely.',
              pinned: {},
              muted: {}
            };
            return (
              <GroupPreviewScreen
                group={groupToPreview}
                users={users}
                currentUser={currentUser}
                onJoinGroup={() => {
                  handleJoinGroupViaLink(deeplinkGroupId);
                }}
                onOpenAuth={() => {}}
                onClose={() => {
                  setDeeplinkGroupId(null);
                  window.history.replaceState({}, '', '/');
                }}
              />
            );
          })()
        )}
      </AnimatePresence>

      {/* GLOBAL BOTTOM NAV BAR: Always accessible on mobile viewports */}
      {(() => {
        const isNavVisible = !activeChatId && showFloatingNav;
        return (
          <div className={`glass-nav fixed bottom-4 left-4 right-4 mx-auto max-w-md h-[64px] flex md:hidden items-center justify-around px-1 text-zinc-400 border border-zinc-800 rounded-2xl bg-black/85 backdrop-blur-md z-40 shadow-2xl transition-all duration-300 ${
            isNavVisible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
          }`}>
            
            <button
              onClick={() => { setActiveView('chats'); setActiveChatId(null); setShowGroupCreation(false); }}
              className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all relative ${
                activeView === 'chats' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              <div className="relative">
                <MessageSquare className="w-5.5 h-5.5" />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-2 bg-[#1DB954] text-black font-bold text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 border border-white dark:border-zinc-950">
                    {totalUnread}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-semibold tracking-wide">Chats</span>
            </button>

            <button
              onClick={() => { setActiveView('requests'); setActiveChatId(null); }}
              className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
                activeView === 'requests' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              <div className="relative">
                <UserPlus className="w-5.5 h-5.5" />
                {totalPendingRequests > 0 && (
                  <span className="absolute -top-1 -right-2 bg-orange-500 text-white font-bold text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 border border-white dark:border-zinc-950 animate-bounce">
                    {totalPendingRequests}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-semibold tracking-wide">Discover</span>
            </button>

            <button
              onClick={() => { setActiveView('stories'); setActiveChatId(null); }}
              className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
                activeView === 'stories' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              <BookOpen className="w-5.5 h-5.5" />
              <span className="text-[9px] font-semibold tracking-wide">Stories</span>
            </button>

            <button
              onClick={() => { setActiveView('notifications'); setActiveChatId(null); }}
              className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
                activeView === 'notifications' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              <div className="relative">
                <Bell className="w-5.5 h-5.5" />
                {alertsBadgeCount > 0 && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white font-bold text-[9px] min-w-4 h-4 rounded-full flex items-center justify-center px-1 border border-white dark:border-zinc-950">
                    {alertsBadgeCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-semibold tracking-wide">Alerts</span>
            </button>

            <button
              onClick={() => { setActiveView('settings'); setActiveChatId(null); }}
              className={`flex flex-col items-center gap-0.5 cursor-pointer flex-1 py-1 transition-all ${
                activeView === 'settings' ? 'text-[#1DB954]' : 'hover:text-zinc-600 dark:hover:text-zinc-200'
              }`}
            >
              <Settings className="w-5.5 h-5.5" />
              <span className="text-[9px] font-semibold tracking-wide">Settings</span>
            </button>

          </div>
        );
      })()}

    </div>
  );
}
