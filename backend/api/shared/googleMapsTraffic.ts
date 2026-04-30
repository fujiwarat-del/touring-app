// ============================================================
// Google Maps Routes API v2 - 渋滞考慮ルート取得
// https://developers.google.com/maps/documentation/routes
// ============================================================

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

interface LatLng {
  lat: number;
  lng: number;
}

export interface TrafficRouteResult {
  durationSeconds: number;          // 渋滞なしの所要時間（秒）
  durationWithTrafficSeconds: number; // 渋滞込みの所要時間（秒）
  distanceMeters: number;           // 総距離（メートル）
  congestion: '低' | '中' | '高';
  delayMinutes: number;             // 渋滞による遅延（分）
}

/**
 * Google Maps Routes API でリアルタイム渋滞を考慮したルートを取得する
 * @param waypoints 経由地の配列（最初が出発地、最後が目的地）
 * @returns TrafficRouteResult | null（API未設定 or エラー時は null）
 */
export async function getTrafficAwareRoute(
  waypoints: LatLng[]
): Promise<TrafficRouteResult | null> {
  if (!GOOGLE_MAPS_API_KEY || waypoints.length < 2) return null;

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1).slice(0, 8); // 中間経由地は最大8か所

  const body = {
    origin: {
      location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
    },
    destination: {
      location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
    },
    intermediates: intermediates.map((wp) => ({
      location: { latLng: { latitude: wp.lat, longitude: wp.lng } },
    })),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2分後（現在時刻だとサーバー側で過去扱いされるため）
    routeModifiers: {
      avoidFerries: true,   // フェリー禁止
      avoidTolls: false,    // 有料道路は許可
    },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5秒タイムアウト

    const res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          // duration: 渋滞込み, staticDuration: 渋滞なし, distanceMeters: 距離
          'X-Goog-FieldMask':
            'routes.duration,routes.staticDuration,routes.distanceMeters',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[GoogleMaps] Routes API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    // duration / staticDuration は "1234s" 形式
    const durationWithTraffic = parseInt(
      (route.duration as string)?.replace('s', '') ?? '0',
      10
    );
    const staticDuration = parseInt(
      (route.staticDuration as string)?.replace('s', '') ?? '0',
      10
    );
    const distanceMeters = (route.distanceMeters as number) ?? 0;

    // 渋滞比率から混雑度を算出
    const ratio =
      staticDuration > 0 ? durationWithTraffic / staticDuration : 1;
    const congestion: '低' | '中' | '高' =
      ratio < 1.1 ? '低' : ratio < 1.3 ? '中' : '高';

    const delayMinutes = Math.round((durationWithTraffic - staticDuration) / 60);

    return {
      durationSeconds: staticDuration,
      durationWithTrafficSeconds: durationWithTraffic,
      distanceMeters,
      congestion,
      delayMinutes,
    };
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      console.warn('[GoogleMaps] Routes API exception:', e?.message);
    }
    return null;
  }
}

/**
 * 秒数を「約X時間Y分」形式に変換
 */
export function formatDurationSec(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `約${m}分`;
  if (m === 0) return `約${h}時間`;
  return `約${h}時間${m}分`;
}

/**
 * メートルを「約XXXkm」形式に変換
 */
export function formatDistanceM(meters: number): string {
  const km = Math.round(meters / 1000);
  return `約${km}km`;
}
