import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  SafeAreaView,
  RefreshControl,
  Modal,
  Dimensions,
  StatusBar,
  TextInput,
} from 'react-native';
import type { CommunityPost } from '@touring/shared';
import { getRelativeTime, PREFECTURES_BY_AREA } from '@touring/shared';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import {
  getCommunityRoutes,
  getPopularRoutes,
  toggleLike,
  deleteCommunityPost,
  ensureAnonymousAuth,
  toggleReaction,
  getMyReactions,
  toggleBookmark,
  getBookmarkedIds,
  getBookmarkedPosts,
  saveRoute,
} from '../services/firebase';
import { RouteCard } from '../components/RouteCard';
import { computeBadges } from '../utils/badges';
import type { Badge, UserStats } from '../utils/badges';

type NavProp = StackNavigationProp<RootStackParamList>;
type TabType = 'latest' | 'popular' | 'bookmarks';

const REACTION_STAMPS: Array<{ type: string; emoji: string }> = [
  { type: '走ってみたい', emoji: '🏍️' },
  { type: '最高', emoji: '🤩' },
  { type: '絶景', emoji: '🗻' },
  { type: 'また行きたい', emoji: '🔁' },
  { type: '林道最高', emoji: '🌲' },
  { type: '参考になった', emoji: '👍' },
];

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function CommunityScreen() {
  const navigation = useNavigation<NavProp>();
  const [activeTab, setActiveTab] = useState<TabType>('latest');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeArea, setActiveArea] = useState<string | null>(null);
  const [activePrefecture, setActivePrefecture] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [myUid, setMyUid] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>({});
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    ensureAnonymousAuth().then((u) => setMyUid(u.uid)).catch(() => {});
    getMyReactions().then(setMyReactions).catch(() => {});
    getBookmarkedIds().then((ids) => setBookmarkedIds(new Set(ids))).catch(() => {});
  }, []);

  const loadPosts = useCallback(async (
    tab: TabType = activeTab,
    tag: string | null = activeTag,
    area: string | null = activeArea,
    prefecture: string | null = activePrefecture,
  ) => {
    try {
      let data: import('@touring/shared').CommunityPost[];
      if (tab === 'bookmarks') {
        data = await getBookmarkedPosts();
      } else if (tab === 'popular') {
        data = await getPopularRoutes(20, tag ?? undefined, area ?? undefined, prefecture ?? undefined);
      } else {
        data = await getCommunityRoutes(20, tag ?? undefined, area ?? undefined, prefecture ?? undefined);
      }
      setPosts(data);
    } catch {
      Alert.alert('エラー', '投稿の読み込みに失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, activeTag, activeArea, activePrefecture]);

  useEffect(() => {
    setLoading(true);
    loadPosts(activeTab, activeTag, activeArea, activePrefecture);
  }, [activeTab, activeTag, activeArea, activePrefecture]);

  // 検索フィルタリング（ルート名・コメント・タグ）
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;
    const q = searchQuery.trim().toLowerCase();
    return posts.filter((post) =>
      post.route.name?.toLowerCase().includes(q) ||
      post.comment?.toLowerCase().includes(q) ||
      post.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
      post.userDisplayName?.toLowerCase().includes(q) ||
      post.prefectures?.some((p) => p.includes(q)) ||
      post.departureArea?.includes(q)
    );
  }, [posts, searchQuery]);

  const userStatsMap = useMemo(() => {
    const map: Record<string, UserStats> = {};
    filteredPosts.forEach((post) => {
      const uid = post.userId;
      if (!map[uid]) map[uid] = { postCount: 0, totalLikes: 0, hasForestRoad: false };
      map[uid].postCount += 1;
      map[uid].totalLikes += post.likes ?? 0;
      if (post.route?.type === '林道') map[uid].hasForestRoad = true;
    });
    return map;
  }, [filteredPosts]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts(activeTab, activeTag, activeArea, activePrefecture);
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
        p.id === post.id ? { ...p, likes: p.likes + (alreadyLiked ? -1 : 1) } : p
      )
    );
    try {
      await toggleLike(post.id);
    } catch {
      setLikedIds((prev) => {
        const next = new Set(prev);
        alreadyLiked ? next.add(post.id!) : next.delete(post.id!);
        return next;
      });
    }
  };

  const handleTabChange = (tab: TabType) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setLoading(true);
  };

  const handleReaction = async (post: CommunityPost, reactionType: string) => {
    if (!post.id) return;
    const myPostReactions = myReactions[post.id] ?? [];
    const alreadyReacted = myPostReactions.includes(reactionType);

    // 楽観的更新
    setMyReactions((prev) => {
      const current = prev[post.id!] ?? [];
      const updated = alreadyReacted
        ? current.filter((r) => r !== reactionType)
        : [...current, reactionType];
      return { ...prev, [post.id!]: updated };
    });
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p;
        const reactions = { ...(p.reactions ?? {}) };
        reactions[reactionType] = Math.max(0, (reactions[reactionType] ?? 0) + (alreadyReacted ? -1 : 1));
        return { ...p, reactions };
      })
    );
    try {
      await toggleReaction(post.id, reactionType);
    } catch {
      // 失敗時は元に戻す
      setMyReactions((prev) => {
        const current = prev[post.id!] ?? [];
        const reverted = alreadyReacted
          ? [...current, reactionType]
          : current.filter((r) => r !== reactionType);
        return { ...prev, [post.id!]: reverted };
      });
    }
  };

  const handleBookmark = async (post: CommunityPost) => {
    if (!post.id) return;
    const isBookmarked = bookmarkedIds.has(post.id);
    // 楽観的更新
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      isBookmarked ? next.delete(post.id!) : next.add(post.id!);
      return next;
    });
    try {
      await toggleBookmark(post.id);
      // ブックマークタブで解除したら一覧から削除
      if (activeTab === 'bookmarks' && isBookmarked) {
        setPosts((prev) => prev.filter((p) => p.id !== post.id));
      }
    } catch {
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        isBookmarked ? next.add(post.id!) : next.delete(post.id!);
        return next;
      });
    }
  };

  const handleSaveRoute = async (post: CommunityPost) => {
    try {
      await saveRoute(post.route);
      Alert.alert('保存しました！', '「保存済みルート」に追加されました 🗺️');
    } catch (e: any) {
      Alert.alert('保存失敗', e.message ?? 'しばらく後でお試しください');
    }
  };

  const handleTagPress = (tag: string) => {
    // 同じタグをもう一度押したら解除
    if (tag === activeTag) {
      setActiveTag(null);
    } else {
      setActiveTag(tag);
    }
    setLoading(true);
  };

  const handleAreaPress = (area: string) => {
    if (area === activeArea) {
      setActiveArea(null);
      setActivePrefecture(null); // エリア解除時は県も解除
    } else {
      setActiveArea(area);
      setActivePrefecture(null); // エリア変更時は県をリセット
    }
    setLoading(true);
  };

  const handlePrefecturePress = (pref: string) => {
    if (pref === activePrefecture) {
      setActivePrefecture(null);
    } else {
      setActivePrefecture(pref);
    }
    setLoading(true);
  };

  const clearTagFilter = () => {
    setActiveTag(null);
    setLoading(true);
  };

  const clearAreaFilter = () => {
    setActiveArea(null);
    setActivePrefecture(null);
    setLoading(true);
  };

  const clearPrefectureFilter = () => {
    setActivePrefecture(null);
    setLoading(true);
  };

  const clearAllFilters = () => {
    setActiveTag(null);
    setActiveArea(null);
    setActivePrefecture(null);
    setLoading(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>🏍️ みんなのコース</Text>
            <Text style={styles.headerSubtitle}>ライダーたちのツーリングルートを見つけよう</Text>
          </View>
          <TouchableOpacity style={styles.postBtn} onPress={() => navigation.navigate('Post')}>
            <Text style={styles.postBtnText}>＋ 投稿</Text>
          </TouchableOpacity>
        </View>
        {/* 検索バー */}
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="ルート名・タグ・エリアで検索..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {[
          { value: 'latest' as TabType, label: '🕐 最新' },
          { value: 'popular' as TabType, label: '🔥 人気' },
          { value: 'bookmarks' as TabType, label: '🔖 後で見る' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.value}
            style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            onPress={() => handleTabChange(tab.value)}
          >
            <Text style={[styles.tabText, activeTab === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* フィルター中バナー */}
      {(activeTag || activeArea || activePrefecture) && (
        <View style={styles.tagFilterBanner}>
          <View style={styles.filterChips}>
            {activeTag && (
              <TouchableOpacity style={styles.filterChip} onPress={clearTagFilter}>
                <Text style={styles.filterChipText}>🏷️ #{activeTag} ✕</Text>
              </TouchableOpacity>
            )}
            {activeArea && !activePrefecture && (
              <TouchableOpacity style={[styles.filterChip, styles.filterChipArea]} onPress={clearAreaFilter}>
                <Text style={[styles.filterChipText, styles.filterChipAreaText]}>📍 {activeArea} ✕</Text>
              </TouchableOpacity>
            )}
            {activePrefecture && (
              <TouchableOpacity style={[styles.filterChip, styles.filterChipPref]} onPress={clearPrefectureFilter}>
                <Text style={[styles.filterChipText, styles.filterChipPrefText]}>
                  🗾 {activeArea ? `${activeArea} › ` : ''}{activePrefecture} ✕
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={clearAllFilters} style={styles.tagFilterClear}>
            <Text style={styles.tagFilterClearText}>全解除</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* エリア選択時の都道府県絞り込みバー */}
      {activeArea && PREFECTURES_BY_AREA[activeArea] && PREFECTURES_BY_AREA[activeArea].length > 1 && (
        <View style={styles.prefBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.prefBarContent}>
            {PREFECTURES_BY_AREA[activeArea].map((pref) => (
              <TouchableOpacity
                key={pref}
                style={[styles.prefBarChip, activePrefecture === pref && styles.prefBarChipActive]}
                onPress={() => handlePrefecturePress(pref)}
              >
                <Text style={[styles.prefBarChipText, activePrefecture === pref && styles.prefBarChipTextActive]}>
                  {pref}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      ) : filteredPosts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>
            {searchQuery ? '🔍' : activeTab === 'bookmarks' ? '🔖' : (activeTag || activeArea || activePrefecture) ? '🔍' : '🏍️'}
          </Text>
          <Text style={styles.emptyTitle}>
            {searchQuery
              ? `「${searchQuery}」に一致するルートはありません`
              : activeTab === 'bookmarks'
              ? '「後で見る」に保存した投稿はありません'
              : activePrefecture
              ? `${activePrefecture} の投稿はありません`
              : activeTag && activeArea
              ? `#${activeTag} × ${activeArea} の投稿はありません`
              : activeTag
              ? `#${activeTag} の投稿はありません`
              : activeArea
              ? `${activeArea} の投稿はありません`
              : 'まだ投稿がありません'}
          </Text>
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearFilterBtn}>
              <Text style={styles.clearFilterBtnText}>検索をクリア</Text>
            </TouchableOpacity>
          ) : activeTab === 'bookmarks' ? (
            <Text style={styles.emptySubtitle}>気になる投稿の「🔖 後で見る」をタップして保存しよう</Text>
          ) : (activeTag || activeArea || activePrefecture) ? (
            <TouchableOpacity onPress={clearAllFilters} style={styles.clearFilterBtn}>
              <Text style={styles.clearFilterBtnText}>フィルターを解除</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.emptySubtitle}>最初のルートを共有しましょう！</Text>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
          }
        >
          {searchQuery.trim() !== '' && (
            <View style={styles.searchResultBanner}>
              <Text style={styles.searchResultText}>
                🔍 「{searchQuery}」 の検索結果 {filteredPosts.length}件
              </Text>
            </View>
          )}
          {filteredPosts.map((post) => {
            const stats = userStatsMap[post.userId] ?? { postCount: 0, totalLikes: 0, hasForestRoad: false };
            const badges = computeBadges(stats);
            return (
              <CommunityPostCard
                key={post.id}
                post={post}
                badges={badges}
                isLiked={likedIds.has(post.id ?? '')}
                onLike={() => handleLike(post)}
                isOwn={!!post.id && post.userId === myUid}
                onTagPress={handleTagPress}
                activeTag={activeTag}
                onAreaPress={handleAreaPress}
                activeArea={activeArea}
                onPrefecturePress={handlePrefecturePress}
                activePrefecture={activePrefecture}
                onPhotoPress={setSelectedPhoto}
                myReactions={myReactions[post.id ?? ''] ?? []}
                onReaction={(type) => handleReaction(post, type)}
                isBookmarked={bookmarkedIds.has(post.id ?? '')}
                onBookmark={() => handleBookmark(post)}
                onSaveRoute={() => handleSaveRoute(post)}
                onDelete={() => {
                  Alert.alert('投稿を削除', 'この投稿を削除しますか？', [
                    { text: 'キャンセル', style: 'cancel' },
                    {
                      text: '削除',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deleteCommunityPost(post.id!);
                          setPosts((prev) => prev.filter((p) => p.id !== post.id));
                        } catch (e: any) {
                          Alert.alert('エラー', e.message);
                        }
                      },
                    },
                  ]);
                }}
                onUserPress={() =>
                  navigation.navigate('UserProfile', {
                    userId: post.userId,
                    displayName: post.userDisplayName,
                  })
                }
              />
            );
          })}
          <View style={{ height: SPACING.xxxl }} />
        </ScrollView>
      )}

      {/* 写真拡大モーダル */}
      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <TouchableOpacity
          style={photoModalStyles.backdrop}
          activeOpacity={1}
          onPress={() => setSelectedPhoto(null)}
        >
          {selectedPhoto && (
            <Image
              source={{ uri: selectedPhoto }}
              style={photoModalStyles.image}
              resizeMode="contain"
            />
          )}
          <View style={photoModalStyles.closeHint}>
            <Text style={photoModalStyles.closeHintText}>タップして閉じる</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// Post Card
// ============================================================

interface PostCardProps {
  post: CommunityPost;
  badges: Badge[];
  isLiked: boolean;
  onLike: () => void;
  isOwn?: boolean;
  onDelete?: () => void;
  onTagPress: (tag: string) => void;
  activeTag: string | null;
  onAreaPress: (area: string) => void;
  activeArea: string | null;
  onPrefecturePress: (pref: string) => void;
  activePrefecture: string | null;
  onPhotoPress: (url: string) => void;
  onUserPress: () => void;
  myReactions: string[];
  onReaction: (type: string) => void;
  isBookmarked: boolean;
  onBookmark: () => void;
  onSaveRoute: () => void;
}

function CommunityPostCard({
  post, badges, isLiked, onLike, isOwn, onDelete,
  onTagPress, activeTag, onAreaPress, activeArea,
  onPrefecturePress, activePrefecture, onPhotoPress, onUserPress,
  myReactions, onReaction, isBookmarked, onBookmark, onSaveRoute,
}: PostCardProps) {
  const [showRoute, setShowRoute] = useState(false);
  const visibleBadges = badges.slice(0, 3);

  return (
    <View style={cardStyles.card}>
      {/* User info */}
      <View style={cardStyles.userRow}>
        <TouchableOpacity onPress={onUserPress}>
          <View style={cardStyles.avatar}>
            <Text style={cardStyles.avatarText}>{post.userDisplayName?.[0] ?? '?'}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={cardStyles.userInfo} onPress={onUserPress}>
          <View style={cardStyles.nameRow}>
            <Text style={cardStyles.userName}>{post.userDisplayName}</Text>
            {isOwn && (
              <View style={cardStyles.meBadge}>
                <Text style={cardStyles.meBadgeText}>自分</Text>
              </View>
            )}
          </View>
          {visibleBadges.length > 0 && (
            <View style={cardStyles.badgesRow}>
              {visibleBadges.map((badge) => (
                <View key={badge.id} style={[cardStyles.badgePill, { backgroundColor: badge.bgColor }]}>
                  <Text style={cardStyles.badgePillText}>{badge.icon}</Text>
                  <Text style={[cardStyles.badgePillLabel, { color: badge.textColor }]}>{badge.label}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={cardStyles.postTime}>
            {getRelativeTime(typeof post.createdAt === 'string' ? post.createdAt : new Date().toISOString())}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cardStyles.areaBadge, activeArea === post.departureArea && cardStyles.areaBadgeActive]}
          onPress={() => post.departureArea && onAreaPress(post.departureArea)}
        >
          <Text style={[cardStyles.areaText, activeArea === post.departureArea && cardStyles.areaTextActive]}>
            📍 {post.departureArea}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBookmark}
          style={[cardStyles.bookmarkBtn, isBookmarked && cardStyles.bookmarkBtnActive]}
        >
          <Text style={cardStyles.bookmarkBtnText}>{isBookmarked ? '🔖' : '🔖'}</Text>
          <Text style={[cardStyles.bookmarkBtnLabel, isBookmarked && cardStyles.bookmarkBtnLabelActive]}>
            {isBookmarked ? '保存中' : '後で見る'}
          </Text>
        </TouchableOpacity>
        {isOwn && (
          <TouchableOpacity onPress={onDelete} style={cardStyles.deleteBtn}>
            <Text style={cardStyles.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 都道府県バッジ（複数） */}
      {post.prefectures && post.prefectures.length > 0 && (
        <View style={cardStyles.prefRow}>
          {post.prefectures.map((pref) => (
            <TouchableOpacity
              key={pref}
              style={[cardStyles.prefBadge, activePrefecture === pref && cardStyles.prefBadgeActive]}
              onPress={() => onPrefecturePress(pref)}
            >
              <Text style={[cardStyles.prefText, activePrefecture === pref && cardStyles.prefTextActive]}>
                🗾 {pref}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Route name & type */}
      <Text style={cardStyles.routeName}>{post.route.name}</Text>
      <Text style={cardStyles.routeType}>{post.route.type}</Text>

      {/* Comment */}
      {post.comment ? <Text style={cardStyles.comment}>{post.comment}</Text> : null}

      {/* Stats */}
      <View style={cardStyles.statsRow}>
        <Text style={cardStyles.stat}>📍 {post.route.distance}</Text>
        <Text style={cardStyles.stat}>⏱️ {post.route.time}</Text>
        <Text style={cardStyles.stat}>⚡ {post.route.difficulty}</Text>
      </View>

      {/* Photos（タップで拡大） */}
      {post.photos && post.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cardStyles.photosScroll}>
          {post.photos.map((url, i) => (
            <TouchableOpacity key={i} onPress={() => onPhotoPress(url)} activeOpacity={0.85}>
              <Image source={{ uri: url }} style={cardStyles.photo} resizeMode="cover" />
              <View style={cardStyles.photoZoomHint}>
                <Text style={cardStyles.photoZoomHintText}>🔍</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Tags（タップでフィルター） */}
      {post.tags && post.tags.length > 0 && (
        <View style={cardStyles.tagsRow}>
          {post.tags.map((tag, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => onTagPress(tag)}
              style={[
                cardStyles.tag,
                activeTag === tag && cardStyles.tagActive,
              ]}
            >
              <Text style={[cardStyles.tagText, activeTag === tag && cardStyles.tagTextActive]}>
                #{tag}
              </Text>
            </TouchableOpacity>
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
        <TouchableOpacity style={cardStyles.saveRouteBtn} onPress={onSaveRoute}>
          <Text style={cardStyles.saveRouteBtnText}>🗺️ ルートを保存</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cardStyles.detailBtn} onPress={() => setShowRoute(!showRoute)}>
          <Text style={cardStyles.detailBtnText}>
            {showRoute ? '▲ 閉じる' : '▼ ルート詳細'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Stamp reactions */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={cardStyles.reactionsScroll}
        contentContainerStyle={cardStyles.reactionsContent}
      >
        {REACTION_STAMPS.map((stamp) => {
          const count = post.reactions?.[stamp.type] ?? 0;
          const isActive = myReactions.includes(stamp.type);
          return (
            <TouchableOpacity
              key={stamp.type}
              style={[cardStyles.reactionBtn, isActive && cardStyles.reactionBtnActive]}
              onPress={() => onReaction(stamp.type)}
            >
              <Text style={cardStyles.reactionEmoji}>{stamp.emoji}</Text>
              <Text style={[cardStyles.reactionLabel, isActive && cardStyles.reactionLabelActive]}>
                {stamp.type}
              </Text>
              {count > 0 && (
                <View style={[cardStyles.reactionCount, isActive && cardStyles.reactionCountActive]}>
                  <Text style={[cardStyles.reactionCountText, isActive && cardStyles.reactionCountTextActive]}>
                    {count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Route card (expandable) */}
      {showRoute && (
        <>
          {post.route.mapUrl ? (
            <TouchableOpacity
              style={cardStyles.mapsBtn}
              onPress={() => Linking.openURL(post.route.mapUrl!)}
            >
              <Text style={cardStyles.mapsBtnText}>🗺️ Google Maps でルートを開く</Text>
            </TouchableOpacity>
          ) : null}
          <RouteCard route={post.route} showActions={false} />
        </>
      )}
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  searchIcon: { fontSize: FONT_SIZE.md },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
    paddingVertical: 0,
  },
  searchClear: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    paddingHorizontal: SPACING.xs,
  },
  searchResultBanner: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  searchResultText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  headerTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.white },
  headerSubtitle: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  postBtn: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  postBtnText: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
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
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semiBold, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary },
  tagFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primary + '30',
  },
  filterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, flex: 1 },
  filterChip: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  filterChipText: { fontSize: FONT_SIZE.xs, color: COLORS.white, fontWeight: FONT_WEIGHT.bold },
  filterChipArea: { backgroundColor: '#1A7A4A' },
  filterChipAreaText: { color: COLORS.white },
  filterChipPref: { backgroundColor: '#2E6DB4' },
  filterChipPrefText: { color: COLORS.white },
  prefBar: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
  },
  prefBarContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
  },
  prefBarChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: '#2E6DB430',
    backgroundColor: '#EEF4FC',
    marginRight: SPACING.xs,
  },
  prefBarChipActive: {
    backgroundColor: '#2E6DB4',
    borderColor: '#1A4A8A',
  },
  prefBarChipText: {
    fontSize: FONT_SIZE.sm,
    color: '#2E6DB4',
    fontWeight: FONT_WEIGHT.semiBold,
  },
  prefBarChipTextActive: {
    color: COLORS.white,
  },
  tagFilterText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  tagFilterTag: { color: COLORS.primary, fontWeight: FONT_WEIGHT.bold },
  tagFilterClear: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginLeft: SPACING.xs,
  },
  tagFilterClearText: { fontSize: FONT_SIZE.xs, color: COLORS.white, fontWeight: FONT_WEIGHT.bold },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: SPACING.md },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl },
  emptyIcon: { fontSize: 64, marginBottom: SPACING.lg },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptySubtitle: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, marginTop: SPACING.sm },
  clearFilterBtn: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  clearFilterBtnText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
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
  userRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  avatarText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, flexWrap: 'wrap' },
  userName: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semiBold, color: COLORS.textPrimary },
  meBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  meBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: FONT_WEIGHT.bold },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 2 },
  badgePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, gap: 2 },
  badgePillText: { fontSize: 10 },
  badgePillLabel: { fontSize: 10, fontWeight: FONT_WEIGHT.bold },
  postTime: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  areaBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    marginLeft: SPACING.xs,
    flexShrink: 0,
  },
  areaBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  areaText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.semiBold },
  areaTextActive: { color: COLORS.white },
  prefRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  prefBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: '#EEF4FC',
    borderWidth: 1,
    borderColor: '#2E6DB430',
  },
  prefBadgeActive: {
    backgroundColor: '#2E6DB4',
    borderColor: '#1A4A8A',
  },
  prefText: {
    fontSize: FONT_SIZE.xs,
    color: '#2E6DB4',
    fontWeight: FONT_WEIGHT.semiBold,
  },
  prefTextActive: {
    color: COLORS.white,
  },
  routeName: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.textPrimary, marginBottom: 2 },
  routeType: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: FONT_WEIGHT.semiBold, marginBottom: SPACING.sm },
  comment: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  statsRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  stat: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  photosScroll: { marginBottom: SPACING.md },
  photo: { width: 160, height: 120, borderRadius: RADIUS.md, marginRight: SPACING.sm },
  photoZoomHint: {
    position: 'absolute',
    bottom: 6,
    right: SPACING.sm + 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  photoZoomHintText: { fontSize: 10 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md },
  tag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tagActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  tagText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.semiBold },
  tagTextActive: { color: COLORS.white },
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
  likeBtnActive: { borderColor: COLORS.danger, backgroundColor: COLORS.dangerLight },
  likeBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.semiBold },
  likeBtnTextActive: { color: COLORS.danger },
  saveRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  saveRouteBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.semiBold },
  bookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    marginLeft: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  bookmarkBtnActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  bookmarkBtnText: { fontSize: 13 },
  bookmarkBtnLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  bookmarkBtnLabelActive: {
    color: COLORS.primary,
  },
  deleteBtn: { padding: SPACING.xs, marginLeft: SPACING.xs },
  deleteBtnText: { fontSize: FONT_SIZE.md },
  detailBtn: { flex: 1 },
  detailBtnText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: FONT_WEIGHT.semiBold, textAlign: 'right' },
  reactionsScroll: { marginTop: SPACING.sm },
  reactionsContent: { gap: SPACING.xs, paddingVertical: 2 },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.background,
    marginRight: SPACING.xs,
  },
  reactionBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  reactionEmoji: { fontSize: 14 },
  reactionLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.semiBold },
  reactionLabelActive: { color: COLORS.primary },
  reactionCount: {
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  reactionCountActive: { backgroundColor: COLORS.primary },
  reactionCountText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.bold },
  reactionCountTextActive: { color: COLORS.white },
  mapsBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  mapsBtnText: { color: COLORS.white, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold },
});

const photoModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  closeHint: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  closeHintText: { color: 'rgba(255,255,255,0.8)', fontSize: FONT_SIZE.sm },
});
