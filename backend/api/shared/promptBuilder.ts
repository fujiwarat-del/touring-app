import type { GenerateRouteRequest } from './types';

export function buildPrompt(req: GenerateRouteRequest): string {
  const {
    lat, lng, locationName, bikeType, purposes, preferences,
    duration, routeMode, returnType, destination,
    emptyRoadMode, todayInfo, weatherInfo,
    planningMode = 'time', targetDistanceKm,
  } = req;

  const locationStr = locationName
    ? `${locationName}（緯度: ${lat.toFixed(4)}, 経度: ${lng.toFixed(4)}）`
    : `緯度: ${lat.toFixed(4)}, 経度: ${lng.toFixed(4)}`;

  // 走行スタイルに応じた平均速度
  const avgSpeed = emptyRoadMode
    ? 28   // 空いている道優先：山道・ワインディング多用 → 平均28km/h
    : 55;  // 時間優先：高速活用 → 平均55km/h

  // 距離モード vs 時間モードで上限距離と表示文字列を切り替え
  const isDistanceMode = planningMode === 'distance' && targetDistanceKm != null;
  const maxDistanceKm = isDistanceMode
    ? targetDistanceKm!
    : Math.round((duration / 60) * avgSpeed);

  const hours = isDistanceMode
    ? maxDistanceKm / avgSpeed                     // 距離÷速度で推定時間
    : duration / 60;
  const durationStr = isDistanceMode
    ? `約${Math.round(hours * 10) / 10}時間（${targetDistanceKm}kmから推算）`
    : hours >= 1
      ? `${hours.toFixed(1).replace(/\.0$/, '')}時間`
      : `${duration}分`;

  const distanceGuide = isDistanceMode
    ? `${Math.round(maxDistanceKm * 0.9)}〜${Math.round(maxDistanceKm * 1.1)}km`  // ±10%
    : `${Math.round(maxDistanceKm * 0.8)}〜${maxDistanceKm}km`;

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

  // 経由地間の距離計算
  const maxLegsCount = 6; // 7地点なら6区間
  const maxPerLegKm = Math.round(maxDistanceKm / maxLegsCount);
  const minPerLegKm = Math.max(5, Math.round(maxDistanceKm / 12)); // 経由地間の最低距離
  const maxRadiusKm = Math.round(maxDistanceKm / 2);
  const minDistanceKm = Math.round(maxDistanceKm * 0.9); // 距離モード時の最低走行距離

  // 行動半径の緯度・経度範囲（Claude が具体的に確認できるよう計算）
  const latDeg = maxRadiusKm / 111.0;
  const lngDeg = maxRadiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
  const minLat = (lat - latDeg).toFixed(2);
  const maxLat = (lat + latDeg).toFixed(2);
  const minLng = (lng - lngDeg).toFixed(2);
  const maxLng = (lng + lngDeg).toFixed(2);

  return `あなたはバイクツーリングの専門家AIです。以下の条件で日本国内のバイクツーリングルートを3つ提案してください。

## 出発地点
${locationStr}

## ❗❗❗【絶対厳守・最優先】行動半径制約 ❗❗❗
出発地から **直線距離 ${maxRadiusKm}km以内** の地点のみ経由地・目的地に使用できます。
この範囲を超えた経由地を設定すると、システムが自動削除して**ルートが崩壊**します。

✅ 使用可能な座標範囲:
  緯度 ${minLat} 〜 ${maxLat}
  経度 ${minLng} 〜 ${maxLng}

❌ この範囲を**1つでも超えた**経由地はNG（システムが自動削除してルートが消える）

**提案前に各経由地の緯度・経度がこの範囲内に収まっているか必ず確認してください。**

## ツーリング条件
- バイク種類: ${bikeType}
- 目的: ${purposes.join('、')}
- 走行スタイル: ${preferences.join('、')}
- プランニングモード: ${isDistanceMode ? `📍 距離指定（目標 ${targetDistanceKm}km）` : `⏱️ 時間指定（${durationStr}）`}
${isDistanceMode
  ? `- 走行距離の目標: **${targetDistanceKm}km**（許容範囲: ${distanceGuide}、この範囲外は絶対NG）\n- 所要時間: distanceに合わせてAIが現実的な時間を計算すること`
  : `- 所要時間: ${durationStr}（厳守）\n- 適切な距離の目安: ${distanceGuide}（この範囲内に収めること）`}
- ルートモード: ${modeStr}
- ${returnStr}
- ${roadStr}
${isDistanceMode ? `
## ❗❗❗【最重要・距離必達】走行距離 ${targetDistanceKm}km を達成すること ❗❗❗
以下の条件をすべて満たさないルートは絶対に提案しないこと：

1. **最低走行距離**: 実走行距離が必ず **${minDistanceKm}km以上** であること
   → ${minDistanceKm}km未満のルートは条件違反。絶対にNG。
2. **目標走行距離**: 実走行距離が **${distanceGuide}** の範囲内であること
3. **行動半径**: 出発地から最も遠い経由地まで直線距離で **${Math.round(maxRadiusKm * 0.4)}km〜${maxRadiusKm}km** 離れていること
   → ${targetDistanceKm}kmを走るには、出発地から${Math.round(maxRadiusKm * 0.4)}km以上離れた場所まで必ず足を延ばすこと
4. **経由地間距離**: 隣接する経由地の直線距離が **${minPerLegKm}km〜${maxPerLegKm}km** の範囲内
   → ${minPerLegKm}km未満の近すぎる経由地は距離を稼げないため禁止
5. **3ルートは異なる方向**: 各ルートが別々の方角へ広がること（北・南・東・西・斜めなど）

【チェックリスト】提案前に各ルートで以下を必ず確認せよ：
- 全経由地が出発地から直線 **${maxRadiusKm}km以内** に収まっているか？ ← ❗最優先確認
- waypointObjects の全区間の距離合計（道路係数1.3〜1.5倍）が ${minDistanceKm}km〜${Math.round(maxDistanceKm * 1.1)}km になっているか？
- 最遠経由地は出発地から直線${Math.round(maxRadiusKm * 0.4)}km以上離れているか？
- 各経由地間が${minPerLegKm}km以上離れているか？` : `
## 【最重要】経由地の距離制約（必ず守ること）
- 出発地から半径 **${maxRadiusKm}km以内** の地点のみ経由地・目的地に設定すること
- 隣接する経由地同士の直線距離は **${minPerLegKm}km〜${maxPerLegKm}km** の範囲内にすること
- 全経由地をGoogle Mapsで繋いだ実際の走行距離が **${distanceGuide}** に収まること
- ❗ 3ルートはそれぞれ **異なる方向・異なる経由地** にすること（同じ目的地・経由地を使い回さないこと）`}

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
        {"name": "地点名", "lat": 緯度（小数点4桁の実在座標、末尾ゼロ埋め禁止）, "lng": 経度（同上）, "description": "説明", "type": "start | waypoint | destination"}
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
3. 緯度・経度は実際の日本の陸上地点に正確な値を使用すること。【絶対禁止】35.5000000や140.6700000のような末尾ゼロ埋めの座標は使わないこと（架空座標の証拠）。必ず小数点以下4桁以上の実在する座標（例: 35.5273, 140.6821）を使用すること
4. バイク種類「${bikeType}」に適した道路を選ぶこと${bikeType === '小型125cc以下' ? '（125cc以下のため高速道路・自動車専用道路・バイパスは絶対に使用しないこと。一般道のみ）' : ''}
5. 季節「${todayInfo.season}」と交通状況「${todayInfo.trafficLabel}」を考慮すること
6. 3ルートはそれぞれ異なるキャラクター（難易度・方向・テーマ）を持たせること
7. 出発地点から実際に行ける現実的なルートのみを提案すること
${isDistanceMode
  ? `8. 【距離必達】distanceフィールドは必ず **${distanceGuide}** の範囲内に収めること。
   - ✅ OK例: 「約${Math.round(maxDistanceKm * 0.95)}km」「約${targetDistanceKm}km」「約${Math.round(maxDistanceKm * 1.05)}km」
   - ❌ NG例: 「約${Math.round(maxDistanceKm * 0.4)}km」「約${Math.round(maxDistanceKm * 0.5)}km」（目標の半分以下は条件違反）
   - waypointObjectsの全区間を合計してdistanceが${minDistanceKm}km以上になっているか必ず確認してから出力すること
9. timeフィールドは走行距離${targetDistanceKm}kmに見合った現実的な時間を記載すること。
   道路種別ごとの目安速度：【峠・ワインディング・山岳道路】平均20〜25km/h、【山間の一般道・県道】平均25〜35km/h、【平地の国道・幹線道路】平均35〜45km/h、【高速道路】平均80km/h`
  : `8. distanceフィールドは必ず「適切な距離の目安: ${distanceGuide}」の範囲内に収めること。この距離を大幅に超えるルートは所要時間内に走り切れないため絶対に提案しないこと
9. timeフィールドはGoogle Mapsの経路案内で表示される所要時間に近い現実的な値を記載すること。道路種別ごとの目安速度：【峠・ワインディング・山岳道路】平均20〜25km/h、【山間の一般道・県道】平均25〜35km/h、【平地の国道・幹線道路】平均35〜45km/h、【高速道路】平均80km/h。ユーザーが指定した所要時間「${durationStr}」と大きくズレないこと`}
10. 【バイクアクセス厳守】以下の場所は絶対に経由地・目的地に含めないこと：
    - 車道のない山頂・登山道のみでアクセスする場所（例: 山頂の展望台で車道がないもの、登山でしか行けない場所）
    - 歩行者専用エリア・遊歩道のみの場所
    - 橋のない離島・フェリーのみでアクセスする島（本州・四国・九州・北海道と橋でつながっていない島）
    - 駐車場・車道が存在しない場所
    - 通行止め区間・冬季閉鎖中の道路（季節「${todayInfo.season}」を考慮）
    - 【絶対禁止】経由地・目的地の座標（lat/lng）を海上・川上・湖上・航路上・無人島に設定しないこと。必ず陸上の施設・道路・港・駐車場の座標を使うこと
    - 【フェリー移動禁止】ルートの移動手段にフェリーを含めないこと。出発地から目的地まで必ず道路でつながっているルートのみ提案すること。「フェリーで○○へ渡る」「○○港から××島へ」などのルートは絶対NG
    - フェリー乗り場（港）自体は「観光スポットとして立ち寄る経由地」としてのみ使用可。ただしその港から先へフェリーで移動するルートにはしないこと（例: 大洗港に立ち寄るのはOK、でも大洗港→苫小牧のフェリー移動ルートはNG）
    ✅ 正しい例：道の駅・展望台（駐車場あり）・温泉施設・道路沿いの岬・湖畔の駐車場・フェリー乗り場の港
    ❌ 悪い例：登山でしか行けない山頂、橋のない島、歩行者専用の遊歩道終点、海上・水上の座標
${purposes.includes('林道') ? '11. 目的に「林道」が含まれているため、未舗装路・グラベル道・山岳林道・ダート道を積極的にルートに組み込むこと。舗装路よりも林道・砂利道・山道を優先し、オフロード走行の醍醐味が味わえるルートにすること。cautionには必ず路面状況（未舗装区間・ぬかるみ注意など）を記載すること' : ''}
${purposes.includes('キャンプ') ? '12. 目的に「キャンプ」が含まれているため、キャンプ場・オートキャンプ場・無料キャンプ場を経由地に積極的に含めること。焚き火・テント泊に適した自然豊かなエリアを優先し、キャンプ場名をwaypointObjectsのnameに明記すること' : ''}
${purposes.includes('湖・高原') ? '13. 目的に「湖・高原」が含まれているため、湖畔・高原・山岳リゾートを経由地に積極的に含めること。湖の展望スポット・高原の絶景道路を優先し、季節の景色（新緑・紅葉・雪景色など）も考慮すること' : ''}
${purposes.includes('城・史跡') ? '14. 目的に「城・史跡」が含まれているため、城・城址・神社仏閣・古戦場・史跡公園などを経由地に積極的に含めること。歴史的価値の高いスポットを優先し、waypointObjectsのdescriptionに簡単な歴史的説明を加えること' : ''}
`;
}
