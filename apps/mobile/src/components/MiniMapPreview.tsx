// ============================================================
// 確定した地点を小さな地図で確認するためのプレビュー
//
// ジオコーディングは同名の別地点を掴むことがあり（「ビーナスライン」のように
// 候補が複数出る例がある）、ラベルだけでは正しさを判断できない。
// 地図に出せば一目で分かるので、確定直後に必ず見せる。
//
// RouteMapScreen と同じく Leaflet を WebView で表示する。
// Google Maps SDK を入れないのは、APIキーの管理と課金を増やさないため。
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  lat: number;
  lng: number;
  /** 地図上に出す地点名 */
  label?: string;
  height?: number;
}

function buildHtml(lat: number, lng: number, label: string): string {
  const safeLabel = label.replace(/[<>"'&]/g, '');
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
      width: 26px; height: 26px; border-radius: 50%;
      background: #e53e3e; border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    }
    .cap {
      position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%);
      background: rgba(255,255,255,0.95); padding: 4px 12px; border-radius: 14px;
      font-size: 12px; font-weight: bold; color: #333; z-index: 1000;
      max-width: 90%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  ${safeLabel ? `<div class="cap">${safeLabel}</div>` : ''}
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false })
      .setView([${lat}, ${lng}], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    L.marker([${lat}, ${lng}], {
      icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [26, 26], iconAnchor: [13, 13] })
    }).addTo(map);
  </script>
</body>
</html>`;
}

export default function MiniMapPreview({ lat, lng, label = '', height = 170 }: Props) {
  const openInMaps = () => {
    // 地図アプリ側でも確認できるようにする。縮尺や周辺を見たいときに有用
    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label || '集合場所')}`,
      default: `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label || '集合場所')})`,
    })!;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`).catch(() => {});
    });
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        source={{ html: buildHtml(lat, lng, label) }}
        style={styles.web}
        scrollEnabled={false}
        originWhitelist={['*']}
      />
      <TouchableOpacity style={styles.openBtn} onPress={openInMaps}>
        <Text style={styles.openBtnText}>地図アプリで開く</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#e8e8e8',
  },
  web: { flex: 1 },
  openBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  openBtnText: { fontSize: 11, fontWeight: 'bold', color: '#333' },
});
