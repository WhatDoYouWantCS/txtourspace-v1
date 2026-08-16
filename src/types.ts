/**
 * Shared types for iOS Messaging & Discovery App
 */

export interface SecuritySettings {
  pinEnabled: boolean;
  pinCode?: string; // 4-digit PIN code
  biometricEnabled: boolean;
  biometricCredentialId?: string;
  lockTimeout?: 'immediately' | '1m' | '5m';
}

export interface User {
  uid: string;
  fullName: string;
  username: string;
  usernameLower: string;
  email: string;
  phone: string;
  birthDate: string;
  profileImage: string; // Base64 or initial gradient
  bio: string;
  createdAt: string;
  lastSeen: string;
  online: boolean;
  blockedUsers: string[]; // List of user IDs blocked by this user
  reportedBy: string[]; // List of user IDs that reported this user
  unfriendedUsers?: string[]; // List of user IDs unfriended by this user
  password?: string; // Optional password for local account verification
  autoDownloadMedia?: boolean; // Setting for auto downloading incoming chat images (default false)
  accountStatus?: 'active' | 'deactivated'; // Account status (grace period for deletion)
  deactivatedAt?: string; // ISO string when deactivation was initiated
  securitySettings?: SecuritySettings; // Biometric and 4-digit PIN 2FA lock settings synced to Firestore
  syncGoogleContacts?: boolean; // Setting to sync Google Contacts to discover friends on the platform
  googleContactsSyncedAt?: string; // ISO string when Google contacts were last synced
  fcmToken?: string; // Firebase Cloud Messaging Web Push Registration Token
  pushNotificationsEnabled?: boolean; // User preference for browser web push notifications
}

export interface ChatRequest {
  requestId: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface Chat {
  chatId: string;
  isGroup: boolean;
  members: string[]; // user UIDs
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageSenderId?: string;
  pinned?: { [uid: string]: boolean };
  muted?: { [uid: string]: boolean };
  favorites?: { [uid: string]: boolean };
  deletedBy?: { [uid: string]: boolean }; // To hide chat for a user who cleared/deleted it
  typing?: { [uid: string]: boolean }; // Real-time typing indicators synced in Firestore
  
  // Group specific properties
  name?: string;
  image?: string;
  ownerId?: string;
  admins?: string[];
  permissions?: {
    allowAddMembers: boolean;
    allowInviteLink: boolean;
    allowEditSettings: boolean;
    allowSendMessages: boolean;
  };
}

export interface Message {
  messageId: string;
  senderId: string;
  text: string;
  createdAt: string; // ISO string
  edited?: boolean;
  deleted?: boolean;
  replyTo?: string; // messageId of the message being replied to
  readBy?: string[]; // array of UIDs who have read this message
  image?: string; // Base64 data URL for shared image
  reactions?: { [emoji: string]: string[] }; // Map emoji string to array of user UIDs
  isSystem?: boolean; // System log notification message in chat (e.g. User added User)
}

export interface Story {
  storyId: string;
  creatorId: string;
  creatorName: string;
  creatorImage: string;
  text: string;
  bgColor: string; // Dynamic background colors like spotify/instagram style
  createdAt: string; // ISO String
  likes: string[]; // list of user UIDs who liked it
  replies: StoryReply[];
  views?: string[]; // list of user UIDs who viewed it
  image?: string; // Optional Base64 data URL for image background/overlay
  mentions?: string[]; // List of user UIDs or usernames mentioned/tagged in the story
}

export interface StoryReply {
  replyId: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  type: 'request_received' | 'request_accepted' | 'request_sent' | 'new_message' | 'added_to_group' | 'removed_from_group' | 'story_liked' | 'system_alert' | 'promoted_admin' | 'permission_updated' | 'mention';
  senderName: string;
  senderImage: string;
  messageText: string;
  chatId?: string;
  createdAt: string;
  userId?: string; // Target recipient user UID for persistent storage
  recipientId?: string;
}
