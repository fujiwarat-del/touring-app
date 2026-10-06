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
  Image,
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
import { searchPlace, type GeocodeCandidate } from '../services/geocoding';
import MiniMapPreview from '../components/MiniMapPreview';
import * as ImagePicker from 'expo-image-picker';
import { uploadPhotos } from '../services/cloudinaryService';
import { MAX_SPOTS, MAX_SPOT_PHOTOS, type PlanSpot } from '../services/plans';
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
  // 集合場所の座標。到着予定時刻の計算に使う
  const [meetingLat, setMeetingLat] = useState<number | null>(null);
  const [meetingLng, setMeetingLng] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [routeSummary, setRouteSummary] = useState('');
  const [routeMapUrl, setRouteMapUrl] = useState('');
  const [spots, setSpots] = useState<PlanSpot[]>([]);
  const [spotBusy, setSpotBusy] = useState<string | null>(null);
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
        setMeetingLat(p.meetingLat);
        setMeetingLng(p.meetingLng);
        setRouteSummary(p.routeSummary);
        setRouteMapUrl(p.routeMapUrl ?? '');
        setSpots(p.spots);
        setCapacity(p.capacity);
        setVisibility(p.visibility);
        setGroupId(p.groupId);
      })
      .catch(() => Alert.alert('エラー', '計画の読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [planId]);

  const handleSearchPlace = async () => {
    const q = meetingPlace.trim();
    if (!q) { Alert.alert('入力エラー', '集合場所を入力してください'); return; }
    setSearching(true);
    setCandidates([]);
    try {
      const found = await searchPlace(q);
      setSearched(true);
      if (found.length === 1) {
        // 候補が1つなら選ばせる意味がないので確定してしまう
        setMeetingLat(found[0].lat);
        setMeetingLng(found[0].lng);
        setMeetingPlace(found[0].label);
      } else {
        setCandidates(found);
      }
    } catch {
      Alert.alert('検索に失敗しました', '通信状態をご確認ください');
    } finally {
      setSearching(false);
    }
  };

  const patchSpot = (id: string, patch: Partial<PlanSpot>) =>
    setSpots((prev) => prev.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)));

  const addSpot = () => {
    if (spots.length >= MAX_SPOTS) {
      Alert.alert('上限に達しました', `立ち寄りスポットは${MAX_SPOTS}件までです`);
      return;
    }
    setSpots((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}`, name: '', lat: null, lng: null, photoUrls: [], note: '' },
    ]);
  };

  /** スポット名から座標を引く。集合場所と同じ仕組みを使う */
  const searchSpot = async (sp: PlanSpot) => {
    if (!sp.name.trim()) { Alert.alert('入力エラー', 'スポット名を入力してください'); return; }
    setSpotBusy(sp.id);
    try {
      const found = await searchPlace(sp.name);
      if (found.length === 0) {
        Alert.alert('見つかりませんでした', '別の言い方でも試せます。座標が無くても保存はできます');
        return;
      }
      const c = found[0];
      patchSpot(sp.id, { lat: c.lat, lng: c.lng, name: c.label });
      if (found.length > 1) {
        Alert.alert('複数見つかりました', `「${c.label}」を採用しました。違う場合は名前を変えて再検索してください`);
      }
    } catch {
      Alert.alert('検索に失敗しました', '通信状態をご確認ください');
    } finally {
      setSpotBusy(null);
    }
  };

  const pickSpotPhotos = async (sp: PlanSpot) => {
    const remaining = MAX_SPOT_PHOTOS - sp.photoUrls.length;
    if (remaining <= 0) {
      Alert.alert('上限に達しました', `1スポットあたり${MAX_SPOT_PHOTOS}枚までです`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('権限が必要です', 'フォトライブラリへのアクセスを許可してください');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: remaining,
    });
    if (result.canceled) return;

    setSpotBusy(sp.id);
    try {
      // 保存時にまとめて上げるのではなく、選んだ時点で上げる。
      // 保存ボタンの待ち時間が写真の枚数で膨らむのを避けるため
      const urls = await uploadPhotos(result.assets.map((a) => a.uri));
      patchSpot(sp.id, { photoUrls: [...sp.photoUrls, ...urls].slice(0, MAX_SPOT_PHOTOS) });
    } catch {
      Alert.alert('アップロードに失敗しました', '通信状態をご確認ください');
    } finally {
      setSpotBusy(null);
    }
  };

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
        meetingLat,
        meetingLng,
        routeSummary: routeSummary.trim(),
        routeMapUrl: routeMapUrl.trim() || null,
        spots,
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
            <View style={styles.searchRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.searchInput,
                  { color: colors.textPrimary, borderColor: colors.border },
                ]}
                value={meetingPlace}
                onChangeText={(t) => {
                  setMeetingPlace(t);
                  // 文字を変えたら確定済みの座標は無効にする
                  setMeetingLat(null);
                  setMeetingLng(null);
                  setCandidates([]);
                  setSearched(false);
                }}
                placeholder="例: 道の駅果樹公園あしがくぼ"
                placeholderTextColor={colors.textMuted}
                maxLength={80}
                onSubmitEditing={handleSearchPlace}
                returnKeyType="search"
              />
              <TouchableOpacity
                style={[styles.searchBtn, { backgroundColor: colors.primary, opacity: searching ? 0.5 : 1 }]}
                onPress={handleSearchPlace}
                disabled={searching}
              >
                {searching
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.searchBtnText}>検索</Text>}
              </TouchableOpacity>
            </View>

            {/* 確定した地点は必ず地図で見せる。
                同名の別地点を掴んでいても、ラベルだけでは気づけないため */}
            {meetingLat != null && meetingLng != null && (
              <>
                <Text style={[styles.geoOk, { color: colors.primary }]}>
                  ✓ この地点でよろしいですか？（到着予定時刻を計算できます）
                </Text>
                <MiniMapPreview lat={meetingLat} lng={meetingLng} label={meetingPlace} />
                <Text style={[styles.geoCoord, { color: colors.textMuted }]}>
                  緯度経度: {meetingLat.toFixed(5)}, {meetingLng.toFixed(5)}
                </Text>
              </>
            )}

            {candidates.length > 0 && (
              <View style={[styles.candidateBox, { borderColor: colors.border }]}>
                <Text style={[styles.candidateHint, { color: colors.textMuted }]}>
                  {candidates.length}件見つかりました。地図を見ながら選び直せます
                </Text>
                {candidates.map((c, i) => (
                  <TouchableOpacity
                    key={`${c.lat},${c.lng},${i}`}
                    style={[styles.candidateItem, { borderTopColor: colors.borderLight }]}
                    onPress={() => {
                      // 候補は消さない。地図を見て違っていたら選び直せるようにする
                      setMeetingLat(c.lat);
                      setMeetingLng(c.lng);
                      setMeetingPlace(c.label);
                    }}
                  >
                    <Text
                      style={[
                        styles.candidateMain,
                        { color: c.lat === meetingLat && c.lng === meetingLng ? colors.primary : colors.textPrimary },
                      ]}
                    >
                      {c.lat === meetingLat && c.lng === meetingLng ? '✓ ' : ''}{c.label}
                    </Text>
                    {c.sublabel ? (
                      <Text style={[styles.candidateSub, { color: colors.textMuted }]}>{c.sublabel}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {searched && candidates.length === 0 && meetingLat == null && (
              <Text style={[styles.geoWarn, { color: colors.textMuted }]}>
                地点を特定できませんでした。このまま保存できますが、
                到着予定時刻の共有は使えません。別の言い方（最寄りの住所や駅名など）でも試せます。
              </Text>
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>集合場所のマップURL（任意）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={meetingMapUrl} onChangeText={setMeetingMapUrl}
              placeholder="Google Maps の共有リンク"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>
              立ち寄りスポット（任意・{spots.length}/{MAX_SPOTS}）
            </Text>
            <Text style={[styles.spotHelp, { color: colors.textMuted }]}>
              写真を添えておくと、参加者が当日の雰囲気を掴めます。
              場所を検索して地点を確定すると、地図にも表示されます。
            </Text>

            {spots.map((sp, idx) => (
              <View key={sp.id} style={[styles.spotCard, { borderColor: colors.border }]}>
                <View style={styles.spotHeader}>
                  <Text style={[styles.spotNo, { color: colors.primary }]}>{idx + 1}</Text>
                  <TextInput
                    style={[styles.spotName, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={sp.name}
                    onChangeText={(t) => patchSpot(sp.id, { name: t, lat: null, lng: null })}
                    placeholder="例: 白石峠"
                    placeholderTextColor={colors.textMuted}
                    maxLength={40}
                  />
                  <TouchableOpacity
                    style={[styles.spotMiniBtn, { backgroundColor: colors.primary }]}
                    onPress={() => searchSpot(sp)}
                    disabled={spotBusy === sp.id}
                  >
                    <Text style={styles.spotMiniBtnText}>検索</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSpots((prev) => prev.filter((x) => x.id !== sp.id))}>
                    <Text style={[styles.spotDelete, { color: colors.textMuted }]}>✕</Text>
                  </TouchableOpacity>
                </View>

                {sp.lat != null && sp.lng != null && (
                  <MiniMapPreview lat={sp.lat} lng={sp.lng} label={sp.name} height={130} />
                )}

                <TextInput
                  style={[styles.spotNote, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={sp.note}
                  onChangeText={(t) => patchSpot(sp.id, { note: t })}
                  placeholder="メモ（任意）例: ここで昼食、30分休憩"
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                />

                <View style={styles.spotPhotoRow}>
                  {sp.photoUrls.map((url) => (
                    <View key={url}>
                      <Image source={{ uri: url }} style={styles.spotPhoto} />
                      <TouchableOpacity
                        style={styles.spotPhotoDel}
                        onPress={() => patchSpot(sp.id, { photoUrls: sp.photoUrls.filter((u) => u !== url) })}
                      >
                        <Text style={styles.spotPhotoDelText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {sp.photoUrls.length < MAX_SPOT_PHOTOS && (
                    <TouchableOpacity
                      style={[styles.spotPhotoAdd, { borderColor: colors.border }]}
                      onPress={() => pickSpotPhotos(sp)}
                      disabled={spotBusy === sp.id}
                    >
                      {spotBusy === sp.id
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Text style={{ color: colors.textMuted, fontSize: 22 }}>＋</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}

            {spots.length < MAX_SPOTS && (
              <TouchableOpacity
                style={[styles.spotAddBtn, { borderColor: colors.primary }]}
                onPress={addSpot}
              >
                <Text style={{ color: colors.primary, fontWeight: 'bold' }}>＋ スポットを追加</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>ルート概要（任意）</Text>
            <TextInput
              style={[styles.input, styles.textarea, { color: colors.textPrimary, borderColor: colors.border }]}
              value={routeSummary} onChangeText={setRouteSummary}
              placeholder="例: あしがくぼ → 定峰峠 → 白石峠 → 昼食（あじよし） → 解散"
              placeholderTextColor={colors.textMuted}
              multiline maxLength={300}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>ルートのマップURL（任意）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={routeMapUrl} onChangeText={setRouteMapUrl}
              placeholder="Google Maps のルート共有リンク"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="url"
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
  searchRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  searchInput:     { flex: 1 },
  searchBtn:       { paddingHorizontal: 18, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  searchBtnText:   { color: '#fff', fontWeight: 'bold' },
  geoOk:           { fontSize: 12, marginTop: -4, marginBottom: 8 },
  geoCoord:        { fontSize: 10, marginTop: -6, marginBottom: 10 },
  spotHelp:        { fontSize: 11, lineHeight: 17, marginTop: -4, marginBottom: 10 },
  spotCard:        { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  spotHeader:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  spotNo:          { fontSize: 15, fontWeight: 'bold', width: 18 },
  spotName:        { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, height: 40 },
  spotMiniBtn:     { paddingHorizontal: 12, height: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  spotMiniBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  spotDelete:      { fontSize: 18, paddingHorizontal: 4 },
  spotNote:        { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, height: 40, marginBottom: 8 },
  spotPhotoRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  spotPhoto:       { width: 64, height: 64, borderRadius: 6 },
  spotPhotoDel:    { position: 'absolute', top: -4, right: -4, backgroundColor: 'rgba(0,0,0,0.6)', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  spotPhotoDelText:{ color: '#fff', fontSize: 11 },
  spotPhotoAdd:    { width: 64, height: 64, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  spotAddBtn:      { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginBottom: 14 },
  geoWarn:         { fontSize: 12, lineHeight: 18, marginTop: -4, marginBottom: 8 },
  candidateBox:    { borderWidth: 1, borderRadius: 8, marginBottom: 12, overflow: 'hidden' },
  candidateHint:   { fontSize: 11, padding: 10 },
  candidateItem:   { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  candidateMain:   { fontSize: 14, fontWeight: '600' },
  candidateSub:    { fontSize: 11, marginTop: 2 },
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
