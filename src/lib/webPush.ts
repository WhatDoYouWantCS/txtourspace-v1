import { initializeApp, getApps, getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';

// Public VAPID Key provided for Web Push Notifications
export const FIREBASE_VAPID_KEY = "BFqHy28LJutj1nPy9kwkXDxcrwHojkXPNe3igKv6aeSHvHvZSIG3_VWZIBcPq27JeRrQjqo8ctqaRZZYwy8sbeg";

let messagingInstance: Messaging | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// Initialize or get Firebase App instance
function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp({
    apiKey: "AIzaSyAATBt1WE6CDeSVpg7R3pnXRfuggPyY8X4",
    authDomain: "txtorspace.firebaseapp.com",
    projectId: "txtorspace",
    storageBucket: "txtorspace.firebasestorage.app",
    messagingSenderId: "673080519612",
    appId: "1:673080519612:web:f28fc7c92336fa185019b9"
  });
}

/**
 * Register Service Worker for Web Push & Firebase Messaging
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    if (swRegistration) {
      return swRegistration;
    }

    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    console.log('[WebPush] Service Worker registered with scope:', reg.scope);
    swRegistration = reg;
    return reg;
  } catch (err) {
    console.warn('[WebPush] Service Worker registration failed:', err);
    return null;
  }
}

/**
 * Get current browser notification permission status
 */
export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Initialize Firebase Messaging & request push notification token with the VAPID key
 */
export async function initFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;

  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[WebPush] Firebase Messaging is not supported in this browser environment.');
      return null;
    }

    if (!messagingInstance) {
      const app = getFirebaseApp();
      messagingInstance = getMessaging(app);
    }
    return messagingInstance;
  } catch (err) {
    console.warn('[WebPush] Error initializing messaging:', err);
    return null;
  }
}

/**
 * Request notification permission from the user and retrieve FCM Web Push Token
 */
export async function requestWebPushPermission(): Promise<{
  granted: boolean;
  token: string | null;
  permission: NotificationPermission | 'unsupported';
  error?: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      granted: false,
      token: null,
      permission: 'unsupported',
      error: 'Web Push Notifications are not supported in this browser.'
    };
  }

  try {
    // 1. Request native browser notification permission
    const permissionResult = await Notification.requestPermission();
    if (permissionResult !== 'granted') {
      return {
        granted: false,
        token: null,
        permission: permissionResult,
        error: permissionResult === 'denied' ? 'Permission was denied by user.' : 'Permission dismissed.'
      };
    }

    // 2. Register Service Worker
    const reg = await registerServiceWorker();

    // 3. Initialize Firebase Messaging
    const messaging = await initFirebaseMessaging();
    let fcmToken: string | null = null;

    if (messaging) {
      try {
        fcmToken = await getToken(messaging, {
          vapidKey: FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: reg || undefined
        });
        console.log('[WebPush] Obtained FCM Web Push Token:', fcmToken ? `${fcmToken.slice(0, 16)}...` : 'null');
      } catch (tokenErr) {
        console.warn('[WebPush] Failed to obtain FCM token with VAPID key:', tokenErr);
      }
    }

    return {
      granted: true,
      token: fcmToken,
      permission: 'granted'
    };
  } catch (err) {
    console.error('[WebPush] Exception requesting notification permission:', err);
    return {
      granted: false,
      token: null,
      permission: getNotificationPermissionStatus(),
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

export interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  chatId?: string;
  url?: string;
  type?: string;
  data?: Record<string, any>;
}

/**
 * Dispatch web push notification natively to the browser / OS
 */
export async function dispatchWebPushNotification(payload: WebPushPayload): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const { title, body, icon, tag, chatId, url, type, data } = payload;
  const resolvedIcon = icon && (icon.startsWith('data:') || icon.startsWith('http') || icon.startsWith('/'))
    ? icon
    : '/favicon.ico';

  const notificationData = {
    chatId,
    url: url || (chatId ? `/?chat=${chatId}` : '/'),
    type: type || 'general',
    ...(data || {})
  };

  try {
    // 1. Try displaying via Service Worker registration (native background & lockscreen notification)
    if ('serviceWorker' in navigator) {
      const reg = swRegistration || (await navigator.serviceWorker.ready);
      if (reg && reg.showNotification) {
        const swOptions: any = {
          body,
          icon: resolvedIcon,
          badge: '/favicon.ico',
          tag: tag || (chatId ? `chat_${chatId}` : `alert_${Date.now()}`),
          renotify: true,
          data: notificationData,
          vibrate: [200, 100, 200]
        };
        await reg.showNotification(title, swOptions);
        return true;
      }
    }

    // 2. Fallback to standard Notification constructor
    const notif = new Notification(title, {
      body,
      icon: resolvedIcon,
      tag: tag || (chatId ? `chat_${chatId}` : `alert_${Date.now()}`),
      data: notificationData
    });

    notif.onclick = () => {
      window.focus();
      if (chatId) {
        window.dispatchEvent(new CustomEvent('open-chat', { detail: { chatId } }));
      }
      notif.close();
    };

    return true;
  } catch (err) {
    console.warn('[WebPush] Error displaying web push notification:', err);
    return false;
  }
}

/**
 * Setup foreground listener for Firebase Push Notifications
 */
export function listenToForegroundPushMessages(onReceive: (payload: any) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let unsubscribe: (() => void) | null = null;

  initFirebaseMessaging().then((messaging) => {
    if (messaging) {
      try {
        unsubscribe = onMessage(messaging, (payload) => {
          console.log('[WebPush] Foreground push message received:', payload);
          onReceive(payload);

          // Trigger native notification if tab is in background or unfocused
          if (document.hidden) {
            const title = payload.notification?.title || payload.data?.title || 'Txtorspace Alert';
            const body = payload.notification?.body || payload.data?.body || 'New message or alert';
            const icon = payload.notification?.icon || payload.data?.icon;
            const chatId = payload.data?.chatId;

            dispatchWebPushNotification({
              title,
              body,
              icon,
              chatId,
              data: payload.data
            });
          }
        });
      } catch (err) {
        console.warn('[WebPush] Error setting up onMessage listener:', err);
      }
    }
  });

  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}
