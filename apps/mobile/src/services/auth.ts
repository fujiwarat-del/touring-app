// ============================================================
// Firebase Authentication（Google / Apple サインイン）
//
// 【重要】このアプリは長らく「端末内で生成した匿名UID」で運用してきた。
// 認証導入により UID が Firebase のものへ切り替わるため、初回サインイン時に
// 旧UIDのデータ（投稿・ガレージ・アルバム・フォロー等）を新UIDへ引き継ぐ。
// 引き継ぎは migrateLegacyData() が担当し、同じ端末での初回ログイン時のみ動作する。
// ============================================================

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeAuth,
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
// getReactNativePersistence は firebase v10 の React Native ビルドには存在するが、
// 'firebase/auth' の型定義（ブラウザ向け）には含まれていない既知の問題があるため
// ここだけ実行時参照で取得する。Metro は firebase/auth を RN ビルドへ解決する。
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: unknown) => any;
};
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { getFirebaseApp, setAuthedUser } from './firebase';
import { migrateLegacyData, needsMigration, describeMigration } from './migration';
import type { MigrationResult } from './migration';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

// ─── Auth インスタンス ────────────────────────────────────
// React Native では initializeAuth + AsyncStorage 永続化を指定しないと
// アプリ再起動でログイン状態が消える
let _auth: Auth | null = null;

// 初期化に失敗した理由を保持する。以前は catch {} で2段とも握り潰しており
// 「Firebase が未設定です」しか出ずに原因が追えなかったため、
// 実際の例外を残してUIまで持ち上げる。
let _authInitError: string | null = null;

export function getAuthInitError(): string | null {
  return _authInitError;
}

function errText(e: unknown): string {
  const anyE = e as any;
  return anyE?.code ? `${anyE.code}: ${anyE.message}` : (anyE?.message ?? String(e));
}

export function getFirebaseAuth(): Auth | null {
  if (_auth) return _auth;
  _authInitError = null;

  const app = getFirebaseApp();
  if (!app) {
    _authInitError =
      'Firebase App が初期化されていません（EXPO_PUBLIC_FIREBASE_API_KEY / PROJECT_ID が空）';
    return null;
  }

  // 永続化は取得できなければ諦める。永続化なしでもサインイン自体は成立するので、
  // ここで失敗して全体を止めるのは損（再起動でログアウトされるだけ）。
  let persistence: unknown = undefined;
  try {
    persistence = getReactNativePersistence?.(AsyncStorage);
  } catch (e) {
    _authInitError = `getReactNativePersistence 失敗: ${errText(e)}`;
  }
  if (!persistence && !_authInitError) {
    _authInitError = 'getReactNativePersistence が undefined（firebase/auth の解決先が RN ビルドでない）';
  }

  const errors: string[] = [];
  if (_authInitError) errors.push(_authInitError);

  try {
    _auth = persistence
      ? initializeAuth(app, { persistence: persistence as any })
      : initializeAuth(app);
    _authInitError = null;
    return _auth;
  } catch (e) {
    errors.push(`initializeAuth: ${errText(e)}`);
  }

  // 既に初期化済み（auth/already-initialized）などはこちらで拾える
  try {
    _auth = getAuth(app);
    _authInitError = null;
    return _auth;
  } catch (e) {
    errors.push(`getAuth: ${errText(e)}`);
  }

  _authInitError = errors.join(' / ');
  console.error('[Auth] 初期化失敗:', _authInitError);
  return null;
}

/** ログイン処理の入口で使う。null のときは理由込みで例外にする。 */
function requireAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error(`認証を初期化できません — ${_authInitError ?? '原因不明'}`);
  return auth;
}

let googleConfigured = false;
function configureGoogle() {
  if (googleConfigured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
  googleConfigured = true;
}

// ─── サインイン ──────────────────────────────────────────

export async function signInWithGoogle(): Promise<User> {
  const auth = requireAuth();
  if (!WEB_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID が未設定です');
  }
  configureGoogle();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result: any = await GoogleSignin.signIn();

  // ライブラリのバージョンで戻り値の形が違うため両対応
  const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Googleサインインをキャンセルしました');

  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);
  return cred.user;
}

export async function signInWithApple(): Promise<User> {
  const auth = requireAuth();

  // Apple はリプレイ攻撃防止に nonce を要求する。
  // 生の nonce を Apple へは SHA256 で、Firebase へは生のまま渡す。
  const rawNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) {
    throw new Error('Appleサインインをキャンセルしました');
  }

  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });
  const cred = await signInWithCredential(auth, credential);

  // Apple は初回のみ名前を返す。取り逃すと二度と取れないのでここで保存する
  const fullName = appleCredential.fullName;
  if (fullName && !cred.user.displayName) {
    const name = [fullName.familyName, fullName.givenName].filter(Boolean).join(' ').trim();
    if (name) await updateProfile(cred.user, { displayName: name }).catch(() => {});
  }
  return cred.user;
}

/** Appleサインインが使える端末か（iOS 13+ のみ） */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await fbSignOut(auth).catch(() => {});
  try {
    configureGoogle();
    await GoogleSignin.signOut();
  } catch {
    // Google を使っていないセッションでは失敗しうる
  }
  // 既存サービス側のキャッシュもクリアして未ログイン状態へ戻す
  setAuthedUser(null);
}

/** 現在のFirebaseユーザー（未ログインなら null） */
export function getCurrentUser(): User | null {
  return getFirebaseAuth()?.currentUser ?? null;
}

export function onFirebaseAuthChanged(cb: (user: User | null) => void): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    // 既存サービス（requireAuthedUser を使う全機能）へUIDを反映する
    setAuthedUser(
      user ? { uid: user.uid, displayName: displayNameOf(user) } : null
    );
    cb(user);
  });
}

/** Firebase User から表示名を決める（未設定ならメールのローカル部を使う） */
export function displayNameOf(user: User): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  const local = user.email?.split('@')[0];
  return local && local.length > 0 ? local : '匿名ライダー';
}

/**
 * サインイン直後に呼ぶ。旧UIDのデータが残っていれば新UIDへ引き継ぐ。
 * 失敗してもサインイン自体は成立させる（例外を投げない）。
 */
export async function runPostSignIn(user: User): Promise<string | null> {
  const name = displayNameOf(user);
  setAuthedUser({ uid: user.uid, displayName: name });
  try {
    if (!(await needsMigration(user.uid))) return null;
    const result: MigrationResult = await migrateLegacyData(user.uid, name);
    return describeMigration(result);
  } catch (e: any) {
    console.warn('[Auth] migration skipped:', e?.message);
    return null;
  }
}

/** 表示名を更新（Firebase Auth プロフィール側） */
export async function updateAuthDisplayName(name: string): Promise<void> {
  const user = getCurrentUser();
  if (user) await updateProfile(user, { displayName: name }).catch(() => {});
}
