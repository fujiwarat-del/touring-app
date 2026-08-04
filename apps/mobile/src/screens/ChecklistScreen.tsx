import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { getGarageBikes, saveChecklist, formatKm } from '../services/garage';
import type { GarageBike } from '../services/garage';
import { CHECK_ITEMS } from '../constants/checkItems';
import type { CheckStatus, CheckResultItem } from '../constants/checkItems';

type RouteProps = RouteProp<RootStackParamList, 'Checklist'>;
type NavProp = StackNavigationProp<RootStackParamList>;

interface ItemState {
  status: CheckStatus | null; // null = 未回答
  memo: string;
}

export default function ChecklistScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();

  const [bikes, setBikes] = useState<GarageBike[]>([]);
  const [selectedBike, setSelectedBike] = useState<GarageBike | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [odometer, setOdometer] = useState('');
  const [items, setItems] = useState<Record<string, ItemState>>(
    Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, { status: null, memo: '' }]))
  );

  useEffect(() => {
    getGarageBikes()
      .then((list) => {
        setBikes(list);
        // 遷移時にbikeId指定があればそれを、1台のみなら自動選択
        const target = route.params?.bikeId
          ? list.find((b) => b.id === route.params!.bikeId) ?? null
          : list.length === 1 ? list[0] : null;
        if (target) {
          setSelectedBike(target);
          setOdometer(target.odometer > 0 ? formatKm(target.odometer) : '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [route.params?.bikeId]);

  const setStatus = (key: string, status: CheckStatus) => {
    setItems((prev) => ({
      ...prev,
      [key]: { ...prev[key], status: prev[key].status === status ? null : status },
    }));
  };

  const setMemo = (key: string, memo: string) => {
    setItems((prev) => ({ ...prev, [key]: { ...prev[key], memo } }));
  };

  const doSave = async () => {
    if (!selectedBike) return;
    const odo = parseInt(odometer.replace(/[^\d]/g, ''), 10);
    if (isNaN(odo) || odo < 0) {
      Alert.alert('入力エラー', '走行距離を数値で入力してください');
      return;
    }

    const resultItems: CheckResultItem[] = CHECK_ITEMS
      .filter((def) => items[def.key].status !== null)
      .map((def) => ({
        key: def.key,
        status: items[def.key].status!,
        memo: items[def.key].status === 'concern' && items[def.key].memo.trim()
          ? items[def.key].memo.trim()
          : null,
      }));

    setSaving(true);
    try {
      await saveChecklist(selectedBike.id, odo, resultItems);
      const concernCount = resultItems.filter((i) => i.status === 'concern').length;
      Alert.alert(
        'チェック完了！',
        concernCount > 0
          ? `「気になる」が${concernCount}件ありました。\n\n不安な箇所は販売店や整備士への相談をおすすめします。安全なツーリングを！🏍️`
          : 'すべてのチェックが記録されました。\n安全なツーリングを！🏍️',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('保存に失敗しました', e?.message ?? '通信環境をご確認のうえ再度お試しください');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const unanswered = CHECK_ITEMS.filter((def) => items[def.key].status === null);
    if (unanswered.length > 0) {
      Alert.alert(
        '未チェックの項目があります',
        `${unanswered.map((d) => d.label).join('・')} が未チェックです。\nこのまま保存しますか？`,
        [
          { text: '戻って確認', style: 'cancel' },
          { text: 'このまま保存', onPress: doSave },
        ]
      );
    } else {
      doSave();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  // 車両未登録
  if (bikes.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🏍️</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>先に愛車を登録してください</Text>
          <TouchableOpacity
            style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.replace('BikeForm', {})}
          >
            <Text style={styles.emptyBtnText}>＋ 愛車を登録</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // 車両選択（複数台でbikeId未指定）
  if (!selectedBike) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.selectTitle, { color: colors.textPrimary }]}>どのバイクをチェックしますか？</Text>
          {bikes.map((bike) => (
            <TouchableOpacity
              key={bike.id}
              style={[styles.bikeSelectCard, { backgroundColor: colors.cardBg }]}
              onPress={() => {
                setSelectedBike(bike);
                setOdometer(bike.odometer > 0 ? formatKm(bike.odometer) : '');
              }}
            >
              <Text style={styles.bikeSelectIcon}>🏍️</Text>
              <View>
                <Text style={[styles.bikeSelectName, { color: colors.textPrimary }]}>{bike.name}</Text>
                <Text style={[styles.bikeSelectModel, { color: colors.textSecondary }]}>
                  {bike.maker} {bike.model}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const answeredCount = CHECK_ITEMS.filter((d) => items[d.key].status !== null).length;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* 対象車両＋走行距離 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.targetLabel, { color: colors.textMuted }]}>チェック対象</Text>
            <Text style={[styles.targetName, { color: colors.textPrimary }]}>🏍️ {selectedBike.name}</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>現在の走行距離（km）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={odometer}
              onChangeText={(t) => {
                const digits = t.replace(/[^\d]/g, '');
                setOdometer(digits ? formatKm(parseInt(digits, 10)) : '');
              }}
              placeholder="例: 12,345"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={9}
            />
          </View>

          {/* 進捗 */}
          <Text style={[styles.progress, { color: colors.textSecondary }]}>
            {answeredCount} / {CHECK_ITEMS.length} 項目チェック済み
          </Text>

          {/* チェック項目 */}
          {CHECK_ITEMS.map((def) => {
            const state = items[def.key];
            return (
              <View key={def.key} style={[styles.itemCard, { backgroundColor: colors.cardBg }]}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemIcon}>{def.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemLabel, { color: colors.textPrimary }]}>{def.label}</Text>
                    <Text style={[styles.itemHint, { color: colors.textMuted }]}>{def.hint}</Text>
                  </View>
                </View>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      { borderColor: colors.border },
                      state.status === 'ok' && styles.okBtnActive,
                    ]}
                    onPress={() => setStatus(def.key, 'ok')}
                  >
                    <Text style={[styles.statusBtnText, state.status === 'ok' && styles.okBtnTextActive]}>
                      ✅ OK
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.statusBtn,
                      { borderColor: colors.border },
                      state.status === 'concern' && styles.concernBtnActive,
                    ]}
                    onPress={() => setStatus(def.key, 'concern')}
                  >
                    <Text style={[styles.statusBtnText, state.status === 'concern' && styles.concernBtnTextActive]}>
                      ⚠️ 気になる
                    </Text>
                  </TouchableOpacity>
                </View>
                {state.status === 'concern' && (
                  <TextInput
                    style={[styles.memoInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={state.memo}
                    onChangeText={(t) => setMemo(def.key, t)}
                    placeholder="気になる点をメモ（任意）"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    maxLength={200}
                  />
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中...' : '💾 チェック結果を保存'}</Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  emptyBtn: {
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  emptyBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  selectTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  bikeSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  bikeSelectIcon: { fontSize: 32, marginRight: SPACING.md },
  bikeSelectName: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  bikeSelectModel: { fontSize: FONT_SIZE.sm, marginTop: 2 },
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  targetLabel: { fontSize: FONT_SIZE.xs },
  targetName: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, marginTop: 2 },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.lg,
  },
  progress: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  itemCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  itemIcon: { fontSize: 26, marginRight: SPACING.md },
  itemLabel: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  itemHint: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  // グローブを外した直後でも押しやすい大きめのタップ領域
  statusBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  statusBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: '#888',
  },
  okBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(29,158,117,0.12)',
  },
  okBtnTextActive: { color: COLORS.primary },
  concernBtnActive: {
    borderColor: '#D97706',
    backgroundColor: 'rgba(217,119,6,0.12)',
  },
  concernBtnTextActive: { color: '#D97706' },
  memoInput: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    marginTop: SPACING.md,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveBtn: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
});
