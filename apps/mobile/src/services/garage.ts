// ============================================================
// ガレージ機能 データアクセス層
// users/{userId}/bikes/{bikeId}
// users/{userId}/bikes/{bikeId}/checklists/{checklistId}
// ============================================================

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestoreDb, ensureAnonymousAuth } from './firebase';
import type { CheckResultItem } from '../constants/checkItems';

// ─── 型定義 ──────────────────────────────────────────────

export interface GarageBike {
  id: string;
  name: string;              // 愛車の呼び名（例: "CB750"）
  maker: string;
  model: string;
  year: number | null;
  odometer: number;          // 現在の走行距離(km)
  shakenDate: string | null;    // 車検満了日（ISO文字列。251cc以上のみ・任意）
  jibaisekiDate: string | null; // 自賠責満了日（ISO文字列・任意）
  insuranceDate: string | null; // 任意保険満了日（ISO文字列・任意）
  oilChangeDate: string | null;     // 前回オイル交換日（ISO文字列・任意）
  oilChangeOdometer: number | null; // 前回オイル交換時の走行距離(km・任意)
  lastCheckAt: string | null;   // 最終チェック日（非正規化・カード表示用）
  createdAt?: string;
  updatedAt?: string;
  // 将来拡張: photoUrl（愛車写真, Firebase Storage 導入後）
}

export type GarageBikeInput = Omit<GarageBike, 'id' | 'lastCheckAt' | 'createdAt' | 'updatedAt'>;

export interface ChecklistRecord {
  id: string;
  date: string;              // 点検日時（ISO文字列）
  odometer: number;          // 点検時の走行距離
  items: CheckResultItem[];
  createdAt?: string;
}

// ─── 内部ヘルパー ────────────────────────────────────────

function tsToIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return null;
}

function isoToTs(v: string | null): Timestamp | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

async function bikesCol() {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase が未設定です');
  const user = await ensureAnonymousAuth();
  return collection(db, 'users', user.uid, 'bikes');
}

async function bikeDoc(bikeId: string) {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase が未設定です');
  const user = await ensureAnonymousAuth();
  return doc(db, 'users', user.uid, 'bikes', bikeId);
}

function mapBike(id: string, data: Record<string, any>): GarageBike {
  return {
    id,
    name: String(data.name ?? ''),
    maker: String(data.maker ?? ''),
    model: String(data.model ?? ''),
    year: typeof data.year === 'number' ? data.year : null,
    odometer: Number(data.odometer ?? 0),
    shakenDate: tsToIso(data.shakenDate),
    jibaisekiDate: tsToIso(data.jibaisekiDate),
    insuranceDate: tsToIso(data.insuranceDate),
    oilChangeDate: tsToIso(data.oilChangeDate),
    oilChangeOdometer: typeof data.oilChangeOdometer === 'number' ? data.oilChangeOdometer : null,
    lastCheckAt: tsToIso(data.lastCheckAt),
    createdAt: tsToIso(data.createdAt) ?? undefined,
    updatedAt: tsToIso(data.updatedAt) ?? undefined,
  };
}

// ─── バイク CRUD ─────────────────────────────────────────

export async function getGarageBikes(): Promise<GarageBike[]> {
  const col = await bikesCol();
  const snap = await getDocs(query(col, orderBy('createdAt', 'asc')));
  return snap.docs.map((d) => mapBike(d.id, d.data()));
}

export async function getGarageBike(bikeId: string): Promise<GarageBike | null> {
  const ref = await bikeDoc(bikeId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapBike(snap.id, snap.data());
}

export async function addGarageBike(input: GarageBikeInput): Promise<string> {
  const col = await bikesCol();
  const ref = await addDoc(col, {
    name: input.name,
    maker: input.maker,
    model: input.model,
    year: input.year,
    odometer: input.odometer,
    shakenDate: isoToTs(input.shakenDate),
    jibaisekiDate: isoToTs(input.jibaisekiDate),
    insuranceDate: isoToTs(input.insuranceDate),
    oilChangeDate: isoToTs(input.oilChangeDate),
    oilChangeOdometer: input.oilChangeOdometer,
    lastCheckAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateGarageBike(bikeId: string, input: GarageBikeInput): Promise<void> {
  const ref = await bikeDoc(bikeId);
  await updateDoc(ref, {
    name: input.name,
    maker: input.maker,
    model: input.model,
    year: input.year,
    odometer: input.odometer,
    shakenDate: isoToTs(input.shakenDate),
    jibaisekiDate: isoToTs(input.jibaisekiDate),
    insuranceDate: isoToTs(input.insuranceDate),
    oilChangeDate: isoToTs(input.oilChangeDate),
    oilChangeOdometer: input.oilChangeOdometer,
    updatedAt: serverTimestamp(),
  });
}

/** 車両を削除（配下のチェックリスト履歴も削除） */
export async function deleteGarageBike(bikeId: string): Promise<void> {
  const ref = await bikeDoc(bikeId);
  // サブコレクションは自動削除されないため先に消す
  const checksSnap = await getDocs(collection(ref, 'checklists'));
  await Promise.all(checksSnap.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(ref);
}

// ─── チェックリスト ──────────────────────────────────────

export async function getChecklists(bikeId: string): Promise<ChecklistRecord[]> {
  const ref = await bikeDoc(bikeId);
  const snap = await getDocs(query(collection(ref, 'checklists'), orderBy('date', 'desc')));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      date: tsToIso(data.date) ?? new Date().toISOString(),
      odometer: Number(data.odometer ?? 0),
      items: Array.isArray(data.items) ? data.items : [],
      createdAt: tsToIso(data.createdAt) ?? undefined,
    };
  });
}

/**
 * チェックリストを保存し、親バイクの odometer / lastCheckAt を更新する
 */
export async function saveChecklist(
  bikeId: string,
  odometer: number,
  items: CheckResultItem[]
): Promise<string> {
  const ref = await bikeDoc(bikeId);
  const now = Timestamp.now();
  const checkRef = await addDoc(collection(ref, 'checklists'), {
    date: now,
    odometer,
    items,
    createdAt: serverTimestamp(),
  });
  // 走行距離の最新値と最終チェック日を車両側に反映
  await updateDoc(ref, {
    odometer,
    lastCheckAt: now,
    updatedAt: serverTimestamp(),
  });
  return checkRef.id;
}

// ─── 既存マイバイク（プロフィール画面）からの初回取り込み ──

const GARAGE_SEEDED_KEY = '@touring_app_garage_seeded';
const MY_BIKES_KEY = '@touring_app_my_bikes';

/**
 * 初回のみ、プロフィール画面の簡易マイバイク（AsyncStorage）をガレージへ取り込む。
 * 走行距離は 0 で仮登録し、ユーザーが編集する想定。
 */
export async function seedGarageFromMyBikes(): Promise<number> {
  const seeded = await AsyncStorage.getItem(GARAGE_SEEDED_KEY);
  if (seeded === 'true') return 0;

  try {
    const existing = await getGarageBikes();
    if (existing.length > 0) {
      await AsyncStorage.setItem(GARAGE_SEEDED_KEY, 'true');
      return 0;
    }

    const raw = await AsyncStorage.getItem(MY_BIKES_KEY);
    const myBikes: { maker: string; model: string; year: string }[] = raw ? JSON.parse(raw) : [];
    let count = 0;
    for (const b of myBikes) {
      if (!b.maker && !b.model) continue;
      await addGarageBike({
        name: b.model || b.maker,
        maker: b.maker,
        model: b.model,
        year: b.year && /^\d{4}$/.test(b.year) ? Number(b.year) : null,
        odometer: 0,
        shakenDate: null,
        jibaisekiDate: null,
        insuranceDate: null,
        oilChangeDate: null,
        oilChangeOdometer: null,
      });
      count++;
    }
    await AsyncStorage.setItem(GARAGE_SEEDED_KEY, 'true');
    return count;
  } catch {
    return 0;
  }
}

// ─── 期日ユーティリティ ──────────────────────────────────

export interface ExpiryInfo {
  label: string;        // '車検' | '自賠責'
  daysLeft: number;     // 負数=期限切れ
  expired: boolean;
}

/** 満了日まで60日以内（または期限切れ）の警告情報を返す */
export function getExpiryWarnings(bike: GarageBike): ExpiryInfo[] {
  const warnings: ExpiryInfo[] = [];
  const now = Date.now();
  const check = (dateIso: string | null, label: string) => {
    if (!dateIso) return;
    const d = new Date(dateIso);
    if (isNaN(d.getTime())) return;
    const daysLeft = Math.ceil((d.getTime() - now) / (24 * 60 * 60 * 1000));
    if (daysLeft <= 60) {
      warnings.push({ label, daysLeft, expired: daysLeft < 0 });
    }
  };
  check(bike.shakenDate, '車検');
  check(bike.jibaisekiDate, '自賠責');
  check(bike.insuranceDate, '任意保険');
  return warnings;
}

/** 数値をカンマ区切り表示（例: 12345 → "12,345"） */
export function formatKm(n: number): string {
  return n.toLocaleString('ja-JP');
}
