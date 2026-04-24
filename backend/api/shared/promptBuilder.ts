import type { GenerateRouteRequest } from './types';

export function buildPrompt(req: GenerateRouteRequest): string {
  const {
    lat, lng, locationName, bikeType, purposes, preferences,
    duration, routeMode, returnType, destination,
    emptyRoadMode, todayInfo, weatherInfo,
  } = req;

  const locationStr = locationName
    ? `${locationName}（緯度: ${lat.toFixed(4)}, 経度: ${lng.toFixed(4)}）`
    : `緯度: ${lat.toFixed(4)}, 経度: ${lng.toFixed(4)}`;

  const hours = duration / 60;
  const durationStr = hours >= 1
    ? `${hours.toFixed(1).replace(/\.0$/, '')}時間`
    : `${duration}分`;

  const returnStr =
    returnType === 'loop' ? '帰り: ループで出発地に戻る' :
    returnType === 'same' ? '帰り: 同じ道を折り返す' :
    '帰り: 目的地そのまま（帰還なし）';

  const modeStr = routeMode === 'destination' && destination
    ? `目的地指定モード: ${destination}へ向かう`
    : 'フリーモード: 出発地点から自由にルートを生成';

  const roadStr = emptyRoadMode
    ? '🌿 空いている道優先: 交通量の少ない道・下道を優先すること（高速は空いている場合のみ利用可）'
    : '🕐 時間優先: 高速道路・有料道路を積極的に活用し、所要時間を短縮すること';

  const weatherStr = weatherInfo
    ? `現在の天気: ${weatherInfo.weatherDescription} ${weatherInfo.icon}, 気温: ${weatherInfo.temperature}°C, 風速: ${weatherInfo.windSpeed}km/h, 降水: ${weatherInfo.precipitation}mm`
    : '';

  return `あなたはバイクツーリングの専門家AIです。以下の条件で日本国内のバイクツーリングルートを3つ提案してください。

## 出発地点
${locationStr}

## ツーリング条件
- バイク種類: ${bikeType}
- 目的: ${purposes.join('、')}
- 走行スタイル: ${preferences.join('、')}
- 所要時間: ${durationStr}
- ルートモード: ${modeStr}
- ${returnStr}
- ${roadStr}

## 本日の状況
- 日付: ${todayInfo.dateStr}
- 季節: ${todayInfo.season}
- 交通状況: ${todayInfo.trafficLabel}
${todayInfo.isHoliday ? `- 祝日: ${todayInfo.holidayName ?? '休日'}のため観光地は混雑予想` : ''}
${weatherStr ? `- ${weatherStr}` : ''}

## 出力形式（JSONのみ）
以下のJSON形式で3つのルートを返してください。JSONのみを返し、前後の説明文は不要です。

\`\`\`json
{
  "routes": [
    {
      "name": "ルート名（魅力的な名前）",
      "congestion": "低 | 中 | 高",
      "distance": "約XXXkm",
      "time": "約X.X時間",
      "difficulty": "初級 | 中級 | 上級",
      "windingScore": 1〜5の整数,
      "sceneryScore": 1〜5の整数,
      "trafficScore": 1〜5の整数,
      "difficultyScore": 1〜5の整数,
      "type": "${purposes[0] ?? 'ツーリング'}",
      "description": "ルートの魅力的な説明（2-3文）",
      "caution": "注意事項（路面状況、天気、混雑など）",
      "waypointObjects": [
        {"name": "地点名", "lat": 緯度, "lng": 経度, "description": "説明", "type": "start | waypoint | destination"}
      ],
      "highlightWaypoints": [
        {"name": "ハイライト地点名", "lat": 緯度, "lng": 経度, "description": "見どころの説明", "type": "highlight"}
      ]
    }
  ]
}
\`\`\`

## 重要な注意事項
1. waypointObjectsには【峠・展望台・道の駅・岬・湖・温泉地・観光地・絶景スポット】など走行上・観光上の意味がある地点のみ設定すること。市街地の交差点や住宅街の通過点は絶対に含めないこと。5〜8地点に絞ること
2. highlightWaypointsには特に見どころとなる地点を2〜3か所設定すること
3. 緯度・経度は実際の日本の地点に正確な値を使用すること
4. バイク種類「${bikeType}」に適した道路を選ぶこと
5. 季節「${todayInfo.season}」と交通状況「${todayInfo.trafficLabel}」を考慮すること
6. 3ルートはそれぞれ異なるキャラクター（難易度・方向・テーマ）を持たせること
7. 出発地点から実際に行ける現実的なルートのみを提案すること
8. timeフィールドは純粋なバイク走行時間のみを記載すること（休憩・観光時間は含めない）。一般道は平均40km/h、高速道路は平均80km/hで計算すること
`;
}
