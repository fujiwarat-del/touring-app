// ============================================================
// 計画の地図
//
// 集合場所・立ち寄りスポット・共有中の参加者を1枚にまとめて出す。
// MiniMapPreview と同じく Leaflet を WebView で表示する
// （Google Maps SDK を入れないのは APIキーの管理と課金を増やさないため）。
//
// 参加者の位置が出るのは「現在地も共有」を選んだ人だけ。
// 「到着予定だけ」を選んだ人は端末から座標を送っていないので、
// そもそも地図には出しようがない。
// ============================================================

import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';
import { useTheme } from '../theme/ThemeContext';
import { getPlan, getParticipants } from '../services/plans';
import type { TouringPlan, Participant } from '../services/plans';
import { getSharedStatuses, type SharedStatus } from '../services/planSharing';

type Props = RouteProp<RootStackParamList, 'PlanMap'>;

interface Pin {
  lat: number;
  lng: number;
  label: string;
  kind: 'meeting' | 'spot' | 'rider';
  /** スポットの通し番号 */
  index?: number;
}

function buildHtml(pins: Pin[]): string {
  const esc = (t: string) => t.replace(/[<>"'&\\]/g, '');
  const data = pins.map((p) => ({ ...p, label: esc(p.label) }));
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100vh; }
    .pin {
      width: 30px; height: 30px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: bold; color: #fff;
      border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .meeting { background: #1D9E75; }
    .spot    { background: #3182ce; }
    .rider   { background: #e53e3e; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var pins = ${JSON.stringify(data)};
    var map = L.map('map', { attributionControl: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

    var bounds = [];
    pins.forEach(function (p) {
      var text = p.kind === 'meeting' ? '集' : (p.kind === 'spot' ? String(p.index) : '🏍');
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div class="pin ' + p.kind + '">' + text + '</div>',
          iconSize: [30, 30], iconAnchor: [15, 15],
        })
      }).addTo(map).bindPopup(p.label);
      bounds.push([p.lat, p.lng]);
    });

    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] });
    else map.setView([35.68, 139.76], 9);
  </script>
</body>
</html>`;
}

export default function PlanMapScreen() {
  const { colors } = useTheme();
  const route = useRoute<Props>();
  const { planId } = route.params;

  const [plan, setPlan] = useState<TouringPlan | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [statuses, setStatuses] = useState<SharedStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, parts, st] = await Promise.all([
      getPlan(planId).catch(() => null),
      getParticipants(planId).catch(() => []),
      getSharedStatuses(planId).catch(() => []),
    ]);
    setPlan(p);
    setParticipants(parts);
    setStatuses(st);
    setLoading(false);
  }, [planId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const pins: Pin[] = [];
  if (plan?.meetingLat != null && plan?.meetingLng != null) {
    pins.push({ lat: plan.meetingLat, lng: plan.meetingLng, label: `集合: ${plan.meetingPlace}`, kind: 'meeting' });
  }
  plan?.spots.forEach((sp, i) => {
    if (sp.lat != null && sp.lng != null) {
      pins.push({ lat: sp.lat, lng: sp.lng, label: sp.name, kind: 'spot', index: i + 1 });
    }
  });
  // 位置を共有しているのは mode === 'full' の参加者だけ
  statuses.forEach((st) => {
    if (st.lat == null || st.lng == null) return;
    const name = participants.find((x) => x.uid === st.uid)?.displayName ?? '参加者';
    const ageMin = Math.floor((Date.now() - st.fixAt) / 60000);
    pins.push({
      lat: st.lat,
      lng: st.lng,
      // 鮮度を併記する。古い位置を現在地と誤解させないため
      label: `${name}（${ageMin <= 0 ? 'たった今' : `${ageMin}分前`}）`,
      kind: 'rider',
    });
  });

  const riderCount = pins.filter((p) => p.kind === 'rider').length;
  const etaOnly = statuses.filter((s) => s.lat == null && !s.arrived).length;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]}>
      <WebView
        key={pins.map((p) => `${p.lat},${p.lng}`).join('|')}
        source={{ html: buildHtml(pins) }}
        style={styles.web}
        originWhitelist={['*']}
      />
      <View style={[styles.legend, { backgroundColor: colors.cardBg, borderTopColor: colors.border }]}>
        <Text style={[styles.legendText, { color: colors.textSecondary }]}>
          🟢 集合場所　🔵 立ち寄り　🔴 走行中 {riderCount}人
        </Text>
        {etaOnly > 0 && (
          <Text style={[styles.legendSub, { color: colors.textMuted }]}>
            ほか{etaOnly}人は到着予定のみ共有（地図には出ません）
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap:       { flex: 1 },
  web:        { flex: 1 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  legend:     { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  legendText: { fontSize: 12 },
  legendSub:  { fontSize: 11, marginTop: 4 },
});
