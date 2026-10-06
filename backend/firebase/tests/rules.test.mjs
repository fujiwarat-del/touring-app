// ============================================================
// Firestore セキュリティルールのテスト
//
// 実行:
//   cd backend/firebase/tests && npm install && npm test
//
// 目的は2つ:
//  1) アプリが実際に行う操作が許可されていること（デプロイでアプリを壊さない）
//  2) 他人になりすます操作が拒否されていること
// ============================================================

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc, setDoc, getDoc, deleteDoc, updateDoc, collection, getDocs, addDoc,
} from 'firebase/firestore';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ALICE = 'alice';
const BOB = 'bob';

// firebase.json は親ディレクトリのファイルを参照できないため、
// ルールはテスト側から直接読み込んでエミュレータへ投入する。
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-touring',
  firestore: {
    host: '127.0.0.1',
    port: 8080,
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  },
});

const alice = testEnv.authenticatedContext(ALICE).firestore();
const bob = testEnv.authenticatedContext(BOB).firestore();
const anon = testEnv.unauthenticatedContext().firestore();

/** ルールを無効化して初期データを投入する */
async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

const results = [];
async function it(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
  } catch (e) {
    results.push(['FAIL', name, e?.message ?? String(e)]);
  }
}

// ─── 個人データ: 本人のみ ──────────────────────────────────
await it('自分のガレージには書き込める', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/bikes/b1'), { maker: 'Honda' })));

await it('他人のガレージには書き込めない', () =>
  assertFails(setDoc(doc(bob, 'users/alice/bikes/b1'), { maker: '乗っ取り' })));

await it('他人のガレージは読めない', () =>
  assertFails(getDoc(doc(bob, 'users/alice/bikes/b1'))));

await it('未ログインではガレージに書き込めない', () =>
  assertFails(setDoc(doc(anon, 'users/alice/bikes/b2'), { maker: 'Honda' })));

await it('チェックリスト履歴は更新できない（不変）', async () => {
  await seed((db) => setDoc(doc(db, 'users/alice/bikes/b1/checklists/c1'), { done: 1 }));
  await assertFails(updateDoc(doc(alice, 'users/alice/bikes/b1/checklists/c1'), { done: 2 }));
  await assertSucceeds(deleteDoc(doc(alice, 'users/alice/bikes/b1/checklists/c1')));
});

await it('自分のアルバムは読み書きできる', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/tours/t1'), { title: '箱根' })));

await it('他人のアルバムは読めない', () =>
  assertFails(getDoc(doc(bob, 'users/alice/tours/t1'))));

// ─── フォロー ─────────────────────────────────────────────
await it('自分の following には書ける', () =>
  assertSucceeds(setDoc(doc(alice, 'users/alice/following/bob'), { displayName: 'Bob' })));

await it('他人の following には書けない', () =>
  assertFails(setDoc(doc(bob, 'users/alice/following/carol'), { displayName: 'Carol' })));

await it('相手の followers に自分のドキュメントは作れる（フォロー動作）', () =>
  assertSucceeds(setDoc(doc(alice, 'users/bob/followers/alice'), { displayName: 'Alice' })));

await it('相手の followers に第三者のドキュメントは作れない（なりすまし）', () =>
  assertFails(setDoc(doc(alice, 'users/bob/followers/carol'), { displayName: 'Carol' })));

await it('フォロー解除で自分のドキュメントは消せる', () =>
  assertSucceeds(deleteDoc(doc(alice, 'users/bob/followers/alice'))));

await it('フォロー関係は誰でも閲覧できる（プロフィール画面の件数表示）', () =>
  assertSucceeds(getDocs(collection(anon, 'users/alice/following'))));

// ─── コミュニティ投稿 ─────────────────────────────────────
await it('投稿は本人の userId でのみ作成できる', async () => {
  await assertSucceeds(setDoc(doc(alice, 'communityPosts/p1'), { userId: ALICE, comment: 'hi' }));
  await assertFails(setDoc(doc(bob, 'communityPosts/p2'), { userId: ALICE, comment: 'なりすまし' }));
});

await it('未ログインでもフィードは読める', () =>
  assertSucceeds(getDoc(doc(anon, 'communityPosts/p1'))));

await it('他人の投稿にいいね・スタンプはできる', () =>
  assertSucceeds(updateDoc(doc(bob, 'communityPosts/p1'), { likes: 1, likedBy: [BOB] })));

await it('他人の投稿の本文は書き換えられない', () =>
  assertFails(updateDoc(doc(bob, 'communityPosts/p1'), { comment: '改ざん' })));

await it('他人の投稿は削除できない', () =>
  assertFails(deleteDoc(doc(bob, 'communityPosts/p1'))));

await it('自分の投稿は削除できる', () =>
  assertSucceeds(deleteDoc(doc(alice, 'communityPosts/p1'))));

// ─── プロフィール ─────────────────────────────────────────
await it('自分のプロフィールは作成・更新できる', () =>
  assertSucceeds(setDoc(doc(alice, 'userProfiles/alice'), { bio: 'はじめまして' })));

await it('他人のプロフィールは書き換えられない', () =>
  assertFails(setDoc(doc(bob, 'userProfiles/alice'), { bio: '改ざん' })));

await it('banned フラグはクライアントから立てられない', async () => {
  await assertFails(setDoc(doc(alice, 'userProfiles/alice'), { banned: false }));
  await seed((db) => setDoc(doc(db, 'userProfiles/bob'), { bio: 'bob', banned: true }));
  await assertFails(updateDoc(doc(bob, 'userProfiles/bob'), { banned: false }));
});

await it('プロフィールは誰でも閲覧できる', () =>
  assertSucceeds(getDoc(doc(anon, 'userProfiles/alice'))));

// ─── グループ ─────────────────────────────────────────────
await it('グループは自分をオーナーとしてのみ作成できる', async () => {
  await assertSucceeds(setDoc(doc(alice, 'groups/g1'), { ownerId: ALICE, name: 'Team', memberCount: 1 }));
  await assertFails(setDoc(doc(bob, 'groups/g2'), { ownerId: ALICE, name: '偽', memberCount: 1 }));
});

await it('メンバーは自分の参加ドキュメントを作れる', () =>
  assertSucceeds(setDoc(doc(bob, 'groups/g1/members/bob'), { role: 'member' })));

await it('メンバーは他人を勝手に参加させられない', () =>
  assertFails(setDoc(doc(bob, 'groups/g1/members/carol'), { role: 'member' })));

await it('オーナーはメンバーの所属一覧を操作できる（承認・削除）', () =>
  assertSucceeds(setDoc(doc(alice, 'users/bob/groups/g1'), { name: 'Team', role: 'member' })));

await it('第三者はメンバーの所属一覧を操作できない', () =>
  assertFails(setDoc(doc(bob, 'users/carol/groups/g1'), { name: 'Team', role: 'member' })));

await it('メンバーは memberCount のみ更新できる', async () => {
  await assertSucceeds(updateDoc(doc(bob, 'groups/g1'), { memberCount: 2 }));
  await assertFails(updateDoc(doc(bob, 'groups/g1'), { name: '改ざん' }));
});

await it('グループを削除できるのはオーナーのみ', async () => {
  await assertFails(deleteDoc(doc(bob, 'groups/g1')));
});

await it('参加申請は本人のみ作成でき、申請一覧は第三者に見えない', async () => {
  await seed((db) => setDoc(doc(db, 'groups/g1/joinRequests/bob'), { message: 'よろしく' }));
  await assertFails(setDoc(doc(bob, 'groups/g1/joinRequests/carol'), { message: '代理申請' }));
  await assertSucceeds(getDoc(doc(alice, 'groups/g1/joinRequests/bob'))); // オーナー
  await assertSucceeds(getDoc(doc(bob, 'groups/g1/joinRequests/bob')));   // 本人
  await assertFails(getDoc(doc(anon, 'groups/g1/joinRequests/bob')));     // 第三者
});

// ─── ツーリング計画 ───────────────────────────────────────
await it('計画は自分を主催者としてのみ作成できる', async () => {
  await assertSucceeds(setDoc(doc(alice, 'plans/pl1'), { ownerId: ALICE, participantCount: 1 }));
  await assertFails(setDoc(doc(bob, 'plans/pl2'), { ownerId: ALICE, participantCount: 1 }));
});

await it('参加は本人のみ、主催者は承認できる', async () => {
  await assertSucceeds(setDoc(doc(bob, 'plans/pl1/participants/bob'), { displayName: 'Bob' }));
  await assertFails(setDoc(doc(bob, 'plans/pl1/participants/carol'), { displayName: 'Carol' }));
  await assertSucceeds(setDoc(doc(alice, 'plans/pl1/participants/carol'), { displayName: 'Carol' }));
});

await it('参加者は participantCount のみ更新できる', async () => {
  await assertSucceeds(updateDoc(doc(bob, 'plans/pl1'), { participantCount: 2 }));
  await assertFails(updateDoc(doc(bob, 'plans/pl1'), { closed: true }));
});

// ─── 到着予定の共有 ───────────────────────────────────────
await it('共有を書けるのは本人のみ', async () => {
  await assertSucceeds(setDoc(doc(bob, 'plans/pl1/sharing/bob'), {
    mode: 'eta', etaMinutes: 18, distanceKm: 12, arrived: false, fixAt: 1,
  }));
  await assertFails(setDoc(doc(bob, 'plans/pl1/sharing/carol'), {
    mode: 'eta', etaMinutes: 1, distanceKm: 1, arrived: false, fixAt: 1,
  }));
});

await it("mode が 'eta' のとき座標の混入は拒否される", async () => {
  await assertFails(setDoc(doc(bob, 'plans/pl1/sharing/bob'), {
    mode: 'eta', etaMinutes: 18, distanceKm: 12, arrived: false, fixAt: 1,
    lat: 35.6, lng: 139.7,
  }));
});

await it("mode が 'full' なら座標を書ける", async () => {
  await assertSucceeds(setDoc(doc(bob, 'plans/pl1/sharing/bob'), {
    mode: 'full', etaMinutes: 18, distanceKm: 12, arrived: false, fixAt: 1,
    lat: 35.6, lng: 139.7,
  }));
});

await it('共有を読めるのは参加者だけ', async () => {
  // bob は pl1 の参加者（上のテストで登録済み）、carol は参加していない
  await assertSucceeds(getDoc(doc(bob, 'plans/pl1/sharing/bob')));
  await assertFails(getDoc(doc(anon, 'plans/pl1/sharing/bob')));
  const carol = testEnv.authenticatedContext('carol-outsider').firestore();
  await assertFails(getDoc(doc(carol, 'plans/pl1/sharing/bob')));
});

await it('自分の共有は削除できる', () =>
  assertSucceeds(deleteDoc(doc(bob, 'plans/pl1/sharing/bob'))));

// ─── 通報 ─────────────────────────────────────────────────
await it('通報は本人名義でのみ作成でき、読み出しはできない', async () => {
  await assertSucceeds(addDoc(collection(alice, 'reports'), {
    postId: 'p1', reporterUid: ALICE, reason: 'スパム',
  }));
  await assertFails(addDoc(collection(alice, 'reports'), {
    postId: 'p1', reporterUid: BOB, reason: 'なりすまし通報',
  }));
  await assertFails(getDocs(collection(alice, 'reports')));
});

// ─── 未定義コレクション ───────────────────────────────────
await it('定義されていないコレクションは読み書きできない', async () => {
  await assertFails(setDoc(doc(alice, 'randomStuff/x'), { a: 1 }));
  await assertFails(getDoc(doc(alice, 'randomStuff/x')));
});

// ─── 結果出力 ─────────────────────────────────────────────
await testEnv.cleanup();

const failed = results.filter((r) => r[0] === 'FAIL');
for (const [status, name, msg] of results) {
  console.log(`${status === 'PASS' ? '  ok' : 'FAIL'}  ${name}${msg ? '\n      ' + msg : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} passed`);
assert.equal(failed.length, 0, `${failed.length} 件のルールテストが失敗しました`);
