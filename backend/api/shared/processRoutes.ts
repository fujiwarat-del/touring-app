/**
 * processRoutes.ts
 * AI レスポンス → Route[] への変換・フィルタリング共通ロジック
 * claude.ts / compare.ts 両方で使用する
 */

import type { Route, WaypointObject } from './types';
import type { GenerateRouteRequest } from './types';

// WaypointObject に準じる緩い型（AI が生成するため name は optional）
export type WaypointLike = { lat: number; lng: number; [key: string]: any };

// ============================================================
// avgSpeed 計算（promptBuilder.ts と必ず同じロジックを保つこと）
// ============================================================
export function calcAvgSpeed(
  bikeType: string,
  emptyRoadMode: boolean,
  preferences: string[],
  purposes: string[]
): number {
  if (bikeType === '小型125cc以下') return 28;
  if (bikeType === 'オフロード')     return 20;
  if (emptyRoadMode)                return 28;
  if (preferences.includes('高速使わない')) return 30;
  if (preferences.includes('峠道'))         return 30;
  if (['ワインディング', '林道', '農道'].some(p => purposes.includes(p))) return 33;
  return 50;
}

// ============================================================
// Haversine 距離計算（km）
// ============================================================
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// 座標が日本の陸地エリア内か粗く判定（海上・架空座標除外）
// ============================================================
export function isCoordinateOnJapanLand(lat: number, lng: number): boolean {
  const latStr = lat.toFixed(7);
  const lngStr = lng.toFixed(7);
  const latTrail = latStr.replace(/.*\./, '');
  const lngTrail = lngStr.replace(/.*\./, '');
  if (latTrail.endsWith('0000') && lngTrail.endsWith('0000')) return false;

  const regions = [
    [24.0, 28.5, 122.9, 131.5], // 沖縄・先島
    [27.0, 30.5, 129.0, 130.5], // 奄美・トカラ
    [30.9, 34.2, 129.0, 132.0], // 九州
    [33.9, 34.8, 129.1, 129.8], // 対馬・壱岐
    [32.5, 34.3, 132.0, 134.9], // 四国
    [33.0, 36.5, 130.5, 136.5], // 中国・近畿西部
    [34.0, 36.0, 135.0, 138.5], // 近畿・東海
    [35.5, 37.0, 136.5, 138.5], // 中部内陸
    [36.5, 37.6, 136.5, 137.4], // 能登半島
    [35.0, 36.5, 138.5, 140.0], // 関東内陸・神奈川・東京
    [35.0, 35.8, 139.7, 140.9], // 房総半島
    [35.7, 36.8, 139.8, 140.8], // 茨城・千葉北部
    [36.8, 40.5, 140.0, 141.8], // 東北（太平洋側）
    [40.4, 41.6, 140.0, 141.5], // 東北（青森）
    [37.0, 41.6, 138.5, 140.5], // 東北（日本海側）
    [41.2, 45.6, 139.5, 145.8], // 北海道
    [29.0, 35.5, 138.5, 140.2], // 伊豆諸島
  ] as const;

  for (const [minLat, maxLat, minLng, maxLng] of regions) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return true;
  }
  return false;
}

// ============================================================
// 経由地の訪問順序を最適化（2-opt 法）
// ============================================================
export function optimizeWaypointOrder<T extends { lat: number; lng: number }>(waypoints: T[]): T[] {
  if (waypoints.length <= 3) return waypoints;

  const origin = waypoints[0];
  const dest = waypoints[waypoints.length - 1];
  let intermediates = waypoints.slice(1, -1);
  if (intermediates.length <= 1) return waypoints;

  // Step1: 最近傍法で初期順序
  const visited = new Array(intermediates.length).fill(false);
  const ordered: T[] = [];
  let current: { lat: number; lng: number } = origin;

  for (let i = 0; i < intermediates.length; i++) {
    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let j = 0; j < intermediates.length; j++) {
      if (visited[j]) continue;
      const d = haversineKm(current.lat, current.lng, intermediates[j].lat, intermediates[j].lng);
      if (d < nearestDist) { nearestDist = d; nearestIdx = j; }
    }
    visited[nearestIdx] = true;
    ordered.push(intermediates[nearestIdx]);
    current = intermediates[nearestIdx];
  }
  intermediates = ordered;

  // Step2: 2-opt 改善
  const totalDist = (arr: T[]) => {
    let d = haversineKm(origin.lat, origin.lng, arr[0].lat, arr[0].lng);
    for (let i = 0; i < arr.length - 1; i++) {
      d += haversineKm(arr[i].lat, arr[i].lng, arr[i + 1].lat, arr[i + 1].lng);
    }
    d += haversineKm(arr[arr.length - 1].lat, arr[arr.length - 1].lng, dest.lat, dest.lng);
    return d;
  };

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < intermediates.length - 1; i++) {
      for (let j = i + 1; j < intermediates.length; j++) {
        const next = [...intermediates];
        next.splice(i, j - i + 1, ...intermediates.slice(i, j + 1).reverse());
        if (totalDist(next) < totalDist(intermediates) - 0.1) {
          intermediates = next;
          improved = true;
        }
      }
    }
  }

  return [origin, ...intermediates, dest];
}

// ============================================================
// 大きな寄り道になる中間経由地を除去
// ============================================================
export function removeMajorDetours(waypoints: WaypointLike[], maxDetourFactor = 2.0): WaypointLike[] {
  if (waypoints.length <= 2) return waypoints;

  const result: WaypointLike[] = [waypoints[0]];

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    const directDist = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
    const viaDist =
      haversineKm(prev.lat, prev.lng, curr.lat, curr.lng) +
      haversineKm(curr.lat, curr.lng, next.lat, next.lng);

    if (directDist < 1 || viaDist / directDist <= maxDetourFactor) {
      result.push(curr);
    }
  }

  result.push(waypoints[waypoints.length - 1]);
  return result;
}

// ============================================================
// 出発地から遠すぎる経由地を除去
// ============================================================
export function filterWaypoints(
  waypoints: WaypointLike[],
  maxRadiusKm: number,
  maxTotalKm: number
): WaypointLike[] {
  if (waypoints.length <= 1) return waypoints;

  const origin = waypoints[0];

  const applyFilter = (radiusKm: number) => {
    const res: WaypointLike[] = [origin];
    let totalKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const fromOrigin = haversineKm(origin.lat, origin.lng, wp.lat, wp.lng);
      const fromPrev = haversineKm(res[res.length - 1].lat, res[res.length - 1].lng, wp.lat, wp.lng);
      if (fromOrigin > radiusKm) continue;
      if (totalKm + fromPrev > maxTotalKm * 1.2) break;
      totalKm += fromPrev;
      res.push(wp);
    }
    return res;
  };

  let result = applyFilter(maxRadiusKm);

  if (result.length < 3 && waypoints.length >= 3) {
    const relaxed = applyFilter(maxRadiusKm * 1.6);
    if (relaxed.length >= 3) result = relaxed;
  }

  if (result.length < 3 && waypoints.length >= 3) {
    const intermediate = waypoints
      .slice(1, -1)
      .filter(wp => !result.includes(wp))
      .filter(wp => haversineKm(origin.lat, origin.lng, wp.lat, wp.lng) <= maxRadiusKm * 1.6)
      .sort((a, b) =>
        haversineKm(origin.lat, origin.lng, a.lat, a.lng) -
        haversineKm(origin.lat, origin.lng, b.lat, b.lng)
      )[0];
    if (intermediate) result.splice(result.length - 1, 0, intermediate);
  }

  if (result.length < 2) {
    const sorted = waypoints.slice(1)
      .filter(wp => haversineKm(origin.lat, origin.lng, wp.lat, wp.lng) <= maxRadiusKm * 2)
      .sort((a, b) =>
        haversineKm(origin.lat, origin.lng, a.lat, a.lng) -
        haversineKm(origin.lat, origin.lng, b.lat, b.lng)
      );
    if (sorted.length > 0) result.push(sorted[0]);
  }

  return result;
}

// ============================================================
// フェリー・徒歩ルート検出
// ============================================================
export const FERRY_KEYWORDS = [
  'フェリー', 'カーフェリー', 'フェリーボート',
  '乗船', '渡航', '船便', '船で渡', '船に乗', '船を使',
  '旅客船', '高速船', '渡船', '連絡船',
  '航路', '海路', '海上',
  '竹芝桟橋', '竹芝港', '久里浜港', '金谷港', '浜金谷',
  '宮島口', '高松港', '宇野港', '稚内港', '小樽港',
  '青森港', '函館港', '苫小牧港', '大間港', '脇野沢',
  '佐渡汽船', '新潟港フェリー',
  '青函連絡', '津軽海峡', '伊豆大島', '三宅島', '八丈島',
  '佐渡島', '隠岐', '壱岐島', '対馬', '屋久島', '種子島',
  '奄美大島', '与論島', '沖永良部',
];
export const WALKING_KEYWORDS = [
  '徒歩', 'ハイキング', '登山', '遊歩道', '登山道',
  '山道を歩', '歩いて', '歩行', 'トレッキング', '山歩き',
  '徒歩で', '歩き', '登山口', 'ハイク', '山頂まで歩',
];

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

export function isFerryRoute(route: Partial<Route>): boolean {
  const texts = [
    String(route.name ?? ''), String(route.description ?? ''), String(route.caution ?? ''),
  ];
  const wps = Array.isArray(route.waypointObjects) ? route.waypointObjects : [];
  for (const wp of wps) {
    texts.push(String((wp as any).name ?? ''), String((wp as any).description ?? ''));
  }
  return texts.some(t => containsKeyword(t, FERRY_KEYWORDS));
}

export function isWalkingRoute(route: Partial<Route>): boolean {
  const texts = [
    String(route.name ?? ''), String(route.description ?? ''), String(route.caution ?? ''),
  ];
  const wps = Array.isArray(route.waypointObjects) ? route.waypointObjects : [];
  for (const wp of wps) {
    texts.push(String((wp as any).name ?? ''), String((wp as any).description ?? ''));
  }
  return texts.some(t => containsKeyword(t, WALKING_KEYWORDS));
}

// ============================================================
// AI レスポンス JSON パース（マークダウンコードブロック対応）
// ============================================================
export function parseJsonResponse(rawText: string): { routes: any[] } | null {
  // マークダウンコードブロック優先
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[1].trim()); } catch { /* fall through */ }
  }
  // 生 JSON 抽出
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    try { return JSON.parse(rawText.slice(jsonStart, jsonEnd + 1)); } catch { /* fall through */ }
  }
  return null;
}

// ============================================================
// ルート後処理メインパイプライン
// ============================================================
export function processRouteCandidates(
  rawRoutes: any[],
  routeRequest: GenerateRouteRequest
): Route[] {
  const avgSpeed = calcAvgSpeed(
    routeRequest.bikeType,
    routeRequest.emptyRoadMode,
    routeRequest.preferences,
    routeRequest.purposes
  );

  const isDistanceModeWp = routeRequest.planningMode === 'distance' && routeRequest.targetDistanceKm != null;
  const maxDistKm = isDistanceModeWp
    ? routeRequest.targetDistanceKm!
    : Math.round((routeRequest.duration / 60) * avgSpeed);

  const isOneWay = routeRequest.returnType === 'none';
  const maxRadiusKm = isOneWay
    ? Math.round(maxDistKm / 1.3)
    : Math.round(maxDistKm / 2);

  const routes: Route[] = (rawRoutes
    .slice(0, 3)
    .map((r: Partial<Route>): Route | null => {
      let wps: WaypointLike[] = Array.isArray(r.waypointObjects) ? [...r.waypointObjects] : [];

      // 出発地座標を実際の GPS 座標で上書き（AI の誤差修正）
      if (wps.length > 0) {
        wps[0] = { ...wps[0], lat: routeRequest.lat, lng: routeRequest.lng };
      }

      wps = filterWaypoints(wps, maxRadiusKm, maxDistKm);
      wps = removeMajorDetours(wps);

      // 海上・架空座標を除去（出発地は除外対象外）
      wps = wps.filter((wp, idx) => {
        if (idx === 0) return true;
        return isCoordinateOnJapanLand(wp.lat, wp.lng);
      });

      wps = optimizeWaypointOrder(wps);

      // 最終距離安全チェック
      if (wps.length >= 2) {
        const straightTotalKm = wps.slice(0, -1).reduce((sum, wp, i) =>
          sum + haversineKm(wp.lat, wp.lng, wps[i + 1].lat, wps[i + 1].lng), 0
        );
        if (straightTotalKm > maxDistKm * 3) return null;

        const maxFromOrigin = Math.max(...wps.slice(1).map(wp =>
          haversineKm(routeRequest.lat, routeRequest.lng, wp.lat, wp.lng)
        ));
        if (maxFromOrigin > maxRadiusKm * 3) return null;
      }

      if (isFerryRoute(r))   return null;
      if (isWalkingRoute(r)) return null;

      if (wps.length < 2) return null;
      if (wps.length === 2 && haversineKm(wps[0].lat, wps[0].lng, wps[1].lat, wps[1].lng) < 10) return null;

      // 目的地座標を上書き
      if (
        routeRequest.routeMode === 'destination' &&
        routeRequest.destinationLat != null &&
        routeRequest.destinationLng != null &&
        wps.length > 1
      ) {
        const last = wps[wps.length - 1];
        wps[wps.length - 1] = {
          ...last,
          lat: routeRequest.destinationLat,
          lng: routeRequest.destinationLng,
          name: routeRequest.destination ?? last.name,
        };
      }

      // 同道帰着処理
      if (routeRequest.returnType === 'same' && routeRequest.routeMode !== 'destination' && wps.length > 1) {
        wps[wps.length - 1] = {
          ...wps[0],
          name: wps[0].name ?? '出発地点（帰着）',
          type: 'destination' as const,
        };
      }

      return {
        name:            String(r.name ?? 'ルート'),
        congestion:      String(r.congestion ?? '中'),
        distance:        String(r.distance ?? '-'),
        time:            String(r.time ?? '-'),
        difficulty:      String(r.difficulty ?? '中級'),
        windingScore:    Math.min(5, Math.max(1, Number(r.windingScore) || 3)),
        sceneryScore:    Math.min(5, Math.max(1, Number(r.sceneryScore) || 3)),
        trafficScore:    Math.min(5, Math.max(1, Number(r.trafficScore) || 3)),
        difficultyScore: Math.min(5, Math.max(1, Number(r.difficultyScore) || 3)),
        type:            String(r.type ?? 'ツーリング'),
        description:     String(r.description ?? ''),
        caution:         String(r.caution ?? ''),
        waypointObjects: wps as WaypointObject[],
        highlightWaypoints: Array.isArray(r.highlightWaypoints) ? r.highlightWaypoints : [],
      };
    })
    .filter((r): r is Route => r !== null));

  return routes;
}

// ============================================================
// コスト見積もり（USD）
// ============================================================
const PRICING_USD_PER_M_TOKENS: Record<string, [number, number]> = {
  // [input, output] per 1M tokens
  // Claude (Anthropic)
  'claude-haiku-4-5':       [0.80,  4.00],
  'claude-haiku-4-6':       [0.80,  4.00],
  'claude-sonnet-4-5':      [3.00,  15.00],
  'claude-sonnet-4-6':      [3.00,  15.00],
  // Gemini 2.0 系
  'gemini-2.0-flash':       [0.10,  0.40],
  'gemini-2.0-flash-001':   [0.10,  0.40],
  'gemini-2.0-flash-lite':  [0.075, 0.30],
  'gemini-2.0-flash-lite-001': [0.075, 0.30],
  // Gemini 2.5 系（非Thinking モード）
  'gemini-2.5-flash':       [0.15,  0.60],
  'gemini-2.5-flash-lite':  [0.075, 0.30],
  'gemini-2.5-pro':         [1.25,  10.00],
  // エイリアス
  'gemini-flash-latest':    [0.15,  0.60],
  'gemini-pro-latest':      [1.25,  10.00],
  // OpenAI
  'gpt-4o-mini':            [0.15,  0.60],
  'gpt-4o':                 [2.50,  10.00],
};

export function estimateCostUSD(modelId: string, inputTokens: number, outputTokens: number): number {
  const [inPrice, outPrice] = PRICING_USD_PER_M_TOKENS[modelId] ?? [0, 0];
  return (inputTokens * inPrice + outputTokens * outPrice) / 1_000_000;
}
