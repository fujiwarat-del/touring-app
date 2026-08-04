import React, { Component, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { savePushToken } from './src/services/firebase';

// プッシュ通知の表示設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── グローバルエラーハンドラ（デバッグ用）─────────────────
if (__DEV__) {
  const g = global as any;
  const handler = g.ErrorUtils?.getGlobalHandler?.();
  g.ErrorUtils?.setGlobalHandler?.((error: Error, isFatal: boolean) => {
    console.error('[GlobalError] fatal=' + isFatal, error?.message, error?.stack);
    handler?.(error, isFatal);
  });
}
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import type { WaypointObject } from '@touring/shared';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import PostScreen from './src/screens/PostScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import SavedScreen from './src/screens/SavedScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RouteMapScreen from './src/screens/RouteMapScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import GarageScreen from './src/screens/GarageScreen';
import BikeFormScreen from './src/screens/BikeFormScreen';
import BikeDetailScreen from './src/screens/BikeDetailScreen';
import ChecklistScreen from './src/screens/ChecklistScreen';
import AlbumScreen from './src/screens/AlbumScreen';
import TourFormScreen from './src/screens/TourFormScreen';
import TourDetailScreen from './src/screens/TourDetailScreen';

// ─── 型定義 ───────────────────────────────────────────────
export type RootStackParamList = {
  HomeTabs: undefined;
  Saved: undefined;
  Post: {
    prefill?: {
      routeName: string;
      comment: string;
      photoUrls: string[];      // アップロード済みURL（再アップロード不要）
      prefectures: string[];
    };
  } | undefined;
  RouteMap: {
    routeData: { name: string; waypointObjects: WaypointObject[] };
    mapUrl?: string;
    startLat?: number;
    startLng?: number;
  };
  UserProfile: { userId: string; displayName: string };
  BikeForm: { bikeId?: string };
  BikeDetail: { bikeId: string };
  Checklist: { bikeId?: string };
  TourForm: {
    tourId?: string;
    prefill?: {
      title: string;
      distanceKm: number;
      origin: string;
      waypoints: string[];
      destination: string;
    };
  };
  TourDetail: { tourId: string };
};
export type HomeTabParamList = {
  Community: undefined;
  Garage: undefined;
  Album: undefined;
  Profile: undefined;
  // 今後追加予定: Plans（ツーリング計画）/ Nearby（近くのライダー）/ Groups（グループ）
};

// ─── ナビゲーター ─────────────────────────────────────────
const Stack = createStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<HomeTabParamList>();

function HomeTabs() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;
  const { colors, isDark } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.cardBg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 4,
          paddingTop: 4,
          height: tabBarHeight,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{ tabBarLabel: 'フィード', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text> }}
      />
      <Tab.Screen
        name="Garage"
        component={GarageScreen}
        options={{ tabBarLabel: 'ガレージ', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔧</Text> }}
      />
      <Tab.Screen
        name="Album"
        component={AlbumScreen}
        options={{ tabBarLabel: 'アルバム', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📔</Text> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'マイページ', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
      />
    </Tab.Navigator>
  );
}

// ─── エラーバウンダリ ──────────────────────────────────────
interface ErrorBoundaryState { hasError: boolean; error: string; stack: string }

class AppErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '', stack: '' };
  }
  static getDerivedStateFromError(error: Error) {
    console.error('[AppErrorBoundary]', error.message, error.stack);
    return { hasError: true, error: error.message, stack: error.stack ?? '' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.icon}>⚠️</Text>
          <Text style={errStyles.title}>エラーが発生しました</Text>
          <Text style={errStyles.message}>{this.state.error}</Text>
          <Text style={errStyles.stack} selectable>{this.state.stack}</Text>
          <TouchableOpacity
            style={errStyles.btn}
            onPress={() => this.setState({ hasError: false, error: '', stack: '' })}
          >
            <Text style={errStyles.btnText}>再試行</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  icon:      { fontSize: 48, marginBottom: 16 },
  title:     { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  message:   { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 12 },
  stack:     { fontSize: 10, color: '#999', marginBottom: 24, maxWidth: '100%' },
  btn:       { backgroundColor: '#1D9E75', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

// ─── プッシュ通知初期化 ───────────────────────────────────
async function registerForPushNotifications() {
  try {
    // Expo Go / 実機のみ対応（シミュレーターは除外）
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    await savePushToken(tokenData.data);

    // Android はチャンネル設定が必要
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
  } catch {
    // 通知権限がなくてもアプリは動作する
  }
}

// ─── メインアプリ ─────────────────────────────────────────
function AppNavigator() {
  const { colors, isDark } = useTheme();
  // 白ベースミニマル: ヘッダーも白＋黒文字＋ヘアライン（IG風）
  const headerOpts = {
    headerStyle: {
      backgroundColor: colors.cardBg,
      shadowColor: 'transparent',
      elevation: 0,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    headerTintColor: colors.textPrimary,
    headerTitleStyle: { fontWeight: 'bold' as const },
  };

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="HomeTabs" component={HomeTabs} />
        <Stack.Screen name="Saved"       component={SavedScreen}       options={{ headerShown: true, title: '保存したルート', ...headerOpts }} />
        <Stack.Screen name="Post"        component={PostScreen}        options={{ headerShown: true, title: 'ルートを投稿',  ...headerOpts }} />
        <Stack.Screen name="RouteMap"    component={RouteMapScreen}    options={{ headerShown: true, title: 'ルートマップ',  ...headerOpts }} />
        <Stack.Screen
          name="UserProfile"
          component={UserProfileScreen}
          options={({ route }) => ({
            headerShown: true,
            title: (route.params as any).displayName ?? 'プロフィール',
            ...headerOpts,
          })}
        />
        <Stack.Screen
          name="BikeForm"
          component={BikeFormScreen}
          options={({ route }) => ({
            headerShown: true,
            title: (route.params as any)?.bikeId ? '車両を編集' : '愛車を登録',
            ...headerOpts,
          })}
        />
        <Stack.Screen name="BikeDetail" component={BikeDetailScreen} options={{ headerShown: true, title: '車両詳細', ...headerOpts }} />
        <Stack.Screen name="Checklist"  component={ChecklistScreen}  options={{ headerShown: true, title: '出発前チェック', ...headerOpts }} />
        <Stack.Screen
          name="TourForm"
          component={TourFormScreen}
          options={({ route }) => ({
            headerShown: true,
            title: (route.params as any)?.tourId ? '記録を編集' : 'ツーリングを記録',
            ...headerOpts,
          })}
        />
        <Stack.Screen name="TourDetail" component={TourDetailScreen} options={{ headerShown: true, title: 'ツーリング記録', ...headerOpts }} />
      </Stack.Navigator>
    </>
  );
}

export default function App() {
  useEffect(() => {
    registerForPushNotifications().then(() => {
      // 期日リマインダー（車検・自賠責・任意保険・免許証）を最新データで再登録
      import('./src/services/reminders').then(({ rescheduleAllReminders }) =>
        rescheduleAllReminders().catch(() => {})
      );
    });
  }, []);

  return (
    <SafeAreaProvider>
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </ThemeProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
