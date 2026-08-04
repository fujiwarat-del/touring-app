// ============================================================
// ツーリングアルバム（走行ログ） データアクセス層
// Firestore: users/{userId}/tours/{tourId}
// Storage:   users/{userId}/tours/{tourId}/{photoId}.jpg
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
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from 'firebase/storage';
import { getFirestoreDb, getFirebaseApp, ensureAnonymousAuth } from './firebase';
import { compressImage } from './imageUtils';

/** 1ツーリングあたりの写真上限（将来、有料プランで無制限化する想定） */
export const MAX_TOUR_PHOTOS = 10;

/** 天気の選択肢 */
export const TOUR_WEATHER_OPTIONS = ['☀️ 晴れ', '☁️ 曇り', '🌧️ 雨', '❄️ 雪'] as const;

// ─── 型定義 ──────────────────────────────────────────────

export interface TourPhoto {
  storagePath: string;
  url: string;             // ダウンロードURL（キャッシュ）
  caption: string | null;
  order: number;
}

export interface TourRoute {
  origin: string;
  waypoints: string[];
  destination: string;
}

export interface Tour {
  id: string;
  title: string;
  date: string;            // ISO文字列
  bikeId: string | null;
  distanceKm: number;
  route: TourRoute | null;
  prefectures: string[];
  memo: string | null;
  weather: string | null;
  photos: TourPhoto[];
  coverPhotoIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export type TourInput = Omit<Tour, 'id' | 'photos' | 'createdAt' | 'updatedAt'>;

// ─── 内部ヘルパー ────────────────────────────────────────

function tsToIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (typeof v === 'string') return v;
  return null;
}

async function toursCol() {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase が未設定です');
  const user = await ensureAnonymousAuth();
  return { col: collection(db, 'users', user.uid, 'tours'), uid: user.uid };
}

async function tourDoc(tourId: string) {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firebase が未設定です');
  const user = await ensureAnonymousAuth();
  return { ref: doc(db, 'users', user.uid, 'tours', tourId), uid: user.uid };
}

function mapTour(id: string, data: Record<string, any>): Tour {
  return {
    id,
    title: String(data.title ?? ''),
    date: tsToIso(data.date) ?? new Date().toISOString(),
    bikeId: data.bikeId ?? null,
    distanceKm: Number(data.distanceKm ?? 0),
    route: data.route ?? null,
    prefectures: Array.isArray(data.prefectures) ? data.prefectures : [],
    memo: data.memo ?? null,
    weather: data.weather ?? null,
    photos: Array.isArray(data.photos) ? data.photos : [],
    coverPhotoIndex: Number(data.coverPhotoIndex ?? 0),
    createdAt: tsToIso(data.createdAt) ?? undefined,
    updatedAt: tsToIso(data.updatedAt) ?? undefined,
  };
}

// ─── ツアー CRUD ─────────────────────────────────────────

export async function getTours(): Promise<Tour[]> {
  const { col } = await toursCol();
  const snap = await getDocs(query(col, orderBy('date', 'desc')));
  return snap.docs.map((d) => mapTour(d.id, d.data()));
}

export async function getTour(tourId: string): Promise<Tour | null> {
  const { ref } = await tourDoc(tourId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return mapTour(snap.id, snap.data());
}

/**
 * ツアー本体を先に保存して tourId を確定する（写真は後から追加）。
 * 途中離脱しても「写真なしの有効なツアー」として残る設計。
 */
export async function addTour(input: TourInput): Promise<string> {
  const { col } = await toursCol();
  const ref = await addDoc(col, {
    title: input.title,
    date: Timestamp.fromDate(new Date(input.date)),
    bikeId: input.bikeId,
    distanceKm: input.distanceKm,
    route: input.route,
    prefectures: input.prefectures,
    memo: input.memo,
    weather: input.weather,
    photos: [],
    coverPhotoIndex: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTour(tourId: string, input: TourInput): Promise<void> {
  const { ref } = await tourDoc(tourId);
  await updateDoc(ref, {
    title: input.title,
    date: Timestamp.fromDate(new Date(input.date)),
    bikeId: input.bikeId,
    distanceKm: input.distanceKm,
    route: input.route,
    prefectures: input.prefectures,
    memo: input.memo,
    weather: input.weather,
    coverPhotoIndex: input.coverPhotoIndex,
    updatedAt: serverTimestamp(),
  });
}

/** 写真配列とカバー指定のみ更新 */
export async function updateTourPhotos(
  tourId: string,
  photos: TourPhoto[],
  coverPhotoIndex: number
): Promise<void> {
  const { ref } = await tourDoc(tourId);
  await updateDoc(ref, { photos, coverPhotoIndex, updatedAt: serverTimestamp() });
}

/**
 * ツアーを削除（Storage 上の写真も削除して孤児ファイルを残さない）
 */
export async function deleteTour(tourId: string): Promise<void> {
  const { ref, uid } = await tourDoc(tourId);
  const app = getFirebaseApp();
  if (app) {
    try {
      const storage = getStorage(app);
      const folderRef = storageRef(storage, `users/${uid}/tours/${tourId}`);
      const listing = await listAll(folderRef);
      await Promise.all(listing.items.map((item) => deleteObject(item).catch(() => {})));
    } catch {
      // Storage 削除失敗でもドキュメント削除は続行（写真URLが無効になるだけ）
    }
  }
  await deleteDoc(ref);
}

// ─── 写真アップロード ─────────────────────────────────────

/**
 * 写真1枚を圧縮して Storage へアップロードし、TourPhoto を返す。
 * 圧縮仕様: 長辺1280px・JPEG品質0.7（imageUtils.compressImage）
 */
export async function uploadTourPhoto(
  tourId: string,
  localUri: string,
  order: number
): Promise<TourPhoto> {
  const app = getFirebaseApp();
  if (!app) throw new Error('Firebase が未設定です');
  const user = await ensureAnonymousAuth();

  const compressedUri = await compressImage(localUri);
  const response = await fetch(compressedUri);
  const blob = await response.blob();

  const photoId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `users/${user.uid}/tours/${tourId}/${photoId}.jpg`;

  const storage = getStorage(app);
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(fileRef);

  return { storagePath: path, url, caption: null, order };
}

// ─── 集計 ────────────────────────────────────────────────

export interface YearlyStats {
  year: number;
  tourCount: number;
  totalDistanceKm: number;
  prefectures: string[];  // 重複なし
}

/** 年間サマリーを算出（クライアント側集計） */
export function calcYearlyStats(tours: Tour[], year: number): YearlyStats {
  const inYear = tours.filter((t) => new Date(t.date).getFullYear() === year);
  const prefSet = new Set<string>();
  inYear.forEach((t) => t.prefectures.forEach((p) => prefSet.add(p)));
  return {
    year,
    tourCount: inYear.length,
    totalDistanceKm: inYear.reduce((sum, t) => sum + (t.distanceKm || 0), 0),
    prefectures: Array.from(prefSet),
  };
}

/**
 * 車両ごとのツーリング実績（回数・合計距離）
 * TODO: ツアー数が増えた場合は全件クエリでの集計コストが問題になるため、
 *       bike ドキュメント側にカウンタを非正規化する等の対策を検討する
 */
export async function getBikeStats(bikeId: string): Promise<{ count: number; totalKm: number }> {
  const tours = await getTours();
  const byBike = tours.filter((t) => t.bikeId === bikeId);
  return {
    count: byBike.length,
    totalKm: byBike.reduce((sum, t) => sum + (t.distanceKm || 0), 0),
  };
}
