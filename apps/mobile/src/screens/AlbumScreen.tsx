import React, { useCallback, useState } from 'react';
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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { getTours, calcYearlyStats } from '../services/tours';
import type { Tour } from '../services/tours';
import { getGarageBikes } from '../services/garage';
import { formatKm } from '../services/garage';

type NavProp = StackNavigationProp<RootStackParamList>;

function formatDateJa(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function AlbumScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const [tours, setTours] = useState<Tour[]>([]);
  const [bikeNames, setBikeNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showPrefs, setShowPrefs] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getTours(), getGarageBikes().catch(() => [])])
        .then(([t, bikes]) => {
          if (!active) return;
          setTours(t);
          setBikeNames(Object.fromEntries(bikes.map((b) => [b.id, b.name])));
        })
        .catch(() => {})
        .finally(() => active && setLoading(false));
      return () => { active = false; };
    }, [])
  );

  const stats = calcYearlyStats(tours, year);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* 年間サマリー */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
        {/* 年間サマリー */}
        <View style={[styles.summaryCard, { backgroundColor: colors.chipBg }]}>
          <View style={styles.yearRow}>
            <TouchableOpacity style={styles.yearBtn} onPress={() => setYear((y) => y - 1)}>
              <Text style={styles.yearBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={[styles.yearText, { color: colors.textPrimary }]}>{year}年</Text>
            <TouchableOpacity
              style={[styles.yearBtn, year >= new Date().getFullYear() && { opacity: 0.3 }]}
              onPress={() => setYear((y) => Math.min(new Date().getFullYear(), y + 1))}
              disabled={year >= new Date().getFullYear()}
            >
              <Text style={styles.yearBtnText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{stats.tourCount}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textLight }]}>走行回数</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{formatKm(stats.totalDistanceKm)}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textLight }]}>合計km</Text>
            </View>
            <View style={styles.summaryDivider} />
            <TouchableOpacity style={styles.summaryItem} onPress={() => setShowPrefs(true)}>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{stats.prefectures.length}</Text>
              <Text style={[styles.summaryLabel, { color: colors.textLight }]}>都道府県 ›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : tours.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📔</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            まだ記録がありません
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            ツーリングの思い出を写真と一緒に{'\n'}残していきましょう
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('TourForm', {})}
          >
            <Text style={styles.emptyBtnText}>＋ 最初のツーリングを記録</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {tours.map((tour) => {
            const cover = tour.photos[tour.coverPhotoIndex] ?? tour.photos[0];
            return (
              <TouchableOpacity
                key={tour.id}
                style={[styles.card, { backgroundColor: colors.cardBg }]}
                onPress={() => navigation.navigate('TourDetail', { tourId: tour.id })}
                activeOpacity={0.85}
              >
                {cover ? (
                  <Image source={{ uri: cover.url }} style={styles.cardImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                    <Text style={styles.cardImagePlaceholderText}>🏍️</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {tour.title}
                  </Text>
                  <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
                    {formatDateJa(tour.date)} ・ {formatKm(tour.distanceKm)}km
                    {tour.bikeId && bikeNames[tour.bikeId] ? ` ・ 🏍️ ${bikeNames[tour.bikeId]}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: SPACING.xxxl * 2 }} />
        </ScrollView>
      )}

      {/* 新規作成FAB */}
      {tours.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('TourForm', {})}
        >
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* 訪問済み都道府県モーダル */}
      {/* TODO: 将来は47都道府県の塗りつぶしマップに置き換える（実装コスト高のため現状はチップ一覧） */}
      <Modal visible={showPrefs} transparent animationType="fade" onRequestClose={() => setShowPrefs(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowPrefs(false)}>
          <View style={[styles.modalCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              🗾 {year}年に訪れた都道府県（{stats.prefectures.length}）
            </Text>
            {stats.prefectures.length === 0 ? (
              <Text style={[styles.modalEmpty, { color: colors.textMuted }]}>
                まだ記録がありません
              </Text>
            ) : (
              <View style={styles.prefWrap}>
                {stats.prefectures.map((p) => (
                  <View key={p} style={[styles.prefChip, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.prefChipText, { color: colors.primary }]}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]} onPress={() => setShowPrefs(false)}>
              <Text style={styles.modalCloseText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary },
  headerSub: { fontSize: FONT_SIZE.sm, color: COLORS.textLight, marginTop: 2 },
  summaryCard: {
    backgroundColor: '#F4F4F4',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  yearBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: SPACING.lg,
  },
  yearBtnText: { color: COLORS.textSecondary, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, lineHeight: 24 },
  yearText: { color: COLORS.textPrimary, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, backgroundColor: '#DBDBDB' },
  summaryValue: { color: COLORS.textPrimary, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  summaryLabel: { color: COLORS.textLight, fontSize: FONT_SIZE.xs, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.sm },
  emptySub: { fontSize: FONT_SIZE.md, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },
  emptyBtn: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    ...SHADOW.sm,
  },
  emptyBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  card: {
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  cardImage: { width: '100%', height: 160 },
  cardImagePlaceholder: {
    backgroundColor: 'rgba(29,158,117,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagePlaceholderText: { fontSize: 48 },
  cardBody: { padding: SPACING.md },
  cardTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  cardMeta: { fontSize: FONT_SIZE.xs, marginTop: 4 },
  fab: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.xl,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW.md,
  },
  fabText: { color: '#fff', fontSize: 30, lineHeight: 34 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  modalCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxHeight: '70%',
  },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.md },
  modalEmpty: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.lg },
  prefWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md },
  prefChip: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
  },
  prefChipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  modalCloseBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modalCloseText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
