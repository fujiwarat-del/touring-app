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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { createPlan, updatePlan, getPlan, VISIBILITY_OPTIONS } from '../services/plans';
import type { PlanVisibility } from '../services/plans';
import { getMyGroups } from '../services/groups';
import type { Group } from '../services/groups';

type RouteProps = RouteProp<RootStackParamList, 'PlanForm'>;
type NavProp = StackNavigationProp<RootStackParamList>;

const CAPACITY_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 15, 20];

function formatDateTimeJa(iso: string): string {
  const d = new Date(iso);
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${dow}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** デフォルトは翌週土曜の朝8時 */
function defaultDateTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

export default function PlanFormScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const planId = route.params?.planId;
  const isEdit = !!planId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateTime, setDateTime] = useState(defaultDateTime());
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [meetingPlace, setMeetingPlace] = useState('');
  const [meetingMapUrl, setMeetingMapUrl] = useState('');
  const [routeSummary, setRouteSummary] = useState('');
  const [capacity, setCapacity] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<PlanVisibility>('public');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<Group[]>([]);

  useEffect(() => {
    getMyGroups().then(setMyGroups).catch(() => {});
    if (!planId) return;
    getPlan(planId)
      .then((p) => {
        if (!p) return;
        setTitle(p.title);
        setDescription(p.description);
        setDateTime(p.dateTime);
        setMeetingPlace(p.meetingPlace);
        setMeetingMapUrl(p.meetingMapUrl ?? '');
        setRouteSummary(p.routeSummary);
        setCapacity(p.capacity);
        setVisibility(p.visibility);
        setGroupId(p.groupId);
      })
      .catch(() => Alert.alert('エラー', '計画の読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [planId]);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('入力エラー', 'タイトルを入力してください'); return; }
    if (!meetingPlace.trim()) { Alert.alert('入力エラー', '集合場所を入力してください'); return; }
    if (new Date(dateTime).getTime() < Date.now() && !isEdit) {
      Alert.alert('入力エラー', '開催日時が過去になっています');
      return;
    }
    if (visibility === 'group' && !groupId) {
      Alert.alert('入力エラー', '限定するグループを選択してください');
      return;
    }

    setSaving(true);
    try {
      const selectedGroup = myGroups.find((g) => g.id === groupId);
      const input = {
        title: title.trim(),
        description: description.trim(),
        dateTime,
        meetingPlace: meetingPlace.trim(),
        meetingMapUrl: meetingMapUrl.trim() || null,
        routeSummary: routeSummary.trim(),
        capacity,
        visibility,
        groupId: visibility === 'group' ? groupId : null,
        groupName: visibility === 'group' ? (selectedGroup?.name ?? null) : null,
      };
      if (isEdit) {
        await updatePlan(planId!, input);
        navigation.goBack();
      } else {
        const id = await createPlan(input);
        navigation.replace('PlanDetail', { planId: id });
      }
    } catch (e: any) {
      Alert.alert('保存に失敗しました', e?.message ?? '通信環境をご確認ください');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 基本情報 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              タイトル <Text style={styles.required}>必須</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={title} onChangeText={setTitle}
              placeholder="例: 秩父の峠をのんびり流しましょう"
              placeholderTextColor={colors.textMuted} maxLength={60}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              開催日時 <Text style={styles.required}>必須</Text>
            </Text>
            <View style={styles.dateTimeRow}>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: colors.border }]}
                onPress={() => setPicker('date')}
              >
                <Text style={[styles.dateBtnText, { color: colors.textPrimary }]}>
                  {formatDateTimeJa(dateTime)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeBtn, { borderColor: colors.border }]}
                onPress={() => setPicker('time')}
              >
                <Text style={[styles.dateBtnText, { color: colors.textSecondary }]}>🕐</Text>
              </TouchableOpacity>
            </View>
            {picker && (
              <DateTimePicker
                value={new Date(dateTime)}
                mode={picker}
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, d) => {
                  setPicker(null);
                  if (event.type === 'set' && d) {
                    const base = new Date(dateTime);
                    if (picker === 'date') {
                      base.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    } else {
                      base.setHours(d.getHours(), d.getMinutes(), 0, 0);
                    }
                    setDateTime(base.toISOString());
                  }
                }}
              />
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              集合場所 <Text style={styles.required}>必須</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={meetingPlace} onChangeText={setMeetingPlace}
              placeholder="例: 道の駅果樹公園あしがくぼ"
              placeholderTextColor={colors.textMuted} maxLength={80}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>集合場所のマップURL（任意）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={meetingMapUrl} onChangeText={setMeetingMapUrl}
              placeholder="Google Maps の共有リンク"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>ルート概要（任意）</Text>
            <TextInput
              style={[styles.input, styles.textarea, { color: colors.textPrimary, borderColor: colors.border }]}
              value={routeSummary} onChangeText={setRouteSummary}
              placeholder="例: あしがくぼ → 定峰峠 → 白石峠 → 昼食（あじよし） → 解散"
              placeholderTextColor={colors.textMuted}
              multiline maxLength={300}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>ひとこと（任意）</Text>
            <TextInput
              style={[styles.input, styles.textarea, { color: colors.textPrimary, borderColor: colors.border }]}
              value={description} onChangeText={setDescription}
              placeholder="ペースや参加条件、持ち物など"
              placeholderTextColor={colors.textMuted}
              multiline maxLength={500}
            />
          </View>

          {/* 定員 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>👤 定員</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>主催者を含む人数です</Text>
            <View style={styles.chipWrap}>
              <TouchableOpacity
                style={[
                  styles.chip, { borderColor: colors.border },
                  capacity === null && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setCapacity(null)}
              >
                <Text style={[styles.chipText, { color: capacity === null ? colors.primary : colors.textSecondary }]}>
                  制限なし
                </Text>
              </TouchableOpacity>
              {CAPACITY_OPTIONS.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.chip, { borderColor: colors.border },
                    capacity === n && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => setCapacity(n)}
                >
                  <Text style={[styles.chipText, { color: capacity === n ? colors.primary : colors.textSecondary }]}>
                    {n}人
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 公開範囲 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🔐 公開範囲</Text>
            {VISIBILITY_OPTIONS.map((opt) => {
              const selected = visibility === opt.value;
              const disabled = opt.value === 'group' && myGroups.length === 0;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.radioRow,
                    { borderColor: colors.border },
                    selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                    disabled && { opacity: 0.45 },
                  ]}
                  onPress={() => !disabled && setVisibility(opt.value)}
                  disabled={disabled}
                >
                  <Text style={[styles.radioMark, { color: selected ? colors.primary : colors.textMuted }]}>
                    {selected ? '●' : '○'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.radioLabel, { color: colors.textPrimary }]}>
                      {opt.icon} {opt.label}
                    </Text>
                    <Text style={[styles.radioDesc, { color: colors.textMuted }]}>
                      {disabled ? 'グループに参加すると選べます' : opt.desc}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* グループ限定のときだけグループ選択 */}
            {visibility === 'group' && myGroups.length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary }]}>対象グループ</Text>
                <View style={styles.chipWrap}>
                  {myGroups.map((g) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.chip, { borderColor: colors.border },
                        groupId === g.id && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                      ]}
                      onPress={() => setGroupId(g.id)}
                    >
                      <Text style={[styles.chipText, { color: groupId === g.id ? colors.primary : colors.textSecondary }]}>
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? '保存中...' : isEdit ? '変更を保存' : '📣 募集を開始'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: SPACING.lg },
  section: { borderRadius: RADIUS.lg, padding: SPACING.lg, marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  hint: { fontSize: FONT_SIZE.xs, marginTop: 2, marginBottom: SPACING.sm },
  label: {
    fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold,
    marginTop: SPACING.md, marginBottom: SPACING.xs,
  },
  required: { fontSize: FONT_SIZE.xs, color: '#DC2626' },
  input: {
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: SPACING.sm },
  dateBtn: {
    flex: 1, borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  timeBtn: {
    borderWidth: 1, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    alignItems: 'center', justifyContent: 'center',
  },
  dateBtnText: { fontSize: FONT_SIZE.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    borderWidth: 1.5, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: 7,
  },
  chipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  radioRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm, gap: SPACING.md,
  },
  radioMark: { fontSize: FONT_SIZE.lg },
  radioLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  radioDesc: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  saveBtn: { borderRadius: RADIUS.lg, paddingVertical: SPACING.lg, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
});
