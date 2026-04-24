import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
  Modal,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { CommunityPost } from '@touring/shared';
import { getRelativeTime } from '@touring/shared';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { getCommunityRoutes, getPopularRoutes, toggleLike } from '../services/firebase';
import { RouteCard } from '../components/RouteCard';
import { StarRating } from '../components/StarRating';

type NavProp = StackNavigationProp<RootStackParamList>;

type TabType = 'latest' | 'popular';

export default function CommunityScreen() {
  const navigation = useNavigation<NavProp>();
  const [activeTab, setActiveTab] = useState<TabType>('latest');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async (tab: TabType = activeTab) => {
    try {
      const data =
        tab === 'popular'
          ? await getPopularRoutes(20)
          : await getCommunityRoutes(20);
      setPosts(data);
    } catch (err: any) {
      Alert.alert('エラー', '投稿の読み込みに失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadPosts(activeTab);
  }, [activeTab]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts(activeTab);
  };

  const handleLike = async (post: CommunityPost) => {
    if (!post.id) return;
    const alreadyLiked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      alreadyLiked ? next.delete(post.id!) : next.add(post.id!);
      return next;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likes: p.likes + (alreadyLiked ? -1 : 1) }
          : p
      )
    );
    try {
      await toggleLike(post.id);
    } catch {
      // Revert on error
      setLikedIds((prev) => {
        const next = new Set(prev);
        alreadyLiked ? next.add(post.id!) : next.delete(post.id!);
        return next;
      });
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setLoading(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>👥 コミュニティ</Text>
            <Text style={styles.headerSubtitle}>仲間のツーリングルートを見つけよう</Text>
          </View>
          <TouchableOpacity
            style={styles.postBtn}
            onPress={() => navigation.navigate('Post')}
          >
            <Text style={styles.postBtnText}>＋ 投稿</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {[
          { value: 'latest' as TabType, label: '🕐 最新' },
          { value: 'popular' as TabType, label: '🔥 人気' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            onPress={() => handleTabChange(tab.value)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab.value && styles.tabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🏍️</Text>
          <Text style={styles.emptyTitle}>まだ投稿がありません</Text>
          <Text style={styles.emptySubtitle}>最初のルートを共有しましょう！</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {posts.map((post) => (
            <CommunityPostCard
              key={post.id}
              post={post}
              isLiked={likedIds.has(post.id ?? '')}
              onLike={() => handleLike(post)}
            />
          ))}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

interface PostCardProps {
  post: CommunityPost;
  isLiked: boolean;
  onLike: () => void;
}

function CommunityPostCard({ post, isLiked, onLike }: PostCardProps) {
  const [showRoute, setShowRoute] = useState(false);

  return (
    <View style={cardStyles.card}>
      {/* User info */}
      <View style={cardStyles.userRow}>
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarText}>
            {post.userDisplayName?.[0] ?? '?'}
          </Text>
        </View>
        <View style={cardStyles.userInfo}>
          <Text style={cardStyles.userName}>{post.userDisplayName}</Text>
          <Text style={cardStyles.postTime}>{getRelativeTime(typeof post.createdAt === 'string' ? post.createdAt : new Date().toISOString())}</Text>
        </View>
        <View style={cardStyles.areaBadge}>
          <Text style={cardStyles.areaText}>{post.departureArea}</Text>
        </View>
      </View>

      {/* Route name & type */}
      <Text style={cardStyles.routeName}>{post.route.name}</Text>
      <Text style={cardStyles.routeType}>{post.route.type}</Text>

      {/* Comment */}
      {post.comment && (
        <Text style={cardStyles.comment}>{post.comment}</Text>
      )}

      {/* Stats */}
      <View style={cardStyles.statsRow}>
        <Text style={cardStyles.stat}>📍 {post.route.distance}</Text>
        <Text style={cardStyles.stat}>⏱️ {post.route.time}</Text>
        <Text style={cardStyles.stat}>⚡ {post.route.difficulty}</Text>
      </View>

      {/* Photos */}
      {post.photos && post.photos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={cardStyles.photosScroll}
        >
          {post.photos.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={cardStyles.photo}
              resizeMode="cover"
            />
          ))}
        </ScrollView>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <View style={cardStyles.tagsRow}>
          {post.tags.map((tag, i) => (
            <Text key={i} style={cardStyles.tag}>#{tag}</Text>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={cardStyles.actionsRow}>
        <TouchableOpacity
          style={[cardStyles.likeBtn, isLiked && cardStyles.likeBtnActive]}
          onPress={onLike}
        >
          <Text style={[cardStyles.likeBtnText, isLiked && cardStyles.likeBtnTextActive]}>
            {isLiked ? '❤️' : '🤍'} {post.likes}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={cardStyles.detailBtn}
          onPress={() => setShowRoute(!showRoute)}
        >
          <Text style={cardStyles.detailBtnText}>
            {showRoute ? '▲ ルート折りたたむ' : '▼ ルート詳細を見る'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Route card (expandable) */}
      {showRoute && (
        <RouteCard
          route={post.route}
          showActions={false}
        />
      )}
    </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  postBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  postBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: SPACING.md },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xxxl,
  },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
  },
  emptySubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    ...SHADOW.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  userInfo: { flex: 1 },
  userName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textPrimary,
  },
  postTime: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  areaBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  areaText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.semiBold },
  routeName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  routeType: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
    marginBottom: SPACING.sm,
  },
  comment: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  stat: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  photosScroll: { marginBottom: SPACING.md },
  photo: {
    width: 160,
    height: 120,
    borderRadius: RADIUS.md,
    marginRight: SPACING.sm,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  tag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  likeBtnActive: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  likeBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  likeBtnTextActive: { color: COLORS.danger },
  detailBtn: { flex: 1 },
  detailBtnText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
    textAlign: 'right',
  },
});
