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
import {
  getGarageBike,
  addGarageBike,
  updateGarageBike,
  deleteGarageBike,
  formatKm,
} from '../services/garage';
import { rescheduleAllReminders } from '../services/reminders';

type RouteProps = RouteProp<RootStackParamList, 'BikeForm'>;
type NavProp = StackNavigationProp<RootStackParamList>;

function formatDateJa(iso: string | null): string {
  if (!iso) return '未設定';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '未設定';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function BikeFormScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const bikeId = route.params?.bikeId;
  const isEdit = !!bikeId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [maker, setMaker] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [odometer, setOdometer] = useState('');
  const [shakenDate, setShakenDate] = useState<string | null>(null);
  const [jibaisekiDate, setJibaisekiDate] = useState<string | null>(null);
  const [insuranceDate, setInsuranceDate] = useState<string | null>(null);
  const [oilChangeDate, setOilChangeDate] = useState<string | null>(null);
  const [oilChangeOdometer, setOilChangeOdometer] = useState('');
  const [showPicker, setShowPicker] = useState<'shaken' | 'jibaiseki' | 'insurance' | 'oil' | null>(null);

  useEffect(() => {
    if (!bikeId) return;
    getGarageBike(bikeId)
      .then((bike) => {
        if (bike) {
          setName(bike.name);
          setMaker(bike.maker);
          setModel(bike.model);
          setYear(bike.year ? String(bike.year) : '');
          setOdometer(String(bike.odometer));
          setShakenDate(bike.shakenDate);
          setJibaisekiDate(bike.jibaisekiDate);
          setInsuranceDate(bike.insuranceDate);
          setOilChangeDate(bike.oilChangeDate);
          setOilChangeOdometer(bike.oilChangeOdometer != null ? formatKm(bike.oilChangeOdometer) : '');
        }
      })
      .catch(() => Alert.alert('エラー', '車両情報の読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [bikeId]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('入力エラー', '呼び名を入力してください'); return; }
    if (!maker.trim()) { Alert.alert('入力エラー', 'メーカーを入力してください'); return; }
    if (!model.trim()) { Alert.alert('入力エラー', '車種名を入力してください'); return; }
    const odo = parseInt(odometer.replace(/[^\d]/g, ''), 10);
    if (isNaN(odo) || odo < 0) { Alert.alert('入力エラー', '走行距離を数値で入力してください'); return; }
    const yearNum = year.trim() ? parseInt(year.trim(), 10) : null;
    if (yearNum !== null && (isNaN(yearNum) || yearNum < 1950 || yearNum > 2100)) {
      Alert.alert('入力エラー', '年式は西暦4桁で入力してください（例: 2020）');
      return;
    }

    setSaving(true);
    try {
      const oilOdo = oilChangeOdometer.trim()
        ? parseInt(oilChangeOdometer.replace(/[^\d]/g, ''), 10)
        : null;
      const input = {
        name: name.trim(),
        maker: maker.trim(),
        model: model.trim(),
        year: yearNum,
        odometer: odo,
        shakenDate,
        jibaisekiDate,
        insuranceDate,
        oilChangeDate,
        oilChangeOdometer: oilOdo != null && !isNaN(oilOdo) ? oilOdo : null,
      };
      if (isEdit) {
        await updateGarageBike(bikeId!, input);
      } else {
        await addGarageBike(input);
      }
      rescheduleAllReminders().catch(() => {}); // 期日通知を再登録
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('保存に失敗しました', e?.message ?? '通信環境をご確認のうえ再度お試しください');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      '車両を削除',
      `「${name}」を削除しますか？\n\n⚠️ この車両のチェックリスト履歴もすべて削除されます。この操作は取り消せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteGarageBike(bikeId!);
              rescheduleAllReminders().catch(() => {});
              navigation.navigate('HomeTabs');
            } catch (e: any) {
              Alert.alert('削除に失敗しました', e?.message ?? '再度お試しください');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const pickerValue = (() => {
    const iso =
      showPicker === 'shaken' ? shakenDate :
      showPicker === 'jibaiseki' ? jibaisekiDate :
      showPicker === 'insurance' ? insuranceDate : oilChangeDate;
    return iso ? new Date(iso) : new Date();
  })();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>呼び名 <Text style={styles.required}>必須</Text></Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={name}
              onChangeText={setName}
              placeholder="例: CB750、通勤カブ"
              placeholderTextColor={colors.textMuted}
              maxLength={30}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>メーカー <Text style={styles.required}>必須</Text></Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={maker}
              onChangeText={setMaker}
              placeholder="例: ホンダ"
              placeholderTextColor={colors.textMuted}
              maxLength={30}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>車種名 <Text style={styles.required}>必須</Text></Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={model}
              onChangeText={setModel}
              placeholder="例: CB750 Four"
              placeholderTextColor={colors.textMuted}
              maxLength={50}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>年式（任意）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={year}
              onChangeText={setYear}
              placeholder="例: 2020"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={4}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>現在の走行距離（km） <Text style={styles.required}>必須</Text></Text>
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

          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📅 期日管理（任意）</Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>車検満了日</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>※ 250cc以下のバイクは車検不要です</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: colors.border }]}
                onPress={() => setShowPicker('shaken')}
              >
                <Text style={[styles.dateBtnText, { color: shakenDate ? colors.textPrimary : colors.textMuted }]}>
                  {formatDateJa(shakenDate)}
                </Text>
              </TouchableOpacity>
              {shakenDate && (
                <TouchableOpacity style={styles.dateClearBtn} onPress={() => setShakenDate(null)}>
                  <Text style={styles.dateClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>自賠責満了日</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: colors.border }]}
                onPress={() => setShowPicker('jibaiseki')}
              >
                <Text style={[styles.dateBtnText, { color: jibaisekiDate ? colors.textPrimary : colors.textMuted }]}>
                  {formatDateJa(jibaisekiDate)}
                </Text>
              </TouchableOpacity>
              {jibaisekiDate && (
                <TouchableOpacity style={styles.dateClearBtn} onPress={() => setJibaisekiDate(null)}>
                  <Text style={styles.dateClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>任意保険満了日</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: colors.border }]}
                onPress={() => setShowPicker('insurance')}
              >
                <Text style={[styles.dateBtnText, { color: insuranceDate ? colors.textPrimary : colors.textMuted }]}>
                  {formatDateJa(insuranceDate)}
                </Text>
              </TouchableOpacity>
              {insuranceDate && (
                <TouchableOpacity style={styles.dateClearBtn} onPress={() => setInsuranceDate(null)}>
                  <Text style={styles.dateClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.hint, { color: colors.textMuted, marginTop: SPACING.sm }]}>
              期日を入力すると、満了の30日前・7日前・当日に通知でお知らせします
            </Text>
          </View>

          {/* オイル交換記録 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🛢️ オイル交換記録（任意）</Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>前回のオイル交換日</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.dateBtn, { borderColor: colors.border }]}
                onPress={() => setShowPicker('oil')}
              >
                <Text style={[styles.dateBtnText, { color: oilChangeDate ? colors.textPrimary : colors.textMuted }]}>
                  {formatDateJa(oilChangeDate)}
                </Text>
              </TouchableOpacity>
              {oilChangeDate && (
                <TouchableOpacity style={styles.dateClearBtn} onPress={() => setOilChangeDate(null)}>
                  <Text style={styles.dateClearText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>交換時の走行距離（km）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={oilChangeOdometer}
              onChangeText={(t) => {
                const digits = t.replace(/[^\d]/g, '');
                setOilChangeOdometer(digits ? formatKm(parseInt(digits, 10)) : '');
              }}
              placeholder="例: 12,000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={9}
            />
            <Text style={[styles.hint, { color: colors.textMuted, marginTop: SPACING.sm }]}>
              記録すると車両詳細に「交換から◯km走行」が表示されます
            </Text>
          </View>

          {showPicker && (
            <DateTimePicker
              value={pickerValue}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, date) => {
                setShowPicker(null);
                if (event.type === 'set' && date) {
                  const iso = date.toISOString();
                  if (showPicker === 'shaken') setShakenDate(iso);
                  else if (showPicker === 'jibaiseki') setJibaisekiDate(iso);
                  else if (showPicker === 'insurance') setInsuranceDate(iso);
                  else setOilChangeDate(iso);
                }
              }}
            />
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中...' : isEdit ? '変更を保存' : '登録する'}</Text>
          </TouchableOpacity>

          {isEdit && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Text style={styles.deleteBtnText}>🗑️ この車両を削除</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  required: {
    fontSize: FONT_SIZE.xs,
    color: '#DC2626',
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    marginBottom: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  dateBtnText: {
    fontSize: FONT_SIZE.md,
  },
  dateClearBtn: {
    marginLeft: SPACING.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateClearText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
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
  deleteBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.md,
  },
  deleteBtnText: {
    color: '#DC2626',
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
  },
});
