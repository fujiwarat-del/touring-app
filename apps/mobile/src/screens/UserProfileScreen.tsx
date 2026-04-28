import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Linking,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { CommunityPost } from '@touring/shared';
import { getRelativeTime } from '@touring/shared';
import { BIKE_TYPES } from '@touring/shared';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import {
  getUserPosts,
  getUserPostStats,
  getUserBikesFromFirestore,
  getUserPhotoUrl,
  ensureAnonymousAuth,
} from '../services/firebase';
import type { BikeRecord } from '../services/firebase';
import { getAllBadgesWithStatus } from '../utils/badges';
import type { UserStats } from '../utils/badges';

type RouteProps = RouteProp<RootStackParamList, 'UserProfile'>;
type NavProp = StackNavigationProp<RootStackParamList>;

export default function UserProfileScreen() {
  useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { userId, displayName } = route.params;

  const [myUid, setMyUid] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>({ postCount: 0, totalLikes: 0, hasForestRoad: false });
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [bikes, setBikes] = useState<BikeRecord[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);

  useEffect(() => {
    ensureAnonymousAuth().then((u) => setMyUid(u.uid)).catch(() => {});
  }, []);

  // stats・バイク・写真は独立してロード
  useEffect(() => {
    setStatsLoading(true);
    getUserPostStats(userId)
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    getUserBikesFromFirestore(userId)
      .then(setBikes)
      .catch(() => {});

    getUserPhotoUrl(userId)
      .then(setPhotoUrl)
      .catch(() => {});
  }, [userId]);

  // 投稿は独立してロード
  useEffect(() => {
    setPostsLoading(true);
    getUserPosts(userId)
      .then(setPosts)
      .catch(() => {})
      .finally(() => setPostsLoading(false));
  }, [userId]);

  const isOwnProfile = myUid === userId;
  const earnedBadges = getAllBadgesWithStatus(stats).filter((b) => b.earned);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User header card */}
        <View style={styles.profileCard}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>
                {displayName?.[0] ?? '?'}
              </Text>
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{displayName}</Text>
            {isOwnProfile && (
              <View style={styles.meBadge}>
                <Text style={styles.meBadgeText}>自分</Text>
              </View>
            )}
          </View>

          {/* Stats */}
          {statsLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.md }} />
          ) : (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.postCount}</Text>
                <Text style={styles.statLabel}>投稿</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.totalLikes}</Text>
                <Text style={styles.statLabel}>いいね獲得</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{earnedBadges.length}</Text>
                <Text style={styles.statLabel}>バッジ</Text>
              </View>
            </View>
          )}
        </View>

        {/* Badges */}
        {earnedBadges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏅 獲得バッジ</Text>
            <View style={styles.badgesWrap}>
              {earnedBadges.map((badge) => (
                <View
                  key={badge.id}
                  style={[styles.badgePill, { backgroundColor: badge.bgColor }]}
                >
                  <Text style={styles.badgePillIcon}>{badge.icon}</Text>
                  <Text style={[styles.badgePillLabel, { color: badge.textColor }]}>
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Bikes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏍️ マイバイク</Text>
          {bikes.length === 0 ? (
            <Text style={styles.emptyText}>バイク情報が登録されていません</Text>
          ) : (
            <View style={styles.bikeList}>
              {bikes.map((bike) => {
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
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Posts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            🗺️ 投稿したルート（{stats.postCount}件）
          </Text>
          {postsLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.lg }} />
          ) : posts.length === 0 ? (
            <Text style={styles.emptyText}>まだ投稿がありません</Text>
          ) : (
            <View style={styles.postList}>
              {posts.map((post) => (
                <UserPostCard key={post.id} post={post} />
              ))}
            </View>
          )}
        </View>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── 投稿カード（読み取り専用） ───────────────────────────────

function UserPostCard({ post }: { post: CommunityPost }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={postStyles.card}>
      <Text style={postStyles.routeName}>{post.route.name}</Text>
      <Text style={postStyles.routeType}>{post.route.type}</Text>
      <View style={postStyles.statsRow}>
        <Text style={postStyles.stat}>📍 {post.route.distance}</Text>
        <Text style={postStyles.stat}>⏱️ {post.route.time}</Text>
        <Text style={postStyles.stat}>⚡ {post.route.difficulty}</Text>
      </View>
      {post.comment ? (
        <Text style={postStyles.comment} numberOfLines={expanded ? undefined : 2}>
          {post.comment}
        </Text>
      ) : null}
      <View style={postStyles.footer}>
        <Text style={postStyles.time}>
          {getRelativeTime(
            typeof post.createdAt === 'string' ? post.createdAt : new Date().toISOString()
          )}
        </Text>
        <View style={postStyles.footerRight}>
          <Text style={postStyles.likeCount}>❤️ {post.likes}</Text>
          {post.route.mapUrl ? (
            <TouchableOpacity onPress={() => Linking.openURL(post.route.mapUrl!)}>
              <Text style={postStyles.mapsLink}>🗺️ Maps</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={postStyles.expandBtn}>
              {expanded ? '▲ 閉じる' : '▼ 詳細'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {expanded && post.route.waypointObjects?.length > 0 && (
        <View style={postStyles.waypointList}>
          {post.route.waypointObjects.map((wp, i) => (
            <View key={i} style={postStyles.waypointRow}>
              <View style={postStyles.waypointDot}>
                <Text style={postStyles.waypointDotText}>
                  {i === 0 ? '発' : i === post.route.waypointObjects.length - 1 ? '着' : String(i)}
                </Text>
              </View>
              <Text style={postStyles.waypointName}>{wp.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: SPACING.md },
  profileCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.xl,
    alignItems: 'center',
    ...SHADOW.sm,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: SPACING.md,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  avatarLargeText: {
    color: COLORS.white,
    fontSize: 32,
    fontWeight: FONT_WEIGHT.bold,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  displayName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
  },
  meBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  meBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.bold,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
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
  section: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
    ...SHADOW.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    gap: 4,
  },
  badgePillIcon: { fontSize: FONT_SIZE.md },
  badgePillLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
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
  emptyText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  postList: { gap: SPACING.sm },
});

const postStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  routeName: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  routeType: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
    marginBottom: SPACING.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xs,
  },
  stat: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  comment: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    marginBottom: SPACING.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  time: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  likeCount: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary },
  mapsLink: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  expandBtn: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  waypointList: {
    marginTop: SPACING.sm,
    gap: 6,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  waypointDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  waypointDotText: {
    fontSize: 8,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.bold,
  },
  waypointName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    flex: 1,
  },
});
