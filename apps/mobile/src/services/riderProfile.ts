// ============================================================
// ライダープロフィール（SNS用の拡張プロフィール）
// Firestore: userProfiles/{userId}
//
// ツーリング計画への参加申請時、ここの情報（バイク種別・経験年数）が
// 主催者へ自動送信される。申請ごとに手入力させないための供給元。
// ============================================================

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestoreDb, requireAuthedUser, getCurrentUid } from './firebase';
import { getGarageBikes } from './garage';

/** 主な走行エリア（8地域） */
export const RIDING_AREAS = [
  '北海道', '東北', '関東', '中部', '近畿', '中国', '四国', '九州・沖縄',
] as const;

/** ツーリング歴の選択肢（年） */
export const TOURING_YEARS_OPTIONS = [
  { value: 0, label: '1年未満' },
  { value: 1, label: '1年' },
  { value: 2, label: '2年' },
  { value: 3, label: '3年' },
  { value: 5, label: '5年' },
  { value: 10, label: '10年' },
  { value: 15, label: '15年' },
  { value: 20, label: '20年以上' },
] as const;

export interface RiderProfile {
  touringYears: number | null;  // ツーリング歴（年）。null = 未設定
  ridingAreas: string[];        // 主な走行エリア
  bio: string | null;           // 自己紹介
}

/** 参加申請時に主催者へ自動送信されるスナップショット */
export interface RiderCredentials {
  bikeType: string | null;      // 代表車両のタイプ（中型以上 / オフロード / 小型125cc以下）
  bikeName: string | null;      // 代表車両名（例: NIKEN GT）
  touringYears: number | null;
  ridingAreas: string[];
}

const LOCAL_CACHE_KEY = '@touring_app_rider_profile';
const MY_BIKES_KEY = '@touring_app_my_bikes';

function emptyProfile(): RiderProfile {
  return { touringYears: null, ridingAreas: [], bio: null };
}

/** 自分の拡張プロフィールを取得（オフライン時は端末キャッシュ） */
export async function getMyRiderProfile(): Promise<RiderProfile> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const uid = getCurrentUid();
      if (!uid) throw new Error('not signed in'); // → 端末キャッシュへ
      const snap = await getDoc(doc(db, 'userProfiles', uid));
      if (snap.exists()) {
        const d = snap.data();
        const profile: RiderProfile = {
          touringYears: typeof d.touringYears === 'number' ? d.touringYears : null,
          ridingAreas: Array.isArray(d.ridingAreas) ? d.ridingAreas : [],
          bio: typeof d.bio === 'string' ? d.bio : null,
        };
        AsyncStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(profile)).catch(() => {});
        return profile;
      }
    } catch {
      // オフライン等 → キャッシュへフォールバック
    }
  }
  const raw = await AsyncStorage.getItem(LOCAL_CACHE_KEY).catch(() => null);
  return raw ? JSON.parse(raw) : emptyProfile();
}

/** 他ユーザーの拡張プロフィールを取得 */
export async function getRiderProfile(uid: string): Promise<RiderProfile> {
  const db = getFirestoreDb();
  if (!db) return emptyProfile();
  try {
    const snap = await getDoc(doc(db, 'userProfiles', uid));
    if (!snap.exists()) return emptyProfile();
    const d = snap.data();
    return {
      touringYears: typeof d.touringYears === 'number' ? d.touringYears : null,
      ridingAreas: Array.isArray(d.ridingAreas) ? d.ridingAreas : [],
      bio: typeof d.bio === 'string' ? d.bio : null,
    };
  } catch {
    return emptyProfile();
  }
}

/** 拡張プロフィールを保存 */
export async function updateMyRiderProfile(patch: Partial<RiderProfile>): Promise<void> {
  const current = await getMyRiderProfile();
  const next: RiderProfile = { ...current, ...patch };
  await AsyncStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(next)).catch(() => {});

  const db = getFirestoreDb();
  if (!db) return;
  const user = await requireAuthedUser();
  await setDoc(
    doc(db, 'userProfiles', user.uid),
    { ...next, displayName: user.displayName, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * 参加申請に添付する自己紹介データを組み立てる。
 * 車両はガレージを優先し、未登録ならプロフィールのマイバイクを使う。
 */
export async function buildRiderCredentials(): Promise<RiderCredentials> {
  const profile = await getMyRiderProfile();

  let bikeType: string | null = null;
  let bikeName: string | null = null;

  // ガレージの1台目を代表車両とする
  try {
    const bikes = await getGarageBikes();
    if (bikes.length > 0) {
      bikeName = bikes[0].name;
      // ガレージには種別を持たないため、マイバイク側の種別を突き合わせる
      const raw = await AsyncStorage.getItem(MY_BIKES_KEY);
      const myBikes: { model?: string; maker?: string; bikeType?: string }[] = raw ? JSON.parse(raw) : [];
      const matched = myBikes.find(
        (b) => b.model === bikes[0].model || b.maker === bikes[0].maker
      );
      bikeType = matched?.bikeType ?? null;
    }
  } catch {
    // ガレージ取得失敗は無視
  }

  // ガレージ未登録ならマイバイクから
  if (!bikeName) {
    try {
      const raw = await AsyncStorage.getItem(MY_BIKES_KEY);
      const myBikes: { model?: string; maker?: string; bikeType?: string }[] = raw ? JSON.parse(raw) : [];
      if (myBikes.length > 0) {
        bikeName = [myBikes[0].maker, myBikes[0].model].filter(Boolean).join(' ') || null;
        bikeType = myBikes[0].bikeType ?? null;
      }
    } catch {
      // 無視
    }
  }

  return {
    bikeType,
    bikeName,
    touringYears: profile.touringYears,
    ridingAreas: profile.ridingAreas,
  };
}

/** ツーリング歴を表示用の文字列にする */
export function formatTouringYears(years: number | null): string {
  if (years == null) return '未設定';
  const opt = TOURING_YEARS_OPTIONS.find((o) => o.value === years);
  return opt?.label ?? `${years}年`;
}
