// ============================================================
// 旧UID → Firebase UID へのデータ移行
//
// このアプリは認証導入前、端末内で生成した匿名UIDでデータを保存していた。
// Firebase Auth 導入後は UID が変わるため、初回サインイン時に旧データを引き継ぐ。
//
// 【重要な制約】
// 引き継ぎ元の旧UIDは端末の AsyncStorage にしか存在しない。
// つまり「アプリを消していない同じ端末で初回ログインした場合」のみ移行できる。
// 端末を変えた／アプリを再インストールした場合は引き継げない。
//
// 移行方針:
//  - コピー方式（旧データは消さない）。問題が起きても元に戻せるようにするため。
//  - ベストエフォート。個別の失敗はスキップして記録し、ログイン自体は止めない。
// ============================================================

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestoreDb } from './firebase';

const ANON_UID_KEY = '@touring_app_anon_uid';
const MIGRATION_DONE_KEY = '@touring_app_migration_done';

export interface MigrationResult {
  migrated: boolean;
  legacyUid: string | null;
  counts: Record<string, number>;
  errors: string[];
}

/** users/{uid} 配下でコピー対象とするサブコレクション */
const USER_SUBCOLLECTIONS = [
  'savedRoutes',
  'bikes',
  'tours',
  'following',
  'followers',
  'groups',
] as const;

/** bikes の下にはさらに checklists がぶら下がる */
const NESTED: Record<string, string> = { bikes: 'checklists' };

function db() {
  const d = getFirestoreDb();
  if (!d) throw new Error('Firebase not configured');
  return d;
}

/** 旧UIDを取得（認証導入前に発行されたもの） */
export async function getLegacyUid(): Promise<string | null> {
  return AsyncStorage.getItem(ANON_UID_KEY);
}

/** この端末で移行済みかどうか */
export async function isMigrationDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(MIGRATION_DONE_KEY)) === 'true';
}

/** 移行が必要か（旧UIDがあり、新UIDと異なり、未実施） */
export async function needsMigration(newUid: string): Promise<boolean> {
  if (await isMigrationDone()) return false;
  const legacy = await getLegacyUid();
  return !!legacy && legacy !== newUid;
}

/**
 * 旧UIDのデータを新UIDへコピーする。
 * ログインを止めないため例外は投げず、結果オブジェクトで返す。
 */
export async function migrateLegacyData(
  newUid: string,
  newDisplayName: string
): Promise<MigrationResult> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const legacyUid = await getLegacyUid();

  if (!legacyUid || legacyUid === newUid) {
    return { migrated: false, legacyUid, counts, errors };
  }
  if (await isMigrationDone()) {
    return { migrated: false, legacyUid, counts, errors };
  }

  // ── 1) userProfiles（名前・写真・バイク・ライダー情報） ──
  try {
    const oldSnap = await getDoc(doc(db(), 'userProfiles', legacyUid));
    if (oldSnap.exists()) {
      const data: Record<string, any> = { ...oldSnap.data() };
      delete data.banned; // BANフラグは引き継がない（新規IDのため）
      await setDoc(
        doc(db(), 'userProfiles', newUid),
        { ...data, displayName: newDisplayName || data.displayName, migratedFrom: legacyUid },
        { merge: true }
      );
      counts.userProfile = 1;
    }
  } catch (e: any) {
    errors.push('userProfile: ' + (e?.message ?? 'failed'));
  }

  // ── 2) users/{uid} 配下のサブコレクション ──
  for (const sub of USER_SUBCOLLECTIONS) {
    try {
      const snap = await getDocs(collection(db(), 'users', legacyUid, sub));
      let n = 0;
      for (const d of snap.docs) {
        await setDoc(doc(db(), 'users', newUid, sub, d.id), d.data(), { merge: true });
        n++;

        // bikes の下の checklists も引き継ぐ
        const nested = NESTED[sub];
        if (nested) {
          const childSnap = await getDocs(
            collection(db(), 'users', legacyUid, sub, d.id, nested)
          );
          for (const c of childSnap.docs) {
            await setDoc(
              doc(db(), 'users', newUid, sub, d.id, nested, c.id),
              c.data(),
              { merge: true }
            );
          }
          const key = sub + '/' + nested;
          counts[key] = (counts[key] ?? 0) + childSnap.size;
        }
      }
      if (n > 0) counts[sub] = n;
    } catch (e: any) {
      errors.push(sub + ': ' + (e?.message ?? 'failed'));
    }
  }

  // ── 3) コミュニティ投稿の所有者を付け替え ──
  try {
    const snap = await getDocs(
      query(collection(db(), 'communityPosts'), where('userId', '==', legacyUid))
    );
    for (const d of snap.docs) {
      await updateDoc(d.ref, { userId: newUid, userDisplayName: newDisplayName }).catch(() => {});
    }
    if (snap.size > 0) counts.communityPosts = snap.size;
  } catch (e: any) {
    errors.push('communityPosts: ' + (e?.message ?? 'failed'));
  }

  // ── 4) グループ（主催・メンバー在籍） ──
  try {
    const snap = await getDocs(collection(db(), 'groups'));
    let owned = 0;
    let joined = 0;
    for (const g of snap.docs) {
      if (g.data().ownerId === legacyUid) {
        await updateDoc(g.ref, { ownerId: newUid, ownerName: newDisplayName }).catch(() => {});
        owned++;
      }
      const m = await getDoc(doc(db(), 'groups', g.id, 'members', legacyUid)).catch(() => null);
      if (m && m.exists()) {
        await setDoc(
          doc(db(), 'groups', g.id, 'members', newUid),
          { ...m.data(), displayName: newDisplayName },
          { merge: true }
        );
        joined++;
      }
    }
    if (owned) counts.groupsOwned = owned;
    if (joined) counts.groupsJoined = joined;
  } catch (e: any) {
    errors.push('groups: ' + (e?.message ?? 'failed'));
  }

  // ── 5) ツーリング計画（主催・参加） ──
  try {
    const snap = await getDocs(collection(db(), 'plans'));
    let owned = 0;
    let joined = 0;
    for (const p of snap.docs) {
      if (p.data().ownerId === legacyUid) {
        await updateDoc(p.ref, { ownerId: newUid, ownerName: newDisplayName }).catch(() => {});
        owned++;
      }
      const part = await getDoc(doc(db(), 'plans', p.id, 'participants', legacyUid)).catch(() => null);
      if (part && part.exists()) {
        await setDoc(
          doc(db(), 'plans', p.id, 'participants', newUid),
          { ...part.data(), displayName: newDisplayName },
          { merge: true }
        );
        joined++;
      }
    }
    if (owned) counts.plansOwned = owned;
    if (joined) counts.plansJoined = joined;
  } catch (e: any) {
    errors.push('plans: ' + (e?.message ?? 'failed'));
  }

  // ── 6) 自分をフォローしている人の following エントリを付け替え ──
  // 旧UIDを指したままだと相手のフォロー中一覧から辿れなくなる。
  //
  // 【既知の制約】この書き込み先は「他人の following」であり、Firestore ルールは
  // これを拒否する（自分の following しか書けない）。したがって現状この処理は
  // 必ず失敗し、errors に 'followerLinks' が記録される。相手のフォロー中一覧は
  // 旧UIDを指したまま残る。サーバー側（Admin SDK）でしか直せないため、
  // 移行が必要な規模になった時点でバッチ処理を用意する。
  try {
    const followers = await getDocs(collection(db(), 'users', legacyUid, 'followers'));
    let n = 0;
    for (const f of followers.docs) {
      const snap = await getDoc(doc(db(), 'users', f.id, 'following', legacyUid)).catch(() => null);
      if (snap && snap.exists()) {
        await setDoc(
          doc(db(), 'users', f.id, 'following', newUid),
          { ...snap.data(), displayName: newDisplayName },
          { merge: true }
        );
        n++;
      }
    }
    if (n) counts.followerLinks = n;
  } catch (e: any) {
    errors.push('followerLinks: ' + (e?.message ?? 'failed'));
  }

  await AsyncStorage.setItem(MIGRATION_DONE_KEY, 'true');
  console.log('[Migration] done', { legacyUid, newUid, counts, errors });

  return { migrated: true, legacyUid, counts, errors };
}

/** 移行結果を利用者向けの文章にする（引き継ぎ0件なら null） */
export function describeMigration(result: MigrationResult): string | null {
  if (!result.migrated) return null;
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const labels: Record<string, string> = {
    userProfile: 'プロフィール',
    savedRoutes: '保存したルート',
    bikes: '愛車',
    'bikes/checklists': '点検記録',
    tours: 'ツーリング記録',
    following: 'フォロー中',
    followers: 'フォロワー',
    groups: '所属グループ',
    communityPosts: '投稿',
    groupsOwned: '主催グループ',
    groupsJoined: '参加グループ',
    plansOwned: '主催した計画',
    plansJoined: '参加予定の計画',
    followerLinks: 'フォロー関係',
  };
  const parts = Object.entries(result.counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${labels[k] ?? k} ${n}件`);

  return `これまでのデータを引き継ぎました。\n\n${parts.join('\n')}`;
}
