/**
 * /api/gemini-models
 * 現在の GEMINI_API_KEY で利用可能なモデル一覧を返す診断エンドポイント
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY not set' });
    return;
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=50`;
    const response = await fetch(url);
    const data = await response.json() as any;

    if (!response.ok) {
      res.status(response.status).json({ error: data });
      return;
    }

    // generateContent をサポートするモデルのみ抽出
    const generateModels = (data.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => ({
        name: m.name,                          // 例: "models/gemini-2.0-flash"
        displayName: m.displayName,
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
      }));

    res.status(200).json({
      total: generateModels.length,
      models: generateModels,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
