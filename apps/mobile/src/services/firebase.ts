import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
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
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  signInAnonymously,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
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

// Firebase が設定されているか確認（未設定の場合は各関数が早期リターン）
const isConfigured = !!firebaseConfig.projectId && !!firebaseConfig.apiKey;

// Initialize Firebase (singleton) — 設定が揃っている場合のみ初期化
let app: ReturnType<typeof initializeApp> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

if (isConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    // React Native では initializeAuth + inMemoryPersistence が必要
    try {
      auth = initializeAuth(app, { persistence: inMemoryPersistence });
    } catch {
      // 既に初期化済み（ホットリロード時）
      auth = getAuth(app);
    }
  } catch (e) {
    console.error('[Firebase] 初期化に失敗しました:', e);
  }
  // Storage は別途初期化（Spark プランでは使えないためエラーでも他機能に影響させない）
  try {
    storage = getStorage(app!);
  } catch (e) {
    console.warn('[Firebase] Storage 未使用（Cloudinary を使用）');
  }
}

export { auth };

// ============================================================
// Auth helpers
// ============================================================

export async function ensureAnonymousAuth(): Promise<User> {
  if (!auth) throw new Error('Firebase が未設定です。.env を確認してください。');
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function onAuthChanged(callback: (user: User | null) => void) {
  if (!auth) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}

// ============================================================
// Saved Routes
// ============================================================

/**
 * Save a route to the current user's saved routes collection
 */
export async function saveRoute(route: Route): Promise<string> {
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

/**
 * Load all saved routes for the current user
 */
export async function loadSavedRoutes(): Promise<Route[]> {
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

/**
 * Delete a saved route
 */
export async function deleteSavedRoute(routeId: string): Promise<void> {
  if (!db) return;
  const user = await ensureAnonymousAuth();
  const routeRef = doc(db, 'users', user.uid, 'savedRoutes', routeId);
  await updateDoc(routeRef, { deletedAt: serverTimestamp() });
}

// ============================================================
// Community Routes
// ============================================================

/**
 * Post a route to the community feed
 */
export async function postCommunityRoute(
  route: Route,
  comment: string,
  photos: string[],
  tags: string[],
  departureArea: string
): Promise<string> {
  if (!db) throw new Error('Firebase が未設定です。');
  const user = await ensureAnonymousAuth();
  const postsRef = collection(db, 'communityPosts');
  const docRef = await addDoc(postsRef, {
    userId: user.uid,
    userDisplayName: user.displayName ?? '匿名ライダー',
    userPhotoUrl: user.photoURL ?? undefined,
    route,
    photos,
    comment,
    tags,
    departureArea,
    likes: 0,
    likedBy: [],
    createdAt: serverTimestamp(),
  } satisfies Omit<CommunityPost, 'id'>);
  return docRef.id;
}

/**
 * Get community routes (latest)
 */
export async function getCommunityRoutes(
  limitCount = 20
): Promise<CommunityPost[]> {
  if (!db) return [];
  await ensureAnonymousAuth();
  const postsRef = collection(db, 'communityPosts');
  const q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
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
}

/**
 * Get popular community routes sorted by likes
 */
export async function getPopularRoutes(
  limitCount = 10,
  departureArea?: string
): Promise<CommunityPost[]> {
  if (!db) return [];
  await ensureAnonymousAuth();
  const postsRef = collection(db, 'communityPosts');
  let q;
  if (departureArea) {
    q = query(
      postsRef,
      where('departureArea', '==', departureArea),
      orderBy('likes', 'desc'),
      limit(limitCount)
    );
  } else {
    q = query(postsRef, orderBy('likes', 'desc'), limit(limitCount));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
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
}

/**
 * Toggle like on a community post
 */
export async function toggleLike(postId: string): Promise<void> {
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
}

// ============================================================
// Photo Upload
// ============================================================

/**
 * Upload a photo to Firebase Storage and return the download URL
 */
export async function uploadPhoto(
  localUri: string,
  folder = 'community'
): Promise<string> {
  if (!storage) throw new Error('Firebase が未設定です。');
  const user = await ensureAnonymousAuth();
  const filename = `${folder}/${user.uid}/${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);

  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });

  return getDownloadURL(storageRef);
}
