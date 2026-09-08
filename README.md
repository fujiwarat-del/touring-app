# ツーリングアプリ - モノレポ

バイク乗り向けの SNS / コミュニティアプリのモノレポです。

ツーリングの記録を投稿して共有し、グループを作り、走行の計画を募って一緒に走る、
というところまでをアプリ内で完結させることを目指しています。

> **経緯**: このプロジェクトは当初「AI がツーリングルートを生成するアプリ」でしたが、
> 2026-08-04 に SNS / コミュニティ特化へ方針転換しました。ルート生成機能と
> Claude API 連携は削除済みです。転換前の完成状態はコミット `0167fa9` に残しています。

## 構成

```
touring-app/
├── apps/
│   ├── mobile/          # Expo (React Native) モバイルアプリ ← 開発の主対象
│   └── web/             # Next.js 14 LP + 管理パネル（ほぼ未着手）
├── packages/
│   └── shared/          # 共有TypeScript型・ユーティリティ
└── backend/
    ├── api/             # Vercelサーバーレス関数（health / notify のみ）
    └── firebase/        # Firestore・Storageのルールとそのテスト
```

## 技術スタック

| 領域 | 採用技術 |
|---|---|
| モバイル | Expo SDK 54 / React Native 0.81 |
| Web | Next.js 14 (App Router) + TailwindCSS |
| バックエンド | Vercel Serverless Functions (Node.js) |
| DB | Firebase Firestore |
| 認証 | Firebase Auth（Google / Apple サインイン） |
| 画像 | 投稿・プロフィール写真は Cloudinary、アルバム写真は Firebase Storage |
| 天気 | Open-Meteo API（無料・APIキー不要） |
| 地図 | Leaflet を WebView で表示（Google Maps SDK は不使用） |
| プッシュ通知 | Expo Notifications + Vercel の `notify` エンドポイント |

## 主な機能

タブ構成は **フィード / 計画 / グループ / マイページ** の4本です。

- **フィード** — ツーリング投稿の閲覧・投稿、いいね・スタンプ、通報
- **計画** — ツーリングの募集、参加申請と主催者による承認、公開範囲の設定
- **グループ** — グループの作成・参加、承認制グループの申請と承認
- **マイページ** — プロフィール、フォロー / フォロワー、ライダー情報（ツーリング歴・走行エリア）
- **ガレージ** — 愛車の登録、出発前チェックリスト、車検・保険・免許の期日リマインダー
- **アルバム** — 走行記録と写真、走破した都道府県の記録

## 認証とデータの見え方

**未ログインでも閲覧はできます。書き込みはすべてログインが必要です。**

| | 未ログイン | ログイン済み |
|---|---|---|
| フィード・グループ・計画の閲覧 | ○ | ○ |
| 他人のプロフィール・フォロー数の閲覧 | ○ | ○ |
| 投稿・フォロー・グループ参加・計画参加 | × | ○ |
| ガレージ・アルバム・保存したルート | × | ○ |

以前は未ログイン時に端末内で生成した匿名UIDを使っていましたが、その方式では
Firestore ルールで「自分のデータだけ」という制限がかけられないため廃止しました。
詳細は `apps/mobile/src/services/firebase.ts` の冒頭コメントを参照してください。

## セットアップ

### 前提条件

- Node.js >= 18.0.0
- Yarn >= 1.22.0
- Firebase CLI（ルールのデプロイ時のみ）

### 1. 依存関係のインストール

```bash
yarn install
```

### 2. 環境変数

#### apps/mobile/.env

```
EXPO_PUBLIC_API_URL=https://your-vercel-deployment.vercel.app
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=...
EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=...
EXPO_PUBLIC_APP_API_KEY=...
```

`.env` は git 管理外なので、**EAS ビルドではこれらをビルダーに渡せません。**
EAS の環境変数として別途登録する必要があります（development / preview / production の3環境）。

```bash
cd apps/mobile
npx eas-cli env:list --environment preview
```

#### backend/api/.env

```
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
APP_API_KEY=...
```

### 3. Firebase 設定ファイル

`apps/mobile/google-services.json` と `GoogleService-Info.plist` は OAuth クライアント
情報を含むため **git 管理外**です。ローカルにはファイルを直接置き、EAS では file 型の
secret（`GOOGLE_SERVICES_JSON` / `GOOGLE_SERVICES_INFO_PLIST`）から復元されます。
この切り替えは `apps/mobile/app.config.js` が行っています。

### 4. 起動

```bash
yarn build:shared   # 共有パッケージのビルド（初回のみ）
yarn mobile         # モバイルアプリ
yarn web            # Webアプリ
yarn api            # APIサーバー（開発）
```

モバイルアプリはネイティブモジュール（Google Sign-In など）を含むため、**Expo Go では
動きません。** dev client か preview ビルドが必要です。

```bash
cd apps/mobile
npx eas-cli build -p android -e development   # Metro に接続して開発する場合
npx eas-cli build -p android -e preview       # JSを内包した単体で動くAPK
```

## Firestore / Storage のセキュリティルール

ルールは `backend/firebase/` にあり、`backend/firebase/tests/` にテストがあります。
**ルールを変更したら必ずテストを通してからデプロイしてください。**
アプリが実際に行う操作が許可されることと、なりすましが拒否されることの両方を検証しています。

```bash
cd backend/firebase/tests && npm install && npm test
```

デプロイ:

```bash
cd backend/firebase
npx firebase-tools@13 deploy --only firestore:rules,storage --project touring-planner-e9b5a
```

> `firebase-tools` のバージョンを固定しているのは、最新版がエミュレータ実行に
> Java 21 以上を要求するためです。デプロイのみなら Java は不要です。

## デプロイ

```bash
cd backend/api && vercel deploy
```

## ライセンス

MIT
