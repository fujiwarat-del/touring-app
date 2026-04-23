// ============================================================
// Touring App - Date Utilities
// ============================================================

import type { TodayInfo } from '../types/index';
import { HOLIDAYS, DOW, TRAFFIC_LEVELS, getSeasonByMonth } from '../constants/index';

/**
 * Format a Date object to a "YYYY-MM-DD" date string (local time)
 */
export function toDS(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculate traffic level (1-5) based on date factors
 */
function calcTrafficLevel(
  date: Date,
  isHoliday: boolean,
  isWeekend: boolean,
  month: number
): number {
  const dow = date.getDay();
  const isGoldenWeek = month === 5 && date.getDate() >= 3 && date.getDate() <= 6;
  const isSilverWeek =
    month === 9 &&
    (date.getDate() === 21 ||
      date.getDate() === 22 ||
      date.getDate() === 23);
  const isNewYear =
    (month === 1 && date.getDate() <= 3) ||
    (month === 12 && date.getDate() >= 28);
    const isSummerPeak = month === 8 && date.getDate() >= 10 && date.getDate() <= 18;

  if (isGoldenWeek || isSilverWeek || isNewYear || isSummerPeak) return 5;
  if (isHoliday && (dow === 0 || dow === 6)) return 4;
  if (isHoliday) return 4;
  if (isWeekend) {
    if (month >= 4 && month <= 5) return 4; // Spring touring season
    if (month >= 9 && month <= 11) return 4; // Autumn touring season
    return 3;
  }
  if (dow === 5) return 3; // Friday
  return 2; // Regular weekday
}

/**
 * Get today's info including traffic level, holiday status, season
 */
export function getTodayInfo(date: Date = new Date()): TodayInfo {
  const ds = toDS(date);
  const dowIndex = date.getDay();
  const dowStr = DOW[dowIndex] ?? '?';
  const month = date.getMonth() + 1;
  const isWeekend = dowIndex === 0 || dowIndex === 6;
  const holidayName = HOLIDAYS[ds];
  const isHoliday = Boolean(holidayName) || isWeekend;
  const season = getSeasonByMonth(month);

  const year = date.getFullYear();
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}年${month}月${date.getDate()}日(${dowStr})`;

  const trafficLevel = calcTrafficLevel(date, Boolean(holidayName), isWeekend, month);
  const trafficConfig = TRAFFIC_LEVELS[trafficLevel - 1] ?? TRAFFIC_LEVELS[2];

  const trafficLabel = `混雑予想: ${trafficConfig.label}`;

  return {
    dateStr,
    isHoliday,
    holidayName: holidayName ?? undefined,
    season,
    trafficLevel,
    trafficLabel,
    trafficColor: trafficConfig.color,
    dow: dowStr,
    isWeekend,
  };
}

/**
 * Format minutes to human-readable duration string
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/**
 * Check if a date string is today
 */
export function isToday(dateStr: string): boolean {
  return dateStr === toDS(new Date());
}

/**
 * Get relative time string (e.g. "3時間前", "昨日")
 */
export function getRelativeTime(isoDateStr: string): string {
  const now = new Date();
  const date = new Date(isoDateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  if (diffHour < 24) return `${diffHour}時間前`;
  if (diffDay < 7) return `${diffDay}日前`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}週間前`;
  return `${Math.floor(diffDay / 30)}ヶ月前`;
}
