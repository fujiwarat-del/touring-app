// ============================================================
// グループ機能
//
// Firestore 構造:
//   groups/{groupId}                    … グループ本体（一覧・検索用）
//   groups/{groupId}/members/{uid}      … メンバー
//   groups/{groupId}/joinRequests/{uid} … 参加申請（承認制グループのみ）
//   users/{uid}/groups/{groupId}        … 自分の所属一覧（非正規化・インデックス不要）
//
// ツーリング計画の公開範囲「グループ限定」はここのメンバーシップで判定する。
// ============================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreDb, requireAuthedUser, getCurrentUid, getMyPhotoUrl } from './firebase';
import { buildRiderCredentials } from './riderProfile';
import type { RiderCredentials } from './riderProfile';

export type GroupRole = 'owner' | 'member';

export interface Group {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  area: string | null;        // 主な活動エリア
  memberCount: number;
  requiresApproval: boolean;  // true = 参加に承認が必要
  createdAt: string | null;
}

export interface GroupMember {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  role: GroupRole;
  joinedAt: string | null;
}

export interface JoinRequest {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  message: string | null;
  credentials: RiderCredentials | null;  // バイク種別・経験年数（自動送信）
  createdAt: string | null;
}

export type GroupInput = Pick<Group, 'name' | 'description' | 'area' | 'requiresApproval'>;

function tsToIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return null;
}

function db() {
  const d = getFirestoreDb();
  if (!d) throw new Error('Firebase が未設定です');
  return d;
}

function mapGroup(id: string, d: Record<string, any>): Group {
  return {
    id,
    name: String(d.name ?? ''),
    description: String(d.description ?? ''),
    ownerId: String(d.ownerId ?? ''),
    ownerName: String(d.ownerName ?? ''),
    area: d.area ?? null,
    memberCount: Number(d.memberCount ?? 0),
    requiresApproval: d.requiresApproval === true,
    createdAt: tsToIso(d.createdAt),
  };
}

// ─── グループ CRUD ───────────────────────────────────────

export async function createGroup(input: GroupInput): Promise<string> {
  const me = await requireAuthedUser();
  const photoUrl = await getMyPhotoUrl().catch(() => null);

  const ref = await addDoc(collection(db(), 'groups'), {
    name: input.name,
    description: input.description,
    area: input.area,
    requiresApproval: input.requiresApproval,
    ownerId: me.uid,
    ownerName: me.displayName,
    memberCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 作成者をオーナーとしてメンバー登録
  await Promise.all([
    setDoc(doc(db(), 'groups', ref.id, 'members', me.uid), {
      displayName: me.displayName,
      photoUrl,
      role: 'owner',
      joinedAt: serverTimestamp(),
    }),
    setDoc(doc(db(), 'users', me.uid, 'groups', ref.id), {
      name: input.name,
      role: 'owner',
      joinedAt: serverTimestamp(),
    }),
  ]);

  return ref.id;
}

export async function updateGroup(groupId: string, input: GroupInput): Promise<void> {
  await updateDoc(doc(db(), 'groups', groupId), {
    name: input.name,
    description: input.description,
    area: input.area,
    requiresApproval: input.requiresApproval,
    updatedAt: serverTimestamp(),
  });
}

/** グループを解散（メンバー・申請も削除） */
export async function deleteGroup(groupId: string): Promise<void> {
  const groupRef = doc(db(), 'groups', groupId);
  const [members, requests] = await Promise.all([
    getDocs(collection(groupRef, 'members')),
    getDocs(collection(groupRef, 'joinRequests')).catch(() => null),
  ]);

  // 各メンバーの所属一覧からも削除
  await Promise.all([
    ...members.docs.map((m) =>
      deleteDoc(doc(db(), 'users', m.id, 'groups', groupId)).catch(() => {})
    ),
    ...members.docs.map((m) => deleteDoc(m.ref).catch(() => {})),
    ...(requests?.docs ?? []).map((r) => deleteDoc(r.ref).catch(() => {})),
  ]);
  await deleteDoc(groupRef);
}

export async function getGroup(groupId: string): Promise<Group | null> {
  const snap = await getDoc(doc(db(), 'groups', groupId));
  return snap.exists() ? mapGroup(snap.id, snap.data()) : null;
}

/** 公開グループ一覧（新しい順） */
export async function getAllGroups(limitCount = 50): Promise<Group[]> {
  try {
    const snap = await getDocs(
      query(collection(db(), 'groups'), orderBy('createdAt', 'desc'), limit(limitCount))
    );
    return snap.docs.map((d) => mapGroup(d.id, d.data()));
  } catch {
    const snap = await getDocs(collection(db(), 'groups'));
    return snap.docs.map((d) => mapGroup(d.id, d.data()));
  }
}

/** 自分が所属しているグループ */
export async function getMyGroups(): Promise<Group[]> {
  const me = await requireAuthedUser();
  const snap = await getDocs(collection(db(), 'users', me.uid, 'groups'));
  const ids = snap.docs.map((d) => d.id);
  if (ids.length === 0) return [];
  const groups = await Promise.all(ids.map((id) => getGroup(id).catch(() => null)));
  return groups.filter((g): g is Group => g !== null);
}

/** 自分が所属しているグループIDの集合（計画の公開範囲判定に使う） */
export async function getMyGroupIds(): Promise<string[]> {
  try {
    const uid = getCurrentUid();
    if (!uid) return [];
    const snap = await getDocs(collection(db(), 'users', uid, 'groups'));
    return snap.docs.map((d) => d.id);
  } catch {
    return [];
  }
}

// ─── メンバー管理 ────────────────────────────────────────

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const snap = await getDocs(collection(db(), 'groups', groupId, 'members'));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: String(data.displayName ?? '匿名ライダー'),
        photoUrl: data.photoUrl ?? null,
        role: (data.role === 'owner' ? 'owner' : 'member') as GroupRole,
        joinedAt: tsToIso(data.joinedAt),
      };
    })
    // オーナーを先頭に
    .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
}

/** 自分の参加状態 */
export type MembershipState = 'member' | 'owner' | 'requested' | 'none';

export async function getMyMembership(groupId: string): Promise<MembershipState> {
  try {
    const uid = getCurrentUid();
    if (!uid) return 'none'; // 未ログインは参加状態を持たない
    const me = { uid };
    const member = await getDoc(doc(db(), 'groups', groupId, 'members', me.uid));
    if (member.exists()) {
      return member.data().role === 'owner' ? 'owner' : 'member';
    }
    const req = await getDoc(doc(db(), 'groups', groupId, 'joinRequests', me.uid));
    return req.exists() ? 'requested' : 'none';
  } catch {
    return 'none';
  }
}

/** 誰でも参加できるグループに参加する */
export async function joinGroup(group: Group): Promise<void> {
  const me = await requireAuthedUser();
  const photoUrl = await getMyPhotoUrl().catch(() => null);
  await Promise.all([
    setDoc(doc(db(), 'groups', group.id, 'members', me.uid), {
      displayName: me.displayName,
      photoUrl,
      role: 'member',
      joinedAt: serverTimestamp(),
    }),
    setDoc(doc(db(), 'users', me.uid, 'groups', group.id), {
      name: group.name,
      role: 'member',
      joinedAt: serverTimestamp(),
    }),
  ]);
  await updateDoc(doc(db(), 'groups', group.id), { memberCount: increment(1) }).catch(() => {});
}

/** グループを退会する */
export async function leaveGroup(groupId: string): Promise<void> {
  const me = await requireAuthedUser();
  await Promise.all([
    deleteDoc(doc(db(), 'groups', groupId, 'members', me.uid)),
    deleteDoc(doc(db(), 'users', me.uid, 'groups', groupId)),
  ]);
  await updateDoc(doc(db(), 'groups', groupId), { memberCount: increment(-1) }).catch(() => {});
}

/** メンバーを外す（オーナーのみ） */
export async function removeMember(groupId: string, uid: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db(), 'groups', groupId, 'members', uid)),
    deleteDoc(doc(db(), 'users', uid, 'groups', groupId)).catch(() => {}),
  ]);
  await updateDoc(doc(db(), 'groups', groupId), { memberCount: increment(-1) }).catch(() => {});
}

// ─── 参加申請（承認制グループ） ──────────────────────────

/** 参加申請を送る。バイク種別・経験年数が自動で添付される */
export async function requestToJoin(groupId: string, message: string): Promise<void> {
  const me = await requireAuthedUser();
  const [photoUrl, credentials] = await Promise.all([
    getMyPhotoUrl().catch(() => null),
    buildRiderCredentials().catch(() => null),
  ]);
  await setDoc(doc(db(), 'groups', groupId, 'joinRequests', me.uid), {
    displayName: me.displayName,
    photoUrl,
    message: message.trim() || null,
    credentials,
    createdAt: serverTimestamp(),
  });
}

/** 参加申請を取り消す */
export async function cancelJoinRequest(groupId: string): Promise<void> {
  const me = await requireAuthedUser();
  await deleteDoc(doc(db(), 'groups', groupId, 'joinRequests', me.uid));
}

export async function getJoinRequests(groupId: string): Promise<JoinRequest[]> {
  const snap = await getDocs(collection(db(), 'groups', groupId, 'joinRequests'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: String(data.displayName ?? '匿名ライダー'),
      photoUrl: data.photoUrl ?? null,
      message: data.message ?? null,
      credentials: data.credentials ?? null,
      createdAt: tsToIso(data.createdAt),
    };
  });
}

/** 参加申請を承認する（オーナーのみ） */
export async function approveJoinRequest(group: Group, req: JoinRequest): Promise<void> {
  await Promise.all([
    setDoc(doc(db(), 'groups', group.id, 'members', req.uid), {
      displayName: req.displayName,
      photoUrl: req.photoUrl,
      role: 'member',
      joinedAt: serverTimestamp(),
    }),
    setDoc(doc(db(), 'users', req.uid, 'groups', group.id), {
      name: group.name,
      role: 'member',
      joinedAt: serverTimestamp(),
    }),
    deleteDoc(doc(db(), 'groups', group.id, 'joinRequests', req.uid)),
  ]);
  await updateDoc(doc(db(), 'groups', group.id), { memberCount: increment(1) }).catch(() => {});
}

/** 参加申請を却下する（オーナーのみ） */
export async function rejectJoinRequest(groupId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db(), 'groups', groupId, 'joinRequests', uid));
}
