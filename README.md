# ツーリングルートプランナー - モノレポ

バイクツーリング向けAIルート生成アプリのモノレポです。

## 構成

```
touring-app/
├── apps/
│   ├── mobile/          # Expo (React Native) モバイルアプリ
│   └── web/             # Next.js 14 LP + 管理パネル
├── packages/
│   └── shared/          # 共有TypeScript型・ユーティリティ
└── backend/
    ├── api/             # Vercelサーバーレス関数
    └── firebase/        # Firebaseの設定・ルール
```

## 技術スタック

- **モバイル**: Expo (React Native) ~52
- **Web**: Next.js 14 (App Router) + TailwindCSS
- **バックエンド**: Vercel Serverless Functions (Node.js)
- **DB/ストレージ**: Firebase (Firestore + Storage)
- **AI**: Claude API (claude-sonnet-4-6)
- **天気**: Open-Meteo API (無料・APIキー不要)
- **地図**: Google Maps

## セットアップ手順

### 前提条件

- Node.js >= 18.0.0
- Yarn >= 1.22.0
- Expo CLI (`npm install -g expo-cli`)
- Firebase CLI (`npm install -g firebase-tools`)

### 1. 依存関係のインストール

```bash
yarn install
```

### 2. 環境変数の設定

#### backend/api/.env

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key
```

#### apps/mobile/.env

```
EXPO_PUBLIC_API_URL=https://your-vercel-deployment.vercel.app
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
```

#### apps/web/.env.local

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_ADMIN_PRIVATE_KEY=your_firebase_private_key
```

### 3. Firebaseのセットアップ

```bash
firebase login
firebase init
```

Firestore、Storage、Authenticationを有効化してください。

### 4. 共有パッケージのビルド

```bash
yarn build:shared
```

### 5. モバイルアプリの起動

```bash
yarn mobile
```

### 6. Webアプリの起動

```bash
yarn web
```

### 7. APIサーバーの起動（開発）

```bash
yarn api
```

## Vercelへのデプロイ

```bash
cd backend/api
vercel deploy
```

## 主な機能

1. **AIルート生成** - Claude APIを使ったインテリジェントなルート提案
2. **GPS出発地点** - 現在地からのルート生成
3. **交通情報** - 平日/祝日/季節に基づく混雑予測
4. **天気表示** - Open-Meteo APIによるリアルタイム天気
5. **バイク種類選択** - 大型/中型/オフロード/スクーター
6. **ツーリング目的** - ワインディング/温泉/海沿いなど
7. **走行スタイル** - 信号少な目/高速不使用/峠道など
8. **ルート保存** - Firebaseへのルート保存
9. **コミュニティ共有** - 写真付きルート共有
10. **人気ルート** - エリア別人気ルート表示

## ライセンス

MIT
