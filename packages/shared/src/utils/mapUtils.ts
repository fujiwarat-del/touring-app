// ============================================================
// Touring App - Map Utilities
// ============================================================

import type { WaypointObject, Route } from '../types/index';

/**
 * Build a Google Maps URL with waypoints
 *
 * 【URLフォーマットの選択理由】
 * - `maps/dir/?api=1&travelmode=driving` は前回使用した交通手段を引き継ぐことがある
 * - `maps.google.com/maps?dirflg=d` は「d=driving」を強制指定できるため徒歩モードになりにくい
 * - 座標（lat,lng）使用で AI 造語の地点名が見つからない問題を回避
 *
 * フォーマット: https://maps.google.com/maps?saddr=lat,lng&daddr=lat,lng+to:lat,lng&dirflg=d
 */
export function makeMapUrl(route: Route, startLat?: number, startLng?: number): string {
  const waypoints = route.waypointObjects;

  if (!waypoints || waypoints.length === 0) {
    if (startLat != null && startLng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${startLat},${startLng}`;
    }
    return 'https://www.google.com/maps';
  }

  if (waypoints.length === 1) {
    const wp = waypoints[0];
    return `https://www.google.com/maps/search/?api=1&query=${wp.lat},${wp.lng}`;
  }

  // 出発地：GPS座標（実際の現在地）を優先、なければ最初の経由地座標
  const origin = (startLat != null && startLng != null)
    ? `${startLat},${startLng}`
    : `${waypoints[0].lat},${waypoints[0].lng}`;

  // 目的地：最後の経由地
  const destination = waypoints[waypoints.length - 1];
  const destCoord = `${destination.lat},${destination.lng}`;

  // 中間経由地（最大8か所）
  const intermediateWps = (startLat != null && startLng != null
    ? waypoints.slice(1, -1)
    : waypoints.slice(0, -1)
  ).slice(0, 8);

  // daddr = 中間経由地 + 目的地 を "+to:" で結合
  // dirflg=d で車（ドライブ）モードを強制指定
  const allDests = [
    ...intermediateWps.map((wp) => `${wp.lat},${wp.lng}`),
    destCoord,
  ];
  const daddr = allDests.join('+to:');

  return `https://maps.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${daddr}&dirflg=d`;
}

/**
 * Build Google Maps URL for a single coordinate
 */
export function makeLocationUrl(lat: number, lng: number, label?: string): string {
  if (label) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}&query_place_id=`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Calculate approximate distance between two coordinates (Haversine formula)
 * Returns distance in km
 */
export function calcDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Get a bounding box for an array of waypoints
 */
export function getBoundingBox(waypoints: WaypointObject[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
} | null {
  if (!waypoints || waypoints.length === 0) return null;

  let minLat = waypoints[0].lat;
  let maxLat = waypoints[0].lat;
  let minLng = waypoints[0].lng;
  let maxLng = waypoints[0].lng;

  for (const wp of waypoints) {
    minLat = Math.min(minLat, wp.lat);
    maxLat = Math.max(maxLat, wp.lat);
    minLng = Math.min(minLng, wp.lng);
    maxLng = Math.max(maxLng, wp.lng);
  }

  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
}

/**
 * Format coordinates for display
 */
export function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}
