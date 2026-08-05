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
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { createGroup, updateGroup, getGroup } from '../services/groups';
import { RIDING_AREAS } from '../services/riderProfile';

type RouteProps = RouteProp<RootStackParamList, 'GroupForm'>;
type NavProp = StackNavigationProp<RootStackParamList>;

export default function GroupFormScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const groupId = route.params?.groupId;
  const isEdit = !!groupId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState<string | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    getGroup(groupId)
      .then((g) => {
        if (!g) return;
        setName(g.name);
        setDescription(g.description);
        setArea(g.area);
        setRequiresApproval(g.requiresApproval);
      })
      .catch(() => Alert.alert('エラー', 'グループ情報の読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [groupId]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('入力エラー', 'グループ名を入力してください');
      return;
    }
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        area,
        requiresApproval,
      };
      if (isEdit) {
        await updateGroup(groupId!, input);
        navigation.goBack();
      } else {
        const id = await createGroup(input);
        navigation.replace('GroupDetail', { groupId: id });
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
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              グループ名 <Text style={styles.required}>必須</Text>
            </Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={name}
              onChangeText={setName}
              placeholder="例: 関東ワインディング部"
              placeholderTextColor={colors.textMuted}
              maxLength={40}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>説明</Text>
            <TextInput
              style={[styles.input, styles.textarea, { color: colors.textPrimary, borderColor: colors.border }]}
              value={description}
              onChangeText={setDescription}
              placeholder="どんな走り方をするグループか、参加条件などを書きましょう"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>主な活動エリア</Text>
            <View style={styles.chipWrap}>
              {RIDING_AREAS.map((a) => {
                const selected = area === a;
                return (
                  <TouchableOpacity
                    key={a}
                    style={[
                      styles.chip,
                      { borderColor: colors.border },
                      selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => setArea(selected ? null : a)}
                  >
                    <Text style={[styles.chipText, { color: selected ? colors.primary : colors.textSecondary }]}>
                      {a}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 参加方法 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🔑 参加方法</Text>
            {([
              { value: false, label: '誰でも参加できる', desc: 'ボタンを押すだけで参加できます' },
              { value: true, label: '承認制', desc: '主催者が申請を確認してから参加が確定します' },
            ]).map((opt) => {
              const selected = requiresApproval === opt.value;
              return (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[
                    styles.radioRow,
                    { borderColor: colors.border },
                    selected && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => setRequiresApproval(opt.value)}
                >
                  <Text style={[styles.radioMark, { color: selected ? colors.primary : colors.textMuted }]}>
                    {selected ? '●' : '○'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.radioLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                    <Text style={[styles.radioDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.approvalHint, { color: colors.textMuted }]}>
              承認制にすると、申請者のバイク種別とツーリング歴が自動で表示されます
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>
              {saving ? '保存中...' : isEdit ? '変更を保存' : 'グループを作成'}
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
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.md },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  required: { fontSize: FONT_SIZE.xs, color: '#DC2626' },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  chip: {
    borderWidth: 1.5,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
  },
  chipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  radioMark: { fontSize: FONT_SIZE.lg },
  radioLabel: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  radioDesc: { fontSize: FONT_SIZE.xs, marginTop: 1 },
  approvalHint: { fontSize: FONT_SIZE.xs, marginTop: SPACING.xs },
  saveBtn: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
});
