const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// モノレポ全体を監視対象に追加（既存のdefaultに追記）
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// node_modules の解決順序
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// @touring/shared を直接パスで解決（Windowsシンボリックリンク問題を回避）
config.resolver.extraNodeModules = {
  '@touring/shared': path.resolve(monorepoRoot, 'packages/shared'),
};

module.exports = config;
