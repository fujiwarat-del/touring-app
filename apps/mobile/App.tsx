import React, { Component, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { savePushToken } from './src/services/firebase';

// プッシュ通知の表示設定
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
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

import type { Route, WaypointObject } from '@touring/shared';
import HomeScreen from './src/screens/HomeScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import PostScreen from './src/screens/PostScreen';
import CommunityScreen from './src/screens/CommunityScreen';
import SavedScreen from './src/screens/SavedScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import RouteMapScreen from './src/screens/RouteMapScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';

// ─── 型定義 ───────────────────────────────────────────────
export type RootStackParamList = {
  HomeTabs: undefined;
  Results: { routes?: Route[]; startLat?: number; startLng?: number };
  Post: undefined;
  RouteMap: {
    routeData: { name: string; waypointObjects: WaypointObject[] };
    mapUrl?: string;
  };
  UserProfile: { userId: string; displayName: string };
};
export type HomeTabParamList = {
  Home: undefined;
  Community: undefined;
  Saved: undefined;
  Profile: undefined;
};

// ─── ナビゲーター ─────────────────────────────────────────
const Stack = createStackNavigator<RootStackParamList>();
const Tab   = createBottomTabNavigator<HomeTabParamList>();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'ルート生成', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏍️</Text> }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{ tabBarLabel: 'コミュニティ', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text> }}
      />
      <Tab.Screen
        name="Saved"
        component={SavedScreen}
        options={{ tabBarLabel: '保存済み', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⭐</Text> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: 'プロフィール', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
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
export default function App() {
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <NavigationContainer>
          <StatusBar style="light" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="HomeTabs" component={HomeTabs} />
            <Stack.Screen
              name="Results"
              component={ResultsScreen}
              options={{
                headerShown: true,
                title: 'ルート提案',
                headerStyle: { backgroundColor: '#1D9E75' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
            <Stack.Screen
              name="Post"
              component={PostScreen}
              options={{
                headerShown: true,
                title: 'ルートを投稿',
                headerStyle: { backgroundColor: '#1D9E75' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
            <Stack.Screen
              name="RouteMap"
              component={RouteMapScreen}
              options={{
                headerShown: true,
                title: 'ルートマップ',
                headerStyle: { backgroundColor: '#1D9E75' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
              }}
            />
            <Stack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={({ route }) => ({
                headerShown: true,
                title: (route.params as any).displayName ?? 'プロフィール',
                headerStyle: { backgroundColor: '#1D9E75' },
                headerTintColor: '#fff',
                headerTitleStyle: { fontWeight: 'bold' },
              })}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}
