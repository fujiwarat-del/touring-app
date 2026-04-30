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
    const routes: Route[] = parsedData.routes
      .slice(0, 3) // Max 3 routes
      .map((r: Partial<Route>) => ({
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
        waypointObjects: (() => {
          let wps = Array.isArray(r.waypointObjects) ? [...r.waypointObjects] : [];
          // Override first waypoint coords with actual GPS to prevent drift
          if (wps.length > 0) {
            wps[0] = { ...wps[0], lat: routeRequest.lat, lng: routeRequest.lng };
          }
          // 出発地から遠すぎる経由地・目的地を除去
          const avgSpeed = routeRequest.emptyRoadMode ? 28 : 55;
          const isDistanceMode = routeRequest.planningMode === 'distance' && routeRequest.targetDistanceKm != null;
          const maxDistKm = isDistanceMode
            ? routeRequest.targetDistanceKm!
            : Math.round((routeRequest.duration / 60) * avgSpeed);
          const maxRadiusKm = Math.round(maxDistKm / 2);
          wps = filterWaypoints(wps, maxRadiusKm, maxDistKm);
          // For same-road return, force last waypoint to match start
          if (routeRequest.returnType === 'same' && wps.length > 1) {
            wps[wps.length - 1] = {
              ...wps[0],
              name: wps[0].name ?? '出発地点（帰着）',
              type: 'destination' as const,
            };
          }
          return wps;
        })(),
        highlightWaypoints: Array.isArray(r.highlightWaypoints) ? r.highlightWaypoints : [],
      }));

    // ── Google Maps でリアルタイム渋滞情報を付加 ──────────────
    // API キーが設定されている場合のみ実行（設定なしでも動作する）
    const enrichedRoutes = await Promise.all(
      routes.map(async (route) => {
        const wps = route.waypointObjects;
        if (!wps || wps.length < 2) return route;

        const traffic = await getTrafficAwareRoute(
          wps.map((wp) => ({ lat: wp.lat, lng: wp.lng }))
        );

        if (!traffic) return route; // API未設定 or エラー → 元のまま

        const isDistanceMode = routeRequest.planningMode === 'distance' && routeRequest.targetDistanceKm != null;
        const actualMinutes = Math.round(traffic.durationWithTrafficSeconds / 60);
        const actualKm = Math.round(traffic.distanceMeters / 1000);

        // 注意事項を構築
        const notes: string[] = [];

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
          const overMinutes = actualMinutes - requestedMinutes;
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

    res.status(200).json({
      routes: enrichedRoutes,
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
