// ============================================================
// フォロー・フォロワー機能
//
// Firestore 構造（双方向に非正規化してインデックス不要で引けるようにする）:
//   users/{myUid}/following/{targetUid}   … 自分がフォローしている相手
//   users/{targetUid}/followers/{myUid}   … 相手から見たフォロワー
//
// 【認証導入前の注意】現在は相手ユーザーの followers サブコレクションへ
// クライアントから直接書き込んでいる（暫定ルールが users/** を許可）。
// Firebase Auth 導入後は「自分の following のみ書込可」に絞り、
// followers 側は Cloud Functions で同期する形へ移行すること。
// ============================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreDb, ensureAnonymousAuth } from './firebase';

export interface FollowUser {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  followedAt: string | null;
}

function tsToIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return null;
}

function mapFollowUser(id: string, d: Record<string, any>): FollowUser {
  return {
    uid: id,
    displayName: String(d.displayName ?? '匿名ライダー'),
    photoUrl: d.photoUrl ?? null,
    followedAt: tsToIso(d.createdAt),
  };
}

/** 相手をフォローする */
export async function followUser(
  targetUid: string,
  targetDisplayName: string,
  targetPhotoUrl?: string | null
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase が未設定です');
  const me = await ensureAnonymousAuth();
  if (me.uid === targetUid) throw new Error('自分をフォローすることはできません');

  const myPhoto = await getMyPhotoUrlSafe();

  await Promise.all([
    // 自分 → 相手
    setDoc(doc(db, 'users', me.uid, 'following', targetUid), {
      displayName: targetDisplayName,
      photoUrl: targetPhotoUrl ?? null,
      createdAt: serverTimestamp(),
    }),
    // 相手側のフォロワー一覧
    setDoc(doc(db, 'users', targetUid, 'followers', me.uid), {
      displayName: me.displayName,
      photoUrl: myPhoto,
      createdAt: serverTimestamp(),
    }),
  ]);
}

/** フォローを解除する */
export async function unfollowUser(targetUid: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase が未設定です');
  const me = await ensureAnonymousAuth();
  await Promise.all([
    deleteDoc(doc(db, 'users', me.uid, 'following', targetUid)),
    deleteDoc(doc(db, 'users', targetUid, 'followers', me.uid)),
  ]);
}

/** 自分が対象をフォローしているか */
export async function isFollowing(targetUid: string): Promise<boolean> {
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const me = await ensureAnonymousAuth();
    const snap = await getDoc(doc(db, 'users', me.uid, 'following', targetUid));
    return snap.exists();
  } catch {
    return false;
  }
}

/** フォロー中／フォロワーの一覧を取得 */
export async function getFollowList(
  uid: string,
  kind: 'following' | 'followers',
  limitCount = 100
): Promise<FollowUser[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, kind), orderBy('createdAt', 'desc'), limit(limitCount))
    );
    return snap.docs.map((d) => mapFollowUser(d.id, d.data()));
  } catch {
    // createdAt 未設定の古いデータが混ざるとorderByで落ちるためフォールバック
    try {
      const snap = await getDocs(collection(db, 'users', uid, kind));
      return snap.docs.map((d) => mapFollowUser(d.id, d.data()));
    } catch {
      return [];
    }
  }
}

/** フォロー数・フォロワー数 */
export async function getFollowCounts(uid: string): Promise<{ following: number; followers: number }> {
  const db = getFirestoreDb();
  if (!db) return { following: 0, followers: 0 };
  try {
    const [f1, f2] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'following')),
      getDocs(collection(db, 'users', uid, 'followers')),
    ]);
    return { following: f1.size, followers: f2.size };
  } catch {
    return { following: 0, followers: 0 };
  }
}

/** 自分がフォローしているUIDの集合（フィード絞り込み・公開範囲判定に使う） */
export async function getFollowingUids(): Promise<string[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const me = await ensureAnonymousAuth();
    const snap = await getDocs(collection(db, 'users', me.uid, 'following'));
    return snap.docs.map((d) => d.id);
  } catch {
    return [];
  }
}

/** 自分のプロフィール写真URL（失敗しても null で続行） */
async function getMyPhotoUrlSafe(): Promise<string | null> {
  try {
    const { getMyPhotoUrl } = await import('./firebase');
    return await getMyPhotoUrl();
  } catch {
    return null;
  }
}
