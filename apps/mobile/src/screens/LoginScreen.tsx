import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import {
  signInWithGoogle,
  signInWithApple,
  isAppleSignInAvailable,
  runPostSignIn,
} from '../services/auth';

type NavProp = StackNavigationProp<RootStackParamList>;

/** ログインが必要な操作から遷移してきた場合、その旨を伝える */
const REASON_TEXT: Record<string, string> = {
  post: 'ルートを投稿するにはログインが必要です',
  follow: 'フォローするにはログインが必要です',
  group: 'グループに参加するにはログインが必要です',
  plan: 'ツーリング計画に参加するにはログインが必要です',
};

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const reason = REASON_TEXT[route.params?.reason ?? ''];
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => {});
  }, []);

  /** サインイン成功後の共通処理：旧データ引き継ぎ → 画面を閉じる */
  const finishSignIn = async (user: Parameters<typeof runPostSignIn>[0]) => {
    const migrationMessage = await runPostSignIn(user);
    if (migrationMessage) {
      Alert.alert('データを引き継ぎました', migrationMessage, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } else {
      navigation.goBack();
    }
  };

  const handleGoogle = async () => {
    setBusy('google');
    try {
      const user = await signInWithGoogle();
      await finishSignIn(user);
    } catch (e: any) {
      // ユーザーによるキャンセルはエラー表示しない
      const msg = String(e?.message ?? '');
      const cancelled = /cancel|キャンセル|SIGN_IN_CANCELLED/i.test(msg) || e?.code === '-5';
      if (!cancelled) {
        Alert.alert('ログインに失敗しました', msg || '時間をおいて再度お試しください');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleApple = async () => {
    setBusy('apple');
    try {
      const user = await signInWithApple();
      await finishSignIn(user);
    } catch (e: any) {
      const cancelled =
        e?.code === 'ERR_REQUEST_CANCELED' || /cancel|キャンセル/i.test(String(e?.message ?? ''));
      if (!cancelled) {
        Alert.alert('ログインに失敗しました', e?.message ?? '時間をおいて再度お試しください');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.logo}>🏍️</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>ツーリングプランナー</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            ライダー同士でルートを共有し{'\n'}一緒に走る仲間を見つけよう
          </Text>
        </View>

        {reason && (
          <View style={[styles.reasonBox, { backgroundColor: colors.chipBg }]}>
            <Text style={[styles.reasonText, { color: colors.textSecondary }]}>{reason}</Text>
          </View>
        )}

        <View style={styles.buttons}>
          {/* Google */}
          <TouchableOpacity
            style={[styles.googleBtn, { borderColor: colors.border, backgroundColor: colors.cardBg }]}
            onPress={handleGoogle}
            disabled={busy !== null}
            activeOpacity={0.8}
          >
            {busy === 'google' ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <>
                <Text style={styles.googleIcon}>Ｇ</Text>
                <Text style={[styles.googleText, { color: colors.textPrimary }]}>Googleで続ける</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple（iOS のみ） */}
          {appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={RADIUS.md}
              style={styles.appleBtn}
              onPress={handleApple}
            />
          )}
        </View>

        <Text style={[styles.note, { color: colors.textMuted }]}>
          ログインすると、これまでこの端末に保存されていた{'\n'}
          投稿・ガレージ・アルバムのデータが引き継がれます
        </Text>

        <TouchableOpacity style={styles.skipBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>
            あとで（閲覧のみ利用する）
          </Text>
        </TouchableOpacity>

        <Text style={[styles.terms, { color: colors.textMuted }]}>
          ログインすることで、コミュニティガイドラインに同意したものとみなされます
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: SPACING.xl },
  hero: { alignItems: 'center', marginBottom: SPACING.xxxl },
  logo: { fontSize: 72, marginBottom: SPACING.lg },
  title: { fontSize: FONT_SIZE.display, fontWeight: FONT_WEIGHT.bold },
  subtitle: {
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  reasonBox: {
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  reasonText: { fontSize: FONT_SIZE.sm, textAlign: 'center', fontWeight: FONT_WEIGHT.semiBold },
  buttons: { gap: SPACING.md },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    height: 52,
    ...SHADOW.sm,
  },
  googleIcon: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: '#4285F4' },
  googleText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  appleBtn: { height: 52, width: '100%' },
  note: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.xl,
  },
  skipBtn: { alignItems: 'center', paddingVertical: SPACING.lg, marginTop: SPACING.sm },
  skipText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold },
  terms: {
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: SPACING.sm,
  },
});
