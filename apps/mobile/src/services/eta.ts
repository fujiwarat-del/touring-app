// ============================================================
// 到着予定時刻（ETA）の推定
//
// v1 は端末側で計算する。サーバーも API キーも不要でコストがゼロのため。
// 精度が足りないと分かった時点で Google Routes API に差し替えるが、その際は
// Vercel 側にサーバー用キーを置く。クライアントのキーに課金APIを追加してはいけない
// （漏洩時にそのまま請求につながる。実際 Routes API は制限から外した経緯がある）。
//
// 直線距離をそのまま使うと山道で大きく外れるため、道路の迂回係数を掛ける。
// 速度は実測の移動平均を使うので、渋滞にはまれば自然と ETA が伸びる。
// ============================================================

/** 直線距離を道路距離に近づける補正。日本の一般道で概ね 1.3 前後 */
const ROAD_DETOUR_FACTOR = 1.3;

/** 速度の実測が無いときの既定値（km/h）。一般道のツーリングを想定 */
const DEFAULT_SPEED_KMH = 40;

/** 遅すぎる値で ETA が発散しないための下限（km/h）。信号待ちや休憩の影響を抑える */
const MIN_SPEED_KMH = 15;

/** 速度の移動平均に使う件数 */
const SPEED_WINDOW = 5;

export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * 直近の速度サンプルから推定速度（km/h）を出す。
 * 停車中の 0 を含めるとETAが発散するので、下限で丸める。
 */
export function estimateSpeedKmh(recentSpeedsMps: number[]): number {
  const usable = recentSpeedsMps
    .filter((s) => typeof s === 'number' && isFinite(s) && s >= 0)
    .slice(-SPEED_WINDOW);
  if (usable.length === 0) return DEFAULT_SPEED_KMH;
  const avgMps = usable.reduce((a, b) => a + b, 0) / usable.length;
  const kmh = avgMps * 3.6;
  return Math.max(MIN_SPEED_KMH, kmh || DEFAULT_SPEED_KMH);
}

export interface EtaResult {
  /** 集合場所までの推定道路距離（km） */
  distanceKm: number;
  /** 推定所要時間（分） */
  etaMinutes: number;
}

export function estimateEta(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  recentSpeedsMps: number[]
): EtaResult {
  const straightKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const distanceKm = straightKm * ROAD_DETOUR_FACTOR;
  const speedKmh = estimateSpeedKmh(recentSpeedsMps);
  const etaMinutes = Math.round((distanceKm / speedKmh) * 60);
  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    etaMinutes,
  };
}

/** 到着とみなす距離（km）。これ以内に入ったら共有を自動停止する */
export const ARRIVAL_RADIUS_KM = 0.2;

export function hasArrived(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): boolean {
  return haversineKm(from.lat, from.lng, to.lat, to.lng) <= ARRIVAL_RADIUS_KM;
}
