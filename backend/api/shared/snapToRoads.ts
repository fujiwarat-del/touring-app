// ============================================================
// Google Roads API - 経由地座標の道路スナップ
// https://developers.google.com/maps/documentation/roads/nearest
//
// AIが生成した座標は道路から外れていることがあり、そのまま
// Google Maps に渡すと「車で到達不能」と判定されて徒歩モードに
// フォールバックする。全経由地を最寄りの道路上に補正することで
// これを防ぐ。
// ============================================================

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? '';

interface LatLng {
  lat: number;
  lng: number;
}

/** スナップ結果が元座標からこれ以上離れていたら不採用（異常スナップ対策） */
const MAX_SNAP_DISTANCE_KM = 5;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 複数座標を最寄りの道路上にスナップする（1リクエストで最大100点）
 * @returns 入力と同じ長さの配列。スナップできなかった点は null（元座標を使うこと）
 *          API未設定・エラー時は null（全点スキップ）
 */
export async function snapPointsToRoads(
  points: LatLng[]
): Promise<(LatLng | null)[] | null> {
  if (!GOOGLE_MAPS_API_KEY || points.length === 0) return null;

  // Roads API の上限は100点。超過分はスナップせずそのまま返す
  const target = points.slice(0, 100);

  const pointsParam = target
    .map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
    .join('|');

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://roads.googleapis.com/v1/nearestRoads?points=${encodeURIComponent(pointsParam)}&key=${GOOGLE_MAPS_API_KEY}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('[SnapToRoads] API error:', res.status, (await res.text()).slice(0, 200));
      return null;
    }

    const data = await res.json();
    const snappedPoints: any[] = data?.snappedPoints ?? [];

    // originalIndex ごとに最初のスナップ結果を採用
    const byIndex = new Map<number, LatLng>();
    for (const sp of snappedPoints) {
      const idx = Number(sp.originalIndex);
      if (byIndex.has(idx)) continue;
      const lat = Number(sp?.location?.latitude);
      const lng = Number(sp?.location?.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        byIndex.set(idx, { lat, lng });
      }
    }

    let snappedCount = 0;
    const result: (LatLng | null)[] = points.map((orig, i) => {
      const snapped = byIndex.get(i);
      if (!snapped) return null;
      // 異常に遠くへスナップされた場合は不採用
      if (haversineKm(orig.lat, orig.lng, snapped.lat, snapped.lng) > MAX_SNAP_DISTANCE_KM) {
        return null;
      }
      snappedCount++;
      return snapped;
    });

    console.log(`[SnapToRoads] Snapped ${snappedCount}/${points.length} waypoints to roads`);
    return result;
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      console.warn('[SnapToRoads] Exception:', e?.message);
    }
    return null;
  }
}
