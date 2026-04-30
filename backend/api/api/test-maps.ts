import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    res.status(200).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
    return;
  }

  // 東京→横浜の簡単なテストルート
  const body = {
    origin: { location: { latLng: { latitude: 35.6762, longitude: 139.6503 } } },
    destination: { location: { latLng: { latitude: 35.4437, longitude: 139.6380 } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  };

  try {
    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
        },
        body: JSON.stringify(body),
      }
    );

    const text = await response.text();
    res.status(200).json({
      status: response.status,
      ok: response.ok,
      body: JSON.parse(text),
      keyPrefix: apiKey.substring(0, 8) + '...',
    });
  } catch (e: any) {
    res.status(200).json({ error: e?.message });
  }
}
