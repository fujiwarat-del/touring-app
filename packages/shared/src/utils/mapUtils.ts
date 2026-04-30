// ============================================================
// Touring App - Map Utilities
// ============================================================

import type { WaypointObject, Route } from '../types/index';

/**
 * 経由地を「地点名」で表現する（座標より精度が高い）
 * 名前がある場合は名前を使い、ない場合のみ座標にフォールバック
 */
function wpToString(wp: WaypointObject): string {
  if (wp.name && wp.name.trim().length > 0) {
    return wp.name.trim();
  }
  return `${wp.lat},${wp.lng}`;
}

/**
 * Build a Google Maps URL with waypoints
 * 経由地は座標ではなく地点名で渡すことで、海上・誤ルートを防ぐ
 */
export function makeMapUrl(route: Route, startLat?: number, startLng?: number): string {
  const waypoints = route.waypointObjects;

  if (!waypoints || waypoints.length === 0) {
    if (startLat && startLng) {
      return `https://www.google.com/maps/search/?api=1&query=${startLat},${startLng}`;
    }
    return 'https://www.google.com/maps';
  }

  if (waypoints.length === 1) {
    const wp = waypoints[0];
    const q = wp.name ? encodeURIComponent(wp.name) : `${wp.lat},${wp.lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  // 出発地：GPS座標（実際の現在地）を優先
  const origin = startLat && startLng
    ? `${startLat},${startLng}`
    : `${waypoints[0].lat},${waypoints[0].lng}`;

  // 目的地：地点名を優先
  const destination = waypoints[waypoints.length - 1];
  const destStr = wpToString(destination);

  // 中間経由地：地点名を優先（最大8か所）
  const intermediateWps = (startLat && startLng
    ? waypoints.slice(1, -1)
    : waypoints.slice(0, -1)
  ).slice(0, 8);

  const encodedWaypoints = intermediateWps
    .map((wp) => encodeURIComponent(wpToString(wp)))
    .join('%7C');

  const base = 'https://www.google.com/maps/dir/';
  const parts = [
    'api=1',
    `origin=${encodeURIComponent(origin)}`,
    `destination=${encodeURIComponent(destStr)}`,
    `travelmode=driving`,
  ];
  if (encodedWaypoints) {
    parts.push(`waypoints=${encodedWaypoints}`);
  }

  return `${base}?${parts.join('&')}`;
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
