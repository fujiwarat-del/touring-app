import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  getGarageBike,
  getChecklists,
  getExpiryWarnings,
  formatKm,
} from '../services/garage';
import { getBikeStats } from '../services/tours';
import type { GarageBike, ChecklistRecord } from '../services/garage';
import { getCheckItemDef } from '../constants/checkItems';

type RouteProps = RouteProp<RootStackParamList, 'BikeDetail'>;
type NavProp = StackNavigationProp<RootStackParamList>;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateJa(iso: string | null): string {
  if (!iso) return '未設定';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '未設定';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function BikeDetailScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { bikeId } = route.params;

  const [bike, setBike] = useState<GarageBike | null>(null);
  const [checklists, setChecklists] = useState<ChecklistRecord[]>([]);
  const [tourStats, setTourStats] = useState<{ count: number; totalKm: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<ChecklistRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        getGarageBike(bikeId),
        getChecklists(bikeId),
        getBikeStats(bikeId).catch(() => null),
      ])
        .then(([b, c, stats]) => {
          if (!active) return;
          setBike(b);
          setChecklists(c);
          setTourStats(stats);
        })
        .catch(() => {})
        .finally(() => active && setLoading(false));
      return () => { active = false; };
    }, [bikeId])
  );

  if (loading || !bike) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : (
            <Text style={{ color: colors.textSecondary }}>車両が見つかりませんでした</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const warnings = getExpiryWarnings(bike);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* 車両情報 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <View style={styles.bikeHeader}>
            <Text style={styles.bikeIcon}>🏍️</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bikeName, { color: colors.textPrimary }]}>{bike.name}</Text>
              <Text style={[styles.bikeModel, { color: colors.textSecondary }]}>
                {bike.maker} {bike.model}{bike.year ? `（${bike.year}年式）` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.editBtn, { borderColor: colors.border }]}
              onPress={() => navigation.navigate('BikeForm', { bikeId: bike.id })}
            >
              <Text style={[styles.editBtnText, { color: colors.textSecondary }]}>✏️ 編集</Text>
            </TouchableOpacity>
          </View>

          {warnings.length > 0 && (
            <View style={styles.warnRow}>
              {warnings.map((w) => (
                <View key={w.label} style={[styles.warnBadge, w.expired ? styles.warnBadgeExpired : styles.warnBadgeSoon]}>
                  <Text style={[styles.warnBadgeText, w.expired ? styles.warnTextExpired : styles.warnTextSoon]}>
                    {w.expired ? `⚠️ ${w.label}切れ（${Math.abs(w.daysLeft)}日超過）` : `⏰ ${w.label}まで${w.daysLeft}日`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>走行距離</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatKm(bike.odometer)} km</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>車検満了日</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatDateJa(bike.shakenDate)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>自賠責満了日</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatDateJa(bike.jibaisekiDate)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={[styles.infoLabel, { color: colors.textMuted }]}>任意保険満了日</Text>
              <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{formatDateJa(bike.insuranceDate)}</Text>
            </View>
          </View>

          {/* オイル交換記録（未入力でも表示して入力へ誘導） */}
          {(bike.oilChangeDate || bike.oilChangeOdometer != null) ? (
            <View style={styles.oilRow}>
              <Text style={[styles.oilText, { color: colors.textSecondary }]}>
                🛢️ 前回オイル交換: {formatDateJa(bike.oilChangeDate)}
                {bike.oilChangeOdometer != null ? `（${formatKm(bike.oilChangeOdometer)}km時）` : ''}
              </Text>
              {bike.oilChangeOdometer != null && bike.odometer > bike.oilChangeOdometer && (
                <Text style={[styles.oilSinceText, { color: bike.odometer - bike.oilChangeOdometer >= 3000 ? '#D97706' : colors.textMuted }]}>
                  交換から {formatKm(bike.odometer - bike.oilChangeOdometer)} km 走行
                  {bike.odometer - bike.oilChangeOdometer >= 3000 ? '（そろそろ交換時期の目安です）' : ''}
                </Text>
              )}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.oilRow}
              onPress={() => navigation.navigate('BikeForm', { bikeId: bike.id })}
            >
              <Text style={[styles.oilText, { color: colors.textMuted }]}>
                🛢️ オイル交換記録が未入力です — タップして追加 ›
              </Text>
            </TouchableOpacity>
          )}

          {/* ツーリング実績（アルバムから集計） */}
          {tourStats && tourStats.count > 0 && (
            <Text style={[styles.tourStatsText, { color: colors.textSecondary }]}>
              📔 この車両でのツーリング: {tourStats.count}回 ・ 合計 {formatKm(tourStats.totalKm)} km
            </Text>
          )}

          <TouchableOpacity
            style={[styles.checkBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('Checklist', { bikeId: bike.id })}
          >
            <Text style={styles.checkBtnText}>✅ 出発前チェックを開始</Text>
          </TouchableOpacity>
        </View>

        {/* チェック履歴 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📋 チェック履歴</Text>
          {checklists.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              まだチェック履歴がありません。{'\n'}出発前チェックを実施すると、ここに記録されます。
            </Text>
          ) : (
            checklists.map((record) => {
              const concernCount = record.items.filter((i) => i.status === 'concern').length;
              return (
                <TouchableOpacity
                  key={record.id}
                  style={[styles.historyRow, { borderColor: colors.border }]}
                  onPress={() => setSelectedRecord(record)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyDate, { color: colors.textPrimary }]}>
                      {formatDateTime(record.date)}
                    </Text>
                    <Text style={[styles.historySub, { color: colors.textMuted }]}>
                      {formatKm(record.odometer)} km ・ {record.items.length}項目チェック
                    </Text>
                  </View>
                  {concernCount > 0 ? (
                    <View style={styles.concernBadge}>
                      <Text style={styles.concernBadgeText}>⚠️ 気になる {concernCount}件</Text>
                    </View>
                  ) : (
                    <Text style={styles.okText}>✅ 全てOK</Text>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>

      {/* 履歴詳細モーダル */}
      <Modal
        visible={!!selectedRecord}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRecord(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.cardBg }]}>
            {selectedRecord && (
              <>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {formatDateTime(selectedRecord.date)} のチェック
                </Text>
                <Text style={[styles.modalSub, { color: colors.textMuted }]}>
                  走行距離: {formatKm(selectedRecord.odometer)} km
                </Text>
                <ScrollView style={styles.modalList}>
                  {selectedRecord.items.map((item) => {
                    const def = getCheckItemDef(item.key);
                    return (
                      <View key={item.key} style={[styles.modalItem, { borderColor: colors.border }]}>
                        <Text style={[styles.modalItemLabel, { color: colors.textPrimary }]}>
                          {def?.icon ?? '🔧'} {def?.label ?? item.key}
                        </Text>
                        {item.status === 'ok' ? (
                          <Text style={styles.okText}>✅ OK</Text>
                        ) : (
                          <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: SPACING.md }}>
                            <Text style={styles.concernText}>⚠️ 気になる</Text>
                            {item.memo ? (
                              <Text style={[styles.memoText, { color: colors.textSecondary }]}>{item.memo}</Text>
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setSelectedRecord(null)}
                >
                  <Text style={styles.modalCloseBtnText}>閉じる</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.md,
  },
  bikeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bikeIcon: { fontSize: 36, marginRight: SPACING.md },
  bikeName: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  bikeModel: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  editBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  editBtnText: { fontSize: FONT_SIZE.sm },
  warnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.md,
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
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  infoItem: { width: '50%', alignItems: 'center', marginBottom: SPACING.md },
  infoLabel: { fontSize: FONT_SIZE.xs },
  infoValue: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, marginTop: 2, textAlign: 'center' },
  tourStatsText: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  oilRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
  },
  oilText: {
    fontSize: FONT_SIZE.sm,
  },
  oilSinceText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.bold,
    marginTop: 2,
  },
  checkBtn: {
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  checkBtnText: {
    color: '#fff',
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  emptyText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  historyDate: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  historySub: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  concernBadge: {
    backgroundColor: '#FEF3CD',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  concernBadgeText: { fontSize: FONT_SIZE.xs, color: '#92600A', fontWeight: FONT_WEIGHT.bold },
  okText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: FONT_WEIGHT.bold },
  concernText: { fontSize: FONT_SIZE.sm, color: '#D97706', fontWeight: FONT_WEIGHT.bold },
  memoText: { fontSize: FONT_SIZE.xs, marginTop: 2, textAlign: 'right' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.xl,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  modalSub: { fontSize: FONT_SIZE.sm, marginTop: 2, marginBottom: SPACING.md },
  modalList: { marginBottom: SPACING.md },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalItemLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  modalCloseBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  modalCloseBtnText: { color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});
