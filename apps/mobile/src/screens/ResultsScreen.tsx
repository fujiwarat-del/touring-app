import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Share,
} from 'react-native';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { Route } from '@touring/shared';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { RouteCard } from '../components/RouteCard';
import { WeatherWidget } from '../components/WeatherWidget';
import { saveRoute } from '../services/firebase';

type ResultsRouteProp = RouteProp<RootStackParamList, 'Results'>;
type NavProp = StackNavigationProp<RootStackParamList>;

export default function ResultsScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ResultsRouteProp>();
  const routes = route.params?.routes ?? [];
  const startLat = route.params?.startLat;
  const startLng = route.params?.startLng;

  const [savedRouteIds, setSavedRouteIds] = useState<Set<number>>(new Set());
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const handleSave = useCallback(
    async (tourRoute: Route, index: number) => {
      if (savedRouteIds.has(index)) {
        Alert.alert('このルートはすでに保存済みです');
        return;
      }
      setSavingIndex(index);
      try {
        await saveRoute(tourRoute);
        setSavedRouteIds((prev) => new Set([...prev, index]));
        Alert.alert('保存完了', `「${tourRoute.name}」を保存しました！`);
      } catch (err: any) {
        Alert.alert('保存エラー', err.message ?? '保存に失敗しました');
      } finally {
        setSavingIndex(null);
      }
    },
    [savedRouteIds]
  );

  const handleShare = useCallback(async (tourRoute: Route) => {
    try {
      await Share.share({
        title: tourRoute.name,
        message: `${tourRoute.name}\n${tourRoute.description}\n\n距離: ${tourRoute.distance} | 時間: ${tourRoute.time} | 難易度: ${tourRoute.difficulty}\n\nツーリングプランナーアプリで詳細を確認`,
      });
    } catch {
      // User cancelled
    }
  }, []);

  const handleSaveAll = useCallback(async () => {
    Alert.alert(
      '全ルートを保存',
      `${routes.length}つのルートをすべて保存しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '保存する',
          onPress: async () => {
            for (let i = 0; i < routes.length; i++) {
              if (!savedRouteIds.has(i)) {
                try {
                  await saveRoute(routes[i]);
                  setSavedRouteIds((prev) => new Set([...prev, i]));
                } catch {
                  // Continue saving others
                }
              }
            }
            Alert.alert('完了', 'すべてのルートを保存しました！');
          },
        },
      ]
    );
  }, [routes, savedRouteIds]);

  if (routes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyTitle}>ルートがありません</Text>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backBtnText}>戻る</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Results Header */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>
          🎉 {routes.length}つのルートが見つかりました
        </Text>
        <Text style={styles.resultsSubtitle}>
          あなたの条件に合わせたAI厳選ルートです
        </Text>
        <WeatherWidget lat={startLat} lng={startLng} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {routes.map((r: Route, i: number) => (
          <View key={i}>
            {savingIndex === i && (
              <View style={styles.savingOverlay}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.savingText}>保存中...</Text>
              </View>
            )}
            <RouteCard
              route={r}
              index={i}
              isSaved={savedRouteIds.has(i)}
              onSave={(tourRoute) => handleSave(tourRoute, i)}
              onShare={handleShare}
              onShowMap={(tourRoute) =>
                navigation.navigate('RouteMap', {
                  routeData: { name: tourRoute.name, waypointObjects: tourRoute.waypointObjects },
                  mapUrl: tourRoute.mapUrl,
                })
              }
              showActions
              startLat={startLat}
              startLng={startLng}
            />
          </View>
        ))}

        {/* Save All Button */}
        <TouchableOpacity style={styles.saveAllBtn} onPress={handleSaveAll}>
          <Text style={styles.saveAllBtnText}>⭐ すべてのルートを保存</Text>
        </TouchableOpacity>

        {/* Go Back */}
        <TouchableOpacity
          style={styles.regenerateBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.regenerateBtnText}>
            🔄 条件を変えて再生成
          </Text>
        </TouchableOpacity>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  resultsHeader: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  resultsTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  resultsSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.md,
  },
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  savingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
  },
  saveAllBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.secondary,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    ...SHADOW.sm,
  },
  saveAllBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  regenerateBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOW.sm,
  },
  regenerateBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  backBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  backBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
});
