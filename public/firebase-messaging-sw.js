// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyAATBt1WE6CDeSVpg7R3pnXRfuggPyY8X4",
  authDomain: "txtorspace.firebaseapp.com",
  projectId: "txtorspace",
  storageBucket: "txtorspace.firebasestorage.app",
  messagingSenderId: "673080519612",
  appId: "1:673080519612:web:f28fc7c92336fa185019b9"
});

const messaging = firebase.messaging();

// PWA Offline Caching
const CACHE_NAME = 'txtorspace-pwa-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Do not intercept external API calls or Firebase Messaging endpoints
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('fcm') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // Fallback for document requests when offline
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || payload.data?.title || 'Txtorspace Alert';
  const notificationBody = payload.notification?.body || payload.data?.body || 'You received a new message or alert.';
  const icon = payload.notification?.icon || payload.data?.icon || '/favicon.ico';
  const tag = payload.data?.chatId ? `chat_${payload.data.chatId}` : (payload.data?.tag || 'txtorspace-notification');

  const notificationOptions = {
    body: notificationBody,
    icon: icon,
    badge: '/favicon.ico',
    tag: tag,
    renotify: true,
    data: payload.data || {},
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Custom push event listener fallback
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.notification?.title || data.title || 'Txtorspace Alert';
    const body = data.notification?.body || data.body || 'New activity in Txtorspace';
    const icon = data.notification?.icon || data.icon || '/favicon.ico';
    const tag = data.data?.chatId ? `chat_${data.data.chatId}` : (data.tag || 'txtorspace-push');

    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon,
        badge: '/favicon.ico',
        tag,
        renotify: true,
        data: data.data || data,
        vibrate: [200, 100, 200]
      })
    );
  } catch (err) {
    console.log('[firebase-messaging-sw.js] Push event parse fallback', err);
  }
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if (event.notification.data?.chatId) {
            client.postMessage({
              type: 'OPEN_CHAT',
              chatId: event.notification.data.chatId
            });
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
