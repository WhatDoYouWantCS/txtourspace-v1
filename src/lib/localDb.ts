import { Message } from '../types';

const DB_NAME = 'txtorspace_local_db';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const METADATA_STORE = 'metadata';

let dbInstance: IDBDatabase | null = null;
let isIDBSupported: boolean | null = null;

// In-memory fallbacks when IndexedDB is blocked or throws QuotaExceeded / SecurityError
const memoryMessageCache: Record<string, Message[]> = {};
const memoryMetadataCache: Record<string, string> = {};

export function isIndexedDBSupported(): boolean {
  if (isIDBSupported !== null) return isIDBSupported;
  try {
    if (typeof window === 'undefined' || !window.indexedDB) {
      isIDBSupported = false;
      return false;
    }
    isIDBSupported = true;
    return true;
  } catch (e) {
    isIDBSupported = false;
    return false;
  }
}

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  if (!isIndexedDBSupported()) {
    return Promise.reject(new Error('IndexedDB not supported or blocked'));
  }

  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
            const msgStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'messageId' });
            msgStore.createIndex('chatId', 'chatId', { unique: false });
            msgStore.createIndex('chatId_createdAt', ['chatId', 'createdAt'], { unique: false });
          }
          if (!db.objectStoreNames.contains(METADATA_STORE)) {
            db.createObjectStore(METADATA_STORE);
          }
        } catch (e) {
          reject(e);
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onerror = () => {
        console.warn('[localDb] Failed to open IndexedDB, falling back to in-memory:', request.error);
        isIDBSupported = false;
        reject(request.error || new Error('Failed to open database'));
      };
    } catch (err) {
      console.warn('[localDb] Synchronous error opening IndexedDB, falling back to in-memory:', err);
      isIDBSupported = false;
      reject(err);
    }
  });
}

export async function saveMessageLocal(chatId: string, message: Message): Promise<void> {
  if (!isIndexedDBSupported()) {
    saveMessageToMemory(chatId, message);
    return Promise.resolve();
  }

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(MESSAGES_STORE, 'readwrite');
        const store = tx.objectStore(MESSAGES_STORE);
        const record = { ...message, chatId };
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn('[localDb] saveMessageLocal error, saving to memory fallback:', err);
    saveMessageToMemory(chatId, message);
    return Promise.resolve();
  }
}

export async function saveMessagesLocal(chatId: string, messages: Message[]): Promise<void> {
  if (messages.length === 0) return Promise.resolve();

  if (!isIndexedDBSupported()) {
    messages.forEach(msg => saveMessageToMemory(chatId, msg));
    return Promise.resolve();
  }

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(MESSAGES_STORE, 'readwrite');
        const store = tx.objectStore(MESSAGES_STORE);
        
        let errorOccurred = false;
        messages.forEach((msg) => {
          try {
            const record = { ...msg, chatId };
            const req = store.put(record);
            req.onerror = () => {
              errorOccurred = true;
            };
          } catch (e) {
            errorOccurred = true;
          }
        });

        tx.oncomplete = () => {
          if (errorOccurred) {
            reject(new Error('Some messages failed to save to local database'));
          } else {
            resolve();
          }
        };

        tx.onerror = () => {
          reject(tx.error);
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn('[localDb] saveMessagesLocal error, saving to memory fallback:', err);
    messages.forEach(msg => saveMessageToMemory(chatId, msg));
    return Promise.resolve();
  }
}

export async function getMessagesLocal(chatId: string): Promise<Message[]> {
  if (!isIndexedDBSupported()) {
    return Promise.resolve(memoryMessageCache[chatId] || []);
  }

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(MESSAGES_STORE, 'readonly');
        const store = tx.objectStore(MESSAGES_STORE);
        const index = store.index('chatId');
        const request = index.getAll(IDBKeyRange.only(chatId));

        request.onsuccess = () => {
          const records = request.result as (Message & { chatId: string })[];
          // Map back to Message[] type (stripping or keeping chatId doesn't break Message interface)
          const msgs: Message[] = records.map(({ chatId: _, ...msg }) => msg as Message);
          msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          resolve(msgs);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn('[localDb] getMessagesLocal error, loading from memory fallback:', err);
    return Promise.resolve(memoryMessageCache[chatId] || []);
  }
}

export async function getLocalLastSyncedTimestamp(chatId: string): Promise<string> {
  if (!isIndexedDBSupported()) {
    return Promise.resolve(memoryMetadataCache[`last_synced:${chatId}`] || '1970-01-01T00:00:00.000Z');
  }

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(METADATA_STORE, 'readonly');
        const store = tx.objectStore(METADATA_STORE);
        const request = store.get(`last_synced:${chatId}`);

        request.onsuccess = () => {
          resolve(request.result || '1970-01-01T00:00:00.000Z');
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn('[localDb] getLocalLastSyncedTimestamp error, returning memory fallback:', err);
    return Promise.resolve(memoryMetadataCache[`last_synced:${chatId}`] || '1970-01-01T00:00:00.000Z');
  }
}

export async function saveLocalLastSyncedTimestamp(chatId: string, timestamp: string): Promise<void> {
  if (!isIndexedDBSupported()) {
    memoryMetadataCache[`last_synced:${chatId}`] = timestamp;
    return Promise.resolve();
  }

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(METADATA_STORE, 'readwrite');
        const store = tx.objectStore(METADATA_STORE);
        const request = store.put(timestamp, `last_synced:${chatId}`);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      } catch (txErr) {
        reject(txErr);
      }
    });
  } catch (err) {
    console.warn('[localDb] saveLocalLastSyncedTimestamp error, saving to memory:', err);
    memoryMetadataCache[`last_synced:${chatId}`] = timestamp;
    return Promise.resolve();
  }
}

// Helper to update memory cache list
function saveMessageToMemory(chatId: string, message: Message) {
  if (!memoryMessageCache[chatId]) {
    memoryMessageCache[chatId] = [];
  }
  const list = memoryMessageCache[chatId];
  const index = list.findIndex(m => m.messageId === message.messageId);
  if (index > -1) {
    list[index] = message;
  } else {
    list.push(message);
  }
  list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
