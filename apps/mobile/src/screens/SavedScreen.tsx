import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  RefreshControl,
  Share,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { Route } from '@touring/shared';
import { makeMapUrl } from '@touring/shared';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { RouteCard } from '../components/RouteCard';
import { loadSavedRoutes, deleteSavedRoute } from '../services/firebase';

type NavProp = StackNavigationProp<RootStackParamList>;

export default function SavedScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const [savedRoutes, setSavedRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadRoutes = useCallback(async () => {
    try {
      const routes = await loadSavedRoutes();
      setSavedRoutes(routes);
    } catch (err: any) {
      Alert.alert('エラー', '保存済みルートの読み込みに失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadRoutes();
  };

  // ルートを共有（共有シートから「コピー」も選択可能）
  const handleShare = useCallback(async (route: Route) => {
    try {
      const mapUrl = (route as any).mapUrl ?? makeMapUrl(route);
      await Share.share({
        title: route.name,
        message:
          `🏍️ ${route.name}\n${route.description}\n\n` +
          `📏 ${route.distance} | ⏱️ ${route.time} | ⚡ ${route.difficulty}\n\n` +
          `🗺️ ルートを開く:\n${mapUrl}\n\n` +
          `ツーリングプランナーで作成`,
      });
    } catch {
      // ユーザーがキャンセル
    }
  }, []);

  const handleDelete = (route: Route) => {
    if (!route.id) return;
    Alert.alert(
      'ルートを削除',
      `「${route.name}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSavedRoute(route.id!);
              setSavedRoutes((prev) => prev.filter((r) => r.id !== route.id));
            } catch (err: any) {
              Alert.alert('削除エラー', err.message ?? '削除に失敗しました');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>⭐ 保存済みルート</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textLight }]}>
          {savedRoutes.length}件のルートが保存されています
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      ) : savedRoutes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⭐</Text>
          <Text style={styles.emptyTitle}>保存済みルートはありません</Text>
          <Text style={styles.emptySubtitle}>
            ルート生成後、気に入ったルートを保存してください
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {savedRoutes.map((route, i) => (
            <View key={route.id ?? i}>
              <RouteCard
                route={route}
                index={i}
                isSaved={true}
                onSave={() => handleDelete(route)}
                onShare={handleShare}
                onShowMap={(r) =>
                  navigation.navigate('RouteMap', {
                    routeData: { name: r.name, waypointObjects: r.waypointObjects },
                    mapUrl: r.mapUrl,
                  })
                }
                showActions={true}
              />
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(route)}
              >
                <Text style={styles.deleteBtnText}>🗑️ このルートを削除</Text>
              </TouchableOpacity>
            </View>
          ))}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textLight,
    marginTop: 4,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: SPACING.md },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  emptySubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  deleteBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  deleteBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontWeight: FONT_WEIGHT.semiBold,
  },
});
