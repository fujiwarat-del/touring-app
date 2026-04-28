// ============================================================
// Badge definitions and computation
// ============================================================

export interface Badge {
  id: string;
  icon: string;
  label: string;
  bgColor: string;
  textColor: string;
  description: string;
}

export interface UserStats {
  postCount: number;
  totalLikes: number;
  hasForestRoad: boolean;
}

interface BadgeDef extends Badge {
  condition: (s: UserStats) => boolean;
  priority: number;
  lockedDescription: string; // Shown when not yet earned
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'super_rider',
    icon: '⭐',
    label: 'スーパーライダー',
    bgColor: '#FFFBEB',
    textColor: '#D97706',
    description: 'いいね累計50以上',
    lockedDescription: 'いいね50でアンロック',
    priority: 6,
    condition: (s) => s.totalLikes >= 50,
  },
  {
    id: 'top_poster',
    icon: '🏆',
    label: '投稿王',
    bgColor: '#FEF9E7',
    textColor: '#B7791F',
    description: '投稿10本以上',
    lockedDescription: '投稿10本でアンロック',
    priority: 5,
    condition: (s) => s.postCount >= 10,
  },
  {
    id: 'popular_rider',
    icon: '❤️',
    label: '人気ライダー',
    bgColor: '#FFF5F5',
    textColor: '#E53E3E',
    description: 'いいね累計10以上',
    lockedDescription: 'いいね10でアンロック',
    priority: 4,
    condition: (s) => s.totalLikes >= 10,
  },
  {
    id: 'route_master',
    icon: '🗺️',
    label: 'ルートマスター',
    bgColor: '#EEF2FF',
    textColor: '#4F46E5',
    description: '投稿5本以上',
    lockedDescription: '投稿5本でアンロック',
    priority: 3,
    condition: (s) => s.postCount >= 5,
  },
  {
    id: 'forest_hunter',
    icon: '🌲',
    label: '林道ハンター',
    bgColor: '#F0FFF4',
    textColor: '#276749',
    description: '林道ルートを投稿',
    lockedDescription: '林道ルートを投稿でアンロック',
    priority: 2,
    condition: (s) => s.hasForestRoad,
  },
  {
    id: 'first_post',
    icon: '🏍️',
    label: '初投稿',
    bgColor: '#E8F8F3',
    textColor: '#1D9E75',
    description: '初めて投稿',
    lockedDescription: '初投稿でアンロック',
    priority: 1,
    condition: (s) => s.postCount >= 1,
  },
];

/** 獲得済みバッジを返す（優先度順） */
export function computeBadges(stats: UserStats): Badge[] {
  return BADGE_DEFS
    .filter((b) => b.condition(stats))
    .sort((a, b) => b.priority - a.priority)
    .map(({ condition: _c, priority: _p, lockedDescription: _l, ...badge }) => badge);
}

/** 全バッジ定義（獲得状態付き）を返す - ProfileScreen用 */
export function getAllBadgesWithStatus(stats: UserStats): Array<Badge & { earned: boolean }> {
  return BADGE_DEFS
    .sort((a, b) => b.priority - a.priority)
    .map(({ condition, priority: _p, lockedDescription, description, ...badge }) => ({
      ...badge,
      description: condition(stats) ? description : lockedDescription,
      earned: condition(stats),
    }));
}
