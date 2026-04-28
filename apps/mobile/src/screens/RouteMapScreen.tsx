import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  SafeAreaView,
  Alert,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';
import type { WaypointObject } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { FONT_SIZE, FONT_WEIGHT, SPACING, RADIUS } from '../theme/spacing';

type MapRouteProps = RouteProp<RootStackParamList, 'RouteMap'>;
type NavProp = StackNavigationProp<RootStackParamList, 'RouteMap'>;

/** LeafletJS + OpenStreetMap を使ったルートマップ */
function buildMapHtml(waypoints: WaypointObject[], routeName: string): string {
  const validWps = waypoints.filter((wp) => wp.lat && wp.lng);
  if (validWps.length === 0) return '<html><body><p>経由地データがありません</p></body></html>';

  const center = validWps[Math.floor(validWps.length / 2)];
  const waypointsJson = JSON.stringify(
    validWps.map((wp, i) => ({
      lat: wp.lat,
      lng: wp.lng,
      name: wp.name,
      desc: wp.description ?? '',
      type: wp.type ?? 'waypoint',
      index: i,
      isStart: i === 0,
      isEnd: i === validWps.length - 1,
    }))
  );

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
    .custom-marker {
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: bold; color: white;
      border: 2.5px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .start-marker { background: #1D9E75; }
    .end-marker   { background: #e53e3e; }
    .way-marker   { background: #3182ce; }
    .route-name {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      background: rgba(255,255,255,0.95); padding: 6px 16px;
      border-radius: 20px; font-size: 13px; font-weight: bold;
      color: #1D9E75; z-index: 1000; max-width: 80%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <div class="route-name">${routeName}</div>
  <div id="map"></div>
  <div id="error-msg" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;align-items:center;justify-content:center;flex-direction:column;background:#f8f8f8;z-index:9999;padding:32px;text-align:center;">
    <p style="font-size:40px;margin-bottom:16px">🗺️</p>
    <p style="font-size:16px;font-weight:bold;color:#333;margin-bottom:8px">地図を読み込めませんでした</p>
    <p style="font-size:13px;color:#999">ネットワーク接続を確認して<br>再度お試しください</p>
  </div>
  <script>
    // CDN読み込み失敗時のフォールバック
    window.onerror = function() {
      var el = document.getElementById('error-msg');
      if (el) { el.style.display = 'flex'; }
    };
    if (typeof L === 'undefined') {
      var el = document.getElementById('error-msg');
      if (el) { el.style.display = 'flex'; }
    }
    var wps = ${waypointsJson};
    var map = L.map('map').setView([${center.lat}, ${center.lng}], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // ルートライン
    var latlngs = wps.map(function(wp){ return [wp.lat, wp.lng]; });
    L.polyline(latlngs, { color: '#1D9E75', weight: 4, opacity: 0.85 }).addTo(map);

    // マーカー
    wps.forEach(function(wp) {
      var cls = wp.isStart ? 'start-marker' : wp.isEnd ? 'end-marker' : 'way-marker';
      var label = wp.isStart ? '出' : wp.isEnd ? '着' : String(wp.index);
      var icon = L.divIcon({
        className: '',
        html: '<div class="custom-marker ' + cls + '">' + label + '</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18],
      });
      var popup = '<b>' + wp.name + '</b>';
      if (wp.desc) popup += '<br><span style="font-size:11px;color:#666">' + wp.desc + '</span>';
      L.marker([wp.lat, wp.lng], { icon: icon }).addTo(map).bindPopup(popup);
    });

    // 全マーカーが見えるようにズーム
    if (latlngs.length > 1) {
      map.fitBounds(latlngs, { padding: [40, 40] });
    }
  </script>
</body>
</html>`;
}

export default function RouteMapScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<MapRouteProps>();
  const { routeData, mapUrl } = route.params;
  const webviewRef = useRef<WebView>(null);
  const [loadError, setLoadError] = useState(false);
  const [webviewKey, setWebviewKey] = useState(0);

  const waypoints = [...(routeData.waypointObjects ?? [])];
  const html = buildMapHtml(waypoints, routeData.name);

  const handleOpenGoogleMaps = () => {
    if (mapUrl) {
      Linking.openURL(mapUrl).catch(() => {
        Alert.alert('エラー', 'Google Mapsを開けませんでした');
      });
    }
  };

  const handleRetry = () => {
    setLoadError(false);
    setWebviewKey((k) => k + 1);
  };

  return (
    <SafeAreaView style={styles.container}>
      {waypoints.length > 0 ? (
        loadError ? (
          <View style={styles.noData}>
            <Text style={styles.noDataIcon}>🗺️</Text>
            <Text style={styles.noDataText}>地図を読み込めませんでした</Text>
            <Text style={styles.noDataSub}>ネットワーク接続を確認してください</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryBtnText}>🔄 再読み込み</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <WebView
              key={webviewKey}
              ref={webviewRef}
              source={{ html }}
              containerStyle={styles.webview}
              renderLoading={() => (
                <View style={styles.loading}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              )}
              startInLoadingState
              javaScriptEnabled
              domStorageEnabled
              onError={() => setLoadError(true)}
              onHttpError={() => setLoadError(true)}
            />
            {/* 常に表示されるフローティングリトライボタン */}
            <TouchableOpacity style={styles.floatingRetryBtn} onPress={handleRetry}>
              <Text style={styles.floatingRetryBtnText}>🔄</Text>
            </TouchableOpacity>
          </View>
        )
      ) : (
        <View style={styles.noData}>
          <Text style={styles.noDataIcon}>🗺️</Text>
          <Text style={styles.noDataText}>経由地データがありません</Text>
          <Text style={styles.noDataSub}>Google Mapsでルートを確認できます</Text>
        </View>
      )}

      {mapUrl && (
        <TouchableOpacity style={styles.gmapsBtn} onPress={handleOpenGoogleMaps}>
          <Text style={styles.gmapsBtnText}>🗺️ Google Maps で開く</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
  loading: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  noData: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xxxl,
  },
  noDataIcon: { fontSize: 64, marginBottom: SPACING.lg },
  noDataText: {
    fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary, marginBottom: SPACING.sm,
  },
  noDataSub: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, textAlign: 'center', marginBottom: SPACING.xl },
  retryBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xxxl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
  },
  floatingRetryBtn: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: RADIUS.full,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  floatingRetryBtnText: {
    fontSize: 20,
  },
  gmapsBtn: {
    margin: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  gmapsBtnText: {
    color: '#fff', fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold,
  },
});
