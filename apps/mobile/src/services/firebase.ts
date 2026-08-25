import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  increment,
  arrayUnion,
  arrayRemove,
  Timestamp,
  serverTimestamp,
  documentId,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Route, CommunityPost } from '@touring/shared';

// Firebase config from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

const isConfigured = !!firebaseConfig.projectId && !!firebaseConfig.apiKey;

// ─── Lazy getters ────────────────────────────────────────────
let _app: ReturnType<typeof initializeApp> | null = null;
let _db: ReturnType<typeof getFirestore> | null = null;

function getApp_(): ReturnType<typeof initializeApp> | null {
  if (!isConfigured) return null;
  if (_app) return _app;
  try {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    console.log('[Firebase] App initialized');
  } catch (e) {
    console.error('[Firebase] App init failed:', e);
    return null;
  }
  return _app;
}

function getDb(): ReturnType<typeof getFirestore> | null {
  if (_db) return _db;
  const app = getApp_();
  if (!app) return null;
  try {
    _db = getFirestore(app);
    console.log('[Firebase] Firestore initialized');
  } catch (e) {
    console.error('[Firebase] Firestore init failed:', e);
    return null;
  }
  return _db;
}

/** 他サービス層（garage.ts 等）から Firestore にアクセスするための公開ゲッター */
export function getFirestoreDb(): ReturnType<typeof getFirestore> | null {
  return getDb();
}

/** Firebase App インスタンスの公開ゲッター（Storage 初期化用） */
export function getFirebaseApp(): ReturnType<typeof initializeApp> | null {
  return getApp_();
}

// ============================================================
// 匿名ユーザー管理（Firebase Auth不使用・AsyncStorage利用）
// ============================================================

const ANON_UID_KEY = '@touring_app_anon_uid';
const DISPLAY_NAME_KEY = '@touring_app_display_name';
const PHOTO_URL_KEY = '@touring_app_photo_url';

export interface AnonUser {
  uid: string;
  displayName: string;
  /** true = 未ログイン（端末内IDでの閲覧のみ）/ false = Firebase認証済み */
  isAnonymous: boolean;
}

let _cachedUser: AnonUser | null = null;
let _authCallbacks: ((user: AnonUser | null) => void)[] = [];

function _notifyCallbacks(user: AnonUser | null) {
  _authCallbacks.forEach((cb) => cb(user));
}

// ─── Firebase Auth との橋渡し ────────────────────────────────
// 循環importを避けるため、auth.ts 側から setAuthedUser() を呼んで反映させる。
// これにより既存の ensureAnonymousAuth() 利用箇所を書き換えずに
// UID を Firebase のものへ切り替えられる。
let _firebaseUser: { uid: string; displayName: string } | null = null;

export function setAuthedUser(user: { uid: string; displayName: string } | null): void {
  _firebaseUser = user;
  _cachedUser = user
    ? { uid: user.uid, displayName: user.displayName, isAnonymous: false }
    : null;
  _notifyCallbacks(_cachedUser);
}

/** ログイン中か（投稿・フォロー等の操作可否の判定に使う） */
export function isSignedIn(): boolean {
  return _firebaseUser !== null;
}

export async function ensureAnonymousAuth(): Promise<AnonUser> {
  // Firebase認証済みならそのUIDを最優先で使う
  if (_firebaseUser) {
    _cachedUser = {
      uid: _firebaseUser.uid,
      displayName: _firebaseUser.displayName,
      isAnonymous: false,
    };
    return _cachedUser;
  }
  if (_cachedUser) return _cachedUser;

  const [storedUid, storedName] = await Promise.all([
    AsyncStorage.getItem(ANON_UID_KEY),
    AsyncStorage.getItem(DISPLAY_NAME_KEY),
  ]);

  let uid = storedUid;
  if (!uid) {
    uid =
      Math.random().toString(36).slice(2, 10) +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 6);
    await AsyncStorage.setItem(ANON_UID_KEY, uid);
  }

  _cachedUser = {
    uid,
    displayName: storedName ?? '匿名ライダー',
    isAnonymous: true,
  };
  _notifyCallbacks(_cachedUser);
  return _cachedUser;
}

/** ユーザー名を変更して永続化 */
export async function updateDisplayName(name: string): Promise<void> {
  const trimmed = name.trim() || '匿名ライダー';
  await AsyncStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  if (_cachedUser) {
    _cachedUser = { ..._cachedUser, displayName: trimmed };
    _notifyCallbacks(_cachedUser);
  }
}

export function onAuthChanged(callback: (user: AnonUser | null) => void) {
  _authCallbacks.push(callback);
  // 既にユーザーがいれば即座にコールバック
  if (_cachedUser) {
    callback(_cachedUser);
  } else {
    // バックグラウンドでユーザーを初期化してコールバック
    ensureAnonymousAuth().catch(() => callback(null));
  }
  return () => {
    _authCallbacks = _authCallbacks.filter((cb) => cb !== callback);
  };
}

export async function signOutUser(): Promise<void> {
  await AsyncStorage.removeItem(ANON_UID_KEY);
  _cachedUser = null;
  _notifyCallbacks(null);
}

/** Expo プッシュトークンを Firestore に保存 */
export async function savePushToken(token: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const profileRef = doc(db, 'userProfiles', user.uid);
  await setDoc(profileRef, { expoPushToken: token }, { merge: true });
}

/** 自分のプロフィール写真URLを保存（AsyncStorage + Firestore） */
export async function updateUserPhotoUrl(photoUrl: string): Promise<void> {
  await AsyncStorage.setItem(PHOTO_URL_KEY, photoUrl);
  const db = getDb();
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const profileRef = doc(db, 'userProfiles', user.uid);
  await setDoc(profileRef, { photoUrl }, { merge: true });
}

/** 自分のプロフィール写真URLをAsyncStorageから取得 */
export async function getMyPhotoUrl(): Promise<string | null> {
  return AsyncStorage.getItem(PHOTO_URL_KEY);
}

/** 他ユーザーのプロフィール写真URLをFirestoreから取得 */
export async function getUserPhotoUrl(uid: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const profileRef = doc(db, 'userProfiles', uid);
  const snap = await getDoc(profileRef);
  if (!snap.exists()) return null;
  return (snap.data().photoUrl as string) ?? null;
}

// ダミーの auth オブジェクト（ProfileScreen の型互換用）
export const auth = {
  get currentUser() {
    return _cachedUser;
  },
};

// ============================================================
// Saved Routes
// ============================================================

export async function saveRoute(route: Route): Promise<string> {
  const db = getDb();
  if (!db) throw new Error('Firebase が未設定です。');
  const user = await ensureAnonymousAuth();
  const routesRef = collection(db, 'users', user.uid, 'savedRoutes');
  const docRef = await addDoc(routesRef, {
    ...route,
    userId: user.uid,
    createdAt: serverTimestamp(),
    isSaved: true,
  });
  return docRef.id;
}

export async function loadSavedRoutes(): Promise<Route[]> {
  const db = getDb();
  if (!db) return [];
  const user = await ensureAnonymousAuth();
  const routesRef = collection(db, 'users', user.uid, 'savedRoutes');
  const q = query(routesRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Route, 'id'>),
  }));
}

export async function deleteSavedRoute(routeId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const routeRef = doc(db, 'users', user.uid, 'savedRoutes', routeId);
  await deleteDoc(routeRef);
}

// ============================================================
// Community Routes
// ============================================================

export async function postCommunityRoute(
  route: Route,
  comment: string,
  photos: string[],
  tags: string[],
  departureArea: string,
  prefectures: string[] = [],
): Promise<string> {
  const db = getDb();
  if (!db) throw new Error('Firebase が未設定です。');
  const user = await ensureAnonymousAuth();

  // BAN済みユーザーは投稿不可（App Store UGC要件：問題ユーザーの排除）
  if (await isBannedUser()) {
    throw new Error('コミュニティガイドライン違反のため、投稿が制限されています。');
  }

  const postsRef = collection(db, 'communityPosts');
  const docRef = await addDoc(postsRef, {
    userId: user.uid,
    userDisplayName: user.displayName,
    route,
    photos,
    comment,
    tags,
    departureArea,
    prefectures,
    likes: 0,
    likedBy: [],
    createdAt: serverTimestamp(),
  } satisfies Omit<CommunityPost, 'id'>);
  return docRef.id;
}

// ============================================================
// モデレーション（通報・ブロック・BAN）
// App Store 審査ガイドライン 1.2（UGC要件）対応
// ============================================================

const BLOCKED_USERS_KEY = '@touring_app_blocked_users';
const HIDDEN_POSTS_KEY = '@touring_app_hidden_posts';
const UGC_TERMS_KEY = '@touring_app_ugc_terms_accepted';

/** ブロック済みユーザーID一覧 */
export async function getBlockedUsers(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(BLOCKED_USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

/** ユーザーをブロック（以後そのユーザーの投稿は非表示） */
export async function blockUser(uid: string): Promise<void> {
  const list = await getBlockedUsers();
  if (!list.includes(uid)) {
    list.push(uid);
    await AsyncStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list));
  }
}

/** ブロック解除 */
export async function unblockUser(uid: string): Promise<void> {
  const list = await getBlockedUsers();
  await AsyncStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(list.filter((u) => u !== uid)));
}

/** 非表示にした投稿ID一覧（通報時に自動追加） */
async function getHiddenPostIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(HIDDEN_POSTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * 投稿を通報する。reports コレクションに記録し、通報者の画面からは即座に非表示にする。
 * 通報内容は Firebase Console の reports コレクションで確認 → 24時間以内に対応すること。
 */
export async function reportPost(post: CommunityPost, reason: string): Promise<void> {
  const db = getDb();
  const user = await ensureAnonymousAuth();

  // 通報者の画面からは即非表示（Apple要件：通報したコンテンツが見え続けない）
  if (post.id) {
    const hidden = await getHiddenPostIds();
    if (!hidden.includes(post.id)) {
      hidden.push(post.id);
      await AsyncStorage.setItem(HIDDEN_POSTS_KEY, JSON.stringify(hidden));
    }
  }

  if (!db) return;
  await addDoc(collection(db, 'reports'), {
    postId: post.id ?? '',
    postUserId: post.userId,
    postUserDisplayName: post.userDisplayName,
    postComment: (post.comment ?? '').slice(0, 200),
    postPhotoUrls: post.photos ?? [],
    reporterUid: user.uid,
    reason,
    status: 'open', // open → resolved に手動更新（Firebase Console）
    createdAt: serverTimestamp(),
  });
}

/** ブロック済みユーザー・通報済み投稿を除外する共通フィルタ */
async function filterModerated(posts: CommunityPost[]): Promise<CommunityPost[]> {
  const [blocked, hidden] = await Promise.all([getBlockedUsers(), getHiddenPostIds()]);
  if (blocked.length === 0 && hidden.length === 0) return posts;
  return posts.filter(
    (p) => !blocked.includes(p.userId) && !(p.id && hidden.includes(p.id))
  );
}

/** 自分がBANされているか確認（userProfiles.banned を Firebase Console から手動設定） */
export async function isBannedUser(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const user = await ensureAnonymousAuth();
    const snap = await getDoc(doc(db, 'userProfiles', user.uid));
    return snap.exists() && snap.data().banned === true;
  } catch {
    return false;
  }
}

/** UGC利用規約への同意状態 */
export async function hasAcceptedUgcTerms(): Promise<boolean> {
  return (await AsyncStorage.getItem(UGC_TERMS_KEY)) === 'true';
}

export async function acceptUgcTerms(): Promise<void> {
  await AsyncStorage.setItem(UGC_TERMS_KEY, 'true');
}

function mapPost(d: import('firebase/firestore').QueryDocumentSnapshot): CommunityPost {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : data.createdAt,
  } as CommunityPost;
}

export async function getCommunityRoutes(
  limitCount = 20,
  tag?: string,
  area?: string,
  prefecture?: string,
): Promise<CommunityPost[]> {
  const db = getDb();
  if (!db) return [];
  const postsRef = collection(db, 'communityPosts');

  // 絞り込み優先順: 都道府県 > タグ > エリア > デフォルト（複合インデックス不要・クライアントソート）
  let q;
  if (prefecture) {
    q = query(postsRef, where('prefectures', 'array-contains', prefecture), limit(limitCount));
  } else if (tag) {
    q = query(postsRef, where('tags', 'array-contains', tag), limit(limitCount));
  } else if (area) {
    q = query(postsRef, where('departureArea', '==', area), limit(limitCount));
  } else {
    q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));
  }

  const snapshot = await getDocs(q);
  const posts = await filterModerated(snapshot.docs.map(mapPost));

  if (prefecture || tag || area) {
    return posts.sort((a, b) => {
      const ta = typeof a.createdAt === 'string' ? a.createdAt : '';
      const tb = typeof b.createdAt === 'string' ? b.createdAt : '';
      return tb.localeCompare(ta);
    });
  }
  return posts;
}

export async function getPopularRoutes(
  limitCount = 10,
  tag?: string,
  area?: string,
  prefecture?: string,
): Promise<CommunityPost[]> {
  const db = getDb();
  if (!db) return [];
  const postsRef = collection(db, 'communityPosts');

  let q;
  if (prefecture) {
    q = query(postsRef, where('prefectures', 'array-contains', prefecture), limit(limitCount));
  } else if (tag) {
    q = query(postsRef, where('tags', 'array-contains', tag), limit(limitCount));
  } else if (area) {
    q = query(postsRef, where('departureArea', '==', area), limit(limitCount));
  } else {
    q = query(postsRef, orderBy('likes', 'desc'), limit(limitCount));
  }

  const snapshot = await getDocs(q);
  const posts = await filterModerated(snapshot.docs.map(mapPost));

  if (prefecture || tag || area) {
    return posts.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
  }
  return posts;
}

/** 自分の投稿を削除 */
export async function deleteCommunityPost(postId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const postRef = doc(db, 'communityPosts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return;
  if (snap.data().userId !== user.uid) throw new Error('自分の投稿のみ削除できます');
  await deleteDoc(postRef);
}

/** 特定ユーザーの投稿一覧を取得（複合インデックス不要・クライアントソート） */
export async function getUserPosts(uid: string): Promise<CommunityPost[]> {
  const db = getDb();
  if (!db) return [];
  const postsRef = collection(db, 'communityPosts');
  // orderBy を外して複合インデックス不要にし、クライアント側で日付ソート
  const q = query(postsRef, where('userId', '==', uid), limit(20));
  const snapshot = await getDocs(q);
  const posts = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt:
        data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : data.createdAt,
    } as CommunityPost;
  });
  // 新しい順にソート
  return posts.sort((a, b) => {
    const ta = typeof a.createdAt === 'string' ? a.createdAt : '';
    const tb = typeof b.createdAt === 'string' ? b.createdAt : '';
    return tb.localeCompare(ta);
  });
}

/** ユーザーの投稿統計を取得（バッジ計算用） */
export async function getUserPostStats(uid: string): Promise<{
  postCount: number;
  totalLikes: number;
  hasForestRoad: boolean;
}> {
  const db = getDb();
  if (!db) return { postCount: 0, totalLikes: 0, hasForestRoad: false };
  const postsRef = collection(db, 'communityPosts');
  const q = query(postsRef, where('userId', '==', uid));
  const snapshot = await getDocs(q);
  let totalLikes = 0;
  let hasForestRoad = false;
  snapshot.docs.forEach((d) => {
    const data = d.data();
    totalLikes += data.likes ?? 0;
    if (data.route?.type === '林道') hasForestRoad = true;
  });
  return { postCount: snapshot.size, totalLikes, hasForestRoad };
}

// ============================================================
// User Profile (bikes)
// ============================================================

export interface BikeRecord {
  id: string;
  maker: string;
  model: string;
  year: string;
  bikeType: string;
}

/** 自分のバイク一覧を Firestore に保存 */
export async function syncUserBikesToFirestore(bikes: BikeRecord[]): Promise<void> {
  const db = getDb();
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const profileRef = doc(db, 'userProfiles', user.uid);
  await setDoc(profileRef, { bikes, displayName: user.displayName }, { merge: true });
}

/** 特定ユーザーのバイク一覧を Firestore から取得 */
export async function getUserBikesFromFirestore(uid: string): Promise<BikeRecord[]> {
  const db = getDb();
  if (!db) return [];
  const profileRef = doc(db, 'userProfiles', uid);
  const snap = await getDoc(profileRef);
  if (!snap.exists()) return [];
  return (snap.data().bikes as BikeRecord[]) ?? [];
}

// ============================================================
// Stamp Reactions
// ============================================================

const REACTIONS_STORAGE_KEY = '@touring_reactions';

async function getStoredReactions(): Promise<Record<string, string[]>> {
  const raw = await AsyncStorage.getItem(REACTIONS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

/** スタンプリアクションを切り替え（追加/取り消し） */
export async function toggleReaction(postId: string, reactionType: string): Promise<void> {
  const db = getDb();
  if (!db) return;

  const stored = await getStoredReactions();
  const myReactions = stored[postId] ?? [];
  const alreadyReacted = myReactions.includes(reactionType);

  // AsyncStorage 更新
  const updated = alreadyReacted
    ? myReactions.filter((r) => r !== reactionType)
    : [...myReactions, reactionType];
  if (updated.length === 0) delete stored[postId];
  else stored[postId] = updated;
  await AsyncStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(stored));

  // Firestore 更新（ドット記法でネストフィールドに increment）
  const postRef = doc(db, 'communityPosts', postId);
  await updateDoc(postRef, {
    [`reactions.${reactionType}`]: increment(alreadyReacted ? -1 : 1),
  });
}

/** 自分のスタンプ履歴を取得 */
export async function getMyReactions(): Promise<Record<string, string[]>> {
  return getStoredReactions();
}

// ============================================================
// Bookmarks
// ============================================================

const BOOKMARKS_KEY = '@touring_bookmarks';

/** ブックマーク済みのpostId一覧を取得 */
export async function getBookmarkedIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(BOOKMARKS_KEY);
  return raw ? JSON.parse(raw) : [];
}

/** ブックマークを切り替え（true = ブックマーク済みになった） */
export async function toggleBookmark(postId: string): Promise<boolean> {
  const ids = await getBookmarkedIds();
  const isBookmarked = ids.includes(postId);
  const newIds = isBookmarked ? ids.filter((id) => id !== postId) : [...ids, postId];
  await AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(newIds));
  return !isBookmarked;
}

/** ブックマーク済みの投稿一覧を取得 */
export async function getBookmarkedPosts(): Promise<CommunityPost[]> {
  const db = getDb();
  if (!db) return [];
  const ids = await getBookmarkedIds();
  if (ids.length === 0) return [];
  const postsRef = collection(db, 'communityPosts');
  // Firestore の in クエリは最大30件
  const q = query(postsRef, where(documentId(), 'in', ids.slice(0, 30)));
  const snapshot = await getDocs(q);
  return filterModerated(snapshot.docs.map(mapPost));
}

export async function toggleLike(postId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const postRef = doc(db, 'communityPosts', postId);
  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) return;

  const data = postSnap.data() as CommunityPost;
  const alreadyLiked = data.likedBy?.includes(user.uid);

  await updateDoc(postRef, {
    likes: increment(alreadyLiked ? -1 : 1),
    likedBy: alreadyLiked ? arrayRemove(user.uid) : arrayUnion(user.uid),
  });

  // いいね追加時のみ通知（自分の投稿には送らない）
  if (!alreadyLiked && data.userId !== user.uid) {
    sendLikeNotification({
      recipientUid: data.userId,
      actorName: user.displayName,
      postName: data.route?.name ?? 'ルート',
    }).catch(() => {}); // 通知失敗はサイレントに無視
  }
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

async function sendLikeNotification(params: {
  recipientUid: string;
  actorName: string;
  postName: string;
}): Promise<void> {
  const appKey = process.env.EXPO_PUBLIC_APP_API_KEY ?? '';
  await fetch(`${API_BASE}/api/notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(appKey ? { 'x-app-key': appKey } : {}),
    },
    body: JSON.stringify(params),
  });
}
