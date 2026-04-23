module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'react-native-reanimated/plugin', // 必ず最後に記載（worklets/plugin は自動で含まれる）
    ],
  };
};
