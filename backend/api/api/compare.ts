/**
 * /api/compare
 *
 * 複数の AI プロバイダーに同じプロンプトを並列送信し、
 * ルート品質・速度・コストを比較するためのエンドポイント。
 *
 * リクエスト: /api/claude と同じ形式（GenerateRouteRequest）
 * レスポンス: 各プロバイダーの結果・レイテンシ・コスト見積もりを含む比較オブジェクト
 *
 * 設定:
 *   ANTHROPIC_API_KEY  … Claude 有効化
 *   GEMINI_API_KEY     … Gemini 有効化
 *   COMPARE_PROVIDERS  … カンマ区切りで有効にするプロバイダーを指定（省略=全て）
 *                         例: "claude-haiku-4-5,gemini-1.5-flash"
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildPrompt } from '../shared/promptBuilder';
import type { GenerateRouteRequest, Route } from '../shared/types';
import {
  parseJsonResponse,
  processRouteCandidates,
  estimateCostUSD,
} from '../shared/processRoutes';

// ============================================================
// 型定義
// ============================================================

interface ProviderResult {
  provider: string;          // モデルID (例: "gemini-1.5-flash")
  label: string;             // 表示名 (例: "Gemini 1.5 Flash")
  routes: Route[];
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  estimatedCostUSD: number;
  estimatedCostJPY: number;  // 1 USD = 150 JPY 換算
  rawResponsePreview: string; // デバッグ用（先頭 300 文字）
  error: string | null;
}

interface CompareResponse {
  results: ProviderResult[];
  promptPreview: string;     // 使用したプロンプト（先頭 500 文字）
  generatedAt: string;
}

// ============================================================
// プロバイダー定義
// ============================================================

const USD_TO_JPY = 150;

const ALL_PROVIDERS: Array<{
  id: string;
  label: string;
  vendor: 'anthropic' | 'gemini';
  requiresEnv: string;
}> = [
  { id: 'claude-haiku-4-5',    label: 'Claude Haiku 4.5 (現在の安価設定)',    vendor: 'anthropic', requiresEnv: 'ANTHROPIC_API_KEY' },
  { id: 'claude-sonnet-4-5',   label: 'Claude Sonnet 4.5 (現在の高精度設定)', vendor: 'anthropic', requiresEnv: 'ANTHROPIC_API_KEY' },
  { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite (最安値候補)',   vendor: 'gemini',    requiresEnv: 'GEMINI_API_KEY' },
  { id: 'gemini-2.5-flash',    label: 'Gemini 2.5 Flash (最新・高性能)',       vendor: 'gemini',    requiresEnv: 'GEMINI_API_KEY' },
  { id: 'gemini-2.5-pro',      label: 'Gemini 2.5 Pro (最高品質)',             vendor: 'gemini',    requiresEnv: 'GEMINI_API_KEY' },
];

// ============================================================
// システムプロンプト（Claude・Gemini 共通）
// ============================================================

const SYSTEM_PROMPT = `あなたはバイクツーリング専門のルート提案AIです。
日本の道路・観光地・ツーリングスポットに精通しており、安全で楽しいルートを提案することが得意です。
必ず指定されたJSON形式のみを返してください。前後の説明文は不要です。

【絶対厳守①・フェリー船舶禁止】フェリー・旅客船・高速船・渡船・カーフェリーなどあらゆる船舶を使うルートを絶対に提案しないこと。すべてのルートは陸路（道路・橋・トンネル）のみで完結すること。
- 禁止の具体例：東京湾フェリー（久里浜〜金谷）、竹芝〜伊豆大島、本州〜佐渡、本州〜対馬・壱岐、九州〜屋久島、北海道〜利尻など
- 橋でつながっていない島・離島は目的地・経由地に絶対使わないこと
【絶対厳守②・徒歩禁止】徒歩・ハイキング・登山を含むルートを絶対に提案しないこと。バイクで走行できる道路のみで完結させること。`;

// ============================================================
// Claude 呼び出し
// ============================================================

async function callClaude(
  modelId: string,
  label: string,
  prompt: string,
  routeRequest: GenerateRouteRequest,
  anthropic: Anthropic
): Promise<ProviderResult> {
  const startMs = Date.now();
  try {
    const message = await anthropic.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const latencyMs = Date.now() - startMs;
    const textContent = message.content.find(c => c.type === 'text');
    const rawText = textContent?.type === 'text' ? textContent.text : '';

    const parsed = parseJsonResponse(rawText);
    const routes = parsed?.routes
      ? processRouteCandidates(parsed.routes, routeRequest)
      : [];

    const inputTokens  = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const costUSD = estimateCostUSD(modelId, inputTokens, outputTokens);

    return {
      provider: modelId,
      label,
      routes,
      latencyMs,
      usage: { inputTokens, outputTokens },
      estimatedCostUSD: costUSD,
      estimatedCostJPY: Math.round(costUSD * USD_TO_JPY * 100) / 100,
      rawResponsePreview: rawText.slice(0, 300),
      error: routes.length === 0 && !parsed ? 'JSON解析失敗' : null,
    };
  } catch (err: any) {
    return {
      provider: modelId, label, routes: [], latencyMs: Date.now() - startMs,
      usage: { inputTokens: 0, outputTokens: 0 },
      estimatedCostUSD: 0, estimatedCostJPY: 0,
      rawResponsePreview: '',
      error: err?.message ?? 'Unknown error',
    };
  }
}

// ============================================================
// Gemini 呼び出し
// ============================================================

async function callGemini(
  modelId: string,
  label: string,
  prompt: string,
  routeRequest: GenerateRouteRequest,
  genai: GoogleGenerativeAI
): Promise<ProviderResult> {
  const startMs = Date.now();
  try {
    // Gemini 2.5+ は thinking モードがデフォルト ON
    // thinking トークンが大量消費されて本文 JSON が途切れるため thinkingBudget: 0 で無効化
    const is25Plus = modelId.startsWith('gemini-2.5') || modelId.startsWith('gemini-flash-latest') || modelId.startsWith('gemini-pro-latest');
    const generationConfig: Record<string, any> = {
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    };
    if (is25Plus) {
      generationConfig['thinkingConfig'] = { thinkingBudget: 0 };
    }

    const model = genai.getGenerativeModel({
      model: modelId,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: generationConfig as any,
    });

    const result = await model.generateContent(prompt);
    const latencyMs = Date.now() - startMs;
    const rawText = result.response.text();
    const usage = result.response.usageMetadata;

    const inputTokens  = usage?.promptTokenCount ?? 0;
    const outputTokens = usage?.candidatesTokenCount ?? 0;

    const parsed = parseJsonResponse(rawText);
    const routes = parsed?.routes
      ? processRouteCandidates(parsed.routes, routeRequest)
      : [];

    const costUSD = estimateCostUSD(modelId, inputTokens, outputTokens);

    return {
      provider: modelId,
      label,
      routes,
      latencyMs,
      usage: { inputTokens, outputTokens },
      estimatedCostUSD: costUSD,
      estimatedCostJPY: Math.round(costUSD * USD_TO_JPY * 100) / 100,
      rawResponsePreview: rawText.slice(0, 300),
      error: routes.length === 0 && !parsed ? 'JSON解析失敗' : null,
    };
  } catch (err: any) {
    return {
      provider: modelId, label, routes: [], latencyMs: Date.now() - startMs,
      usage: { inputTokens: 0, outputTokens: 0 },
      estimatedCostUSD: 0, estimatedCostJPY: 0,
      rawResponsePreview: '',
      error: err?.message ?? 'Unknown error',
    };
  }
}

// ============================================================
// リクエストバリデーション
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
  if (req.lat < 24 || req.lat > 46 || req.lng < 122 || req.lng > 154) return false;
  return true;
}

// ============================================================
// メインハンドラ
// ============================================================

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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // App key check（テスト用エンドポイントも複数プロバイダーを叩くため保護）
  const expectedAppKey = process.env.APP_API_KEY;
  if (expectedAppKey && req.headers['x-app-key'] !== expectedAppKey) {
    res.status(401).json({ error: '認証エラー', code: 'UNAUTHORIZED' });
    return;
  }

  const body = req.body as unknown;
  if (!validateRequest(body)) {
    res.status(400).json({ error: '入力パラメータが不正です', code: 'INVALID_INPUT' });
    return;
  }

  const routeRequest = body as GenerateRouteRequest;
  const prompt = buildPrompt(routeRequest);

  // 有効にするプロバイダーを絞り込む
  // COMPARE_PROVIDERS 環境変数で制限可能（例: "claude-haiku-4-5,gemini-1.5-flash"）
  const allowedProviders = process.env.COMPARE_PROVIDERS
    ? process.env.COMPARE_PROVIDERS.split(',').map(s => s.trim())
    : ALL_PROVIDERS.map(p => p.id);

  const activeProviders = ALL_PROVIDERS.filter(p => {
    if (!allowedProviders.includes(p.id)) return false;
    if (!process.env[p.requiresEnv]) return false; // APIキー未設定はスキップ
    return true;
  });

  if (activeProviders.length === 0) {
    res.status(500).json({
      error: 'APIキーが設定されていません。ANTHROPIC_API_KEY または GEMINI_API_KEY を Vercel 環境変数に設定してください。',
      code: 'NO_PROVIDERS',
    });
    return;
  }

  // APIクライアント初期化
  const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

  const genai = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;

  // 全プロバイダーに並列リクエスト
  console.log(`[Compare] Running ${activeProviders.length} providers in parallel: ${activeProviders.map(p => p.id).join(', ')}`);

  const tasks = activeProviders.map(p => {
    if (p.vendor === 'anthropic' && anthropic) {
      return callClaude(p.id, p.label, prompt, routeRequest, anthropic);
    }
    if (p.vendor === 'gemini' && genai) {
      return callGemini(p.id, p.label, prompt, routeRequest, genai);
    }
    // フォールバック（通常は到達しない）
    return Promise.resolve<ProviderResult>({
      provider: p.id, label: p.label, routes: [], latencyMs: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      estimatedCostUSD: 0, estimatedCostJPY: 0,
      rawResponsePreview: '', error: 'APIクライアント未初期化',
    });
  });

  const results = await Promise.all(tasks);

  // 結果をコストの安い順にソート
  results.sort((a, b) => a.estimatedCostUSD - b.estimatedCostUSD);

  // サマリーログ
  results.forEach(r => {
    const status = r.error ? `❌ ${r.error}` : `✅ ${r.routes.length}ルート`;
    console.log(`[Compare] ${r.provider}: ${status} | ${r.latencyMs}ms | $${r.estimatedCostUSD.toFixed(5)} (¥${r.estimatedCostJPY})`);
  });

  const response: CompareResponse = {
    results,
    promptPreview: prompt.slice(0, 500) + (prompt.length > 500 ? '...' : ''),
    generatedAt: new Date().toISOString(),
  };

  res.status(200).json(response);
}
