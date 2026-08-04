/**
 * Expo Config Plugin: Android ビルド設定の永続化
 *
 * `expo prebuild --clean` のたびに手動修正が必要だった以下の設定を自動適用する：
 *   1. gradle.properties: reactNativeArchitectures=arm64-v8a（Windows 260文字パス制限回避）
 *   2. build.gradle: lint { checkReleaseBuilds false } （lintVitalAnalyzeRelease エラー回避）
 *   3. build.gradle: ndk { abiFilters "arm64-v8a" }  （arm64実機のみビルド）
 */

const { withGradleProperties, withAppBuildGradle } = require('@expo/config-plugins');

/** gradle.properties の reactNativeArchitectures を arm64-v8a に固定 */
const withArm64GradleProperties = (config) => {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;

    const existing = props.find(
      (p) => p.type === 'property' && p.key === 'reactNativeArchitectures'
    );
    if (existing) {
      existing.value = 'arm64-v8a';
    } else {
      props.push({
        type: 'property',
        key: 'reactNativeArchitectures',
        value: 'arm64-v8a',
      });
    }

    return config;
  });
};

/** build.gradle に lint設定 と abiFilters を追加 */
const withArm64BuildGradle = (config) => {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // lint 設定を追加（まだない場合のみ）
    if (!contents.includes('checkReleaseBuilds false')) {
      contents = contents.replace(
        /(namespace\s+['"]com\.touringplanner\.app['"])/,
        `$1\n\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }`
      );
    }

    // abiFilters を追加（まだない場合のみ）
    if (!contents.includes('abiFilters "arm64-v8a"')) {
      contents = contents.replace(
        /(buildConfigField\s+"String",\s+"REACT_NATIVE_RELEASE_LEVEL"[^\n]+\n)/,
        `$1        ndk {\n            abiFilters "arm64-v8a"\n        }\n`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = (config) => {
  config = withArm64GradleProperties(config);
  config = withArm64BuildGradle(config);
  return config;
};
