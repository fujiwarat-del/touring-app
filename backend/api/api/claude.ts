import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from '../shared/promptBuilder';
import type { GenerateRouteRequest, Route, WaypointObject } from '../shared/types';
import {
  getTrafficAwareRoute,
  formatDurationSec,
  formatDistanceM,
} from '../shared/googleMapsTraffic';
import { getJarticCongestion } from '../shared/jarticTraffic';
import { snapPointsToRoads } from '../shared/snapToRoads';

// WaypointObject に準じる緩い型（name は AI が生成するため optional でも許容）
type WaypointLike = { lat: number; lng: number; [key: string]: any };

// ──────────────────────────────────────────────
// 座標が日本の陸地エリア内か粗く判定する
// 海上・架空座標（ゼロ埋め等）を除外するための簡易チェック
// ──────────────────────────────────────────────
function isCoordinateOnJapanLand(lat: number, lng: number): boolean {
  // ゼロ埋め架空座標チェック（例: 35.5000000 / 140.0000000）
  const latStr = lat.toFixed(7);
  const lngStr = lng.toFixed(7);
  const latTrail = latStr.replace(/.*\./, '');
  const lngTrail = lngStr.replace(/.*\./, '');
  if (latTrail.endsWith('0000') && lngTrail.endsWith('0000')) {
    console.warn(`[CoordCheck] Suspicious padded-zero coordinate: (${lat}, ${lng}) — discarding`);
    return false;
  }

  // 日本の主要陸地（粗いバウンディングボックス）
  // 複数領域の OR で判定
  // ※東端は各緯度帯の実際の海岸線を考慮して設定
  //   房総半島東岸: lat35.0-35.7 → lng最大~140.4-140.9
  //   茨城・福島沿岸: lat36-38 → lng最大~141.0-141.5
  const regions = [
    // 沖縄・先島
    [24.0, 28.5, 122.9, 131.5],
    // 奄美・トカラ
    [27.0, 30.5, 129.0, 130.5],
    // 九州
    [30.9, 34.2, 129.0, 132.0],
    // 対馬・壱岐
    [33.9, 34.8, 129.1, 129.8],
    // 四国
    [32.5, 34.3, 132.0, 134.9],
    // 中国・近畿西部（山陰含む）
    [33.0, 36.5, 130.5, 136.5],
    // 近畿・東海（東端は伊豆半島付近 lng138.5）
    [34.0, 36.0, 135.0, 138.5],
    // 中部内陸（飛騨高山・白川郷・乗鞍・上高地など）
    [35.5, 37.0, 136.5, 138.5],
    // 能登半島（石川県北部）
    [36.5, 37.6, 136.5, 137.4],
    // 関東内陸・神奈川・東京（東端は東京湾岸 lng140.0）
    [35.0, 36.5, 138.5, 140.0],
    // 房総半島（東端は旭・銚子付近 lng140.9）
    [35.0, 35.8, 139.7, 140.9],
    // 茨城・千葉北部（東端は鹿嶋付近 lng140.8）
    [35.7, 36.8, 139.8, 140.8],
    // 東北（太平洋側・宮城〜岩手: 東端 lng141.8）
    [36.8, 40.5, 140.0, 141.8],
    // 東北（青森: 東端 lng141.5）
    [40.4, 41.6, 140.0, 141.5],
    // 東北（日本海側）
    [37.0, 41.6, 138.5, 140.5],
    // 北海道（東端 lng145.8）
    [41.2, 45.6, 139.5, 145.8],
    // 伊豆諸島（八丈島等）
    [29.0, 35.5, 138.5, 140.2],
  ] as const;

  for (const [minLat, maxLat, minLng, maxLng] of regions) {
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      return true;
    }
  }

  console.warn(`[CoordCheck] Coordinate (${lat}, ${lng}) appears to be outside Japan land — discarding`);
  return false;
}

// ──────────────────────────────────────────────
// 経由地の訪問順序を最適化（2-opt 法）
// 出発地・着地固定、中間経由地の順序を最短距離になるよう並び替える
// ──────────────────────────────────────────────
function optimizeWaypointOrder<T extends { lat: number; lng: number }>(waypoints: T[]): T[] {
  if (waypoints.length <= 3) return waypoints; // 中間経由地0〜1点は最適化不要

  const origin = waypoints[0];
  const dest = waypoints[waypoints.length - 1];
  let intermediates = waypoints.slice(1, -1);

  if (intermediates.length <= 1) return waypoints;

  // ── Step1: 最近傍法で初期順序を作成 ──
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

  // ── Step2: 2-opt 改善 ──
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
        const before = totalDist(intermediates);
        // i〜j の区間を逆順に
        const next = [...intermediates];
        next.splice(i, j - i + 1, ...intermediates.slice(i, j + 1).reverse());
        if (totalDist(next) < before - 0.1) {
          intermediates = next;
          improved = true;
        }
      }
    }
  }

  return [origin, ...intermediates, dest];
}

// ──────────────────────────────────────────────
// Haversine 距離計算（km）
// ──────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 大きな寄り道になる中間経由地を除去する
 * prev→curr→next の距離が prev→next の直線距離の maxDetourFactor 倍を超える場合は除去
 * 例: B が全然違う方向にあり、A→B→C が A→C の 2 倍以上なら B を削除
 */
function removeMajorDetours(
  waypoints: WaypointLike[],
  maxDetourFactor = 2.0
): WaypointLike[] {
  if (waypoints.length <= 2) return waypoints;

  const result: typeof waypoints = [waypoints[0]];

  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = waypoints[i];
    const next = waypoints[i + 1];

    const directDist = haversineKm(prev.lat, prev.lng, next.lat, next.lng);
    const viaDist =
      haversineKm(prev.lat, prev.lng, curr.lat, curr.lng) +
      haversineKm(curr.lat, curr.lng, next.lat, next.lng);

    // 直線距離がほぼ0（prev と next が同一地点）の場合は通す
    if (directDist < 1 || viaDist / directDist <= maxDetourFactor) {
      result.push(curr);
    }
    // else: この経由地は大きな寄り道なのでスキップ
  }

  result.push(waypoints[waypoints.length - 1]);
  return result;
}

/**
 * 出発地から遠すぎる経由地・目的地を除去し、現実的なルートに絞り込む
 * - 全経由地（目的地含む）を maxRadiusKm でフィルタリング
 * - 直線合計距離が maxTotalKm を超えた時点で打ち切る
 * - フィルタ後に中間地点が0になった場合は緩和した半径で救済する
 */
function filterWaypoints(
  waypoints: WaypointLike[],
  maxRadiusKm: number,
  maxTotalKm: number
): WaypointLike[] {
  if (waypoints.length <= 1) return waypoints;

  const origin = waypoints[0];

  const applyFilter = (radiusKm: number) => {
    const res: typeof waypoints = [origin];
    let totalKm = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const fromOrigin = haversineKm(origin.lat, origin.lng, wp.lat, wp.lng);
      const fromPrev = haversineKm(
        res[res.length - 1].lat, res[res.length - 1].lng,
        wp.lat, wp.lng
      );
      if (fromOrigin > radiusKm) continue;
      if (totalKm + fromPrev > maxTotalKm * 1.2) break;
      totalKm += fromPrev;
      res.push(wp);
    }
    return res;
  };

  let result = applyFilter(maxRadiusKm);

  // 中間経由地が0になった場合（出発地+目的地だけ）→ 半径を1.6倍に緩和して再試行
  if (result.length < 3 && waypoints.length >= 3) {
    const relaxed = applyFilter(maxRadiusKm * 1.6);
    if (relaxed.length >= 3) {
      result = relaxed;
    }
  }

  // さらに中間地点が0の場合 → 半径内の経由地から最も近いものを1つ挿入
  // ※ 半径外の経由地は絶対に挿入しない（1700km先の離島が入り込むバグ防止）
  if (result.length < 3 && waypoints.length >= 3) {
    const intermediate = waypoints
      .slice(1, -1)
      .filter(wp => !result.includes(wp))
      .filter(wp => haversineKm(origin.lat, origin.lng, wp.lat, wp.lng) <= maxRadiusKm * 1.6) // 半径制限必須
      .sort((a, b) =>
        haversineKm(origin.lat, origin.lng, a.lat, a.lng) -
        haversineKm(origin.lat, origin.lng, b.lat, b.lng)
      )[0];
    if (intermediate) {
      result.splice(result.length - 1, 0, intermediate);
    }
  }

  // 最低でも出発地＋目的地の2点は確保
  // ※ 目的地も必ず半径内のものを選ぶ（遠すぎる目的地は最近傍に差し替え）
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
// フェリー使用ルートの検出・除外
// ============================================================

const FERRY_KEYWORDS = [
  // 直接的な呼称
  'フェリー', 'カーフェリー', 'フェリーボート',
  // 乗船・移動系
  '乗船', '渡航', '船便', '船で渡', '船に乗', '船を使',
  // 船種
  '旅客船', '高速船', '渡船', '連絡船',
  // 航路・海路
  '航路', '海路', '海上',
  // 主要フェリー港・桟橋
  '竹芝桟橋', '竹芝港', '久里浜港', '金谷港', '浜金谷',
  '宮島口', '高松港', '宇野港', '稚内港', '小樽港',
  '青森港', '函館港', '苫小牧港', '大間港', '脇野沢',
  '佐渡汽船', '新潟港フェリー',
  // 陸路不可の離島アクセス
  '青函連絡', '津軽海峡', '伊豆大島', '三宅島', '八丈島',
  '佐渡島', '隠岐', '壱岐島', '対馬', '屋久島', '種子島',
  '奄美大島', '与論島', '沖永良部',
];
const WALKING_KEYWORDS = ['徒歩', 'ハイキング', '登山', '遊歩道', '登山道', '山道を歩', '歩いて', '歩行'];

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.includes(kw));
}

function isFerryRoute(route: Partial<Route>): boolean {
  const texts = [
    String(route.name ?? ''),
    String(route.description ?? ''),
    String(route.caution ?? ''),
  ];
  const wps = Array.isArray(route.waypointObjects) ? route.waypointObjects : [];
  for (const wp of wps) {
    texts.push(String((wp as any).name ?? ''), String((wp as any).description ?? ''));
  }
  return texts.some(t => containsKeyword(t, FERRY_KEYWORDS));
}

function isWalkingRoute(route: Partial<Route>): boolean {
  const texts = [
    String(route.name ?? ''),
    String(route.description ?? ''),
    String(route.caution ?? ''),
  ];
  const wps = Array.isArray(route.waypointObjects) ? route.waypointObjects : [];
  for (const wp of wps) {
    texts.push(String((wp as any).name ?? ''), String((wp as any).description ?? ''));
  }
  return texts.some(t => containsKeyword(t, WALKING_KEYWORDS));
}

// ============================================================
// Rate limiting (in-memory, resets on cold start)
// For production, use Redis/Vercel KV for distributed rate limiting
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 10;          // requests per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

// ============================================================
// Input validation
// ============================================================

function validateRequest(body: unknown): body is GenerateRouteRequest {
  if (!body || typeof body !== 'object') return false;
  const req = body as Record<string, unknown>;

  if (typeof req.lat !== 'number' || typeof req.lng !== 'number') return false;
  if (typeof req.bikeType !== 'string') return false;
  if (!Array.isArray(req.purposes) || req.purposes.length === 0) return false;
  if (!Array.isArray(req.preferences)) return false;
  if (typeof req.duration !== 'number' || req.duration < 15 || req.duration > 720) return false;
  if (!['free', 'destination'].includes(req.routeMode as string)) return false;
  if (!['none', 'loop', 'same', 'different'].includes(req.returnType as string)) return false;
  if (typeof req.emptyRoadMode !== 'boolean') return false;
  if (!req.todayInfo || typeof req.todayInfo !== 'object') return false;

  // Validate coordinate bounds (Japan rough bounds)
  if (req.lat < 24 || req.lat > 46 || req.lng < 122 || req.lng > 154) return false;

  return true;
}

// ============================================================
// Claude API handler
// ============================================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// モデル設定
// 地理精度・JSON遵守を優先する場合は claude-sonnet-4-5 を推奨（コスト約5倍）
// CLAUDE_MODEL 環境変数で上書き可能
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-haiku-4-5';

// promptBuilder と同一ロジックで avgSpeed を計算するヘルパー
// （promtBuilder.ts と必ず同じ値を使うこと。片方だけ変えるとフィルターがズレる）
function calcAvgSpeed(
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-key');
    res.status(204).end();
    return;
  }

  // Method check
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // App key check（APP_API_KEY が設定されている場合のみ強制）
  // アプリ以外からの直叩きによるAPIコスト浪費を防ぐ
  const expectedAppKey = process.env.APP_API_KEY;
  if (expectedAppKey && req.headers['x-app-key'] !== expectedAppKey) {
    console.warn('[Auth] Rejected request without valid x-app-key');
    res.status(401).json({
      error: '認証エラーが発生しました。アプリを最新版に更新してください。',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  // Rate limiting
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown';

  if (isRateLimited(clientIp)) {
    res.status(429).json({
      error: 'リクエスト制限に達しました。しばらく待ってから再試行してください。',
      code: 'RATE_LIMITED',
    });
    return;
  }

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set');
    res.status(500).json({ error: 'サーバー設定エラーが発生しました', code: 'CONFIG_ERROR' });
    return;
  }

  // Parse & validate body
  const body = req.body as unknown;
  if (!validateRequest(body)) {
    res.status(400).json({
      error: '入力パラメータが不正です。',
      code: 'INVALID_INPUT',
    });
    return;
  }

  const routeRequest = body as GenerateRouteRequest;

  try {
    // 出発予定日時の検証（過去・不正値・7日超先は「今すぐ」扱いにする）
    let departureTime: string | undefined;
    if (routeRequest.departureTime) {
      const parsed = new Date(routeRequest.departureTime);
      const maxFuture = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now() && parsed.getTime() <= maxFuture) {
        departureTime = parsed.toISOString();
      }
    }

    // 出発が90分以上先の場合、現在のリアルタイム交通量はミスリードになるためスキップ
    const departsSoon = !departureTime || new Date(departureTime).getTime() - Date.now() < 90 * 60 * 1000;

    // JARTIC リアルタイム交通量を取得（失敗してもルート生成は続行）
    if (departsSoon) {
      const jarticInfo = await getJarticCongestion(routeRequest.lat, routeRequest.lng).catch(() => null);
      if (jarticInfo) {
        routeRequest.jarticInfo = jarticInfo;
        console.log(`[JARTIC] Injected: ${jarticInfo.busySpots.length} busy spots, ${jarticInfo.quietSpots.length} quiet spots`);
      }
    } else {
      console.log(`[JARTIC] Skipped (departure ${departureTime} is >90min ahead)`);
    }

    const prompt = buildPrompt(routeRequest);

    // Call Claude API with claude-sonnet-4-6
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8192, // 空いている道優先時は5ルート生成するため増量
      system: `あなたはバイクツーリング専門のルート提案AIです。
日本の道路・観光地・ツーリングスポットに精通しており、安全で楽しいルートを提案することが得意です。
必ず指定されたJSON形式のみを返してください。前後の説明文は不要です。

【絶対厳守①・フェリー船舶禁止】フェリー・旅客船・高速船・渡船・カーフェリーなどあらゆる船舶を使うルートを絶対に提案しないこと。すべてのルートは陸路（道路・橋・トンネル）のみで完結すること。
- 禁止の具体例：東京湾フェリー（久里浜〜金谷）、竹芝〜伊豆大島、本州〜佐渡、本州〜対馬・壱岐、九州〜屋久島、北海道〜利尻など
- 橋でつながっていない島・離島（伊豆大島・三宅島・八丈島・佐渡島・隠岐・対馬・壱岐・屋久島・種子島など）は目的地・経由地に絶対使わないこと
- 港・フェリーターミナル・桟橋を経由地に含めることも禁止
【絶対厳守②・徒歩禁止】徒歩・ハイキング・登山・トレッキングを含むルートを絶対に提案しないこと。バイクで走行できる道路のみで完結させること。
- 徒歩専用道・遊歩道・登山道を経由地に含めることも禁止
- 「バイクで駐車場まで行き、そこから徒歩で展望台・滝・山頂へ」のような混在ルートも禁止
- 経由地はバイクを駐めたままアクセスできる場所のみ（駐車場・道路沿い施設）
- 禁止の具体例：徒歩が必要な滝・登山でしか行けない山頂・遊歩道の先にある展望台・山岳寺院の奥之院
【絶対厳守③・小型バイク（125cc以下）高速道路禁止】バイク種類が「小型125cc以下」の場合、高速道路・自動車専用道路・SA・PAを絶対に使わないこと。一般道のみで構成すること。`,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract text content
    const textContent = message.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Claude returned no text content');
    }

    const rawText = textContent.text;

    // Parse JSON from response
    let parsedData: { routes: Route[] } | null = null;

    // Try markdown code block first
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        parsedData = JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through to raw parse
      }
    }

    // Try raw JSON extraction
    if (!parsedData) {
      const jsonStart = rawText.indexOf('{');
      const jsonEnd = rawText.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        try {
          parsedData = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
        } catch {
          // Fall through
        }
      }
    }

    if (!parsedData || !Array.isArray(parsedData.routes)) {
      console.error('Failed to parse Claude response:', rawText.slice(0, 500));
      throw new Error('Claude returned invalid JSON format');
    }

    // Validate and sanitize routes
    // 空いている道優先時は5本生成し、後段で実測混雑率により3本へ絞り込む
    const maxRoutes = routeRequest.emptyRoadMode ? 5 : 3;
    const routes: Route[] = (parsedData.routes
      .slice(0, maxRoutes)
      .map((r: Partial<Route>): Route | null => {
        // waypointObjects のフィルタ処理（処理中は WaypointLike として扱い、最後に WaypointObject[] へキャスト）
        let wps: WaypointLike[] = Array.isArray(r.waypointObjects) ? [...r.waypointObjects] : [];
        // Override first waypoint coords with actual GPS to prevent drift
        if (wps.length > 0) {
          wps[0] = { ...wps[0], lat: routeRequest.lat, lng: routeRequest.lng };
        }
        // 出発地から遠すぎる経由地・目的地を除去
        // avgSpeed は promptBuilder.ts の calcAvgSpeed と同一ロジックで計算（ズレ防止）
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
        // 片道(none)は全距離を一方向に使えるので道路係数1.3で割る
        // ループ・同道・別道帰着は往復なので半分
        const isOneWay = routeRequest.returnType === 'none';
        const maxRadiusKm = isOneWay
          ? Math.round(maxDistKm / 1.3)
          : Math.round(maxDistKm / 2);
        wps = filterWaypoints(wps, maxRadiusKm, maxDistKm);
        // 大きな寄り道になる中間経由地を除去（例: 北向きと東向きが混在する経由地）
        wps = removeMajorDetours(wps);
        // 海上・架空座標を除去（出発地=実GPS座標は除外対象外）※ 最適化の前に実施して無駄な計算を省く
        wps = wps.filter((wp, idx) => {
          if (idx === 0) return true; // 出発地は実GPS座標なので除外しない
          const valid = isCoordinateOnJapanLand(wp.lat, wp.lng);
          if (!valid) console.warn(`[Route] Removed invalid coord waypoint: ${wp.name ?? '?'} (${wp.lat}, ${wp.lng})`);
          return valid;
        });
        // 経由地の訪問順序を最適化（2-opt法で最短距離順に並び替え）※ 不正座標除去後に実施
        wps = optimizeWaypointOrder(wps);

        // ── 最終距離チェック：フィルタ後も経由地の合計直線距離が上限の3倍を超えたら除外 ──
        // フェリー・遠距離ルートがフォールバック処理をすり抜けた場合の安全網
        if (wps.length >= 2) {
          const straightTotalKm = wps.slice(0, -1).reduce((sum, wp, i) =>
            sum + haversineKm(wp.lat, wp.lng, wps[i + 1].lat, wps[i + 1].lng), 0
          );
          if (straightTotalKm > maxDistKm * 3) {
            console.warn(`[Route] "${r.name}" — straight-line total ${straightTotalKm.toFixed(0)}km far exceeds limit ${maxDistKm}km, skipping`);
            return null;
          }
          // 出発地から最遠ウェイポイントまでの直線距離チェック（半径 × 3 を超えたら除外）
          const maxFromOrigin = Math.max(...wps.slice(1).map(wp =>
            haversineKm(routeRequest.lat, routeRequest.lng, wp.lat, wp.lng)
          ));
          if (maxFromOrigin > maxRadiusKm * 3) {
            console.warn(`[Route] "${r.name}" — farthest waypoint ${maxFromOrigin.toFixed(0)}km from origin exceeds radius limit ${maxRadiusKm}km × 3, skipping`);
            return null;
          }
        }

        // フェリーを使うルートを除外
        if (isFerryRoute(r)) {
          console.warn(`[Route] "${r.name}" — ferry route detected, skipping`);
          return null;
        }
        // 徒歩・ハイキングを含むルートを除外
        if (isWalkingRoute(r)) {
          console.warn(`[Route] "${r.name}" — walking route detected, skipping`);
          return null;
        }
        // 小型125cc以下の場合：高速道路・ICを含む経由地を除去
        if (routeRequest.bikeType === '小型125cc以下') {
          const HIGHWAY_PATTERNS = /高速|自動車道|IC|JCT|SA|PA|サービスエリア|パーキングエリア|首都高|東名|名神|圏央|東関|常磐|関越|中央道|東北道|山陽|九州道|道央|道東|道北|札幌道/;
          const beforeLen = wps.length;
          wps = wps.filter((wp, idx) => {
            if (idx === 0) return true; // 出発地は除外しない
            const name = String((wp as any).name ?? '');
            if (HIGHWAY_PATTERNS.test(name)) {
              console.warn(`[Route] "${r.name}" — removed highway waypoint for 125cc: ${name}`);
              return false;
            }
            return true;
          });
          if (wps.length < beforeLen) {
            console.warn(`[Route] "${r.name}" — removed ${beforeLen - wps.length} highway waypoints for 125cc bike`);
          }
        }
        // フィルタ後に経由地が2点以下 or 出発地≒着地（中間なし）は崩壊ルートとして除外
        if (wps.length < 2) {
          console.warn(`[Route] "${r.name}" — no waypoints left, skipping`);
          return null;
        }
        if (wps.length === 2 && haversineKm(wps[0].lat, wps[0].lng, wps[1].lat, wps[1].lng) < 10) {
          console.warn(`[Route] "${r.name}" — start≈end with no intermediates (${haversineKm(wps[0].lat, wps[0].lng, wps[1].lat, wps[1].lng).toFixed(1)}km), skipping`);
          return null;
        }
        // 経由地が大量削除され、残距離が目標に大きく届かない「抜け殻ルート」を除外
        // （例: 日光200kmルートの遠方経由地が半径フィルタで全削除され、名前は日光のまま
        //   埼玉止まり25kmのルートが返るケース。名前・説明と実態が乖離するため出さない）
        const originalWpCount = Array.isArray(r.waypointObjects) ? r.waypointObjects.length : 0;
        if (originalWpCount >= 3) {
          const straightKm = wps.slice(0, -1).reduce((sum, wp, i) =>
            sum + haversineKm(wp.lat, wp.lng, wps[i + 1].lat, wps[i + 1].lng), 0);
          const estimatedRoadKm = straightKm * 1.3; // 道路係数
          const removedRatio = 1 - wps.length / originalWpCount;
          if (removedRatio >= 0.5 && estimatedRoadKm < maxDistKm * 0.4) {
            console.warn(`[Route] "${r.name}" — collapsed after filtering (${originalWpCount}→${wps.length} wps, ~${Math.round(estimatedRoadKm)}km vs target ${maxDistKm}km), skipping`);
            return null;
          }
        }
        // 目的地座標が確定済みの場合 → 最終 waypoint の座標・名前を上書き（Claude の誤座標・誤名称を修正）
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
        // For same-road return, force last waypoint to match start
        // destination モードでは目的地が優先されるため、折り返し処理は行わない
        if (routeRequest.returnType === 'same' && routeRequest.routeMode !== 'destination' && wps.length > 1) {
          wps[wps.length - 1] = {
            ...wps[0],
            name: wps[0].name ?? '出発地点（帰着）',
            type: 'destination' as const,
          };
        }

        return {
          name: String(r.name ?? 'ルート'),
          congestion: String(r.congestion ?? '中'),
          distance: String(r.distance ?? '-'),
          time: String(r.time ?? '-'),
          difficulty: String(r.difficulty ?? '中級'),
          windingScore: Math.min(5, Math.max(1, Number(r.windingScore) || 3)),
          sceneryScore: Math.min(5, Math.max(1, Number(r.sceneryScore) || 3)),
          trafficScore: Math.min(5, Math.max(1, Number(r.trafficScore) || 3)),
          difficultyScore: Math.min(5, Math.max(1, Number(r.difficultyScore) || 3)),
          type: String(r.type ?? 'ツーリング'),
          description: String(r.description ?? ''),
          caution: String(r.caution ?? ''),
          waypointObjects: wps as WaypointObject[],
          highlightWaypoints: Array.isArray(r.highlightWaypoints) ? r.highlightWaypoints : [],
        };
      })
      .filter((r): r is Route => r !== null));

    // 全ルートがフィルタで除外された場合はエラーを返す（アプリ側で再試行を促す）
    if (routes.length === 0) {
      console.warn('[Route] All generated routes were filtered out — returning error for retry');
      throw new Error('All generated routes were filtered out');
    }

    // ── 経由地座標を最寄りの道路上にスナップ（Google Roads API） ──
    // AI座標が道路から外れていると Google Maps が徒歩モードにフォール
    // バックするため、全ルートの経由地を1回のAPIコールでまとめて補正する
    try {
      const allPoints = routes.flatMap((r) =>
        r.waypointObjects.map((wp) => ({ lat: wp.lat, lng: wp.lng }))
      );
      const snapped = await snapPointsToRoads(allPoints);
      if (snapped) {
        let idx = 0;
        for (const r of routes) {
          r.waypointObjects = r.waypointObjects.map((wp) => {
            const s = snapped[idx++];
            return s ? { ...wp, lat: s.lat, lng: s.lng } : wp;
          });
        }
      }
    } catch (e: any) {
      console.warn('[SnapToRoads] Skipped due to error:', e?.message);
    }

    // ── Google Maps でリアルタイム渋滞情報を付加 ──────────────
    // API キーが設定されている場合のみ実行（設定なしでも動作する）
    const enrichedRoutes = await Promise.all(
      routes.map(async (route) => {
        const wps = route.waypointObjects;
        if (!wps || wps.length < 2) return route;

        // Claude が生成した順序のまま渡す（greedy sort はかえって非効率になるため削除）
        // departureTime 指定時は Google の予測渋滞（過去データベース）で計算される
        const traffic = await getTrafficAwareRoute(
          wps.map((wp) => ({ lat: wp.lat, lng: wp.lng })),
          departureTime
        );

        if (!traffic) return route; // API未設定 or エラー → 元のまま

        const isDistanceMode = routeRequest.planningMode === 'distance' && routeRequest.targetDistanceKm != null;
        const avgSpeedKmh = calcAvgSpeed(
          routeRequest.bikeType,
          routeRequest.emptyRoadMode,
          routeRequest.preferences,
          routeRequest.purposes
        );
        const expectedKm = isDistanceMode
          ? routeRequest.targetDistanceKm!
          : Math.round((routeRequest.duration / 60) * avgSpeedKmh);
        const actualMinutes = Math.round(traffic.durationWithTrafficSeconds / 60);
        const actualKm = Math.round(traffic.distanceMeters / 1000);

        // Google Maps の距離が期待値の 2.5 倍超は異常値とみなし採用しない
        if (actualKm > expectedKm * 2.5) {
          console.warn(`[GoogleMaps] Abnormal distance: ${actualKm}km vs expected ${expectedKm}km — skipping enrichment`);
          return route;
        }

        // 注意事項を構築
        const notes: string[] = [];
        let overMinutes = 0; // 時間モードでのオーバー分数（ブロック外から参照するためここで宣言）

        if (isDistanceMode) {
          // 距離モード：指定距離との差を確認（±50km以内）
          const targetKm = routeRequest.targetDistanceKm!;
          const diffKm = Math.abs(actualKm - targetKm);
          if (diffKm > 50) {
            notes.push(`⚠️ このルートの実際の距離は約${actualKm}kmです。指定距離（${targetKm}km）と約${diffKm}kmの差があります。`);
          } else if (traffic.delayMinutes >= 5) {
            notes.push(`⚠️ 現在の渋滞により通常より約${traffic.delayMinutes}分多くかかる見込みです。`);
          } else if (traffic.congestion === '低') {
            notes.push('✅ 現在の交通状況は良好です。');
          }
        } else {
          // 時間モード：指定時間との差を確認（±30分以内）
          const requestedMinutes = routeRequest.duration;
          overMinutes = actualMinutes - requestedMinutes;
          if (overMinutes >= 30) {
            notes.push(`⚠️ このルートの実際の所要時間は約${actualMinutes}分です。指定時間（${requestedMinutes}分）より約${overMinutes}分多くかかります。`);
          } else if (traffic.delayMinutes >= 5) {
            notes.push(`⚠️ 現在の渋滞により通常より約${traffic.delayMinutes}分多くかかる見込みです。`);
          } else if (traffic.congestion === '低') {
            notes.push('✅ 現在の交通状況は良好です。');
          }
        }

        if (route.caution) notes.unshift(route.caution);
        const updatedCaution = notes.join('\n');

        // 混雑率（渋滞込み時間 ÷ 通常時間）。空いている道優先時の選別に使う
        const trafficRatio =
          traffic.durationSeconds > 0
            ? traffic.durationWithTrafficSeconds / traffic.durationSeconds
            : undefined;

        return {
          ...route,
          time: formatDurationSec(traffic.durationWithTrafficSeconds),
          distance: formatDistanceM(traffic.distanceMeters),
          congestion: overMinutes >= 30 ? '高' : traffic.congestion,
          caution: updatedCaution,
          distanceVerified: true, // Google Maps Routes API で検証済み
          trafficRatio,
        };
      })
    );

    // ── 空いている道優先: Google実測の混雑率が低い順に上位3本へ絞り込む ──
    // AIの推測ではなく実測値でルートを選別する（5本生成 → 3本厳選）
    let selectedRoutes = enrichedRoutes;
    if (routeRequest.emptyRoadMode && enrichedRoutes.length > 3) {
      selectedRoutes = [...enrichedRoutes]
        .sort((a, b) => (a.trafficRatio ?? 99) - (b.trafficRatio ?? 99))
        .slice(0, 3);
      const dropped = enrichedRoutes
        .filter((r) => !selectedRoutes.includes(r))
        .map((r) => `${r.name}(ratio=${r.trafficRatio?.toFixed(2) ?? '-'})`);
      console.log(`[EmptyRoad] Selected 3 of ${enrichedRoutes.length} by traffic ratio. Dropped: ${dropped.join(', ')}`);
    }

    // 距離の短い順に並び替え（"約200km" → 200 として数値比較）
    const parseDistanceKm = (distStr: string): number => {
      const m = distStr.replace(/[^0-9.]/g, '');
      return m ? parseFloat(m) : 9999;
    };
    const sortedRoutes = [...selectedRoutes].sort(
      (a, b) => parseDistanceKm(a.distance) - parseDistanceKm(b.distance)
    );

    res.status(200).json({
      routes: sortedRoutes,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error('Claude API error:', err);

    if (err instanceof Anthropic.APIError) {
      if (err.status === 429) {
        res.status(429).json({
          error: 'AI APIの利用制限に達しました。しばらく後でお試しください。',
          code: 'AI_RATE_LIMITED',
        });
        return;
      }
      if (err.status === 401) {
        res.status(500).json({
          error: 'AI API認証エラーが発生しました。',
          code: 'AI_AUTH_ERROR',
        });
        return;
      }
    }

    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({
      error: 'ルート生成中にエラーが発生しました。しばらく後でお試しください。',
      code: 'GENERATION_ERROR',
      details: process.env.NODE_ENV === 'development' || process.env.DEBUG_ERRORS === '1' ? message : undefined,
    });
  }
}
