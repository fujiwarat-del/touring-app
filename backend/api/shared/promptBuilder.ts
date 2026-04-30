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

  // 走行スタイルに応じた距離上限を計算
  const avgSpeed = emptyRoadMode
    ? 28   // 空いている道優先：山道・ワインディング多用 → 平均28km/h
    : 55;  // 時間優先：高速活用 → 平均55km/h
  const maxDistanceKm = Math.round(hours * avgSpeed);
  const distanceGuide = `${Math.round(maxDistanceKm * 0.8)}〜${maxDistanceKm}km`;

  const returnStr =
    returnType === 'loop' ? '帰り: ループで出発地に戻る' :
    returnType === 'same' ? '帰り: 同じ道を折り返す' :
    returnType === 'different' ? '帰り: 行きとは異なる別ルートで出発地に戻る（往路と復路で異なる道を使うこと）' :
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

  // 経由地間の最大距離を計算（総距離 ÷ 区間数）
  const maxLegsCount = 5; // 6地点なら5区間
  const maxPerLegKm = Math.round(maxDistanceKm / maxLegsCount);
  const maxRadiusKm = Math.round(maxDistanceKm / 2);

  return `あなたはバイクツーリングの専門家AIです。以下の条件で日本国内のバイクツーリングルートを3つ提案してください。

## 出発地点
${locationStr}

## ツーリング条件
- バイク種類: ${bikeType}
- 目的: ${purposes.join('、')}
- 走行スタイル: ${preferences.join('、')}
- 所要時間: ${durationStr}（厳守）
- 適切な距離の目安: ${distanceGuide}（この範囲内に収めること）
- ルートモード: ${modeStr}
- ${returnStr}
- ${roadStr}

## 【最重要】経由地の距離制約（必ず守ること）
- 出発地から半径 **${maxRadiusKm}km以内** の地点のみ経由地・目的地に設定すること（例: 半径${maxRadiusKm}kmを超える場所は絶対NG）
- 隣接する経由地同士の **直線距離は最大${maxPerLegKm}km以内** にすること
- 全経由地をGoogle Mapsで繋いだ実際の走行距離が **${distanceGuide}** に収まること
- この制約を守れないルートは提案しないこと
- ❗ 所要時間${durationStr}・距離目安${distanceGuide}のルートで、半径${maxRadiusKm}km以上離れた場所（例: 箱根・伊豆・房総・多摩山地など）は絶対に使わないこと
- ❗ 3ルートはそれぞれ **異なる方向・異なる経由地** にすること（同じ目的地・経由地を使い回さないこと）

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
   【重要】全ての経由地は出発地〜終着地の自然な走行ルート上またはその近辺（直線距離で±30km以内の回り道）に配置すること。1か所だけ大きく離れた場所（他の経由地と50km以上離れている）を追加してはいけない。経由地全体が地図上で一本のルートとして視覚的に繋がるよう配置すること
2. highlightWaypointsには特に見どころとなる地点を2〜3か所設定すること
3. 緯度・経度は実際の日本の地点に正確な値を使用すること
4. バイク種類「${bikeType}」に適した道路を選ぶこと${bikeType === '小型125cc以下' ? '（125cc以下のため高速道路・自動車専用道路・バイパスは絶対に使用しないこと。一般道のみ）' : ''}
5. 季節「${todayInfo.season}」と交通状況「${todayInfo.trafficLabel}」を考慮すること
6. 3ルートはそれぞれ異なるキャラクター（難易度・方向・テーマ）を持たせること
7. 出発地点から実際に行ける現実的なルートのみを提案すること
8. distanceフィールドは必ず「適切な距離の目安: ${distanceGuide}」の範囲内に収めること。この距離を大幅に超えるルートは所要時間内に走り切れないため絶対に提案しないこと
9. timeフィールドはGoogle Mapsの経路案内で表示される所要時間に近い現実的な値を記載すること。道路種別ごとの目安速度：【峠・ワインディング・山岳道路】平均20〜25km/h、【山間の一般道・県道】平均25〜35km/h、【平地の国道・幹線道路】平均35〜45km/h、【高速道路】平均80km/h。ユーザーが指定した所要時間「${durationStr}」と大きくズレないこと
10. 【バイクアクセス厳守】以下の場所は絶対に経由地・目的地に含めないこと：
    - 車道のない山頂・登山道のみでアクセスする場所（例: 山頂の展望台で車道がないもの、登山でしか行けない場所）
    - 歩行者専用エリア・遊歩道のみの場所
    - 橋のない離島・フェリーのみでアクセスする島（本州・四国・九州・北海道と橋でつながっていない島）
    - 駐車場・車道が存在しない場所
    - 通行止め区間・冬季閉鎖中の道路（季節「${todayInfo.season}」を考慮）
    - 【絶対禁止】経由地・目的地の座標（lat/lng）を海上・川上・湖上・航路上・無人島に設定しないこと。必ず陸上の施設・道路・港・駐車場の座標を使うこと
    - フェリーを使うツーリングは現実にあるため、フェリー乗り場（港）は経由地にしてよい。ただし座標は必ず港の陸上施設に設定すること（例：大洗港フェリーターミナル、新潟港、敦賀港）
    ✅ 正しい例：道の駅・展望台（駐車場あり）・温泉施設・道路沿いの岬・湖畔の駐車場・フェリー乗り場の港
    ❌ 悪い例：登山でしか行けない山頂、橋のない島、歩行者専用の遊歩道終点、海上・水上の座標
${purposes.includes('林道') ? '11. 目的に「林道」が含まれているため、未舗装路・グラベル道・山岳林道・ダート道を積極的にルートに組み込むこと。舗装路よりも林道・砂利道・山道を優先し、オフロード走行の醍醐味が味わえるルートにすること。cautionには必ず路面状況（未舗装区間・ぬかるみ注意など）を記載すること' : ''}
${purposes.includes('キャンプ') ? '12. 目的に「キャンプ」が含まれているため、キャンプ場・オートキャンプ場・無料キャンプ場を経由地に積極的に含めること。焚き火・テント泊に適した自然豊かなエリアを優先し、キャンプ場名をwaypointObjectsのnameに明記すること' : ''}
${purposes.includes('湖・高原') ? '13. 目的に「湖・高原」が含まれているため、湖畔・高原・山岳リゾートを経由地に積極的に含めること。湖の展望スポット・高原の絶景道路を優先し、季節の景色（新緑・紅葉・雪景色など）も考慮すること' : ''}
${purposes.includes('城・史跡') ? '14. 目的に「城・史跡」が含まれているため、城・城址・神社仏閣・古戦場・史跡公園などを経由地に積極的に含めること。歴史的価値の高いスポットを優先し、waypointObjectsのdescriptionに簡単な歴史的説明を加えること' : ''}
`;
}
