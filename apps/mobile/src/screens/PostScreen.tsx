import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  SafeAreaView,
  Alert,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { uploadPhotos } from '../services/cloudinaryService';
import { postCommunityRoute } from '../services/firebase';
import { PREFECTURES_BY_AREA } from '@touring/shared';

const MAX_PHOTOS = 5;

const DEPARTURE_AREAS = [
  '北海道', '東北', '関東', '中部', '近畿', '中国', '四国', '九州・沖縄',
];

const PRESET_TAGS = [
  'ワインディング', '絶景', '温泉', '海沿い', 'グルメ', '道の駅', '峠', '高速ツーリング',
];

export default function PostScreen() {
  const navigation = useNavigation();

  const [routeName, setRouteName] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [comment, setComment] = useState('');
  const [departureArea, setDepartureArea] = useState('');
  const [selectedPrefectures, setSelectedPrefectures] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  const pickPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', 'フォトライブラリへのアクセスを許可してください');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: MAX_PHOTOS - photos.length,
    });

    if (!result.canceled) {
      const uris = result.assets.map((a) => a.uri);
      setPhotos((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
    }
  }, [photos.length]);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', 'カメラへのアクセスを許可してください');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
    });

    if (!result.canceled) {
      setPhotos((prev) => [...prev, result.assets[0].uri].slice(0, MAX_PHOTOS));
    }
  }, []);

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const togglePrefecture = (pref: string) => {
    setSelectedPrefectures((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  const handleAreaSelect = (area: string) => {
    setDepartureArea(area);
    // エリアが変わったら都道府県選択をリセット
    setSelectedPrefectures([]);
  };

  const handlePost = useCallback(async () => {
    if (!routeName.trim()) {
      Alert.alert('ルート名を入力してください');
      return;
    }
    if (!mapUrl.trim()) {
      Alert.alert('Google Maps の共有URLを貼り付けてください');
      return;
    }
    if (!departureArea) {
      Alert.alert('出発エリアを選択してください');
      return;
    }

    setPosting(true);
    try {
      // Upload photos to Cloudinary
      let uploadedUrls: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        uploadedUrls = await uploadPhotos(photos);
        setUploading(false);
      }

      // Build a minimal Route object with the map URL
      const routeData = {
        name: routeName.trim(),
        mapUrl: mapUrl.trim(),
        congestion: '-',
        distance: '-',
        time: '-',
        difficulty: '-',
        windingScore: 3,
        sceneryScore: 3,
        trafficScore: 3,
        difficultyScore: 3,
        type: selectedTags[0] ?? 'ツーリング',
        description: comment.trim(),
        caution: '',
        waypointObjects: [],
        highlightWaypoints: [],
      };

      await postCommunityRoute(
        routeData as any,
        comment.trim(),
        uploadedUrls,
        selectedTags,
        departureArea,
        selectedPrefectures,
      );

      Alert.alert('投稿完了！', 'ルートをコミュニティに共有しました 🏍️', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('投稿に失敗しました', err.message ?? 'しばらく後でお試しください');
    } finally {
      setPosting(false);
      setUploading(false);
    }
  }, [routeName, mapUrl, comment, departureArea, selectedPrefectures, selectedTags, photos, navigation]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Route Name */}
          <View style={styles.section}>
            <Text style={styles.label}>🏍️ ルート名 *</Text>
            <TextInput
              style={styles.input}
              placeholder="例: 奥多摩ワインディング快走ルート"
              placeholderTextColor={COLORS.textMuted}
              value={routeName}
              onChangeText={setRouteName}
              maxLength={50}
            />
          </View>

          {/* Google Maps URL */}
          <View style={styles.section}>
            <Text style={styles.label}>🗺️ Google Maps 共有URL *</Text>
            <Text style={styles.hint}>
              Google マップでルートを作成 → 共有 → リンクをコピー
            </Text>
            <TextInput
              style={[styles.input, styles.urlInput]}
              placeholder="https://maps.app.goo.gl/..."
              placeholderTextColor={COLORS.textMuted}
              value={mapUrl}
              onChangeText={setMapUrl}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
          </View>

          {/* Comment */}
          <View style={styles.section}>
            <Text style={styles.label}>💬 コメント</Text>
            <TextInput
              style={[styles.input, styles.commentInput]}
              placeholder="ルートの魅力や注意点を書いてください"
              placeholderTextColor={COLORS.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={300}
            />
            <Text style={styles.charCount}>{comment.length}/300</Text>
          </View>

          {/* Departure Area */}
          <View style={styles.section}>
            <Text style={styles.label}>📍 出発エリア *</Text>
            <View style={styles.chipRow}>
              {DEPARTURE_AREAS.map((area) => (
                <TouchableOpacity
                  key={area}
                  style={[styles.chip, departureArea === area && styles.chipSelected]}
                  onPress={() => handleAreaSelect(area)}
                >
                  <Text style={[styles.chipText, departureArea === area && styles.chipTextSelected]}>
                    {area}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 都道府県（エリア選択後に展開） */}
            {departureArea && PREFECTURES_BY_AREA[departureArea] && (
              <View style={styles.prefectureSection}>
                <View style={styles.prefectureLabelRow}>
                  <Text style={styles.prefectureLabel}>🗾 通過する都道府県（複数選択可・任意）</Text>
                </View>
                <View style={styles.chipRow}>
                  {PREFECTURES_BY_AREA[departureArea].map((pref) => (
                    <TouchableOpacity
                      key={pref}
                      style={[styles.chip, styles.prefChip, selectedPrefectures.includes(pref) && styles.prefChipSelected]}
                      onPress={() => togglePrefecture(pref)}
                    >
                      <Text style={[styles.chipText, selectedPrefectures.includes(pref) && styles.prefChipTextSelected]}>
                        {pref}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {selectedPrefectures.length > 0 && (
                  <Text style={styles.prefectureHint}>
                    ✅ {selectedPrefectures.join('・')} を選択中
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Tags */}
          <View style={styles.section}>
            <Text style={styles.label}>🏷️ タグ（複数選択可）</Text>
            <View style={styles.chipRow}>
              {PRESET_TAGS.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[styles.chip, selectedTags.includes(tag) && styles.chipSelected]}
                  onPress={() => toggleTag(tag)}
                >
                  <Text style={[styles.chipText, selectedTags.includes(tag) && styles.chipTextSelected]}>
                    #{tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.label}>📷 写真（最大{MAX_PHOTOS}枚）</Text>
            <View style={styles.photoRow}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri }} style={styles.thumbImage} />
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => removePhoto(i)}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <View style={styles.addPhotoButtons}>
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhotos}>
                    <Text style={styles.addPhotoBtnIcon}>🖼️</Text>
                    <Text style={styles.addPhotoBtnText}>ライブラリ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={takePhoto}>
                    <Text style={styles.addPhotoBtnIcon}>📷</Text>
                    <Text style={styles.addPhotoBtnText}>カメラ</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Post Button */}
          <TouchableOpacity
            style={[styles.postBtn, (posting || uploading) && styles.postBtnDisabled]}
            onPress={handlePost}
            disabled={posting || uploading}
          >
            {posting || uploading ? (
              <View style={styles.postingRow}>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.postBtnText}>
                  {uploading ? '写真をアップロード中...' : '投稿中...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.postBtnText}>🚀 投稿する</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: SPACING.md },
  section: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    ...SHADOW.sm,
  },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  urlInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  commentInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  chipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  chipText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  chipTextSelected: {
    color: COLORS.primary,
  },
  prefectureSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  prefectureLabelRow: {
    marginBottom: SPACING.sm,
  },
  prefectureLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textSecondary,
  },
  prefChip: {
    borderColor: '#1A7A4A30',
    backgroundColor: '#F0FBF5',
  },
  prefChipSelected: {
    borderColor: '#1A7A4A',
    backgroundColor: '#D4F0E4',
  },
  prefChipTextSelected: {
    color: '#1A7A4A',
  },
  prefectureHint: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZE.xs,
    color: '#1A7A4A',
    fontWeight: FONT_WEIGHT.semiBold,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  photoThumb: {
    position: 'relative',
    width: 80,
    height: 80,
  },
  thumbImage: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: COLORS.danger,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: FONT_WEIGHT.bold,
  },
  addPhotoButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  addPhotoBtnIcon: { fontSize: 24 },
  addPhotoBtnText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  postBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xl,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    ...SHADOW.lg,
  },
  postBtnDisabled: {
    backgroundColor: COLORS.textLight,
  },
  postingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  postBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
});
