// google-services.json / GoogleService-Info.plist は OAuth クライアント情報を含むため
// git 管理外（.gitignore）。EAS Build ではローカルの物理ファイルの代わりに
// secret file 環境変数（GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_INFO_PLIST）から
// 復元されたパスを使う。ローカル開発時は process.env が空なのでリポジトリ直下の
// ファイルをそのまま使う。
module.exports = {
  expo: {
    name: 'ツーリングプランナー',
    slug: 'touring-planner',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#1D9E75',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.touringplanner.app',
      googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST ?? './GoogleService-Info.plist',
      usesAppleSignIn: true,
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'ツーリングルート生成のために現在地を取得します。',
        NSLocationAlwaysUsageDescription: 'ツーリング中のルート追跡のために位置情報を使用します。',
        NSPhotoLibraryUsageDescription: 'ツーリング写真のアップロードのためにフォトライブラリにアクセスします。',
        NSCameraUsageDescription: 'ツーリング写真の撮影のためにカメラを使用します。',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1D9E75',
      },
      package: 'com.touringplanner.app',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      permissions: [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      // 位置共有は前面サービス方式で行う。
      // isAndroidForegroundServiceEnabled のみ有効にし、
      // isAndroidBackgroundLocationEnabled は付けない。これにより
      // FOREGROUND_SERVICE / FOREGROUND_SERVICE_LOCATION だけが宣言され、
      // ACCESS_BACKGROUND_LOCATION は入らない。
      // = Play ストアの背景位置に関する個別審査（デモ動画提出）が不要になる。
      // 実機検証でこの方式で成立することを確認済み。
      [
        'expo-location',
        {
          isAndroidForegroundServiceEnabled: true,
          locationWhenInUsePermission:
            'ツーリング企画の参加者に、集合場所への到着予定を共有するために位置情報を使用します。',
        },
      ],
      'expo-image-picker',
      'expo-apple-authentication',
      '@react-native-google-signin/google-signin',
      './plugins/withAndroidBuildConfig',
      [
        'expo-build-properties',
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
          },
          ios: {
            deploymentTarget: '15.1',
          },
        },
      ],
    ],
    newArchEnabled: true,
    extra: {
      eas: {
        projectId: '6f42b314-24fe-4a7c-a369-c56bc68974e4',
      },
    },
    owner: 'wo_fuji',
  },
};
