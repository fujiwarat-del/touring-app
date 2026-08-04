// ============================================================
// JARTIC オープン交通量データ API
// https://www.jartic-open-traffic.org/
// 国土交通省の直轄国道（約2,600地点）のリアルタイム交通量を取得
// 無料・APIキー不要
//
// 【注意】レスポンスに道路名フィールドは存在しない（観測点コード＋
// 座標＋交通量のみ）。そのため座標ベースで混雑地点を分類し、AIに
// 座標リストとして渡す（Claude は座標から道路を推定できる）。
// ============================================================

const JARTIC_BASE = 'https://api.jartic-open-traffic.org/geoserver';

export interface TrafficSpot {
  lat: number;
  lng: number;
  volumePer5min: number; // 上下線・車種合計（台/5分）
}

export interface JarticCongestion {
  busySpots: TrafficSpot[];   // 混雑している観測地点
  quietSpots: TrafficSpot[];  // 比較的空いている観測地点
  sensorCount: number;        // 取得したセンサー数
  timeCode: string;           // 取得した時刻コード
}

/** 現在時刻を JST の時刻コード（YYYYMMDDHHMM・5分丸め）に変換 */
function getJSTTimeCode(minutesAgo = 30): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000 - minutesAgo * 60 * 1000);
  const rounded = Math.floor(jst.getUTCMinutes() / 5) * 5;
  jst.setUTCMinutes(rounded, 0, 0);

  const yyyy = jst.getUTCFullYear();
  const mo   = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(jst.getUTCDate()).padStart(2, '0');
  const hh   = String(jst.getUTCHours()).padStart(2, '0');
  const mi   = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}${mo}${dd}${hh}${mi}`;
}

/**
 * 出発地周辺の国道交通量を取得し、混雑地点と空き地点を返す
 */
export async function getJarticCongestion(
  lat: number,
  lng: number,
  radiusKm = 60
): Promise<JarticCongestion | null> {
  try {
    const timeCode = getJSTTimeCode(30); // 30分前（最新データが確実に存在する時刻）

    const latDeg = radiusKm / 111.0;
    const lngDeg = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
    const minX = (lng - lngDeg).toFixed(4);
    const minY = (lat - latDeg).toFixed(4);
    const maxX = (lng + lngDeg).toFixed(4);
    const maxY = (lat + latDeg).toFixed(4);

    // 道路種別='3' → 一般国道
    const cqlFilter = `道路種別='3' AND 時間コード=${timeCode} AND BBOX(ジオメトリ,${minX},${minY},${maxX},${maxY},'EPSG:4326')`;

    // 【重要】URLSearchParams はスペースを '+' にエンコードするが、
    // GeoServer は '%20' を期待して 400 を返すため encodeURIComponent で手動構築する
    const url =
      `${JARTIC_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
      `&typeNames=t_travospublic_measure_5m&srsName=EPSG:4326` +
      `&outputFormat=application/json&count=300` +
      `&cql_filter=${encodeURIComponent(cqlFilter)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[JARTIC] API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const features: any[] = data?.features ?? [];
    console.log(`[JARTIC] Got ${features.length} sensors for timeCode=${timeCode}`);

    if (features.length === 0) return null;

    // センサーごとに座標と交通量を収集
    const spots: TrafficSpot[] = [];
    for (const f of features) {
      const props = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;

      const volume =
        Number(props['上り・小型交通量'] ?? 0) +
        Number(props['上り・大型交通量'] ?? 0) +
        Number(props['下り・小型交通量'] ?? 0) +
        Number(props['下り・大型交通量'] ?? 0);

      spots.push({
        lat: Number(coords[1]),
        lng: Number(coords[0]),
        volumePer5min: volume,
      });
    }

    if (spots.length === 0) return null;

    // 交通量順にソートし、上位30%を「混雑」、下位40%を「空き」に分類
    const sorted = [...spots].sort((a, b) => b.volumePer5min - a.volumePer5min);
    const busyCount = Math.max(1, Math.ceil(sorted.length * 0.3));
    const quietFrom = Math.floor(sorted.length * 0.6);

    // 交通量が実際に多い地点のみ混雑扱い（100台/5分 ≒ 1,200台/h 以上）
    const busySpots = sorted.slice(0, busyCount).filter(s => s.volumePer5min >= 100);
    const quietSpots = sorted.slice(quietFrom).filter(s => s.volumePer5min < 50);

    console.log(`[JARTIC] busy=${busySpots.length}, quiet=${quietSpots.length} (of ${spots.length} sensors)`);

    return {
      busySpots: busySpots.slice(0, 10),
      quietSpots: quietSpots.slice(0, 10),
      sensorCount: spots.length,
      timeCode,
    };
  } catch (e: any) {
    if (e?.name !== 'AbortError') {
      console.warn('[JARTIC] Exception:', e?.message);
    }
    return null;
  }
}
