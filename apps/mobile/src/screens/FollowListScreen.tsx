import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT } from '../theme/spacing';
import { useTheme } from '../theme/ThemeContext';
import { getFollowList } from '../services/follows';
import type { FollowUser } from '../services/follows';

type RouteProps = RouteProp<RootStackParamList, 'FollowList'>;
type NavProp = StackNavigationProp<RootStackParamList>;

export default function FollowListScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { uid, kind } = route.params;

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getFollowList(uid, kind)
        .then((list) => { if (active) setUsers(list); })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, [uid, kind])
  );

  const emptyText = kind === 'following'
    ? 'まだ誰もフォローしていません'
    : 'まだフォロワーがいません';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{emptyText}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {users.map((u) => (
            <TouchableOpacity
              key={u.uid}
              style={[styles.row, { borderBottomColor: colors.borderLight }]}
              onPress={() =>
                navigation.navigate('UserProfile', { userId: u.uid, displayName: u.displayName })
              }
            >
              {u.photoUrl ? (
                <Image source={{ uri: u.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
                  <Text style={styles.avatarText}>{u.displayName?.[0] ?? '?'}</Text>
                </View>
              )}
              <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
                {u.displayName}
              </Text>
              <Text style={[styles.arrow, { color: colors.textMuted }]}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  emptyIcon: { fontSize: 56, marginBottom: SPACING.md },
  emptyText: { fontSize: FONT_SIZE.md },
  list: { paddingVertical: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  name: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
    marginLeft: SPACING.md,
  },
  arrow: { fontSize: FONT_SIZE.xl },
});
