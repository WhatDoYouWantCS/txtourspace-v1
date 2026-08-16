import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { safeStorage } from './safeStorage';
import { saveMessageLocal, saveMessagesLocal, getMessagesLocal, getLocalLastSyncedTimestamp, saveLocalLastSyncedTimestamp } from './localDb';
import { User, Chat, ChatRequest, Message, Story, NotificationItem } from '../types';

// Helper to strip any undefined values from objects recursively before writing to Firestore
function cleanData<T>(data: T): T {
  if (data === undefined) return undefined as any;
  if (data === null) return null as any;
  try {
    const str = JSON.stringify(data);
    if (str === undefined || str === 'undefined') return undefined as any;
    return JSON.parse(str) as T;
  } catch (err) {
    console.error("Error in cleanData parsing:", err);
    return data;
  }
}

// ============================================================================
// CACHING AND WRITE DEDUPLICATION SYSTEM
// ============================================================================
// Caches stringified payloads of last written/synced documents to avoid redundant writes.
const lastWrittenCache: Record<string, string> = {};

// Specialized throttling for user presence/heartbeat updates
const lastUserWriteTime: Record<string, { timestamp: number; online: boolean }> = {};

/**
 * Checks whether we should skip writing a document to Firestore to avoid too many writes.
 * If the exact same document data is already in Firestore (by checking lastWrittenCache), or
 * if it's a heartbeat/presence update for an online user within the last 60 seconds, it returns true.
 */
function shouldSkipWrite(key: string, data: any): boolean {
  const cleaned = cleanData(data);
  const dataStr = JSON.stringify(cleaned);

  // Throttler for User presence updates
  if (key.startsWith('users:')) {
    const user = data as User;
    const prev = lastUserWriteTime[key];
    const now = Date.now();
    
    // If the user's online status was already written as true, and they are still online,
    // we only update their lastSeen heartbeat to Firestore every 60 seconds.
    if (prev && prev.online === user.online && user.online) {
      if (now - prev.timestamp < 60000) {
        return true;
      }
    }
    // Track last write time and status
    lastUserWriteTime[key] = { timestamp: now, online: user.online };
  }

  // Deduplicate writes with matching stringified payload
  if (lastWrittenCache[key] === dataStr) {
    return true;
  }
  
  lastWrittenCache[key] = dataStr;
  return false;
}

// Write User to Firestore & reserve username
export async function writeUser(user: User): Promise<void> {
  const path = `users/${user.uid}`;
  const key = `users:${user.uid}`;
  
  if (shouldSkipWrite(key, user)) {
    return; // Skipped redundant write
  }

  try {
    await setDoc(doc(db, 'users', user.uid), cleanData(user));
    
    // Also reserve the normalized username for quick direct O(1) lookups
    const uname = (user.usernameLower || user.username || '').trim().toLowerCase();
    if (uname) {
      try {
        await setDoc(doc(db, 'usernames', uname), { 
          uid: user.uid,
          username: uname,
          updatedAt: new Date().toISOString()
        });
      } catch (reserveErr) {
        console.warn("Could not write username reservation:", reserveErr);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Robust, multi-layered check to see if a username is already taken in Firebase Firestore.
 * Checks /usernames/{username} doc, query on users collection (usernameLower & username),
 * and local cache.
 */
export async function isUsernameTakenInFirebase(username: string, localUsersList: User[] = []): Promise<boolean> {
  const trimmed = username.trim().toLowerCase();
  if (!trimmed || trimmed.length < 3) return false;

  // 1. First check local in-memory users list if provided
  if (localUsersList.some(u => (u.usernameLower || u.username || '').trim().toLowerCase() === trimmed)) {
    return true;
  }

  // 2. Check local storage cache
  try {
    const cachedUsers = safeStorage.getItem('chat_app_users_cache');
    if (cachedUsers) {
      const parsed: User[] = JSON.parse(cachedUsers);
      if (parsed.some(u => (u.usernameLower || u.username || '').trim().toLowerCase() === trimmed)) {
        return true;
      }
    }
  } catch (e) {
    // Ignore cache parse error
  }

  // 3. Query Firebase Firestore
  try {
    // A. Check direct usernames collection document
    const usernameDoc = await getDoc(doc(db, 'usernames', trimmed));
    if (usernameDoc.exists()) {
      return true;
    }

    // B. Query users collection where usernameLower == trimmed
    const qLower = query(collection(db, 'users'), where('usernameLower', '==', trimmed));
    const snapLower = await getDocs(qLower);
    if (!snapLower.empty) {
      return true;
    }

    // C. Query users collection where username == trimmed (in case user was stored with standard username)
    const qExact = query(collection(db, 'users'), where('username', '==', trimmed));
    const snapExact = await getDocs(qExact);
    if (!snapExact.empty) {
      return true;
    }

    return false;
  } catch (err) {
    console.warn("Error verifying username in Firebase Firestore:", err);
    // Fallback to local users list
    return localUsersList.some(u => (u.usernameLower || u.username || '').trim().toLowerCase() === trimmed);
  }
}

// Write Chat metadata
export async function writeChat(chat: Chat): Promise<void> {
  const path = `chats/${chat.chatId}`;
  const key = `chats:${chat.chatId}`;

  if (shouldSkipWrite(key, chat)) {
    return;
  }

  try {
    await setDoc(doc(db, 'chats', chat.chatId), cleanData(chat));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Write Message within a Chat subcollection
export async function writeMessage(chatId: string, message: Message): Promise<void> {
  const path = `chats/${chatId}/messages/${message.messageId}`;
  const key = `chats:${chatId}:messages:${message.messageId}`;

  // Save to local IndexedDB immediately for instant offline-first rendering
  try {
    await saveMessageLocal(chatId, message);
  } catch (err) {
    console.warn('[writeMessage] Failed to save message locally:', err);
  }

  if (shouldSkipWrite(key, message)) {
    return;
  }

  try {
    await setDoc(doc(db, 'chats', chatId, 'messages', message.messageId), cleanData(message));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Write Chat Request
export async function writeChatRequest(request: ChatRequest): Promise<void> {
  const path = `chatRequests/${request.requestId}`;
  const key = `chatRequests:${request.requestId}`;

  if (shouldSkipWrite(key, request)) {
    return;
  }

  try {
    await setDoc(doc(db, 'chatRequests', request.requestId), cleanData(request));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Delete Chat Request
export async function removeChatRequest(requestId: string): Promise<void> {
  const path = `chatRequests/${requestId}`;
  const key = `chatRequests:${requestId}`;
  
  // Clear from write cache
  delete lastWrittenCache[key];

  try {
    await deleteDoc(doc(db, 'chatRequests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Write Story
export async function writeStory(story: Story): Promise<void> {
  const path = `stories/${story.storyId}`;
  const key = `stories:${story.storyId}`;

  if (shouldSkipWrite(key, story)) {
    return;
  }

  try {
    await setDoc(doc(db, 'stories', story.storyId), cleanData(story));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ============================================================================
// SHARED REAL-TIME LISTENER MULTIPLEXER (PREVENTS REDUNDANT FIRESTORE READS)
// ============================================================================
class ListenerMultiplexer {
  private activeListeners = new Map<string, {
    unsubscribe: () => void;
    callbacks: Set<(data: any) => void>;
    lastData: any;
  }>();

  subscribe<T>(
    key: string,
    startListener: (callback: (data: T) => void) => () => void,
    onUpdate: (data: T) => void,
    cacheKey?: string
  ): () => void {
    // 1. Immediately emit from localStorage cache if available (SWR)
    let initialCachedData: any = undefined;
    if (cacheKey) {
      try {
        const cached = safeStorage.getItem(cacheKey);
        if (cached && cached !== 'undefined' && cached !== 'null') {
          initialCachedData = JSON.parse(cached);
          onUpdate(initialCachedData);
        }
      } catch (e) {
        console.warn("Failed to load local storage cache for key:", cacheKey, e);
      }
    }

    // 2. If a listener already exists for this query, register the callback and emit latest data immediately
    const existing = this.activeListeners.get(key);
    if (existing) {
      existing.callbacks.add(onUpdate);
      if (existing.lastData !== undefined) {
        onUpdate(existing.lastData);
      } else if (initialCachedData !== undefined) {
        onUpdate(initialCachedData);
      }
      return () => {
        existing.callbacks.delete(onUpdate);
        if (existing.callbacks.size === 0) {
          existing.unsubscribe();
          this.activeListeners.delete(key);
        }
      };
    }

    // 3. Otherwise, spin up the single unified Firestore snapshot listener
    const callbacks = new Set<(data: T) => void>([onUpdate]);
    let lastData: T | undefined = initialCachedData;

    const unsub = startListener((data: T) => {
      // Only emit/trigger cache updates if the server snapshot has actual changes compared to current local state
      if (lastData !== undefined) {
        const newPayload = JSON.stringify(cleanData(data));
        const oldPayload = JSON.stringify(cleanData(lastData));
        
        if (newPayload === oldPayload) {
          return; // Bypassed state update because server data matches local cache exactly
        }
      }

      lastData = data;
      // Update local storage cache
      if (cacheKey) {
        try {
          safeStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (e) {
          console.warn("Failed to save local storage cache for key:", cacheKey, e);
        }
      }
      // Broadcast data to all registered subscriber callbacks
      const current = this.activeListeners.get(key);
      if (current) {
        current.lastData = data;
        current.callbacks.forEach((cb) => {
          try {
            cb(data);
          } catch (err) {
            console.error("Error in multicasted subscription callback:", err);
          }
        });
      }
    });

    this.activeListeners.set(key, {
      unsubscribe: unsub,
      callbacks,
      lastData
    });

    return () => {
      const current = this.activeListeners.get(key);
      if (current) {
        current.callbacks.delete(onUpdate);
        if (current.callbacks.size === 0) {
          current.unsubscribe();
          this.activeListeners.delete(key);
        }
      }
    };
  }
}

const multiplexer = new ListenerMultiplexer();

// Sync Users list (Multicasted & SWR Cached)
export function syncUsers(onUpdate: (users: User[]) => void) {
  const queryKey = 'users';
  const cacheKey = 'chat_app_users_cache';

  return multiplexer.subscribe<User[]>(
    queryKey,
    (emit) => {
      const path = 'users';
      return onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const usersList: User[] = [];
          snapshot.forEach((d) => {
            const user = d.data() as User;
            usersList.push(user);
            // Feed to write deduplicator cache so we don't overwrite if they match exactly
            lastWrittenCache[`users:${user.uid}`] = JSON.stringify(cleanData(user));
          });
          emit(usersList);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
    },
    onUpdate,
    cacheKey
  );
}

// Sync Chats belonging to current user (Multicasted & SWR Cached)
export function syncChats(currentUserUid: string, onUpdate: (chats: Chat[]) => void) {
  const queryKey = `chats:${currentUserUid}`;
  const cacheKey = `chat_app_chats_cache:${currentUserUid}`;

  return multiplexer.subscribe<Chat[]>(
    queryKey,
    (emit) => {
      const path = 'chats';
      const q = query(
        collection(db, 'chats'),
        where('members', 'array-contains', currentUserUid)
      );
      return onSnapshot(
        q,
        (snapshot) => {
          const chatsList: Chat[] = [];
          snapshot.forEach((d) => {
            const chat = d.data() as Chat;
            chatsList.push(chat);
            // Feed to write deduplicator cache
            lastWrittenCache[`chats:${chat.chatId}`] = JSON.stringify(cleanData(chat));
          });
          // Sort chats by updatedAt descending
          chatsList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          emit(chatsList);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
    },
    onUpdate,
    cacheKey
  );
}

// Sync Chat Requests (Both sent and received - Multicasted & SWR Cached)
export function syncChatRequests(
  currentUserUid: string, 
  onUpdate: (reqs: ChatRequest[]) => void
) {
  const queryKey = `chatRequests:${currentUserUid}`;
  const cacheKey = `chat_app_chatRequests_cache:${currentUserUid}`;

  return multiplexer.subscribe<ChatRequest[]>(
    queryKey,
    (emit) => {
      const path = 'chatRequests';
      const qSent = query(collection(db, 'chatRequests'), where('senderId', '==', currentUserUid));
      const qRecv = query(collection(db, 'chatRequests'), where('receiverId', '==', currentUserUid));

      let sentReqs: ChatRequest[] = [];
      let recvReqs: ChatRequest[] = [];

      const updateCombined = () => {
        const combined = [...sentReqs, ...recvReqs];
        // Deduplicate by requestId
        const unique = Array.from(new Map(combined.map(r => [r.requestId, r])).values());
        // Sort by createdAt descending
        unique.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        // Feed to write cache
        unique.forEach(req => {
          lastWrittenCache[`chatRequests:${req.requestId}`] = JSON.stringify(cleanData(req));
        });

        emit(unique);
      };

      const unsubSent = onSnapshot(
        qSent,
        (snapshot) => {
          sentReqs = [];
          snapshot.forEach((d) => {
            sentReqs.push(d.data() as ChatRequest);
          });
          updateCombined();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );

      const unsubRecv = onSnapshot(
        qRecv,
        (snapshot) => {
          recvReqs = [];
          snapshot.forEach((d) => {
            recvReqs.push(d.data() as ChatRequest);
          });
          updateCombined();
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );

      return () => {
        unsubSent();
        unsubRecv();
      };
    },
    onUpdate,
    cacheKey
  );
}

// Sync Messages with local-first delta updates
export function syncMessages(chatId: string, onUpdate: (msgs: Message[]) => void) {
  let active = true;
  let unsubscribeFirebase: (() => void) | null = null;

  // 1. Instantly load from IndexedDB local storage for immediate UI render & offline availability
  getMessagesLocal(chatId).then(async (localMsgs) => {
    if (!active) return;
    
    // Send whatever we have in local storage to UI immediately
    onUpdate(localMsgs);

    // 2. Determine last synced timestamp (the createdAt of the latest message, or the metadata record)
    let lastSynced = '1970-01-01T00:00:00.000Z';
    if (localMsgs.length > 0) {
      lastSynced = localMsgs[localMsgs.length - 1].createdAt;
    }
    const metaTimestamp = await getLocalLastSyncedTimestamp(chatId);
    if (new Date(metaTimestamp).getTime() > new Date(lastSynced).getTime()) {
      lastSynced = metaTimestamp;
    }

    // 3. Set up lightweight delta listener: fetch only where timestamp > lastSynced
    const path = `chats/${chatId}/messages`;
    const q = query(
      collection(db, 'chats', chatId, 'messages'), 
      where('createdAt', '>', lastSynced),
      orderBy('createdAt', 'asc')
    );

    unsubscribeFirebase = onSnapshot(
      q,
      async (snapshot) => {
        if (!active) return;
        
        if (snapshot.empty) return;

        const newMsgs: Message[] = [];
        snapshot.forEach((d) => {
          const msg = d.data() as Message;
          newMsgs.push(msg);
        });

        if (newMsgs.length > 0) {
          // A. Save incoming delta messages to local IndexedDB
          await saveMessagesLocal(chatId, newMsgs);

          // B. Update last synced timestamp metadata to the newest message's timestamp
          const newestTimestamp = newMsgs[newMsgs.length - 1].createdAt;
          await saveLocalLastSyncedTimestamp(chatId, newestTimestamp);

          // C. Query full list from local IndexedDB and emit to UI
          const fullyMergedMsgs = await getMessagesLocal(chatId);
          onUpdate(fullyMergedMsgs);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
  }).catch(err => {
    console.error('[syncMessages] Error loading local messages:', err);
  });

  return () => {
    active = false;
    if (unsubscribeFirebase) {
      unsubscribeFirebase();
    }
  };
}

// Sync Stories (Multicasted & SWR Cached)
export function syncStories(onUpdate: (stories: Story[]) => void) {
  const queryKey = 'stories';
  const cacheKey = 'chat_app_stories_cache';

  return multiplexer.subscribe<Story[]>(
    queryKey,
    (emit) => {
      const path = 'stories';
      const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
      return onSnapshot(
        q,
        (snapshot) => {
          const storiesList: Story[] = [];
          snapshot.forEach((d) => {
            const story = d.data() as Story;
            storiesList.push(story);
            // Feed to write cache
            lastWrittenCache[`stories:${story.storyId}`] = JSON.stringify(cleanData(story));
          });
          emit(storiesList);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
    },
    onUpdate,
    cacheKey
  );
}

// Write Notification for a specific user
export async function writeNotification(userId: string, notification: NotificationItem): Promise<void> {
  const path = `users/${userId}/notifications/${notification.id}`;
  const key = `users:${userId}:notifications:${notification.id}`;

  const payload = {
    ...notification,
    userId,
    recipientId: userId
  };

  if (shouldSkipWrite(key, payload)) {
    return;
  }

  try {
    await setDoc(doc(db, 'users', userId, 'notifications', notification.id), cleanData(payload));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Remove single notification
export async function removeNotification(userId: string, notificationId: string): Promise<void> {
  const path = `users/${userId}/notifications/${notificationId}`;
  const key = `users:${userId}:notifications:${notificationId}`;
  delete lastWrittenCache[key];

  try {
    await deleteDoc(doc(db, 'users', userId, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Sync Notifications for a user (Multicasted & SWR Cached)
export function syncNotifications(userId: string, onUpdate: (notifs: NotificationItem[]) => void) {
  const queryKey = `notifications:${userId}`;
  const cacheKey = `chat_app_notifications_cache:${userId}`;

  return multiplexer.subscribe<NotificationItem[]>(
    queryKey,
    (emit) => {
      const path = `users/${userId}/notifications`;
      const q = query(collection(db, 'users', userId, 'notifications'), orderBy('createdAt', 'desc'));
      return onSnapshot(
        q,
        (snapshot) => {
          const list: NotificationItem[] = [];
          snapshot.forEach((d) => {
            const item = d.data() as NotificationItem;
            list.push(item);
            lastWrittenCache[`users:${userId}:notifications:${item.id}`] = JSON.stringify(cleanData(item));
          });
          emit(list);
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, path);
        }
      );
    },
    onUpdate,
    cacheKey
  );
}

