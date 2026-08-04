import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getLicenseDate, setLicenseDate as saveLicenseDate } from '../services/reminders';
import type { AnonUser } from '../services/firebase';
import { BIKE_TYPES } from '@touring/shared';
import type { BikeType } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme, ACCENT_THEMES } from '../theme/ThemeContext';
import type { ThemeMode, ThemeColorKey } from '../theme/ThemeContext';
import {
  ensureAnonymousAuth, onAuthChanged, signOutUser, updateDisplayName,
  getUserPostStats, syncUserBikesToFirestore,
  updateUserPhotoUrl, getMyPhotoUrl,
} from '../services/firebase';
import { uploadPhotoToCloudinary } from '../services/cloudinaryService';
import { getAllBadgesWithStatus } from '../utils/badges';
import type { UserStats } from '../utils/badges';

// ─── マイバイク ────────────────────────────────────────────────
const MY_BIKES_KEY = '@touring_app_my_bikes';
const MAIN_BIKE_TYPE_KEY = '@touring_app_main_bike_type';

export interface MyBike {
  id: string;
  maker: string;
  model: string;
  year: string;
  bikeType: BikeType;
}

async function loadMyBikes(): Promise<MyBike[]> {
  try {
    const raw = await AsyncStorage.getItem(MY_BIKES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveMyBikes(bikes: MyBike[]): Promise<void> {
  await AsyncStorage.setItem(MY_BIKES_KEY, JSON.stringify(bikes));
}

export default function ProfileScreen() {
  const { colors, mode, colorKey, setMode, setColorKey } = useTheme();

  const [user, setUser] = useState<AnonUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bikeType, setBikeType] = useState<BikeType>('中型以上');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [myStats, setMyStats] = useState<UserStats>({ postCount: 0, totalLikes: 0, hasForestRoad: false });
  const [statsLoading, setStatsLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // バイク関連
  const [myBikes, setMyBikes] = useState<MyBike[]>([]);
  const [addingBike, setAddingBike] = useState(false);
  const [newMaker, setNewMaker] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newBikeType, setNewBikeType] = useState<BikeType>('中型以上');

  // 免許証有効期限
  const [licenseDate, setLicenseDateState] = useState<string | null>(null);
  const [showLicensePicker, setShowLicensePicker] = useState(false);

  useEffect(() => {
    loadMyBikes().then(setMyBikes);
    getMyPhotoUrl().then(setPhotoUrl).catch(() => {});
    getLicenseDate().then(setLicenseDateState).catch(() => {});
    AsyncStorage.getItem(MAIN_BIKE_TYPE_KEY).then((v) => {
      if (v) setBikeType(v as BikeType);
    }).catch(() => {});
  }, []);

  const handleAddBike = useCallback(async () => {
    if (!newMaker.trim() || !newModel.trim()) {
      Alert.alert('入力エラー', 'メーカーとモデル名は必須です');
      return;
    }
    const bike: MyBike = {
      id: Date.now().toString(),
      maker: newMaker.trim(),
      model: newModel.trim(),
      year: newYear.trim(),
      bikeType: newBikeType,
    };
    const updated = [...myBikes, bike];
    setMyBikes(updated);
    await saveMyBikes(updated);
    syncUserBikesToFirestore(updated).catch(() => {});
    setAddingBike(false);
    setNewMaker('');
    setNewModel('');
    setNewYear('');
    setNewBikeType('中型以上');
  }, [myBikes, newMaker, newModel, newYear, newBikeType]);

  const handleDeleteBike = useCallback((id: string) => {
    Alert.alert('バイクを削除', 'このバイクを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          const updated = myBikes.filter((b) => b.id !== id);
          setMyBikes(updated);
          await saveMyBikes(updated);
          syncUserBikesToFirestore(updated).catch(() => {});
        },
      },
    ]);
  }, [myBikes]);

  useEffect(() => {
    const unsubscribe = onAuthChanged((u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        setStatsLoading(true);
        getUserPostStats(u.uid)
          .then(setMyStats)
          .catch(() => {})
          .finally(() => setStatsLoading(false));
      }
    });
    return unsubscribe;
  }, []);

  const handlePickPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('権限が必要です', 'フォトライブラリへのアクセスを許可してください');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;

    setPhotoUploading(true);
    try {
      const url = await uploadPhotoToCloudinary(result.assets[0].uri);
      await updateUserPhotoUrl(url);
      setPhotoUrl(url);
    } catch (e: any) {
      Alert.alert('アップロード失敗', e.message ?? 'しばらく後でお試しください');
    } finally {
      setPhotoUploading(false);
    }
  }, []);

  const handleEditName = () => {
    setNameInput(user?.displayName ?? '');
    setEditingName(true);
  };

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    try {
      await updateDisplayName(nameInput);
      setEditingName(false);
    } catch (err: any) {
      Alert.alert('エラー', err.message);
    }
  };

  const handleSignIn = async () => {
    try {
      await ensureAnonymousAuth();
    } catch (err: any) {
      Alert.alert('ログインエラー', err.message ?? 'ログインに失敗しました');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'サインアウト',
      'サインアウトしますか？保存済みルートはログアウト後にアクセスできなくなります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'サインアウト',
          style: 'destructive',
          onPress: () => signOutUser(),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBg, borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>👤 プロフィール</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: colors.cardBg }]}>
          <TouchableOpacity onPress={handlePickPhoto} style={styles.avatarWrapper} disabled={photoUploading}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarLarge, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarLargeText}>
                  {user?.displayName?.[0] ?? '?'}
                </Text>
              </View>
            )}
            <View style={[styles.cameraOverlay, { backgroundColor: colors.primary, borderColor: colors.cardBg }]}>
              {photoUploading
                ? <ActivityIndicator size="small" color={COLORS.white} />
                : <Text style={styles.cameraIcon}>📷</Text>
              }
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={[styles.nameInput, { borderColor: colors.primary, color: colors.textPrimary, backgroundColor: colors.background }]}
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={20}
                  autoFocus
                  placeholder="ライダー名"
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity style={[styles.nameSaveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveName}>
                  <Text style={styles.nameSaveBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)}>
                  <Text style={{ color: colors.textMuted, marginLeft: SPACING.xs }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={[styles.displayName, { color: colors.textPrimary }]}>
                  {user?.displayName ?? '匿名ライダー'}
                </Text>
                <TouchableOpacity onPress={handleEditName} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>✏️</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={[styles.email, { color: colors.textSecondary }]}>{'匿名ユーザー'}</Text>
            <Text style={[styles.uid, { color: colors.textMuted }]}>
              ID: {user?.uid?.slice(0, 12) ?? 'ログインが必要です'}...
            </Text>
          </View>
        </View>

        {/* Auth actions */}
        {!user ? (
          <TouchableOpacity style={[styles.signInBtn, { backgroundColor: colors.primary }]} onPress={handleSignIn}>
            <Text style={styles.signInBtnText}>🔐 匿名でサインイン</Text>
          </TouchableOpacity>
        ) : user.isAnonymous ? (
          <View style={[styles.infoCard, { backgroundColor: colors.infoLight }]}>
            <Text style={[styles.infoText, { color: colors.info }]}>
              💡 匿名ユーザーとしてご利用中です。ルートの保存やコミュニティ投稿が可能です。
            </Text>
          </View>
        ) : null}

        {/* Badge section */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <View style={styles.badgeSectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🏅 獲得バッジ</Text>
            {statsLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </View>
          <View style={styles.badgeGrid}>
            {getAllBadgesWithStatus(myStats).map((badge) => (
              <View
                key={badge.id}
                style={[
                  styles.badgeCard,
                  { backgroundColor: badge.earned ? badge.bgColor : colors.borderLight },
                  !badge.earned && [styles.badgeCardLocked, { borderColor: colors.border }],
                ]}
              >
                <Text style={[styles.badgeCardIcon, !badge.earned && styles.badgeIconLocked]}>
                  {badge.earned ? badge.icon : '🔒'}
                </Text>
                <Text
                  style={[
                    styles.badgeCardLabel,
                    { color: badge.earned ? badge.textColor : colors.textMuted },
                  ]}
                >
                  {badge.label}
                </Text>
                <Text style={[styles.badgeCardDesc, { color: colors.textMuted }]}>{badge.description}</Text>
              </View>
            ))}
          </View>
          {/* 統計サマリー */}
          <View style={[styles.statsSummary, { backgroundColor: colors.background }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{myStats.postCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>投稿</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{myStats.totalLikes}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>いいね獲得</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {getAllBadgesWithStatus(myStats).filter((b) => b.earned).length}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>バッジ</Text>
            </View>
          </View>
        </View>

        {/* My Bikes */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🏍️ マイバイク</Text>
            {!addingBike && (
              <TouchableOpacity
                style={[styles.addBikeBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
                onPress={() => setAddingBike(true)}
              >
                <Text style={[styles.addBikeBtnText, { color: colors.primary }]}>＋ 追加</Text>
              </TouchableOpacity>
            )}
          </View>

          {myBikes.length === 0 && !addingBike ? (
            <Text style={[styles.noBikesText, { color: colors.textMuted }]}>まだバイクが登録されていません</Text>
          ) : (
            <View style={styles.bikeList}>
              {myBikes.map((bike) => {
                const typeInfo = BIKE_TYPES.find((bt) => bt.value === bike.bikeType);
                return (
                  <View key={bike.id} style={[styles.bikeCard, { backgroundColor: colors.background }]}>
                    <Text style={styles.bikeCardIcon}>{typeInfo?.icon ?? '🏍️'}</Text>
                    <View style={styles.bikeCardInfo}>
                      <Text style={[styles.bikeCardName, { color: colors.textPrimary }]}>
                        {bike.maker} {bike.model}
                      </Text>
                      <View style={styles.bikeCardMeta}>
                        {bike.year ? (
                          <Text style={[styles.bikeCardMetaText, { color: colors.textSecondary }]}>{bike.year}年式</Text>
                        ) : null}
                        <View style={[styles.bikeTypeBadge, { backgroundColor: colors.primaryLight }]}>
                          <Text style={[styles.bikeTypeBadgeText, { color: colors.primary }]}>{bike.bikeType}</Text>
                        </View>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteBike(bike.id)}
                      style={styles.bikeDeleteBtn}
                    >
                      <Text style={styles.bikeDeleteBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {addingBike && (
            <View style={[styles.addBikeForm, { backgroundColor: colors.background, borderColor: colors.primaryLight }]}>
              <Text style={[styles.addBikeFormTitle, { color: colors.textPrimary }]}>バイクを追加</Text>
              <TextInput
                style={[styles.bikeInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.cardBg }]}
                placeholder="メーカー（例: ヤマハ、ホンダ）"
                placeholderTextColor={colors.textMuted}
                value={newMaker}
                onChangeText={setNewMaker}
              />
              <TextInput
                style={[styles.bikeInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.cardBg }]}
                placeholder="モデル名（例: MT-07, CB400SF）"
                placeholderTextColor={colors.textMuted}
                value={newModel}
                onChangeText={setNewModel}
              />
              <TextInput
                style={[styles.bikeInput, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.cardBg }]}
                placeholder="年式（例: 2022）"
                placeholderTextColor={colors.textMuted}
                value={newYear}
                onChangeText={setNewYear}
                keyboardType="numeric"
                maxLength={4}
              />
              <Text style={[styles.bikeTypeLabel, { color: colors.textSecondary }]}>タイプ</Text>
              <View style={styles.bikeTypeChips}>
                {BIKE_TYPES.map((bt) => (
                  <TouchableOpacity
                    key={bt.value}
                    style={[
                      styles.bikeTypeChip,
                      { borderColor: colors.border, backgroundColor: colors.cardBg },
                      newBikeType === bt.value && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                    ]}
                    onPress={() => setNewBikeType(bt.value)}
                  >
                    <Text style={styles.bikeTypeChipIcon}>{bt.icon}</Text>
                    <Text
                      style={[
                        styles.bikeTypeChipLabel,
                        { color: newBikeType === bt.value ? colors.primary : colors.textSecondary },
                      ]}
                    >
                      {bt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addBikeActions}>
                <TouchableOpacity
                  style={[styles.cancelBikeBtn, { borderColor: colors.border }]}
                  onPress={() => {
                    setAddingBike(false);
                    setNewMaker('');
                    setNewModel('');
                    setNewYear('');
                  }}
                >
                  <Text style={[styles.cancelBikeBtnText, { color: colors.textSecondary }]}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBikeBtn, { backgroundColor: colors.primary }]} onPress={handleAddBike}>
                  <Text style={styles.saveBikeBtnText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Bike preference */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🏍️ メインバイク設定</Text>
          <View style={styles.bikeGrid}>
            {BIKE_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt.value}
                style={[
                  styles.bikeChip,
                  { backgroundColor: colors.background, borderColor: colors.borderLight },
                  bikeType === bt.value && { backgroundColor: colors.primary, borderColor: colors.primaryDark },
                ]}
                onPress={() => {
                  setBikeType(bt.value);
                  AsyncStorage.setItem(MAIN_BIKE_TYPE_KEY, bt.value).catch(() => {});
                }}
              >
                <Text style={styles.bikeIcon}>{bt.icon}</Text>
                <Text
                  style={[
                    styles.bikeLabel,
                    { color: bikeType === bt.value ? COLORS.white : colors.textPrimary },
                  ]}
                >
                  {bt.label}
                </Text>
                <Text
                  style={[
                    styles.bikeSub,
                    { color: bikeType === bt.value ? 'rgba(255,255,255,0.8)' : colors.textLight },
                  ]}
                >
                  {bt.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 外観設定 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🎨 外観設定</Text>

          {/* カラーモード */}
          <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>カラーモード</Text>
          <View style={styles.modeRow}>
            {([
              { value: 'auto',  label: '自動',  icon: '🌓' },
              { value: 'light', label: 'ライト', icon: '☀️' },
              { value: 'dark',  label: 'ダーク', icon: '🌙' },
            ] as { value: ThemeMode; label: string; icon: string }[]).map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[
                  styles.modeBtn,
                  { borderColor: colors.border, backgroundColor: colors.background },
                  mode === m.value && { borderColor: colors.primary, backgroundColor: colors.primaryLight },
                ]}
                onPress={() => setMode(m.value)}
              >
                <Text style={styles.modeBtnIcon}>{m.icon}</Text>
                <Text style={[
                  styles.modeBtnLabel,
                  { color: mode === m.value ? colors.primary : colors.textSecondary },
                ]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* テーマカラー */}
          <Text style={[styles.settingLabel, { color: colors.textSecondary, marginTop: SPACING.lg }]}>テーマカラー</Text>
          <View style={styles.colorRow}>
            {(Object.entries(ACCENT_THEMES) as [ThemeColorKey, typeof ACCENT_THEMES[ThemeColorKey]][]).map(([key, theme]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.colorCircle,
                  { backgroundColor: theme.primary },
                  colorKey === key && { borderWidth: 3, borderColor: colors.cardBg, ...SHADOW.sm },
                ]}
                onPress={() => setColorKey(key)}
                activeOpacity={0.8}
              >
                {colorKey === key && <Text style={styles.colorCircleCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.currentThemeLabel, { color: colors.textMuted }]}>
            {ACCENT_THEMES[colorKey].emoji} {ACCENT_THEMES[colorKey].label}
          </Text>
        </View>

        {/* 免許証有効期限 */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🪪 免許証の有効期限</Text>
          <Text style={[styles.licenseHint, { color: colors.textMuted }]}>
            登録すると満了の30日前・7日前・当日に通知でお知らせします
          </Text>
          <View style={styles.licenseRow}>
            <TouchableOpacity
              style={[styles.licenseDateBtn, { borderColor: colors.border }]}
              onPress={() => setShowLicensePicker(true)}
            >
              <Text style={[styles.licenseDateText, { color: licenseDate ? colors.textPrimary : colors.textMuted }]}>
                {licenseDate
                  ? (() => { const d = new Date(licenseDate); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; })()
                  : '未設定（タップして選択）'}
              </Text>
            </TouchableOpacity>
            {licenseDate && (
              <TouchableOpacity
                style={styles.licenseClearBtn}
                onPress={() => {
                  setLicenseDateState(null);
                  saveLicenseDate(null).catch(() => {});
                }}
              >
                <Text style={styles.licenseClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {licenseDate && (() => {
            const daysLeft = Math.ceil((new Date(licenseDate).getTime() - Date.now()) / 86400000);
            if (daysLeft < 0) return <Text style={styles.licenseWarnExpired}>⚠️ 免許証の有効期限が切れています</Text>;
            if (daysLeft <= 60) return <Text style={styles.licenseWarnSoon}>⏰ 有効期限まであと{daysLeft}日です</Text>;
            return null;
          })()}
          {showLicensePicker && (
            <DateTimePicker
              value={licenseDate ? new Date(licenseDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(event, d) => {
                setShowLicensePicker(false);
                if (event.type === 'set' && d) {
                  const iso = d.toISOString();
                  setLicenseDateState(iso);
                  saveLicenseDate(iso).catch(() => {});
                }
              }}
            />
          )}
        </View>

        {/* App info */}
        <View style={[styles.section, { backgroundColor: colors.cardBg }]}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>ℹ️ アプリ情報</Text>
          <View style={styles.infoRows}>
            {[
              { label: 'アプリ名', value: 'ツーリングプランナー' },
              { label: 'バージョン', value: '1.0.0' },
              { label: 'AI', value: 'Claude claude-sonnet-4-6' },
              { label: '天気API', value: 'Open-Meteo (無料)' },
              { label: '地図', value: 'Google Maps' },
            ].map((item) => (
              <View key={item.label} style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sign out */}
        {user && (
          <TouchableOpacity style={[styles.signOutBtn, { borderColor: COLORS.danger }]} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>サインアウト</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: SPACING.md },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    margin: SPACING.lg,
    ...SHADOW.sm,
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    marginRight: SPACING.lg,
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: { fontSize: 10 },
  userInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  displayName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  editBtn: { padding: 2 },
  editBtnText: { fontSize: FONT_SIZE.md },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    fontSize: FONT_SIZE.md,
  },
  nameSaveBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
  },
  nameSaveBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  email: {
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  uid: {
    fontSize: FONT_SIZE.xs,
    marginTop: 4,
  },
  signInBtn: {
    marginHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  signInBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  infoCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
  },
  section: {
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.md,
  },
  bikeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  bikeChip: {
    width: '47%',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    alignItems: 'center',
  },
  bikeIcon: { fontSize: 24, marginBottom: 4 },
  bikeLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  bikeSub: {
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  infoRows: { gap: SPACING.sm },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: FONT_SIZE.sm,
  },
  infoValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  signOutBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderWidth: 2,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  signOutBtnText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  addBikeBtn: {
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  addBikeBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  noBikesText: {
    fontSize: FONT_SIZE.sm,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  bikeList: { gap: SPACING.sm },
  bikeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bikeCardIcon: { fontSize: 24 },
  bikeCardInfo: { flex: 1 },
  bikeCardName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  bikeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 3,
  },
  bikeCardMetaText: {
    fontSize: FONT_SIZE.xs,
  },
  bikeTypeBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bikeTypeBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  bikeDeleteBtn: { padding: SPACING.xs },
  bikeDeleteBtnText: { fontSize: FONT_SIZE.md },
  addBikeForm: {
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1.5,
  },
  addBikeFormTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: 4,
  },
  bikeInput: {
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
  },
  bikeTypeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  bikeTypeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  bikeTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
  },
  bikeTypeChipIcon: { fontSize: FONT_SIZE.md },
  bikeTypeChipLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  addBikeActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  cancelBikeBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelBikeBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  saveBikeBtn: {
    flex: 2,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveBikeBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  badgeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  badgeCard: {
    width: '30.5%',
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    alignItems: 'center',
    gap: 3,
  },
  badgeCardLocked: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  badgeCardIcon: { fontSize: 22 },
  badgeIconLocked: { opacity: 0.4 },
  badgeCardLabel: {
    fontSize: 10,
    fontWeight: FONT_WEIGHT.bold,
    textAlign: 'center',
  },
  badgeCardDesc: {
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 13,
  },
  statsSummary: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    marginVertical: SPACING.xs,
  },
  // ─── 免許証有効期限 ──────────────────────────────────────────
  licenseHint: {
    fontSize: FONT_SIZE.xs,
    marginBottom: SPACING.sm,
  },
  licenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  licenseDateBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  licenseDateText: {
    fontSize: FONT_SIZE.md,
  },
  licenseClearBtn: {
    marginLeft: SPACING.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  licenseClearText: {
    fontSize: FONT_SIZE.md,
    color: '#666',
  },
  licenseWarnSoon: {
    fontSize: FONT_SIZE.sm,
    color: '#92600A',
    fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING.sm,
  },
  licenseWarnExpired: {
    fontSize: FONT_SIZE.sm,
    color: '#DC2626',
    fontWeight: FONT_WEIGHT.bold,
    marginTop: SPACING.sm,
  },
  // ─── 外観設定 ────────────────────────────────────────────────
  settingLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    marginBottom: SPACING.sm,
  },
  modeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
  },
  modeBtnIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  modeBtnLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  colorRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    flexWrap: 'wrap',
    paddingVertical: SPACING.xs,
  },
  colorCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircleCheck: {
    color: COLORS.white,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  currentThemeLabel: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
});
