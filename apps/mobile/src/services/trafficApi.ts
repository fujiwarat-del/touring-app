// ============================================================
// Yahoo! Japan 道路交通情報API
// https://developer.yahoo.co.jp/webapi/map/openlocalplatform/v1/traffic.html
// ============================================================

const YAHOO_CLIENT_ID = process.env.EXPO_PUBLIC_YAHOO_CLIENT_ID ?? '';

export interface TrafficResult {
  level: number;       // 1-5
  label: string;
  incidentCount: number;
  isRealtime: boolean; // true = APIから取得, false = 計算値
}

/**
 * 指定した座標周辺の渋滞レベルを Yahoo! Traffic API から取得する
 * @param lat 緯度
 * @param lng 経度
 * @param radiusDeg 取得範囲（度数）デフォルト0.3度 ≒ 30km四方
 */
export async function fetchRealtimeTraffic(
  lat: number,
  lng: number,
  radiusDeg = 0.3
): Promise<TrafficResult | null> {
  if (!YAHOO_CLIENT_ID) return null;

  const minLat = lat - radiusDeg;
  const maxLat = lat + radiusDeg;
  const minLng = lng - radiusDeg;
  const maxLng = lng + radiusDeg;

  // Yahoo! Maps API bbox は 西,南,東,北 の順（longitude first）
  const bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
  const url =
    `https://map.yahooapis.jp/traffic/V1/TrafficLayer` +
    `?appid=${YAHOO_CLIENT_ID}&output=json&bbox=${bbox}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const features: any[] = data?.Feature ?? [];

    // 渋滞・規制イベント数からレベルを算出
    let congestionCount = 0;
    let blockCount = 0;

    for (const f of features) {
      const type: string = f?.Property?.TrafficLayer?.Type ?? '';
      if (type === '渋滞') congestionCount++;
      else if (type === '規制') blockCount++;
    }

    const total = congestionCount + blockCount * 2; // 規制は重み2倍
    const level = calcLevelFromCount(total);
    const label = LEVEL_LABELS[level - 1] ?? '普通';

    return { level, label, incidentCount: features.length, isRealtime: true };
  } catch {
    return null;
  }
}

/** イベント数から渋滞レベル 1-5 に変換 */
function calcLevelFromCount(count: number): number {
  if (count === 0) return 1;
  if (count <= 2) return 2;
  if (count <= 5) return 3;
  if (count <= 10) return 4;
  return 5;
}

const LEVEL_LABELS = [
  '空いています',
  'やや空いています',
  '普通です',
  'やや混雑しています',
  '混雑が予想されます',
];
