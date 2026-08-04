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
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { PREFECTURES_BY_AREA } from '@touring/shared';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  getTour,
  addTour,
  updateTour,
  updateTourPhotos,
  uploadTourPhoto,
  MAX_TOUR_PHOTOS,
  TOUR_WEATHER_OPTIONS,
} from '../services/tours';
import type { TourPhoto } from '../services/tours';
import { getGarageBikes, formatKm } from '../services/garage';
import type { GarageBike } from '../services/garage';

type RouteProps = RouteProp<RootStackParamList, 'TourForm'>;
type NavProp = StackNavigationProp<RootStackParamList>;

const RECENT_PREFS_KEY = '@touring_app_recent_prefs';
const ALL_PREFECTURES: string[] = Object.values(PREFECTURES_BY_AREA).flat();

/** フォーム内の写真状態（既存アップロード済み or ローカル未アップロード） */
interface PhotoDraft {
  localUri?: string;        // 新規追加分
  uploaded?: TourPhoto;     // アップロード済み
  status: 'done' | 'pending' | 'uploading' | 'error';
}

function formatDateJa(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function TourFormScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const tourId = route.params?.tourId;
  const prefill = route.params?.prefill;
  const isEdit = !!tourId;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [date, setDate] = useState(new Date().toISOString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [bikeId, setBikeId] = useState<string | null>(null);
  const [bikes, setBikes] = useState<GarageBike[]>([]);
  const [distance, setDistance] = useState(prefill?.distanceKm ? formatKm(prefill.distanceKm) : '');
  const [origin, setOrigin] = useState(prefill?.origin ?? '');
  const [waypoints, setWaypoints] = useState((prefill?.waypoints ?? []).join('、'));
  const [destination, setDestination] = useState(prefill?.destination ?? '');
  const [prefectures, setPrefectures] = useState<string[]>([]);
  const [recentPrefs, setRecentPrefs] = useState<string[]>([]);
  const [weather, setWeather] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [savedTourId, setSavedTourId] = useState<string | null>(tourId ?? null);

  useEffect(() => {
    getGarageBikes().then(setBikes).catch(() => {});
    AsyncStorage.getItem(RECENT_PREFS_KEY).then((raw) => {
      if (raw) setRecentPrefs(JSON.parse(raw));
    }).catch(() => {});

    if (!tourId) return;
    getTour(tourId)
      .then((t) => {
        if (!t) return;
        setTitle(t.title);
        setDate(t.date);
        setBikeId(t.bikeId);
        setDistance(t.distanceKm ? formatKm(t.distanceKm) : '');
        setOrigin(t.route?.origin ?? '');
        setWaypoints((t.route?.waypoints ?? []).join('、'));
        setDestination(t.route?.destination ?? '');
        setPrefectures(t.prefectures);
        setWeather(t.weather);
        setMemo(t.memo ?? '');
        setPhotos(t.photos.map((p) => ({ uploaded: p, status: 'done' as const })));
        setCoverIndex(t.coverPhotoIndex);
      })
      .catch(() => Alert.alert('エラー', '読み込みに失敗しました'))
      .finally(() => setLoading(false));
  }, [tourId]);

  // ─── 写真操作 ───────────────────────────────────────────

  const pickPhotos = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', 'フォトライブラリへのアクセスを許可してください');
      return;
    }
    const remain = MAX_TOUR_PHOTOS - photos.length;
    if (remain <= 0) {
      Alert.alert('上限に達しました', `写真は1ツーリングあたり最大${MAX_TOUR_PHOTOS}枚です`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
      selectionLimit: remain,
    });
    if (!result.canceled) {
      const added: PhotoDraft[] = result.assets
        .slice(0, remain)
        .map((a) => ({ localUri: a.uri, status: 'pending' as const }));
      setPhotos((prev) => [...prev, ...added]);
    }
  };

  const removePhoto = (index: number) => {
    const target = photos[index];
    if (target.uploaded) {
      setRemovedPaths((prev) => [...prev, target.uploaded!.storagePath]);
    }
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setCoverIndex((prev) => (index === prev ? 0 : index < prev ? prev - 1 : prev));
  };

  const movePhoto = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= photos.length) return;
    setPhotos((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
    setCoverIndex((prev) => (prev === index ? next : prev === next ? index : prev));
  };

  // ─── 保存 ───────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('入力エラー', 'タイトルを入力してください'); return; }
    const distNum = parseInt(distance.replace(/[^\d]/g, ''), 10);
    if (isNaN(distNum) || distNum <= 0) { Alert.alert('入力エラー', '走行距離を入力してください'); return; }

    setSaving(true);
    try {
      const routeData = (origin.trim() || destination.trim())
        ? {
            origin: origin.trim(),
            waypoints: waypoints.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
            destination: destination.trim(),
          }
        : null;

      const input = {
        title: title.trim(),
        date,
        bikeId,
        distanceKm: distNum,
        route: routeData,
        prefectures,
        memo: memo.trim() || null,
        weather,
        coverPhotoIndex: coverIndex,
      };

      // 1) ツアー本体を先に保存して tourId を確定
      let id = savedTourId;
      if (id) {
        await updateTour(id, input);
      } else {
        id = await addTour(input);
        setSavedTourId(id);
      }

      // 2) 未アップロードの写真を順次アップロード（失敗分は error として残す）
      const drafts = [...photos];
      const pendingIdx = drafts
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.status === 'pending' || p.status === 'error');

      let failed = 0;
      for (let n = 0; n < pendingIdx.length; n++) {
        const { p, i } = pendingIdx[n];
        setUploadProgress(`写真をアップロード中... ${n + 1} / ${pendingIdx.length}`);
        drafts[i] = { ...p, status: 'uploading' };
        setPhotos([...drafts]);
        try {
          const uploaded = await uploadTourPhoto(id, p.localUri!, i);
          drafts[i] = { uploaded, status: 'done' };
        } catch {
          drafts[i] = { ...p, status: 'error' };
          failed++;
        }
        setPhotos([...drafts]);
      }
      setUploadProgress(null);

      // 3) 削除された既存写真を Storage から削除（ベストエフォート）
      if (removedPaths.length > 0) {
        const { getStorage, ref, deleteObject } = await import('firebase/storage');
        const { getFirebaseApp } = await import('../services/firebase');
        const app = getFirebaseApp();
        if (app) {
          const storage = getStorage(app);
          await Promise.all(removedPaths.map((p) => deleteObject(ref(storage, p)).catch(() => {})));
        }
        setRemovedPaths([]);
      }

      // 4) 成功した写真のみを URL 反映
      const finalPhotos: TourPhoto[] = drafts
        .filter((p) => p.status === 'done' && p.uploaded)
        .map((p, order) => ({ ...p.uploaded!, order }));
      const safeCover = Math.min(coverIndex, Math.max(0, finalPhotos.length - 1));
      await updateTourPhotos(id, finalPhotos, safeCover);

      // 直近選択の都道府県を保存（次回の並び順用）
      if (prefectures.length > 0) {
        const merged = [...prefectures, ...recentPrefs.filter((p) => !prefectures.includes(p))].slice(0, 10);
        AsyncStorage.setItem(RECENT_PREFS_KEY, JSON.stringify(merged)).catch(() => {});
      }

      if (failed > 0) {
        Alert.alert(
          '一部の写真をアップロードできませんでした',
          `${failed}枚の写真が失敗しました。⚠️マークの写真を確認し、もう一度「保存」を押すと再試行します。`,
        );
      } else {
        navigation.goBack();
      }
    } catch (e: any) {
      Alert.alert('保存に失敗しました', e?.message ?? '通信環境をご確認のうえ再度お試しください');
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  // 直近選択を上位に並べた都道府県リスト
  const orderedPrefs = [...recentPrefs, ...ALL_PREFECTURES.filter((p) => !recentPrefs.includes(p))];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* 基本情報 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>タイトル <Text style={styles.required}>必須</Text></Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="例: 福島・磐梯吾妻スカイライン"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>実施日 <Text style={styles.required}>必須</Text></Text>
            <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border }]} onPress={() => setShowDatePicker(true)}>
              <Text style={[styles.dateBtnText, { color: colors.textPrimary }]}>{formatDateJa(date)}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(date)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, d) => {
                  setShowDatePicker(false);
                  if (event.type === 'set' && d) setDate(d.toISOString());
                }}
              />
            )}

            <Text style={[styles.label, { color: colors.textSecondary }]}>使用バイク（任意）</Text>
            <View style={styles.chipWrap}>
              {bikes.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.chip, { borderColor: colors.border }, bikeId === b.id && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                  onPress={() => setBikeId(bikeId === b.id ? null : b.id)}
                >
                  <Text style={[styles.chipText, { color: bikeId === b.id ? colors.primary : colors.textSecondary }]}>
                    🏍️ {b.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {bikes.length === 0 && (
                <Text style={[styles.hint, { color: colors.textMuted }]}>ガレージに車両を登録すると選択できます</Text>
              )}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>走行距離（km） <Text style={styles.required}>必須</Text></Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={distance}
              onChangeText={(t) => {
                const digits = t.replace(/[^\d]/g, '');
                setDistance(digits ? formatKm(parseInt(digits, 10)) : '');
              }}
              placeholder="例: 250"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={7}
            />
          </View>

          {/* ルート */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🗺️ ルート（任意）</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>出発地</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={origin} onChangeText={setOrigin}
              placeholder="例: 東京" placeholderTextColor={colors.textMuted} maxLength={50}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>立ち寄り先（「、」区切り）</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={waypoints} onChangeText={setWaypoints}
              placeholder="例: 道の駅つちゆ、浄土平" placeholderTextColor={colors.textMuted} maxLength={200}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>目的地</Text>
            <TextInput
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
              value={destination} onChangeText={setDestination}
              placeholder="例: 磐梯吾妻スカイライン" placeholderTextColor={colors.textMuted} maxLength={50}
            />
          </View>

          {/* 都道府県・天気 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🗾 走った都道府県（任意）</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.prefGrid}>
                {orderedPrefs.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.chip, { borderColor: colors.border }, prefectures.includes(p) && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                    onPress={() => setPrefectures((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p])}
                  >
                    <Text style={[styles.chipText, { color: prefectures.includes(p) ? colors.primary : colors.textSecondary }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: SPACING.lg }]}>🌤️ 天気（任意）</Text>
            <View style={styles.chipWrap}>
              {TOUR_WEATHER_OPTIONS.map((w) => (
                <TouchableOpacity
                  key={w}
                  style={[styles.chip, { borderColor: colors.border }, weather === w && { borderColor: colors.primary, backgroundColor: colors.primaryLight }]}
                  onPress={() => setWeather(weather === w ? null : w)}
                >
                  <Text style={[styles.chipText, { color: weather === w ? colors.primary : colors.textSecondary }]}>{w}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* メモ */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📝 メモ（任意）</Text>
            <TextInput
              style={[styles.input, styles.memoInput, { color: colors.textPrimary, borderColor: colors.border }]}
              value={memo} onChangeText={setMemo}
              placeholder="食べたもの、印象に残った景色、感想など"
              placeholderTextColor={colors.textMuted}
              multiline maxLength={1000}
            />
          </View>

          {/* 写真 */}
          <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              📷 写真（{photos.length} / {MAX_TOUR_PHOTOS}枚）
            </Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              1枚目の「⭐カバー」がアルバムの表紙になります。◀▶で並び替えできます。
            </Text>
            {photos.map((p, i) => (
              <View key={`${p.uploaded?.storagePath ?? p.localUri}_${i}`} style={[styles.photoRow, { borderColor: colors.border }]}>
                <Image
                  source={{ uri: p.uploaded?.url ?? p.localUri }}
                  style={styles.photoThumb}
                  resizeMode="cover"
                />
                <View style={styles.photoInfo}>
                  <View style={styles.photoBadgeRow}>
                    {i === coverIndex && (
                      <View style={[styles.coverBadge, { backgroundColor: colors.primaryLight }]}>
                        <Text style={[styles.coverBadgeText, { color: colors.primary }]}>⭐ カバー</Text>
                      </View>
                    )}
                    {p.status === 'uploading' && <ActivityIndicator size="small" color={colors.primary} />}
                    {p.status === 'error' && <Text style={styles.errorText}>⚠️ 失敗（保存で再試行）</Text>}
                    {p.status === 'pending' && <Text style={[styles.pendingText, { color: colors.textMuted }]}>未アップロード</Text>}
                  </View>
                  <View style={styles.photoActions}>
                    <TouchableOpacity style={styles.photoActionBtn} onPress={() => movePhoto(i, -1)}>
                      <Text style={styles.photoActionText}>◀</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoActionBtn} onPress={() => movePhoto(i, 1)}>
                      <Text style={styles.photoActionText}>▶</Text>
                    </TouchableOpacity>
                    {i !== coverIndex && (
                      <TouchableOpacity style={styles.photoActionBtn} onPress={() => setCoverIndex(i)}>
                        <Text style={styles.photoActionText}>⭐</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.photoActionBtn} onPress={() => removePhoto(i)}>
                      <Text style={styles.photoActionText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
            {photos.length < MAX_TOUR_PHOTOS && (
              <TouchableOpacity style={[styles.addPhotoBtn, { borderColor: colors.primary }]} onPress={pickPhotos}>
                <Text style={[styles.addPhotoBtnText, { color: colors.primary }]}>＋ 写真を追加</Text>
              </TouchableOpacity>
            )}
          </View>

          {uploadProgress && (
            <Text style={[styles.progressText, { color: colors.primary }]}>{uploadProgress}</Text>
          )}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中...' : isEdit || savedTourId ? '変更を保存' : '💾 記録を保存'}</Text>
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
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg },
  section: {
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING.xs },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  required: { fontSize: FONT_SIZE.xs, color: '#DC2626' },
  hint: { fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
  },
  memoInput: { minHeight: 80, textAlignVertical: 'top' },
  dateBtn: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  dateBtnText: { fontSize: FONT_SIZE.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  prefGrid: {
    flexDirection: 'column',
    flexWrap: 'wrap',
    height: 132,
    gap: SPACING.xs,
    alignContent: 'flex-start',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 7,
  },
  chipText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold },
  photoRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  photoThumb: { width: 72, height: 72, borderRadius: RADIUS.sm },
  photoInfo: { flex: 1, marginLeft: SPACING.md },
  photoBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 24 },
  coverBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2 },
  coverBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold },
  errorText: { fontSize: FONT_SIZE.xs, color: '#DC2626', fontWeight: FONT_WEIGHT.bold },
  pendingText: { fontSize: FONT_SIZE.xs },
  photoActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  photoActionBtn: {
    width: 40, height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoActionText: { fontSize: FONT_SIZE.md },
  addPhotoBtn: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  addPhotoBtnText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  progressText: {
    textAlign: 'center',
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.sm,
  },
  saveBtn: {
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
});
