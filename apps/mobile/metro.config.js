const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Expo CLIがYarnワークスペース検出でCWDをモノレポルートに変更しても
// MetroのprojectRootが正しくapps/mobileになるよう絶対パスで明示指定
config.projectRoot = projectRoot;

// @expo/metro-configはWeb向けmonorepoサポートのためunstable_serverRootを
// Yarnワークスペースルート（モノレポルート）に設定する。
// これによりAndroidビルド時にエントリポイントをモノレポルートから解決しようとして失敗する。
// apps/mobileに上書きして正しく解決させる。
config.server = {
  ...(config.server ?? {}),
  unstable_serverRoot: projectRoot,
};

// モノレポ全体を監視対象に追加（既存のdefaultに追記）
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// node_modules の解決順序
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 【重要】階層探索を無効化し、上記 nodeModulesPaths の順でのみ解決させる。
// これがないと、ルートにホイストされたネイティブモジュール
// （例: @react-native-community/datetimepicker）が「ルート側の react」を
// 拾ってしまい React が二重バンドルされ、
// "Cannot read property 'useEffect' of null" でクラッシュする。
config.resolver.disableHierarchicalLookup = true;

// 【重要】firebase v10 のパッケージは exports に "require"(CJS) と "default"(ESM) を
// 併記している。Metro は CommonJS の require() には require 条件、ESM の import には
// default 条件を適用するため、同じパッケージが2モジュールとしてバンドルされる:
//   @firebase/auth の RN ビルド → require('@firebase/app') → dist/index.cjs.js
//   アプリ側 import 'firebase/app' → dist/esm/index.esm2017.js
// @firebase/app はコンポーネント登録簿をモジュール状態として持つため、これが分裂すると
// registerAuth の登録先と initializeApp が作った App が別インスタンスになり、
// サインインが "Component auth has not been registered yet" で失敗する。
// 登録簿と Component クラスの同一性に関わるパッケージを ESM 側の1ファイルへ固定する。
const FIREBASE_SINGLETONS = ['@firebase/app', '@firebase/component', '@firebase/logger'];
const firebaseSingletons = {};
for (const name of FIREBASE_SINGLETONS) {
  const pkgJsonPath = path.resolve(projectRoot, 'node_modules', name, 'package.json');
  const pkgJson = require(pkgJsonPath);
  // dist パスを直書きするとバージョン更新で壊れるため package.json 経由で解決する
  const entry = pkgJson.module ?? pkgJson.browser ?? pkgJson.main;
  firebaseSingletons[name] = path.resolve(path.dirname(pkgJsonPath), entry);
}

const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pinned = firebaseSingletons[moduleName];
  if (pinned) return { type: 'sourceFile', filePath: pinned };
  return (baseResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

// @touring/shared を直接パスで解決（Windowsシンボリックリンク問題を回避）
// react / react-native はアプリ側のコピーへ固定（React二重化の保険）
config.resolver.extraNodeModules = {
  '@touring/shared': path.resolve(monorepoRoot, 'packages/shared'),
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

module.exports = config;
