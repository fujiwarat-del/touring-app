import type { GenerateRouteRequest, Route } from '@touring/shared';
import { parseClaudeResponse } from '@touring/shared';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ClaudeApiResult {
  routes: Route[];
  generatedAt: string;
}

/**
 * Call the Vercel backend /api/claude endpoint to generate routes.
 * The Claude API key is kept server-side and never exposed to the client.
 */
export async function callClaude(
  request: GenerateRouteRequest
): Promise<ClaudeApiResult> {
  const response = await fetch(`${API_BASE_URL}/api/claude`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `API error: ${response.status}`;
    try {
      const parsed = JSON.parse(errorBody);
      errorMessage = parsed.error ?? errorMessage;
    } catch {
      // ignore parse error
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data as ClaudeApiResult;
}

/**
 * Regenerate a single route with slightly different parameters
 */
export async function regenerateRoute(
  request: GenerateRouteRequest,
  excludeRouteNames: string[]
): Promise<ClaudeApiResult> {
  const modifiedRequest = {
    ...request,
    excludeRouteNames,
  };

  return callClaude(modifiedRequest);
}
