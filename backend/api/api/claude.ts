import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from '../shared/promptBuilder';
import type { GenerateRouteRequest, Route } from '../shared/types';
import {
  getTrafficAwareRoute,
  formatDurationSec,
  formatDistanceM,
} from '../shared/googleMapsTraffic';

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
  waypoints: { lat: number; lng: number; [key: string]: any }[],
  maxDetourFactor = 2.0
): typeof waypoints {
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
  waypoints: { lat: number; lng: number; [key: string]: any }[],
  maxRadiusKm: number,
  maxTotalKm: number
): typeof waypoints {
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

  // さらに中間地点が0の場合 → 元の経由地リストから中間点に最も近いものを1つ挿入
  if (result.length < 3 && waypoints.length >= 3) {
    const dest = result[result.length - 1];
    const midLat = (origin.lat + dest.lat) / 2;
    const midLng = (origin.lng + dest.lng) / 2;
    const intermediate = waypoints
      .slice(1, -1) // 出発地・目的地を除く中間地点
      .filter(wp => !result.includes(wp))
      .sort((a, b) =>
        haversineKm(midLat, midLng, a.lat, a.lng) -
        haversineKm(midLat, midLng, b.lat, b.lng)
      )[0];
    if (intermediate) {
      result.splice(result.length - 1, 0, intermediate);
    }
  }

  // 最低でも出発地＋目的地の2点は確保
  if (result.length < 2) {
    const sorted = waypoints.slice(1).sort((a, b) =>
      haversineKm(origin.lat, origin.lng, a.lat, a.lng) -
      haversineKm(origin.lat, origin.lng, b.lat, b.lng)
    );
    result.push(sorted[0]);
  }

  return result;
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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    const prompt = buildPrompt(routeRequest);

    // Call Claude API with claude-sonnet-4-6
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: `あなたはバイクツーリング専門のルート提案AIです。
日本の道路・観光地・ツーリングスポットに精通しており、
安全で楽しいルートを提案することが得意です。
必ず指定されたJSON形式のみを返してください。前後の説明文は不要です。`,
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
    const routes: Route[] = (parsedData.routes
      .slice(0, 3) // Max 3 routes
      .map((r: Partial<Route>): Route | null => {
        // waypointObjects のフィルタ処理
        let wps = Array.isArray(r.waypointObjects) ? [...r.waypointObjects] : [];
        // Override first waypoint coords with actual GPS to prevent drift
        if (wps.length > 0) {
          wps[0] = { ...wps[0], lat: routeRequest.lat, lng: routeRequest.lng };
        }
        // 出発地から遠すぎる経由地・目的地を除去
        const avgSpeed = routeRequest.emptyRoadMode ? 28 : 55;
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
        // 海上・架空座標を除去（出発地=実GPS座標は除外対象外）
        wps = wps.filter((wp, idx) => {
          if (idx === 0) return true; // 出発地は実GPS座標なので除外しない
          const valid = isCoordinateOnJapanLand(wp.lat, wp.lng);
          if (!valid) console.warn(`[Route] Removed invalid coord waypoint: ${wp.name ?? '?'} (${wp.lat}, ${wp.lng})`);
          return valid;
        });
        // フィルタ後に経由地が2点以下 or 出発地≒着地（中間なし）は崩壊ルートとして除外
        if (wps.length < 2) {
          console.warn(`[Route] "${r.name}" — no waypoints left, skipping`);
          return null;
        }
        if (wps.length === 2 && haversineKm(wps[0].lat, wps[0].lng, wps[1].lat, wps[1].lng) < 10) {
          console.warn(`[Route] "${r.name}" — start≈end with no intermediates (${haversineKm(wps[0].lat, wps[0].lng, wps[1].lat, wps[1].lng).toFixed(1)}km), skipping`);
          return null;
        }
        // 目的地座標が確定済みの場合 → 最終 waypoint の座標を上書き（Claude の誤座標を修正）
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
          };
        }
        // For same-road return, force last waypoint to match start
        if (routeRequest.returnType === 'same' && wps.length > 1) {
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
          waypointObjects: wps,
          highlightWaypoints: Array.isArray(r.highlightWaypoints) ? r.highlightWaypoints : [],
        };
      })
      .filter((r): r is Route => r !== null));

    // ── Google Maps でリアルタイム渋滞情報を付加 ──────────────
    // API キーが設定されている場合のみ実行（設定なしでも動作する）
    const enrichedRoutes = await Promise.all(
      routes.map(async (route) => {
        const wps = route.waypointObjects;
        if (!wps || wps.length < 2) return route;

        // Claude が生成した順序のまま渡す（greedy sort はかえって非効率になるため削除）
        const traffic = await getTrafficAwareRoute(
          wps.map((wp) => ({ lat: wp.lat, lng: wp.lng }))
        );

        if (!traffic) return route; // API未設定 or エラー → 元のまま

        const isDistanceMode = routeRequest.planningMode === 'distance' && routeRequest.targetDistanceKm != null;
        const avgSpeedKmh = routeRequest.emptyRoadMode ? 28 : 55;
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

        return {
          ...route,
          time: formatDurationSec(traffic.durationWithTrafficSeconds),
          distance: formatDistanceM(traffic.distanceMeters),
          congestion: overMinutes >= 30 ? '高' : traffic.congestion,
          caution: updatedCaution,
          distanceVerified: true, // Google Maps Routes API で検証済み
        };
      })
    );

    // 距離の短い順に並び替え（"約200km" → 200 として数値比較）
    const parseDistanceKm = (distStr: string): number => {
      const m = distStr.replace(/[^0-9.]/g, '');
      return m ? parseFloat(m) : 9999;
    };
    const sortedRoutes = [...enrichedRoutes].sort(
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
      details: process.env.NODE_ENV === 'development' ? message : undefined,
    });
  }
}
