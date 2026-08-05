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
import { getMyGroups, getAllGroups } from '../services/groups';
import type { Group } from '../services/groups';

type NavProp = StackNavigationProp<RootStackParamList>;
type TabType = 'mine' | 'discover';

export default function GroupsScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const [tab, setTab] = useState<TabType>('mine');
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mine, all] = await Promise.all([
        getMyGroups().catch(() => []),
        getAllGroups().catch(() => []),
      ]);
      setMyGroups(mine);
      setAllGroups(all);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const myIds = new Set(myGroups.map((g) => g.id));
  // 「探す」タブでは参加済みを除外
  const discoverGroups = allGroups.filter((g) => !myIds.has(g.id));
  const list = tab === 'mine' ? myGroups : discoverGroups;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomColor: colors.borderLight }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>👥 グループ</Text>
            <Text style={[styles.headerSub, { color: colors.textLight }]}>仲間とツーリングを計画しよう</Text>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('GroupForm', {})}
          >
            <Text style={styles.createBtnText}>＋ 作成</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {([
            { value: 'mine' as const, label: `参加中（${myGroups.length}）` },
            { value: 'discover' as const, label: 'グループを探す' },
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
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {tab === 'mine' ? 'まだグループに参加していません' : 'グループがまだありません'}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
            {tab === 'mine'
              ? `「グループを探す」から参加するか、${'\n'}自分で作成してみましょう`
              : '最初のグループを作ってみませんか'}
          </Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('GroupForm', {})}
          >
            <Text style={styles.emptyBtnText}>＋ グループを作成</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
        >
          {list.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[styles.card, { backgroundColor: colors.cardBg }]}
              onPress={() => navigation.navigate('GroupDetail', { groupId: g.id })}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {g.name}
                </Text>
                {g.requiresApproval && (
                  <View style={[styles.approvalBadge, { backgroundColor: colors.chipBg }]}>
                    <Text style={[styles.approvalBadgeText, { color: colors.textSecondary }]}>承認制</Text>
                  </View>
                )}
              </View>
              {g.description ? (
                <Text style={[styles.cardDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                  {g.description}
                </Text>
              ) : null}
              <Text style={[styles.cardMeta, { color: colors.textMuted }]}>
                👤 {g.memberCount}人{g.area ? ` ・ 📍 ${g.area}` : ''}
              </Text>
            </TouchableOpacity>
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
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  headerSub: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  createBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  createBtnText: { color: '#fff', fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  tabRow: { flexDirection: 'row', marginTop: SPACING.md },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.sm, textAlign: 'center' },
  emptySub: { fontSize: FONT_SIZE.md, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl },
  emptyBtn: {
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  emptyBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  list: { padding: SPACING.lg },
  card: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardName: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  approvalBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  approvalBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  cardDesc: { fontSize: FONT_SIZE.sm, marginTop: SPACING.xs, lineHeight: 19 },
  cardMeta: { fontSize: FONT_SIZE.xs, marginTop: SPACING.sm },
});
