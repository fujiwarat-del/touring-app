import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import type { User } from 'firebase/auth';
import { BIKE_TYPES } from '@touring/shared';
import type { BikeType } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { auth, ensureAnonymousAuth, onAuthChanged } from '../services/firebase';

export default function ProfileScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [bikeType, setBikeType] = useState<BikeType>('大型');

  useEffect(() => {
    const unsubscribe = onAuthChanged((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

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
          onPress: () => auth?.signOut(),
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
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {user?.displayName?.[0] ?? '?'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.displayName}>
              {user?.displayName ?? '匿名ライダー'}
            </Text>
            <Text style={styles.email}>
              {user?.isAnonymous ? '匿名ユーザー' : user?.email ?? ''}
            </Text>
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
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.lg,
  },
  avatarLargeText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  userInfo: { flex: 1 },
  displayName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
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
});
