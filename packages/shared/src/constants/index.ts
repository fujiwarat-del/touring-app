// ============================================================
// Touring App - Shared Constants
// ============================================================

import type { BikeType, TouringPurpose, RidingPreference } from '../types/index';

// ============================================================
// Japanese Public Holidays 2025-2026
// ============================================================

export const HOLIDAYS: Record<string, string> = {
  // 2025
  '2025-01-01': '元日',
  '2025-01-13': '成人の日',
  '2025-02-11': '建国記念の日',
  '2025-02-23': '天皇誕生日',
  '2025-02-24': '天皇誕生日 振替休日',
  '2025-03-20': '春分の日',
  '2025-04-29': '昭和の日',
  '2025-05-03': '憲法記念日',
  '2025-05-04': 'みどりの日',
  '2025-05-05': 'こどもの日',
  '2025-05-06': 'こどもの日 振替休日',
  '2025-07-21': '海の日',
  '2025-08-11': '山の日',
  '2025-09-15': '敬老の日',
  '2025-09-23': '秋分の日',
  '2025-10-13': 'スポーツの日',
  '2025-11-03': '文化の日',
  '2025-11-23': '勤労感謝の日',
  '2025-11-24': '勤労感謝の日 振替休日',
  // 2026
  '2026-01-01': '元日',
  '2026-01-12': '成人の日',
  '2026-02-11': '建国記念の日',
  '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日',
  '2026-04-29': '昭和の日',
  '2026-05-03': '憲法記念日',
  '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日',
  '2026-05-06': 'こどもの日 振替休日',
  '2026-07-20': '海の日',
  '2026-08-11': '山の日',
  '2026-09-21': '敬老の日',
  '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日',
  '2026-11-23': '勤労感謝の日',
};

// ============================================================
// Prefectures by Area
// ============================================================

export const PREFECTURES_BY_AREA: Record<string, string[]> = {
  '北海道': ['北海道'],
  '東北': ['青森', '岩手', '宮城', '秋田', '山形', '福島'],
  '関東': ['東京', '神奈川', '埼玉', '千葉', '茨城', '栃木', '群馬'],
  '中部': ['新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知'],
  '近畿': ['三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山'],
  '中国': ['鳥取', '島根', '岡山', '広島', '山口'],
  '四国': ['徳島', '香川', '愛媛', '高知'],
  '九州・沖縄': ['福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'],
};

// ============================================================
// Seasons
// ============================================================

export const SEASONS: Record<string, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
};

export function getSeasonByMonth(month: number): string {
  if (month >= 3 && month <= 5) return SEASONS.spring;
  if (month >= 6 && month <= 8) return SEASONS.summer;
  if (month >= 9 && month <= 11) return SEASONS.autumn;
  return SEASONS.winter;
}

// ============================================================
// Day of Week
// ============================================================

export const DOW: Record<number, string> = {
  0: '日',
  1: '月',
  2: '火',
  3: '水',
  4: '木',
  5: '金',
  6: '土',
};

// ============================================================
// Bike Types
// ============================================================

export const BIKE_TYPES: Array<{ value: BikeType; label: string; icon: string; description: string }> = [
  { value: '大型', label: '大型', icon: '🏍️', description: '400cc以上' },
  { value: '中型', label: '中型', icon: '🛵', description: '250-400cc' },
  { value: 'オフロード', label: 'オフロード', icon: '🏔️', description: '林道OK' },
  { value: '小型125cc以下', label: '小型125cc以下', icon: '🛵', description: '高速道路不可' },
];

// ============================================================
// Touring Purposes
// ============================================================

export const PURPOSES: Array<{ value: TouringPurpose; label: string; icon: string }> = [
  { value: 'ワインディング', label: 'ワインディング', icon: '〜' },
  { value: '温泉', label: '温泉', icon: '♨️' },
  { value: '海沿い', label: '海沿い', icon: '🌊' },
  { value: '川沿い', label: '川沿い', icon: '🏞️' },
  { value: 'グルメ', label: 'グルメ', icon: '🍜' },
  { value: '道の駅', label: '道の駅', icon: '🏪' },
  { value: '絶景', label: '絶景', icon: '🗻' },
  { value: '林道', label: '林道', icon: '🌲' },
  { value: 'キャンプ', label: 'キャンプ', icon: '🏕️' },
  { value: '湖・高原', label: '湖・高原', icon: '🏔️' },
  { value: '城・史跡', label: '城・史跡', icon: '🏯' },
];

// ============================================================
// Riding Preferences
// ============================================================

export const PREFS: Array<{ value: RidingPreference; label: string; icon: string }> = [
  { value: '信号少な目', label: '信号少な目', icon: '🚦' },
  { value: '高速使わない', label: '高速使わない', icon: '🛣️' },
  { value: '峠道', label: '峠道', icon: '⛰️' },
];

// ============================================================
// Duration Options
// ============================================================

export const DURATION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30, label: '30分' },
  { value: 60, label: '1時間' },
  { value: 90, label: '1.5時間' },
  { value: 120, label: '2時間' },
  { value: 150, label: '2.5時間' },
  { value: 180, label: '3時間' },
  { value: 240, label: '4時間' },
  { value: 300, label: '5時間' },
  { value: 360, label: '6時間以上' },
];

// ============================================================
// Distance Options (距離モード用)
// ============================================================

export const DISTANCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 50,  label: '50km' },
  { value: 100, label: '100km' },
  { value: 150, label: '150km' },
  { value: 200, label: '200km' },
  { value: 250, label: '250km' },
  { value: 300, label: '300km' },
  { value: 400, label: '400km' },
  { value: 500, label: '500km' },
];

// ============================================================
// Traffic Level Config
// ============================================================

export interface TrafficConfig {
  level: number;
  label: string;
  color: string;
  bgColor: string;
}

export const TRAFFIC_LEVELS: TrafficConfig[] = [
  { level: 1, label: '空いています', color: '#1D9E75', bgColor: '#E8F8F3' },
  { level: 2, label: 'やや空いています', color: '#5BB450', bgColor: '#EDF7EC' },
  { level: 3, label: '普通です', color: '#F0A500', bgColor: '#FEF7E6' },
  { level: 4, label: 'やや混雑しています', color: '#E07800', bgColor: '#FEF0E0' },
  { level: 5, label: '混雑が予想されます', color: '#D63B3B', bgColor: '#FDECEC' },
];

// ============================================================
// Weather Code Descriptions (WMO)
// ============================================================

export const WEATHER_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: '快晴', icon: '☀️' },
  1: { description: 'ほぼ晴れ', icon: '🌤️' },
  2: { description: '一部曇り', icon: '⛅' },
  3: { description: '曇り', icon: '☁️' },
  45: { description: '霧', icon: '🌫️' },
  48: { description: '霧氷', icon: '🌫️' },
  51: { description: '霧雨(弱)', icon: '🌦️' },
  53: { description: '霧雨(中)', icon: '🌦️' },
  55: { description: '霧雨(強)', icon: '🌧️' },
  61: { description: '小雨', icon: '🌧️' },
  63: { description: '雨', icon: '🌧️' },
  65: { description: '大雨', icon: '⛈️' },
  71: { description: '小雪', icon: '🌨️' },
  73: { description: '雪', icon: '❄️' },
  75: { description: '大雪', icon: '❄️' },
  80: { description: 'にわか雨(弱)', icon: '🌦️' },
  81: { description: 'にわか雨', icon: '🌧️' },
  82: { description: 'にわか雨(強)', icon: '⛈️' },
  95: { description: '雷雨', icon: '⛈️' },
  96: { description: '雷雨・ひょう', icon: '⛈️' },
  99: { description: '激しい雷雨', icon: '⛈️' },
};

// ============================================================
// App Config
// ============================================================

export const APP_CONFIG = {
  appName: 'ツーリングプランナー',
  appVersion: '1.0.0',
  apiBaseUrl: process.env.EXPO_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  maxRoutesPerRequest: 3,
  maxPhotoUploadSizeMB: 10,
  defaultDuration: 180,
};
