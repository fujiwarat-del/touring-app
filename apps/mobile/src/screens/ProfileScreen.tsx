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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import type { AnonUser } from '../services/firebase';
import { BIKE_TYPES } from '@touring/shared';
import type { BikeType } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
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
  const [user, setUser] = useState<AnonUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bikeType, setBikeType] = useState<BikeType>('大型');
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
  const [newBikeType, setNewBikeType] = useState<BikeType>('大型');

  useEffect(() => {
    loadMyBikes().then(setMyBikes);
    getMyPhotoUrl().then(setPhotoUrl).catch(() => {});
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
    syncUserBikesToFirestore(updated).catch(() => {}); // Firestore にも同期
    setAddingBike(false);
    setNewMaker('');
    setNewModel('');
    setNewYear('');
    setNewBikeType('大型');
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
          syncUserBikesToFirestore(updated).catch(() => {}); // Firestore にも同期
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
      aspect: [1, 1],   // 正方形クロップ
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
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👤 プロフィール</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* User Card */}
        <View style={styles.userCard}>
          <TouchableOpacity onPress={handlePickPhoto} style={styles.avatarWrapper} disabled={photoUploading}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarLarge}>
                <Text style={styles.avatarLargeText}>
                  {user?.displayName?.[0] ?? '?'}
                </Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
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
                  style={styles.nameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={20}
                  autoFocus
                  placeholder="ライダー名"
                />
                <TouchableOpacity style={styles.nameSaveBtn} onPress={handleSaveName}>
                  <Text style={styles.nameSaveBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingName(false)}>
                  <Text style={{ color: COLORS.textMuted, marginLeft: SPACING.xs }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.displayName}>
                  {user?.displayName ?? '匿名ライダー'}
                </Text>
                <TouchableOpacity onPress={handleEditName} style={styles.editBtn}>
                  <Text style={styles.editBtnText}>✏️</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.email}>{'匿名ユーザー'}</Text>
            <Text style={styles.uid}>
              ID: {user?.uid?.slice(0, 12) ?? 'ログインが必要です'}...
            </Text>
          </View>
        </View>

        {/* Auth actions */}
        {!user ? (
          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn}>
            <Text style={styles.signInBtnText}>🔐 匿名でサインイン</Text>
          </TouchableOpacity>
        ) : user.isAnonymous ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              💡 匿名ユーザーとしてご利用中です。ルートの保存やコミュニティ投稿が可能です。
            </Text>
          </View>
        ) : null}

        {/* Badge section */}
        <View style={styles.section}>
          <View style={styles.badgeSectionHeader}>
            <Text style={styles.sectionTitle}>🏅 獲得バッジ</Text>
            {statsLoading && (
              <ActivityIndicator size="small" color={COLORS.primary} />
            )}
          </View>
          <View style={styles.badgeGrid}>
            {getAllBadgesWithStatus(myStats).map((badge) => (
              <View
                key={badge.id}
                style={[
                  styles.badgeCard,
                  { backgroundColor: badge.earned ? badge.bgColor : '#F5F5F5' },
                  !badge.earned && styles.badgeCardLocked,
                ]}
              >
                <Text style={[styles.badgeCardIcon, !badge.earned && styles.badgeIconLocked]}>
                  {badge.earned ? badge.icon : '🔒'}
                </Text>
                <Text
                  style={[
                    styles.badgeCardLabel,
                    { color: badge.earned ? badge.textColor : COLORS.textMuted },
                  ]}
                >
                  {badge.label}
                </Text>
                <Text style={styles.badgeCardDesc}>{badge.description}</Text>
              </View>
            ))}
          </View>
          {/* 統計サマリー */}
          <View style={styles.statsSummary}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myStats.postCount}</Text>
              <Text style={styles.statLabel}>投稿</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{myStats.totalLikes}</Text>
              <Text style={styles.statLabel}>いいね獲得</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {getAllBadgesWithStatus(myStats).filter((b) => b.earned).length}
              </Text>
              <Text style={styles.statLabel}>バッジ</Text>
            </View>
          </View>
        </View>

        {/* My Bikes */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>🏍️ マイバイク</Text>
            {!addingBike && (
              <TouchableOpacity
                style={styles.addBikeBtn}
                onPress={() => setAddingBike(true)}
              >
                <Text style={styles.addBikeBtnText}>＋ 追加</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* 登録済みバイク一覧 */}
          {myBikes.length === 0 && !addingBike ? (
            <Text style={styles.noBikesText}>まだバイクが登録されていません</Text>
          ) : (
            <View style={styles.bikeList}>
              {myBikes.map((bike) => {
                const typeInfo = BIKE_TYPES.find((bt) => bt.value === bike.bikeType);
                return (
                  <View key={bike.id} style={styles.bikeCard}>
                    <Text style={styles.bikeCardIcon}>{typeInfo?.icon ?? '🏍️'}</Text>
                    <View style={styles.bikeCardInfo}>
                      <Text style={styles.bikeCardName}>
                        {bike.maker} {bike.model}
                      </Text>
                      <View style={styles.bikeCardMeta}>
                        {bike.year ? (
                          <Text style={styles.bikeCardMetaText}>{bike.year}年式</Text>
                        ) : null}
                        <View style={styles.bikeTypeBadge}>
                          <Text style={styles.bikeTypeBadgeText}>{bike.bikeType}</Text>
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

          {/* バイク追加フォーム */}
          {addingBike && (
            <View style={styles.addBikeForm}>
              <Text style={styles.addBikeFormTitle}>バイクを追加</Text>
              <TextInput
                style={styles.bikeInput}
                placeholder="メーカー（例: ヤマハ、ホンダ）"
                placeholderTextColor={COLORS.textMuted}
                value={newMaker}
                onChangeText={setNewMaker}
              />
              <TextInput
                style={styles.bikeInput}
                placeholder="モデル名（例: MT-07, CB400SF）"
                placeholderTextColor={COLORS.textMuted}
                value={newModel}
                onChangeText={setNewModel}
              />
              <TextInput
                style={styles.bikeInput}
                placeholder="年式（例: 2022）"
                placeholderTextColor={COLORS.textMuted}
                value={newYear}
                onChangeText={setNewYear}
                keyboardType="numeric"
                maxLength={4}
              />
              <Text style={styles.bikeTypeLabel}>タイプ</Text>
              <View style={styles.bikeTypeChips}>
                {BIKE_TYPES.map((bt) => (
                  <TouchableOpacity
                    key={bt.value}
                    style={[
                      styles.bikeTypeChip,
                      newBikeType === bt.value && styles.bikeTypeChipSelected,
                    ]}
                    onPress={() => setNewBikeType(bt.value)}
                  >
                    <Text style={styles.bikeTypeChipIcon}>{bt.icon}</Text>
                    <Text
                      style={[
                        styles.bikeTypeChipLabel,
                        newBikeType === bt.value && styles.bikeTypeChipLabelSelected,
                      ]}
                    >
                      {bt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.addBikeActions}>
                <TouchableOpacity
                  style={styles.cancelBikeBtn}
                  onPress={() => {
                    setAddingBike(false);
                    setNewMaker('');
                    setNewModel('');
                    setNewYear('');
                  }}
                >
                  <Text style={styles.cancelBikeBtnText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBikeBtn} onPress={handleAddBike}>
                  <Text style={styles.saveBikeBtnText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Bike preference */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏍️ メインバイク設定</Text>
          <View style={styles.bikeGrid}>
            {BIKE_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt.value}
                style={[
                  styles.bikeChip,
                  bikeType === bt.value && styles.bikeChipSelected,
                ]}
                onPress={() => setBikeType(bt.value)}
              >
                <Text style={styles.bikeIcon}>{bt.icon}</Text>
                <Text
                  style={[
                    styles.bikeLabel,
                    bikeType === bt.value && styles.bikeLabelSelected,
                  ]}
                >
                  {bt.label}
                </Text>
                <Text
                  style={[
                    styles.bikeSub,
                    bikeType === bt.value && styles.bikeSubSelected,
                  ]}
                >
                  {bt.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ アプリ情報</Text>
          <View style={styles.infoRows}>
            {[
              { label: 'アプリ名', value: 'ツーリングプランナー' },
              { label: 'バージョン', value: '1.0.0' },
              { label: 'AI', value: 'Claude claude-sonnet-4-6' },
              { label: '天気API', value: 'Open-Meteo (無料)' },
              { label: '地図', value: 'Google Maps' },
            ].map((item) => (
              <View key={item.label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={styles.infoValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sign out */}
        {user && (
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>サインアウト</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
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
    backgroundColor: COLORS.white,
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
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
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
    color: COLORS.textPrimary,
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
    borderColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },
  nameSaveBtn: {
    backgroundColor: COLORS.primary,
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
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  uid: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  signInBtn: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.primary,
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
    backgroundColor: COLORS.infoLight,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
  },
  section: {
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  bikeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  bikeChip: {
    width: '47%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
  },
  bikeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  bikeIcon: { fontSize: 24, marginBottom: 4 },
  bikeLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textPrimary,
  },
  bikeLabelSelected: { color: COLORS.white },
  bikeSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textLight,
    marginTop: 2,
  },
  bikeSubSelected: { color: 'rgba(255,255,255,0.8)' },
  infoRows: { gap: SPACING.sm },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  infoLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textPrimary,
  },
  signOutBtn: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.danger,
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
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  addBikeBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  noBikesText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  bikeList: { gap: SPACING.sm },
  bikeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  bikeCardIcon: { fontSize: 24 },
  bikeCardInfo: { flex: 1 },
  bikeCardName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  bikeCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 3,
  },
  bikeCardMetaText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  bikeTypeBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bikeTypeBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  bikeDeleteBtn: { padding: SPACING.xs },
  bikeDeleteBtnText: { fontSize: FONT_SIZE.md },
  addBikeForm: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
  },
  addBikeFormTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  bikeInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
  },
  bikeTypeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  bikeTypeChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  bikeTypeChipIcon: { fontSize: FONT_SIZE.md },
  bikeTypeChipLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  bikeTypeChipLabelSelected: { color: COLORS.primary },
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
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelBikeBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  saveBikeBtn: {
    flex: 2,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
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
    borderColor: COLORS.borderLight,
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
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 13,
  },
  statsSummary: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
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
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
});
