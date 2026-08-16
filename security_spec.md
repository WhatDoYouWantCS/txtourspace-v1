# Security Specification & Threat Model

This specification details the security invariants and threat modeling for the AeroChat Firestore database.

## Data Invariants

1. **User Ownership & Profile Lockout**: A user profile `/users/{uid}` can only be created and updated by the authenticated user matching `{uid}`. Users cannot modify key access fields like `reportedBy` or other users' `blockedUsers` collections.
2. **Chat Membership Constraint**: Users can only read, write, or query documents in a chat `/chats/{chatId}` if their user ID is listed in the `members` array.
3. **Message Relational Integrity**: A message `/chats/{chatId}/messages/{messageId}` can only be created if the writer is a member of the `/chats/{chatId}` document. The `senderId` must strictly match the writer's authenticated UID.
4. **Chat Request Authenticity**: A chat request `/chatRequests/{requestId}` must have a `senderId` matching the authenticated user. Only the designated `receiverId` can update the request's status (e.g., accepting or declining), and no other field can be changed during this transition.
5. **Story Visibility & Access**: Any authenticated user can read stories, but stories can only be created or deleted by their `creatorId`. Users can only modify the `likes` field (for liking/unliking) or append to `replies`, keeping all other fields immutable.

---

## The "Dirty Dozen" Payloads

These 12 payloads are designed to challenge our Firestore Security Rules. Every single one of these MUST return `PERMISSION_DENIED`.

### 1. Identity Spoofing in User Profile (Creation)
* **Goal**: Attempt to create a user profile with an arbitrary UID that does not match the authenticated user.
* **Payload**:
```json
{
  "uid": "victim_uid_123",
  "fullName": "Imposter Admin",
  "username": "imposter",
  "usernameLower": "imposter",
  "email": "victim@example.com"
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`
* **Expected Result**: `PERMISSION_DENIED`

### 2. Unauthorized Bio Modification of Another User
* **Goal**: Attempt to modify another user's bio.
* **Payload**:
```json
{
  "bio": "Hacked bio text"
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"` on `/users/victim_uid_123`
* **Expected Result**: `PERMISSION_DENIED`

### 3. Self-Escalation (Clearing Report List)
* **Goal**: Attempt to clear one's own list of reports or manually block users on behalf of someone else.
* **Payload**:
```json
{
  "reportedBy": []
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"` on `/users/attacker_uid_999` where previous `reportedBy` had entries.
* **Expected Result**: `PERMISSION_DENIED`

### 4. Direct Unauthorized Chat Access
* **Goal**: An attacker attempts to read `/chats/private_chat_abc` when they are not in the `members` list.
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`; `chats/private_chat_abc` members = `["alice_123", "bob_456"]`.
* **Expected Result**: `PERMISSION_DENIED`

### 5. Impersonation of Sender in a Group Chat
* **Goal**: Write a message to a chat setting `senderId` to another user's ID.
* **Payload**:
```json
{
  "messageId": "msg_001",
  "senderId": "innocent_user_456",
  "text": "I am sending a fake message!",
  "createdAt": "2026-08-13T07:57:24Z"
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"` on `/chats/chat_abc/messages/msg_001`
* **Expected Result**: `PERMISSION_DENIED`

### 6. Message Spoofing by Non-Member
* **Goal**: An attacker tries to write a message to `/chats/private_chat_abc` where they are not a member.
* **Payload**:
```json
{
  "messageId": "msg_002",
  "senderId": "attacker_uid_999",
  "text": "Sneaking into your private chat",
  "createdAt": "2026-08-13T07:57:24Z"
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`; attacker is not in the chat members.
* **Expected Result**: `PERMISSION_DENIED`

### 7. Spoofing Chat Request Sender
* **Goal**: Create a chat request where `senderId` is different from the authenticated user.
* **Payload**:
```json
{
  "requestId": "req_001",
  "senderId": "victim_uid_123",
  "receiverId": "another_victim_456",
  "status": "pending",
  "createdAt": "2026-08-13T07:57:24Z"
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`
* **Expected Result**: `PERMISSION_DENIED`

### 8. Hijacking Status Transition of Chat Request
* **Goal**: The sender of a chat request tries to force accept their own request.
* **Payload (Update)**:
```json
{
  "status": "accepted"
}
```
* **Auth Context**: `request.auth.uid = "sender_uid_777"` (Original request has `senderId` = `sender_uid_777`, `receiverId` = `receiver_uid_888`)
* **Expected Result**: `PERMISSION_DENIED`

### 9. Tampering with Story Creator
* **Goal**: Creating a story with another user's `creatorId`.
* **Payload**:
```json
{
  "storyId": "story_001",
  "creatorId": "victim_uid_123",
  "creatorName": "Victim",
  "creatorImage": "victim_img",
  "text": "Fake story content!",
  "bgColor": "linear-gradient(135deg, #1DB954 0%, #191414 100%)",
  "createdAt": "2026-08-13T07:57:24Z",
  "likes": [],
  "replies": []
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`
* **Expected Result**: `PERMISSION_DENIED`

### 10. Modifying Core Fields of Another User's Story
* **Goal**: Attacker tries to change the `text` or `creatorId` of someone else's story.
* **Payload**:
```json
{
  "text": "Defaced story text!"
}
```
* **Auth Context**: `request.auth.uid = "attacker_uid_999"` on `/stories/story_victim_123`
* **Expected Result**: `PERMISSION_DENIED`

### 11. Unauthorized Notification Scraping
* **Goal**: Attacker attempts to list notifications that belong to another user.
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`; notifications are destined for `receiver_uid_888`.
* **Expected Result**: `PERMISSION_DENIED`

### 12. Deny of Wallet / Excessive ID Length (Poisoning)
* **Goal**: Try to create a message with a document ID that has excessive length or invalid characters.
* **Path**: `/chats/chat_abc/messages/superlongid_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
* **Auth Context**: `request.auth.uid = "attacker_uid_999"`
* **Expected Result**: `PERMISSION_DENIED`

---

## Security Unit Tests (firestore.rules.test.ts)

A complete test runner suite is outlined below to programmatically verify that all 12 dirty-dozen payloads are fully blocked.

```ts
// firestore.rules.test.ts
// Standard unit tests enforcing our security posture using the @firebase/rules-unit-testing package.
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'txtorspace',
    firestore: {
      rules: require('fs').readFileSync('firestore.rules', 'utf8')
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('AeroChat Firestore Security Rules - Dirty Dozen Payloads', () => {
  test('Payload 1: Impersonate user profile creation with different UID (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'users', 'victim_uid_123');
    await expect(setDoc(docRef, {
      uid: 'victim_uid_123',
      fullName: 'Imposter Admin',
      username: 'imposter',
      usernameLower: 'imposter',
      email: 'victim@example.com'
    })).rejects.toThrow();
  });

  test('Payload 2: Unauthorized profile bio edit on another user (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'users', 'victim_uid_123');
    await expect(updateDoc(docRef, { bio: 'Hacked bio text' })).rejects.toThrow();
  });

  test('Payload 3: Self-Escalation / Modifying reportedBy array directly (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'users', 'attacker_uid_999');
    await expect(updateDoc(docRef, { reportedBy: [] })).rejects.toThrow();
  });

  test('Payload 4: Non-member reading private chat (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'chats', 'private_chat_abc');
    await expect(getDoc(docRef)).rejects.toThrow();
  });

  test('Payload 5: Message senderId impersonation inside a chat (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'chats/chat_abc/messages/msg_001');
    await expect(setDoc(docRef, {
      messageId: 'msg_001',
      senderId: 'innocent_user_456',
      text: 'I am sending a fake message!',
      createdAt: new Date().toISOString()
    })).rejects.toThrow();
  });

  test('Payload 6: Posting a message to a chat without membership (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'chats/private_chat_abc/messages/msg_002');
    await expect(setDoc(docRef, {
      messageId: 'msg_002',
      senderId: 'attacker_uid_999',
      text: 'Sneaking into your private chat',
      createdAt: new Date().toISOString()
    })).rejects.toThrow();
  });

  test('Payload 7: Spoofing chat request senderId (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'chatRequests', 'req_001');
    await expect(setDoc(docRef, {
      requestId: 'req_001',
      senderId: 'victim_uid_123',
      receiverId: 'another_victim_456',
      status: 'pending',
      createdAt: new Date().toISOString()
    })).rejects.toThrow();
  });

  test('Payload 8: Sender attempting to accept their own chat request (Deny)', async () => {
    const context = testEnv.authenticatedContext('sender_uid_777');
    const db = context.firestore();
    const docRef = doc(db, 'chatRequests', 'req_777');
    await expect(updateDoc(docRef, { status: 'accepted' })).rejects.toThrow();
  });

  test('Payload 9: Creating story with another user as creatorId (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'stories', 'story_001');
    await expect(setDoc(docRef, {
      storyId: 'story_001',
      creatorId: 'victim_uid_123',
      creatorName: 'Victim',
      creatorImage: 'victim_img',
      text: 'Fake story content!',
      bgColor: 'linear-gradient(135deg, #1DB954 0%, #191414 100%)',
      createdAt: new Date().toISOString(),
      likes: [],
      replies: []
    })).rejects.toThrow();
  });

  test('Payload 10: Unauthorized text update on someone else\'s story (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'stories', 'story_victim_123');
    await expect(updateDoc(docRef, { text: 'Defaced story text!' })).rejects.toThrow();
  });

  test('Payload 11: Attempting to read another user\'s private notification (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'notifications', 'noti_victim_888');
    await expect(getDoc(docRef)).rejects.toThrow();
  });

  test('Payload 12: Resource Poisoning with excessively long ID (Deny)', async () => {
    const context = testEnv.authenticatedContext('attacker_uid_999');
    const db = context.firestore();
    const docRef = doc(db, 'chats/chat_abc/messages', 'x'.repeat(150));
    await expect(setDoc(docRef, {
      messageId: 'x'.repeat(150),
      senderId: 'attacker_uid_999',
      text: 'Excessive ID test',
      createdAt: new Date().toISOString()
    })).rejects.toThrow();
  });
});
