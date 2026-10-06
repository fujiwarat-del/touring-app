// ============================================================
// ツーリング計画の参加者間で到着予定を共有する
//
// 【方式】出発前に1タップで開始し、以降は背景で自動更新する。
// 走行中の操作は一切求めない（グローブとヘルメットで操作できないため）。
//
// 【前面サービス方式】expo-location の foregroundService を使うので
// ACCESS_BACKGROUND_LOCATION は不要。Play ストアの背景位置に関する
// 個別審査を回避できる。開始時にアプリが前面にいる必要があるが、
// 「出発前にボタンを押す」という想定UXと一致するので問題にならない。
//
// 【Xiaomi 系の制約】実機検証で、最近のアプリ画面でアプリをロックしないと
// OS が配信を止めることを確認した（取得率 3〜15%、ロックすれば約100%）。
// 利用者がこの設定をするとは期待できないため、呼び出し側は
// 「最終更新からの経過時間」を必ず表示し、古い位置を現在地として見せないこと。
// ============================================================

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, setDoc, deleteDoc, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase';
import { getFirebaseAuth } from './auth';
import { estimateEta, hasArrived } from './eta';

export const SHARING_TASK = 'plan-location-sharing';
const SESSION_KEY = '@plan_sharing_session';
const SPEEDS_KEY = '@plan_sharing_speeds';
const LAST_WRITE_KEY = '@plan_sharing_last_write';

/** Firestore への書き込み間隔。測位のたびに書くと人数の二乗で読み取りが増える */
const WRITE_INTERVAL_MS = 150_000; // 2分30秒

export type SharingMode = 'eta' | 'full';

interface SharingSession {
  planId: string;
  mode: SharingMode;
  /** 集合場所の座標 */
  destLat: number;
  destLng: number;
  /** 共有を自動終了する時刻（ISO）。消し忘れ防止 */
  expiresAt: string;
}

export interface SharedStatus {
  uid: string;
  mode: SharingMode;
  etaMinutes: number | null;
  distanceKm: number | null;
  /** mode === 'full' のときだけ入る */
  lat: number | null;
  lng: number | null;
  /** 測位時刻（ミリ秒）。鮮度の判定に使う */
  fixAt: number;
  arrived: boolean;
}

// ─── セッションの保存先 ──────────────────────────────────
// 背景タスクは App.tsx を経由せずに起動されうるため、必要な情報は
// メモリではなく AsyncStorage に置く。

async function loadSession(): Promise<SharingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SharingSession) : null;
  } catch {
    return null;
  }
}

async function saveSession(s: SharingSession): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)).catch(() => {});
}

async function clearSessionData(): Promise<void> {
  await AsyncStorage.multiRemove([SESSION_KEY, SPEEDS_KEY, LAST_WRITE_KEY]).catch(() => {});
}

/**
 * 背景タスクでは App.tsx の認証リスナーが動いているとは限らない。
 * AsyncStorage に永続化されたセッションの復元を待ってから UID を返す。
 */
function waitForUid(timeoutMs = 8000): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { unsub(); resolve(null); }, timeoutMs);
    const unsub = auth.onAuthStateChanged((u) => {
      clearTimeout(timer);
      unsub();
      resolve(u?.uid ?? null);
    });
  });
}

// ─── 背景タスク ──────────────────────────────────────────
// 定義はモジュール読み込み時に行う必要がある。アプリが一度終了させられた後に
// OS がタスクを再開する場合、定義済みでないと更新を受け取れない。

TaskManager.defineTask(SHARING_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  const latest = locations?.[locations.length - 1];
  if (!latest) return;

  const session = await loadSession();
  if (!session) return;

  // 期限切れなら自分で止める（消し忘れたまま電池を食い続けるのを防ぐ）
  if (Date.now() > new Date(session.expiresAt).getTime()) {
    await stopSharing().catch(() => {});
    return;
  }

  const here = { lat: latest.coords.latitude, lng: latest.coords.longitude };
  const dest = { lat: session.destLat, lng: session.destLng };

  // 速度の履歴（ETA の推定に使う移動平均）
  let speeds: number[] = [];
  try {
    const raw = await AsyncStorage.getItem(SPEEDS_KEY);
    speeds = raw ? JSON.parse(raw) : [];
  } catch { /* 履歴が壊れていても既定速度で続行する */ }
  if (typeof latest.coords.speed === 'number' && latest.coords.speed >= 0) {
    speeds = [...speeds, latest.coords.speed].slice(-10);
    await AsyncStorage.setItem(SPEEDS_KEY, JSON.stringify(speeds)).catch(() => {});
  }

  const arrived = hasArrived(here, dest);

  // 書き込みの間引き。到着時だけは即座に反映する
  const lastWrite = Number((await AsyncStorage.getItem(LAST_WRITE_KEY)) ?? 0);
  if (!arrived && Date.now() - lastWrite < WRITE_INTERVAL_MS) return;

  await writeStatus(session, here, latest.timestamp ?? Date.now(), speeds, arrived);
  await AsyncStorage.setItem(LAST_WRITE_KEY, String(Date.now())).catch(() => {});

  if (arrived) {
    // 到着したら共有を終える。待つ側には到着が伝わった状態で残る
    await stopSharing().catch(() => {});
  }
});

async function writeStatus(
  session: SharingSession,
  here: { lat: number; lng: number },
  fixAt: number,
  speeds: number[],
  arrived: boolean
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;
  const uid = await waitForUid();
  if (!uid) return;

  const { distanceKm, etaMinutes } = estimateEta(here, {
    lat: session.destLat, lng: session.destLng,
  }, speeds);

  // mode が 'eta' のときは座標を「送らない」。
  // 表示側で隠すのではなく、そもそも端末から出さないことが要点。
  const payload: Record<string, unknown> = {
    mode: session.mode,
    etaMinutes: arrived ? 0 : etaMinutes,
    distanceKm: arrived ? 0 : distanceKm,
    arrived,
    fixAt,
    updatedAt: serverTimestamp(),
  };
  if (session.mode === 'full') {
    payload.lat = here.lat;
    payload.lng = here.lng;
  }

  await setDoc(doc(db, 'plans', session.planId, 'sharing', uid), payload).catch(() => {});
}

// ─── 開始・停止 ──────────────────────────────────────────

export async function isSharing(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(SHARING_TASK);
  } catch {
    return false;
  }
}

/** 現在どの企画を共有しているか（していなければ null） */
export async function getActiveSession(): Promise<SharingSession | null> {
  return (await isSharing()) ? loadSession() : null;
}

export async function startSharing(params: {
  planId: string;
  mode: SharingMode;
  destLat: number;
  destLng: number;
  /** 共有を自動終了するまでの時間。既定は12時間 */
  durationHours?: number;
}): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('位置情報の許可が必要です');
  }

  // Android 13 以降は通知権限が無いと常駐通知を出せず、前面サービスが成立しない。
  // その状態では背景に回った直後に位置情報が遮断される。
  const noti = await Notifications.requestPermissionsAsync().catch(() => null);
  if (noti?.status !== 'granted') {
    throw new Error(
      '通知の許可が必要です。走行中であることを示す通知を出せないと、' +
      '位置の共有が止まってしまいます。'
    );
  }

  const expiresAt = new Date(
    Date.now() + (params.durationHours ?? 12) * 3600_000
  ).toISOString();

  await saveSession({
    planId: params.planId,
    mode: params.mode,
    destLat: params.destLat,
    destLng: params.destLng,
    expiresAt,
  });
  await AsyncStorage.multiRemove([SPEEDS_KEY, LAST_WRITE_KEY]).catch(() => {});

  await Location.startLocationUpdatesAsync(SHARING_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // 走行中を想定し距離でも間引く。停車中に無駄な測位を繰り返さないため
    timeInterval: 60_000,
    distanceInterval: 300,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ツーリングの到着予定を共有しています',
      notificationBody: '参加者に現在の到着予定を知らせています',
      notificationColor: '#1D9E75',
    },
  });
}

export async function stopSharing(): Promise<void> {
  const session = await loadSession();
  if (await isSharing()) {
    await Location.stopLocationUpdatesAsync(SHARING_TASK).catch(() => {});
  }
  // 自分の共有ドキュメントは消す。待つ側に古い情報を残さないため
  if (session) {
    const db = getFirestoreDb();
    const uid = await waitForUid();
    if (db && uid) {
      await deleteDoc(doc(db, 'plans', session.planId, 'sharing', uid)).catch(() => {});
    }
  }
  await clearSessionData();
}

// ─── 参照 ────────────────────────────────────────────────

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number') return v;
  return 0;
}

/** その企画で共有中の参加者の状況を取得する */
export async function getSharedStatuses(planId: string): Promise<SharedStatus[]> {
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, 'plans', planId, 'sharing'));
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        mode: (x.mode === 'full' ? 'full' : 'eta') as SharingMode,
        etaMinutes: typeof x.etaMinutes === 'number' ? x.etaMinutes : null,
        distanceKm: typeof x.distanceKm === 'number' ? x.distanceKm : null,
        lat: typeof x.lat === 'number' ? x.lat : null,
        lng: typeof x.lng === 'number' ? x.lng : null,
        fixAt: toMillis(x.fixAt),
        arrived: x.arrived === true,
      };
    });
  } catch {
    // 参加者でなければルールに拒否される。その場合は空で返す
    return [];
  }
}
