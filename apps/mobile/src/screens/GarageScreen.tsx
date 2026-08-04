import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  getGarageBikes,
  seedGarageFromMyBikes,
  getExpiryWarnings,
  formatKm,
} from '../services/garage';
import type { GarageBike } from '../services/garage';

type NavProp = StackNavigationProp<RootStackParamList>;

function formatDateShort(iso: string | null): string {
  if (!iso) return '未実施';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '未実施';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function GarageScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const [bikes, setBikes] = useState<GarageBike[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      await seedGarageFromMyBikes(); // 初回のみ既存マイバイクを取り込み
      const list = await getGarageBikes();
      setBikes(list);
    } catch {
      // オフライン等。Firestoreのキャッシュに任せる
    } finally {
      setLoading(false);
    }
  }, []);

  // 画面フォーカス時に再読み込み（登録・チェック後の反映）
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>🔧 ガレージ</Text>
        <Text style={[styles.headerSub, { color: colors.textLight }]}>愛車の管理と出発前チェック</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : bikes.length === 0 ? (
        /* 空状態（初回オンボーディング） */
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🏍️</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            愛車を登録しましょう
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            登録すると出発前の点検チェックや{'\n'}車検・自賠責の期日管理ができます
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('BikeForm', {})}
          >
            <Text style={styles.emptyBtnText}>＋ 愛車を登録</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {bikes.map((bike) => {
            const warnings = getExpiryWarnings(bike);
            return (
              <TouchableOpacity
                key={bike.id}
                style={[styles.card, { backgroundColor: colors.cardBg }]}
                onPress={() => navigation.navigate('BikeDetail', { bikeId: bike.id })}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardIcon}>🏍️</Text>
                  <View style={styles.cardTitleWrap}>
                    <Text style={[styles.cardName, { color: colors.textPrimary }]}>{bike.name}</Text>
                    <Text style={[styles.cardModel, { color: colors.textSecondary }]}>
                      {bike.maker} {bike.model}{bike.year ? `（${bike.year}年式）` : ''}
                    </Text>
                  </View>
                </View>

                {/* 期日警告バッジ */}
                {warnings.length > 0 && (
                  <View style={styles.warnRow}>
                    {warnings.map((w) => (
                      <View
                        key={w.label}
                        style={[styles.warnBadge, w.expired ? styles.warnBadgeExpired : styles.warnBadgeSoon]}
                      >
                        <Text style={[styles.warnBadgeText, w.expired ? styles.warnTextExpired : styles.warnTextSoon]}>
                          {w.expired
                            ? `⚠️ ${w.label}切れ（${Math.abs(w.daysLeft)}日超過）`
                            : `⏰ ${w.label}まで${w.daysLeft}日`}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.cardStats}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>走行距離</Text>
                    <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                      {formatKm(bike.odometer)} km
                    </Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>最終チェック</Text>
                    <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                      {formatDateShort(bike.lastCheckAt)}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.checkBtn, { backgroundColor: colors.primaryLight }]}
                  onPress={() => navigation.navigate('Checklist', { bikeId: bike.id })}
                >
                  <Text style={[styles.checkBtnText, { color: colors.primary }]}>
                    ✅ 出発前チェックを開始
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.addBtn, { borderColor: colors.primary }]}
            onPress={() => navigation.navigate('BikeForm', {})}
          >
            <Text style={[styles.addBtnText, { color: colors.primary }]}>＋ 愛車を追加</Text>
          </TouchableOpacity>
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
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  headerSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textLight,
    marginTop: 2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.sm,
  },
  emptySub: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emptyBtn: {
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    ...SHADOW.sm,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: { fontSize: 32, marginRight: SPACING.md },
  cardTitleWrap: { flex: 1 },
  cardName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  cardModel: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  warnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  warnBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  warnBadgeSoon: { backgroundColor: '#FEF3CD' },
  warnBadgeExpired: { backgroundColor: '#FEE2E2' },
  warnBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  warnTextSoon: { color: '#92600A' },
  warnTextExpired: { color: '#DC2626' },
  cardStats: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  statLabel: { fontSize: FONT_SIZE.xs },
  statValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginTop: 2,
  },
  checkBtn: {
    marginTop: SPACING.md,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  checkBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  addBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  addBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
});
