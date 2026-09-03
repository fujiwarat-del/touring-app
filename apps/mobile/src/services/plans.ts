// ============================================================
// ツーリング計画（募集）機能
//
// Firestore 構造:
//   plans/{planId}                      … 計画本体
//   plans/{planId}/participants/{uid}   … 参加確定者
//   plans/{planId}/applications/{uid}   … 参加申請（承認制のみ）
//
// 公開範囲（visibility）:
//   public    … 全体公開
//   followers … 主催者のフォロワーのみ
//   approval  … 誰でも見られるが参加には主催者の承認が必要
//   group     … 指定グループのメンバー限定
//
// 【認証導入前の制約】followers / group の絞り込みはクライアント側で行っている。
// Firestore 上のドキュメント自体は読める状態なので、厳密な秘匿にはならない。
// Firebase Auth 導入後にセキュリティルールでサーバー側の絞り込みへ移行すること。
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
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirestoreDb, requireAuthedUser, getCurrentUid, getMyPhotoUrl } from './firebase';
import { buildRiderCredentials } from './riderProfile';
import type { RiderCredentials } from './riderProfile';
import { getFollowingUids } from './follows';
import { getMyGroupIds } from './groups';

export type PlanVisibility = 'public' | 'followers' | 'approval' | 'group';

export const VISIBILITY_OPTIONS: Array<{
  value: PlanVisibility; label: string; icon: string; desc: string;
}> = [
  { value: 'public',    label: '全体公開',     icon: '🌐', desc: '誰でも見られて、すぐ参加できます' },
  { value: 'followers', label: 'フォロワーのみ', icon: '👥', desc: 'あなたをフォローしている人だけに表示されます' },
  { value: 'approval',  label: '承認制',       icon: '🔑', desc: '誰でも見られますが、参加はあなたの承認が必要です' },
  { value: 'group',     label: 'グループ限定',  icon: '🔒', desc: '選んだグループのメンバーだけに表示されます' },
];

export interface TouringPlan {
  id: string;
  title: string;
  description: string;
  dateTime: string;             // 開催日時（ISO）
  meetingPlace: string;         // 集合場所
  meetingMapUrl: string | null; // 集合場所のマップリンク
  routeSummary: string;         // ルート概要
  capacity: number | null;      // 定員（null = 制限なし）
  visibility: PlanVisibility;
  groupId: string | null;
  groupName: string | null;
  ownerId: string;
  ownerName: string;
  ownerPhotoUrl: string | null;
  participantCount: number;
  closed: boolean;              // 募集締切
  createdAt: string | null;
}

export interface Participant {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  credentials: RiderCredentials | null;
  joinedAt: string | null;
}

export interface PlanApplication {
  uid: string;
  displayName: string;
  photoUrl: string | null;
  message: string | null;
  credentials: RiderCredentials | null;
  createdAt: string | null;
}

export type PlanInput = Pick<
  TouringPlan,
  'title' | 'description' | 'dateTime' | 'meetingPlace' | 'meetingMapUrl'
  | 'routeSummary' | 'capacity' | 'visibility' | 'groupId' | 'groupName'
>;

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

function mapPlan(id: string, d: Record<string, any>): TouringPlan {
  return {
    id,
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
    dateTime: tsToIso(d.dateTime) ?? new Date().toISOString(),
    meetingPlace: String(d.meetingPlace ?? ''),
    meetingMapUrl: d.meetingMapUrl ?? null,
    routeSummary: String(d.routeSummary ?? ''),
    capacity: typeof d.capacity === 'number' ? d.capacity : null,
    visibility: (d.visibility ?? 'public') as PlanVisibility,
    groupId: d.groupId ?? null,
    groupName: d.groupName ?? null,
    ownerId: String(d.ownerId ?? ''),
    ownerName: String(d.ownerName ?? ''),
    ownerPhotoUrl: d.ownerPhotoUrl ?? null,
    participantCount: Number(d.participantCount ?? 0),
    closed: d.closed === true,
    createdAt: tsToIso(d.createdAt),
  };
}

// ─── 計画 CRUD ───────────────────────────────────────────

export async function createPlan(input: PlanInput): Promise<string> {
  const me = await requireAuthedUser();
  const photoUrl = await getMyPhotoUrl().catch(() => null);

  const ref = await addDoc(collection(db(), 'plans'), {
    ...input,
    dateTime: Timestamp.fromDate(new Date(input.dateTime)),
    ownerId: me.uid,
    ownerName: me.displayName,
    ownerPhotoUrl: photoUrl,
    participantCount: 1, // 主催者を含む
    closed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 主催者を参加者として登録
  const credentials = await buildRiderCredentials().catch(() => null);
  await setDoc(doc(db(), 'plans', ref.id, 'participants', me.uid), {
    displayName: me.displayName,
    photoUrl,
    credentials,
    isOwner: true,
    joinedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updatePlan(planId: string, input: PlanInput): Promise<void> {
  await updateDoc(doc(db(), 'plans', planId), {
    ...input,
    dateTime: Timestamp.fromDate(new Date(input.dateTime)),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlan(planId: string): Promise<void> {
  const planRef = doc(db(), 'plans', planId);
  const [participants, applications] = await Promise.all([
    getDocs(collection(planRef, 'participants')).catch(() => null),
    getDocs(collection(planRef, 'applications')).catch(() => null),
  ]);
  await Promise.all([
    ...(participants?.docs ?? []).map((d) => deleteDoc(d.ref).catch(() => {})),
    ...(applications?.docs ?? []).map((d) => deleteDoc(d.ref).catch(() => {})),
  ]);
  await deleteDoc(planRef);
}

export async function getPlan(planId: string): Promise<TouringPlan | null> {
  const snap = await getDoc(doc(db(), 'plans', planId));
  return snap.exists() ? mapPlan(snap.id, snap.data()) : null;
}

/** 募集の締切／再開 */
export async function setPlanClosed(planId: string, closed: boolean): Promise<void> {
  await updateDoc(doc(db(), 'plans', planId), { closed, updatedAt: serverTimestamp() });
}

/**
 * 自分が見られる計画の一覧を返す。
 * 公開範囲に応じてクライアント側で絞り込む（上部コメントの制約を参照）。
 */
export async function getVisiblePlans(): Promise<TouringPlan[]> {
  const me = await requireAuthedUser();

  let all: TouringPlan[];
  try {
    const snap = await getDocs(query(collection(db(), 'plans'), orderBy('dateTime', 'asc')));
    all = snap.docs.map((d) => mapPlan(d.id, d.data()));
  } catch {
    const snap = await getDocs(collection(db(), 'plans'));
    all = snap.docs
      .map((d) => mapPlan(d.id, d.data()))
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  }

  // 絞り込みに使う自分の情報（フォロー中・所属グループ）
  const [followingUids, myGroupIds] = await Promise.all([
    getFollowingUids().catch(() => [] as string[]),
    getMyGroupIds().catch(() => [] as string[]),
  ]);
  const followingSet = new Set(followingUids);
  const groupSet = new Set(myGroupIds);

  // 過去の予定は出さない（当日は表示する）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return all.filter((p) => {
    if (new Date(p.dateTime) < todayStart) return false;
    if (p.ownerId === me.uid) return true; // 自分の計画は常に見える

    switch (p.visibility) {
      case 'public':
      case 'approval':
        return true;
      case 'followers':
        // 「主催者をフォローしている人だけ」＝自分が主催者をフォローしているか
        return followingSet.has(p.ownerId);
      case 'group':
        return !!p.groupId && groupSet.has(p.groupId);
      default:
        return true;
    }
  });
}

/** 自分が主催している計画 */
export async function getMyPlans(): Promise<TouringPlan[]> {
  const me = await requireAuthedUser();
  const all = await getDocs(collection(db(), 'plans'));
  return all.docs
    .map((d) => mapPlan(d.id, d.data()))
    .filter((p) => p.ownerId === me.uid)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
}

// ─── 参加 ────────────────────────────────────────────────

export type ParticipationState = 'owner' | 'joined' | 'applied' | 'none';

export async function getMyParticipation(planId: string): Promise<ParticipationState> {
  try {
    const uid = getCurrentUid();
    if (!uid) return 'none'; // 未ログインは参加状態を持たない
    const me = { uid };
    const p = await getDoc(doc(db(), 'plans', planId, 'participants', me.uid));
    if (p.exists()) return p.data().isOwner ? 'owner' : 'joined';
    const a = await getDoc(doc(db(), 'plans', planId, 'applications', me.uid));
    return a.exists() ? 'applied' : 'none';
  } catch {
    return 'none';
  }
}

export async function getParticipants(planId: string): Promise<Participant[]> {
  const snap = await getDocs(collection(db(), 'plans', planId, 'participants'));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      displayName: String(data.displayName ?? '匿名ライダー'),
      photoUrl: data.photoUrl ?? null,
      credentials: data.credentials ?? null,
      joinedAt: tsToIso(data.joinedAt),
    };
  });
}

/** 承認不要の計画に参加する。バイク種別・経験年数が自動添付される */
export async function joinPlan(plan: TouringPlan): Promise<void> {
  if (plan.closed) throw new Error('この募集は締め切られています');
  if (plan.capacity != null && plan.participantCount >= plan.capacity) {
    throw new Error('定員に達しています');
  }
  const me = await requireAuthedUser();
  const [photoUrl, credentials] = await Promise.all([
    getMyPhotoUrl().catch(() => null),
    buildRiderCredentials().catch(() => null),
  ]);
  await setDoc(doc(db(), 'plans', plan.id, 'participants', me.uid), {
    displayName: me.displayName,
    photoUrl,
    credentials,
    isOwner: false,
    joinedAt: serverTimestamp(),
  });
  await updateDoc(doc(db(), 'plans', plan.id), { participantCount: increment(1) }).catch(() => {});
}

export async function leavePlan(planId: string): Promise<void> {
  const me = await requireAuthedUser();
  await deleteDoc(doc(db(), 'plans', planId, 'participants', me.uid));
  await updateDoc(doc(db(), 'plans', planId), { participantCount: increment(-1) }).catch(() => {});
}

// ─── 参加申請（承認制） ──────────────────────────────────

export async function applyToPlan(planId: string, message: string): Promise<void> {
  const me = await requireAuthedUser();
  const [photoUrl, credentials] = await Promise.all([
    getMyPhotoUrl().catch(() => null),
    buildRiderCredentials().catch(() => null),
  ]);
  await setDoc(doc(db(), 'plans', planId, 'applications', me.uid), {
    displayName: me.displayName,
    photoUrl,
    message: message.trim() || null,
    credentials,
    createdAt: serverTimestamp(),
  });
}

export async function cancelApplication(planId: string): Promise<void> {
  const me = await requireAuthedUser();
  await deleteDoc(doc(db(), 'plans', planId, 'applications', me.uid));
}

export async function getApplications(planId: string): Promise<PlanApplication[]> {
  const snap = await getDocs(collection(db(), 'plans', planId, 'applications'));
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

export async function approveApplication(plan: TouringPlan, app: PlanApplication): Promise<void> {
  if (plan.capacity != null && plan.participantCount >= plan.capacity) {
    throw new Error('定員に達しているため承認できません');
  }
  await Promise.all([
    setDoc(doc(db(), 'plans', plan.id, 'participants', app.uid), {
      displayName: app.displayName,
      photoUrl: app.photoUrl,
      credentials: app.credentials,
      isOwner: false,
      joinedAt: serverTimestamp(),
    }),
    deleteDoc(doc(db(), 'plans', plan.id, 'applications', app.uid)),
  ]);
  await updateDoc(doc(db(), 'plans', plan.id), { participantCount: increment(1) }).catch(() => {});
}

export async function rejectApplication(planId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db(), 'plans', planId, 'applications', uid));
}

// ─── 表示ユーティリティ ──────────────────────────────────

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function formatPlanDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 開催までの残り日数（当日は0） */
export function daysUntil(iso: string): number {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
