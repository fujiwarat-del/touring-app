// ============================================================
// Touring App - Waypoint Coordinate Correction via Nominatim
// ============================================================
//
// AIが生成した「それっぽいが不正確な座標」を
// 地点名でジオコードして正確な座標に上書きする。
//
// 【重要】AIの元座標を「ヒント」として viewbox 検索を行い、
// 元座標から MAX_DIST_KM 以内の結果のみ採用する。
// 範囲外の結果は無視してAI座標を維持（誤マッチ防止）。
// ============================================================

import type { Route } from '@touring/shared';

/** 検索ヒントからの最大許容距離（km）。これを超える結果は捨てる */
const MAX_DIST_KM = 80;

/** ヒント座標の ±delta 度を viewbox に使用（1度 ≈ 111km） */
const VIEWBOX_DELTA = 0.8;

/** Haversine 距離計算（km） */
function calcDistKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** SA/PA略称を正式名称に展開（検索精度向上） */
function getSaPaVariants(name: string): string[] {
  const variants = [name];

  const saMatch = name.match(/^(.+?)\s*[Ss][Aa]$/);
  if (saMatch) {
    variants.push(`${saMatch[1].trim()}サービスエリア`);
  }

  const paMatch = name.match(/^(.+?)\s*[Pp][Aa]$/);
  if (paMatch) {
    variants.push(`${paMatch[1].trim()}パーキングエリア`);
  }

  return variants;
}

/**
 * ジオコード用に地点名をクリーニング
 * 例: "蓮田SA（上り）40" → "蓮田SA"
 */
function cleanForGeocode(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')  // 丸括弧内を削除（上り・下り等）
    .replace(/[「」『』【】〔〕]/g, '') // 日本語カギ括弧を削除（道の駅「山武」→道の駅山武）
    .replace(/[・･]/g, ' ')            // 中黒をスペースに（佐倉市・印旛沼→佐倉市 印旛沼）
    .replace(/\s+\d+\s*$/, '')         // 末尾の数字（高速出口番号等）を削除
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nominatim でヒント座標の近傍のみ検索。
 * - viewbox + bounded=1 で検索範囲をヒント周辺に限定
 * - さらに距離チェックで MAX_DIST_KM 超の結果を排除
 * - 見つからなければ null（AI座標をそのまま維持）
 */
async function geocodeSingle(
  rawName: string,
  hintLat: number,
  hintLng: number
): Promise<{ lat: number; lng: number } | null> {
  const cleaned = cleanForGeocode(rawName);
  const variants = getSaPaVariants(cleaned);

  // ヒント座標周辺の viewbox（left,top,right,bottom）
  const viewbox = [
    hintLng - VIEWBOX_DELTA,
    hintLat + VIEWBOX_DELTA,
    hintLng + VIEWBOX_DELTA,
    hintLat - VIEWBOX_DELTA,
  ].join(',');

  for (const variant of variants) {
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(variant)}` +
        `&format=json&limit=1&accept-language=ja&countrycodes=jp` +
        `&viewbox=${viewbox}&bounded=1`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'TouringPlannerApp/1.0' },
      });
      if (!res.ok) continue;

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue;

      // 距離チェック：ヒント座標から離れすぎていたら不採用
      const dist = calcDistKm(hintLat, hintLng, lat, lng);
      if (dist > MAX_DIST_KM) continue;

      return { lat, lng };
    } catch {
      // バリアント失敗は無視して次を試す
    }
  }

  // 範囲内で見つからなければ null → AI座標維持
  return null;
}

/**
 * 全ルートの全ウェイポイントをジオコードして座標を補正する。
 *
 * - AI元座標をヒントとして viewbox 検索（誤マッチ防止）
 * - ジオコードに失敗 or 範囲外のウェイポイントはAI座標をそのまま維持
 * - リクエストは250msずつずらして並行実行
 */
export async function geocodeRouteWaypoints(routes: Route[]): Promise<Route[]> {
  type Task = { routeIdx: number; wpIdx: number; name: string; hintLat: number; hintLng: number };
  const tasks: Task[] = [];

  for (let ri = 0; ri < routes.length; ri++) {
    for (let wi = 0; wi < (routes[ri].waypointObjects?.length ?? 0); wi++) {
      const wp = routes[ri].waypointObjects[wi];
      tasks.push({
        routeIdx: ri,
        wpIdx: wi,
        name: wp.name,
        hintLat: wp.lat,
        hintLng: wp.lng,
      });
    }
  }

  if (tasks.length === 0) return routes;

  const STAGGER_MS = 250;
  const geocodedCoords = await Promise.all(
    tasks.map(
      (task, idx) =>
        new Promise<{ lat: number; lng: number } | null>((resolve) => {
          setTimeout(
            () =>
              geocodeSingle(task.name, task.hintLat, task.hintLng)
                .then(resolve)
                .catch(() => resolve(null)),
            idx * STAGGER_MS
          );
        })
    )
  );

  // ルートをディープコピーして座標を適用
  const updatedRoutes: Route[] = routes.map((r) => ({
    ...r,
    waypointObjects: (r.waypointObjects ?? []).map((wp) => ({ ...wp })),
  }));

  tasks.forEach((task, idx) => {
    const geocoded = geocodedCoords[idx];
    if (geocoded) {
      updatedRoutes[task.routeIdx].waypointObjects[task.wpIdx] = {
        ...updatedRoutes[task.routeIdx].waypointObjects[task.wpIdx],
        lat: geocoded.lat,
        lng: geocoded.lng,
      };
    }
    // geocoded === null → AI座標をそのまま維持
  });

  return updatedRoutes;
}
