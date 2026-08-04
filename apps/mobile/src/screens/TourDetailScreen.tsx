import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Modal,
  Alert,
  Dimensions,
  FlatList,
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { getTour, deleteTour } from '../services/tours';
import type { Tour } from '../services/tours';
import { getGarageBike, formatKm } from '../services/garage';

type RouteProps = RouteProp<RootStackParamList, 'TourDetail'>;
type NavProp = StackNavigationProp<RootStackParamList>;

const SCREEN_W = Dimensions.get('window').width;
/** 共有画像サイズ（Instagram正方形投稿対応） */
const SHARE_SIZE = 1080;

function formatDateJa(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function TourDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { tourId } = route.params;

  const [tour, setTour] = useState<Tour | null>(null);
  const [bikeName, setBikeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<ViewShot>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getTour(tourId)
        .then(async (t) => {
          if (!active) return;
          setTour(t);
          if (t?.bikeId) {
            const bike = await getGarageBike(t.bikeId).catch(() => null);
            if (active) setBikeName(bike?.name ?? null);
          }
        })
        .catch(() => {})
        .finally(() => active && setLoading(false));
      return () => { active = false; };
    }, [tourId])
  );

  const handleDelete = () => {
    if (!tour) return;
    Alert.alert(
      '記録を削除',
      `「${tour.title}」を削除しますか？\n\n⚠️ アップロード済みの写真もすべて削除されます。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTour(tour.id);
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('削除に失敗しました', e?.message ?? '再度お試しください');
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    if (!shareRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await shareRef.current.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'ツーリング記録を共有' });
      } else {
        Alert.alert('共有できません', 'この端末では共有機能を利用できません');
      }
    } catch (e: any) {
      Alert.alert('共有画像の生成に失敗しました', e?.message ?? '再度お試しください');
    } finally {
      setSharing(false);
    }
  };

  if (loading || !tour) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          {loading ? <ActivityIndicator size="large" color={colors.primary} /> : <Text style={{ color: colors.textSecondary }}>記録が見つかりませんでした</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const cover = tour.photos[tour.coverPhotoIndex] ?? tour.photos[0];
  const routeStr = tour.route
    ? [tour.route.origin, ...tour.route.waypoints, tour.route.destination].filter(Boolean).join(' → ')
    : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scroll}>
        {/* カバー写真 */}
        {cover ? (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setViewerIndex(tour.coverPhotoIndex)}>
            <Image source={{ uri: cover.url }} style={styles.coverImage} resizeMode="cover" />
          </TouchableOpacity>
        ) : (
          <View style={[styles.coverImage, styles.coverPlaceholder]}>
            <Text style={{ fontSize: 56 }}>🏍️</Text>
          </View>
        )}

        <View style={styles.body}>
          {/* タイトル・基本情報 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{tour.title}</Text>
            <View style={styles.metaWrap}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>📅 {formatDateJa(tour.date)}</Text>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>📏 {formatKm(tour.distanceKm)} km</Text>
              {bikeName && <Text style={[styles.metaText, { color: colors.textSecondary }]}>🏍️ {bikeName}</Text>}
              {tour.weather && <Text style={[styles.metaText, { color: colors.textSecondary }]}>{tour.weather}</Text>}
            </View>
            {routeStr && (
              <Text style={[styles.routeText, { color: colors.textSecondary }]}>🗺️ {routeStr}</Text>
            )}
            {tour.prefectures.length > 0 && (
              <View style={styles.prefWrap}>
                {tour.prefectures.map((p) => (
                  <View key={p} style={[styles.prefChip, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.prefChipText, { color: colors.primary }]}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
            {tour.memo && (
              <Text style={[styles.memo, { color: colors.textPrimary }]}>{tour.memo}</Text>
            )}
          </View>

          {/* 写真グリッド */}
          {tour.photos.length > 0 && (
            <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📷 写真（{tour.photos.length}枚）</Text>
              <View style={styles.grid}>
                {tour.photos.map((p, i) => (
                  <TouchableOpacity key={p.storagePath} onPress={() => setViewerIndex(i)}>
                    <Image source={{ uri: p.url }} style={styles.gridImage} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* アクション */}
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.primary }, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
          >
            <Text style={styles.shareBtnText}>{sharing ? '生成中...' : '📤 共有画像を作成'}</Text>
          </TouchableOpacity>

          {/* コミュニティ投稿への転載（タイトル・メモ・写真・都道府県をプレフィル） */}
          <TouchableOpacity
            style={[styles.postBtn, { borderColor: colors.primary }]}
            onPress={() =>
              navigation.navigate('Post', {
                prefill: {
                  routeName: tour.title,
                  comment: [tour.memo ?? '', routeStr ? `🗺️ ${routeStr}` : '']
                    .filter(Boolean)
                    .join('\n\n'),
                  photoUrls: tour.photos.map((p) => p.url),
                  prefectures: tour.prefectures,
                },
              })
            }
          >
            <Text style={[styles.postBtnText, { color: colors.primary }]}>🏍️ コミュニティに投稿</Text>
          </TouchableOpacity>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: colors.border }]}
              onPress={() => navigation.navigate('TourForm', { tourId: tour.id })}
            >
              <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>✏️ 編集</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: '#FCA5A5' }]} onPress={handleDelete}>
              <Text style={[styles.actionBtnText, { color: '#DC2626' }]}>🗑️ 削除</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: SPACING.xxxl }} />
        </View>
      </ScrollView>

      {/* 全画面スワイプビューア */}
      <Modal visible={viewerIndex !== null} transparent animationType="fade" onRequestClose={() => setViewerIndex(null)}>
        <View style={styles.viewerBackdrop}>
          <FlatList
            data={tour.photos}
            horizontal
            pagingEnabled
            initialScrollIndex={viewerIndex ?? 0}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            keyExtractor={(p) => p.storagePath}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_W, justifyContent: 'center' }}>
                <Image source={{ uri: item.url }} style={styles.viewerImage} resizeMode="contain" />
              </View>
            )}
          />
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewerIndex(null)}>
            <Text style={styles.viewerCloseText}>✕ 閉じる</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ─── SNS共有用オフスクリーンレイアウト（1080x1080） ─── */}
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot
          ref={shareRef}
          options={{ format: 'jpg', quality: 0.9, width: SHARE_SIZE, height: SHARE_SIZE }}
        >
          <View style={styles.shareCanvas}>
            {cover ? (
              <Image source={{ uri: cover.url }} style={styles.shareBg} resizeMode="cover" />
            ) : (
              <View style={[styles.shareBg, { backgroundColor: COLORS.primary }]} />
            )}
            {/* 文字が写真に埋もれないよう下部にグラデーション */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.75)']}
              style={styles.shareGradient}
            />
            <View style={styles.shareContent}>
              <Text style={styles.shareTitle} numberOfLines={2}>{tour.title}</Text>
              <Text style={styles.shareMeta}>
                📅 {formatDateJa(tour.date)}　📏 {formatKm(tour.distanceKm)} km
              </Text>
              {routeStr && (
                <Text style={styles.shareRoute} numberOfLines={2}>🗺️ {routeStr}</Text>
              )}
            </View>
            {/* アプリ名ロゴ（共有経由の認知獲得のため必ず表示） */}
            <View style={styles.shareLogoBadge}>
              <Text style={styles.shareLogoText}>🏍️ ツーリングプランナー</Text>
            </View>
          </View>
        </ViewShot>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  coverImage: { width: '100%', height: 240 },
  coverPlaceholder: {
    backgroundColor: 'rgba(29,158,117,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: SPACING.lg, marginTop: -SPACING.lg },
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  metaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  metaText: { fontSize: FONT_SIZE.sm },
  routeText: { fontSize: FONT_SIZE.sm, marginTop: SPACING.sm, lineHeight: 20 },
  prefWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.sm },
  prefChip: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  prefChipText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  memo: {
    fontSize: FONT_SIZE.md,
    lineHeight: 22,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  gridImage: {
    width: (SCREEN_W - SPACING.lg * 2 - SPACING.lg * 2 - SPACING.xs * 2) / 3,
    height: (SCREEN_W - SPACING.lg * 2 - SPACING.lg * 2 - SPACING.xs * 2) / 3,
    borderRadius: RADIUS.sm,
  },
  shareBtn: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  shareBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  postBtn: {
    borderWidth: 2,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  postBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  actionRow: { flexDirection: 'row', gap: SPACING.md },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  actionBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  viewerImage: { width: SCREEN_W, height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: 56,
    right: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  viewerCloseText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  // オフスクリーン共有レイアウト
  offscreen: { position: 'absolute', left: -4000, top: 0 },
  shareCanvas: { width: SHARE_SIZE, height: SHARE_SIZE, backgroundColor: '#000' },
  shareBg: { position: 'absolute', width: SHARE_SIZE, height: SHARE_SIZE },
  shareGradient: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: SHARE_SIZE * 0.45,
  },
  shareContent: {
    position: 'absolute',
    left: 48, right: 48, bottom: 110,
  },
  shareTitle: {
    color: '#fff',
    fontSize: 64,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 8,
  },
  shareMeta: { color: '#fff', fontSize: 40, marginTop: 20 },
  shareRoute: { color: 'rgba(255,255,255,0.9)', fontSize: 30, marginTop: 14 },
  shareLogoBadge: {
    position: 'absolute',
    right: 32, bottom: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  shareLogoText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
});
