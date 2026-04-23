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
  { value: 'スクーター', label: 'スクーター', icon: '🛺', description: 'AT限定' },
];

// ============================================================
// Touring Purposes
// ============================================================

export const PURPOSES: Array<{ value: TouringPurpose; label: string; icon: string }> = [
  { value: 'ワインディング', label: 'ワインディング', icon: '〜' },
  { value: '温泉', label: '温泉', icon: '♨️' },
  { value: '海沿い', label: '海沿い', icon: '🌊' },
  { value: 'グルメ', label: 'グルメ', icon: '🍜' },
  { value: '道の駅', label: '道の駅', icon: '🏪' },
  { value: '絶景', label: '絶景', icon: '🗻' },
];

// ============================================================
// Riding Preferences
// ============================================================

export const PREFS: Array<{ value: RidingPreference; label: string; icon: string }> = [
  { value: '信号少な目', label: '信号少な目', icon: '🚦' },
  { value: '高速使わない', label: '高速使わない', icon: '🛣️' },
  { value: '峠道', label: '峠道', icon: '⛰️' },
  { value: '下道', label: '下道', icon: '🛤️' },
  { value: '川沿い', label: '川沿い', icon: '🏞️' },
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
// Traffic Level Config
// ============================================================

export interface TrafficConfig {
  level: number;
  label: string;
  color: string;
  bgColor: string;
}

export const TRAFFIC_LEVELS: TrafficConfig[] = [
  { level: 1, label: '空いてます', color: '#1D9E75', bgColor: '#E8F8F3' },
  { level: 2, label: 'やや空き', color: '#5BB450', bgColor: '#EDF7EC' },
  { level: 3, label: '普通', color: '#F0A500', bgColor: '#FEF7E6' },
  { level: 4, label: 'やや混雑', color: '#E07800', bgColor: '#FEF0E0' },
  { level: 5, label: '混雑予想', color: '#D63B3B', bgColor: '#FDECEC' },
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
