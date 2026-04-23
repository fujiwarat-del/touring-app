import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { buildPrompt } from '../shared/promptBuilder';
import type { GenerateRouteRequest, Route } from '../shared/types';

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
  if (!['none', 'loop', 'same'].includes(req.returnType as string)) return false;
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
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2048,
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
        waypointObjects: Array.isArray(r.waypointObjects) ? r.waypointObjects : [],
        highlightWaypoints: Array.isArray(r.highlightWaypoints) ? r.highlightWaypoints : [],
      }));

    res.status(200).json({
      routes,
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
