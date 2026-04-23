import type { VercelRequest, VercelResponse } from '@vercel/node';

// ============================================================
// GET /api/health
// Health check endpoint for monitoring
// ============================================================

export default function handler(
  req: VercelRequest,
  res: VercelResponse
): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'touring-api',
    environment: process.env.VERCEL_ENV ?? 'development',
    region: process.env.VERCEL_REGION ?? 'local',
    checks: {
      anthropicApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
      firebaseProjectId: Boolean(process.env.FIREBASE_PROJECT_ID),
    },
  };

  res.status(200).json(status);
}
