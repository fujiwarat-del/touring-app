// ============================================================
// 住所・地名から座標を引く（ジオコーディング）
//
// 集合場所は長らく自由テキストだったが、到着予定時刻を計算するには
// 座標が必要なため導入する。
//
// 3段構えにしているのは、日本の集合場所が「道の駅果樹公園あしがくぼ」のような
// 施設名で指定されることが多く、単一の提供元では取りこぼすため:
//   1. Nominatim（OpenStreetMap）… 施設名・地名に強い。候補名を返せる
//   2. Yahoo ジオコーダ        … 番地まで対応。APIキーがある場合のみ
//   3. OS のジオコーダ          … 上記が全滅したときの保険。名前は返らない
//
// ピボット前の HomeScreen にあった実装（6955b95 / 5e5600a）を、
// 画面から切り離して再利用できる形に起こし直したもの。
// ============================================================

import * as Location from 'expo-location';

export interface GeocodeCandidate {
  /** 一覧に出す主たる名称 */
  label: string;
  /** 補足（住所の続きなど）。無ければ空文字 */
  sublabel: string;
  lat: number;
  lng: number;
  source: 'nominatim' | 'yahoo' | 'device';
}

/** Nominatim の display_name は「名称, 市, 県, 国」の形なので前後に分ける */
function splitDisplayName(displayName: string): { label: string; sublabel: string } {
  const parts = displayName.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { label: displayName, sublabel: '' };
  return {
    label: parts[0],
    // 国名（日本）は自明なので落とす
    sublabel: parts.slice(1).filter((p) => p !== '日本' && p !== 'Japan').join(' '),
  };
}

async function searchNominatim(query: string): Promise<GeocodeCandidate[]> {
  // 利用規約上 User-Agent でアプリを名乗る必要がある
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ja&countrycodes=jp`;
  const res = await fetch(url, { headers: { 'User-Agent': 'TouringPlannerApp/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((d: any): GeocodeCandidate | null => {
      const lat = parseFloat(d.lat);
      const lng = parseFloat(d.lon);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      const { label, sublabel } = splitDisplayName(String(d.display_name ?? ''));
      return { label, sublabel, lat, lng, source: 'nominatim' };
    })
    .filter((c): c is GeocodeCandidate => c !== null);
}

async function searchYahoo(query: string): Promise<GeocodeCandidate[]> {
  const appid = process.env.EXPO_PUBLIC_YAHOO_CLIENT_ID;
  if (!appid) return [];
  const url =
    'https://map.yahooapis.jp/geocode/V1/geoCoder' +
    `?appid=${appid}&query=${encodeURIComponent(query)}&output=json&results=5`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const features = data?.Feature ?? [];
  return features
    .map((f: any): GeocodeCandidate | null => {
      // Yahoo の座標は "経度,緯度" の順。緯度経度が逆なので注意
      const [lngStr, latStr] = String(f.Geometry?.Coordinates ?? '').split(',');
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      return {
        label: String(f.Name ?? f.Property?.Address ?? query),
        sublabel: String(f.Property?.Address ?? ''),
        lat,
        lng,
        source: 'yahoo',
      };
    })
    .filter((c: GeocodeCandidate | null): c is GeocodeCandidate => c !== null);
}

async function searchDevice(query: string): Promise<GeocodeCandidate[]> {
  // OS のジオコーダは座標しか返さないため、表示名は入力文字列をそのまま使う
  const results = await Location.geocodeAsync(query);
  return results.slice(0, 5).map((r) => ({
    label: query,
    sublabel: '端末の検索結果',
    lat: r.latitude,
    lng: r.longitude,
    source: 'device' as const,
  }));
}

/**
 * 地名・住所から候補を返す。見つからなければ空配列。
 * 提供元ごとの失敗は握りつぶして次へ進む（1つ落ちても検索自体は成立させる）。
 */
export async function searchPlace(query: string): Promise<GeocodeCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  for (const search of [searchNominatim, searchYahoo, searchDevice]) {
    try {
      const found = await search(q);
      if (found.length > 0) return found;
    } catch {
      // 次の提供元へ
    }
  }
  return [];
}
