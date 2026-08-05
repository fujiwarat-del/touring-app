import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  getVisiblePlans, getMyPlans, formatPlanDateTime, daysUntil, VISIBILITY_OPTIONS,
} from '../services/plans';
import type { TouringPlan } from '../services/plans';

type NavProp = StackNavigationProp<RootStackParamList>;
type TabType = 'all' | 'mine';

function visibilityIcon(v: TouringPlan['visibility']): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === v)?.icon ?? '🌐';
}

export default function PlansScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const [tab, setTab] = useState<TabType>('all');
  const [plans, setPlans] = useState<TouringPlan[]>([]);
  const [myPlans, setMyPlans] = useState<TouringPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [visible, mine] = await Promise.all([
        getVisiblePlans().catch(() => []),
        getMyPlans().catch(() => []),
      ]);
      setPlans(visible);
      setMyPlans(mine);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const list = tab === 'all' ? plans : myPlans;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.borderLight }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>📅 ツーリング計画</Text>
            <Text style={[styles.headerSub, { color: colors.textLight }]}>一緒に走る仲間を募集しよう</Text>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('PlanForm', {})}
          >
            <Text style={styles.createBtnText}>＋ 募集</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {([
            { value: 'all' as const, label: '募集中' },
            { value: 'mine' as const, label: `主催（${myPlans.length}）` },
          ]).map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.tab, tab === t.value && { borderBottomColor: colors.primary }]}
              onPress={() => setTab(t.value)}
            >
              <Text style={[styles.tabText, { color: tab === t.value ? colors.primary : colors.textSecondary }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : list.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {tab === 'all' ? '募集中の計画がありません' : 'まだ計画を立てていません'}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            日時と集合場所を決めて{'\n'}一緒に走る仲間を募集しましょう
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('PlanForm', {})}
          >
            <Text style={styles.emptyBtnText}>＋ 計画を作成</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />
          }
        >
          {list.map((p) => {
            const days = daysUntil(p.dateTime);
            const full = p.capacity != null && p.participantCount >= p.capacity;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.card, { backgroundColor: colors.cardBg }]}
                onPress={() => navigation.navigate('PlanDetail', { planId: p.id })}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.dateBadge, { backgroundColor: colors.primaryLight }]}>
                    <Text style={[styles.dateBadgeText, { color: colors.primary }]}>
                      {formatPlanDateTime(p.dateTime)}
                    </Text>
                  </View>
                  {days <= 3 && !p.closed && (
                    <Text style={styles.soonText}>
                      {days === 0 ? '本日' : `あと${days}日`}
                    </Text>
                  )}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.visIcon}>{visibilityIcon(p.visibility)}</Text>
                </View>

                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                  {p.title}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                  📍 {p.meetingPlace || '集合場所未定'}
                </Text>
                <View style={styles.cardBottom}>
                  <Text style={[styles.cardOwner, { color: colors.textMuted }]} numberOfLines={1}>
                    主催: {p.ownerName}
                  </Text>
                  <Text style={[styles.cardCount, { color: full ? '#D97706' : colors.textSecondary }]}>
                    👤 {p.participantCount}
                    {p.capacity != null ? ` / ${p.capacity}` : ''}
                    {full ? '（満員）' : ''}
                  </Text>
                </View>
                {p.closed && (
                  <View style={styles.closedOverlay}>
                    <Text style={styles.closedText}>締切</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xl, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  headerSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  createBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full },
  createBtnText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  tabRow: { flexDirection: 'row', marginTop: SPACING.md },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.md,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.sm, textAlign: 'center' },
  emptySub: { fontSize: FONT_SIZE.md, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },
  emptyBtn: { paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderRadius: RADIUS.lg },
  emptyBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  list: { padding: SPACING.lg },
  card: {
    borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md,
    ...SHADOW.sm, overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  dateBadge: { borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  dateBadgeText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  soonText: { fontSize: FONT_SIZE.xs, color: '#D97706', fontWeight: FONT_WEIGHT.bold },
  visIcon: { fontSize: FONT_SIZE.md },
  cardTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  cardMeta: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs },
  cardBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  cardOwner: { flex: 1, fontSize: FONT_SIZE.xs },
  cardCount: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  closedOverlay: {
    position: 'absolute', top: 10, right: -28,
    backgroundColor: '#9A9A9A', paddingHorizontal: 32, paddingVertical: 3,
    transform: [{ rotate: '35deg' }],
  },
  closedText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
});
