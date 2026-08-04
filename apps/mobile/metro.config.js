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

// @touring/shared を直接パスで解決（Windowsシンボリックリンク問題を回避）
// react / react-native はアプリ側のコピーへ固定（React二重化の保険）
config.resolver.extraNodeModules = {
  '@touring/shared': path.resolve(monorepoRoot, 'packages/shared'),
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
};

module.exports = config;
