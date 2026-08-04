import type { GenerateRouteRequest } from './types';

export function buildPrompt(req: GenerateRouteRequest): string {
  const {
    lat, lng, locationName, bikeType, purposes, preferences,
    duration, routeMode, returnType, destination,
    destinationLat, destinationLng,
    emptyRoadMode, todayInfo, weatherInfo,
    planningMode = 'time', targetDistanceKm,
    jarticInfo, departureTime,
  } = req;

  // 出発予定日時（JST表示）。時間帯による混雑傾向を AI に考慮させる
  const departureStr = (() => {
    if (!departureTime) return '';
    const d = new Date(departureTime);
    if (isNaN(d.getTime())) return '';
    const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const dows = ['日', '月', '火', '水', '木', '金', '土'];
    return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日(${dows[jst.getUTCDay()]}) ${jst.getUTCHours()}時${String(jst.getUTCMinutes()).padStart(2, '0')}分`;
  })();

  const locationStr = locationName
    ? `${locationName}（緯度: ${lat.toFixed(4)}, 経度: ${lng.toFixed(4)}）`
    : `緯度: ${lat.toFixed(4)}, 経度: ${lng.toFixed(4)}`;

  // 空いている道優先時は多めに生成し、サーバー側でGoogle実測の混雑率が
  // 低い順に上位3本へ絞り込む（claude.ts 参照）
  const routeCount = emptyRoadMode ? 5 : 3;

  // 走行スタイル・バイク種類・目的に応じた現実的な平均速度
  // ※ この値が maxDistKm（行動半径）の計算基準になるため、過大見積もりは禁物
  const avgSpeed = (() => {
    if (bikeType === '小型125cc以下') return 28;          // 一般道のみ（高速不可）
    if (bikeType === 'オフロード')     return 20;          // 林道・ダート前提
    if (emptyRoadMode)                return 28;           // 空いている道優先モード
    if (preferences.includes('高速使わない')) return 30;   // 下道縛り
    if (preferences.includes('峠道'))         return 30;   // 峠重視＝山間路が中心
    // ワインディング・林道・農道は山間・低速路が中心
    if ((['ワインディング', '林道', '農道'] as string[]).some(p => purposes.includes(p as any))) return 33;
    return 50; // 高速道路活用可の場合
  })();

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

  const destCoordStr = (destinationLat != null && destinationLng != null)
    ? `（座標: ${destinationLat.toFixed(5)}, ${destinationLng.toFixed(5)}）`
    : '';
  const modeStr = routeMode === 'destination' && destination
    ? `目的地指定モード: ${destination}${destCoordStr}へ向かう`
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
  // 片道(none)は全距離を一方向に使えるので道路係数1.3で割る / 往復系は半分
  const isOneWay = returnType === 'none';
  const maxRadiusKm = isOneWay
    ? Math.round(maxDistanceKm / 1.3)
    : Math.round(maxDistanceKm / 2);
  const minDistanceKm = Math.round(maxDistanceKm * 0.9); // 距離モード時の最低走行距離

  // 行動半径の緯度・経度範囲（Claude が具体的に確認できるよう計算）
  const latDeg = maxRadiusKm / 111.0;
  const lngDeg = maxRadiusKm / (111.0 * Math.cos(lat * Math.PI / 180));
  const minLat = (lat - latDeg).toFixed(2);
  const maxLat = (lat + latDeg).toFixed(2);
  const minLng = (lng - lngDeg).toFixed(2);
  const maxLng = (lng + lngDeg).toFixed(2);

  return `あなたはバイクツーリングの専門家AIです。以下の条件で日本国内のバイクツーリングルートを${routeCount}つ提案してください。

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
5. **${routeCount}ルートは異なる方向**: 各ルートが別々の方角へ広がること（北・南・東・西・斜めなど）

【チェックリスト】提案前に各ルートで以下を必ず確認せよ：
- 全経由地が出発地から直線 **${maxRadiusKm}km以内** に収まっているか？ ← ❗最優先確認
- waypointObjects の全区間の距離合計（道路係数1.3〜1.5倍）が ${minDistanceKm}km〜${Math.round(maxDistanceKm * 1.1)}km になっているか？
- 最遠経由地は出発地から直線${Math.round(maxRadiusKm * 0.4)}km以上離れているか？
- 各経由地間が${minPerLegKm}km以上離れているか？` : `
## 【最重要】経由地の距離制約（必ず守ること）
- 出発地から半径 **${maxRadiusKm}km以内** の地点のみ経由地・目的地に設定すること
- 隣接する経由地同士の直線距離は **${minPerLegKm}km〜${maxPerLegKm}km** の範囲内にすること
- 全経由地をGoogle Mapsで繋いだ実際の走行距離が **${distanceGuide}** に収まること
- ❗ ${routeCount}ルートはそれぞれ **異なる方向・異なる経由地** にすること（同じ目的地・経由地を使い回さないこと）`}

## 本日の状況
- 日付: ${todayInfo.dateStr}
${departureStr ? `- 🕐 出発予定: ${departureStr}（この時間帯・曜日の混雑傾向を考慮してルートを選ぶこと）` : ''}
- 季節: ${todayInfo.season}
- 交通状況: ${todayInfo.trafficLabel}
${todayInfo.isHoliday ? `- 祝日: ${todayInfo.holidayName ?? '休日'}のため観光地は混雑予想` : ''}
${weatherStr ? `- ${weatherStr}` : ''}
${jarticInfo && (jarticInfo.busySpots.length > 0 || jarticInfo.quietSpots.length > 0) ? `
## 🚦 リアルタイム国道交通量（JARTIC 実測データ）
${emptyRoadMode ? `【空いている道優先のため特に重要】` : ''}以下は出発地周辺の国道交通量センサーの現在の実測値です。座標から該当する国道を推定し、ルート選定に反映すること。
${jarticInfo.busySpots.length > 0 ? `
❌ 現在混雑している地点（この付近の国道はできるだけ避けること）:
${jarticInfo.busySpots.map(s => `  - (${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}) 交通量${s.volumePer5min}台/5分`).join('\n')}` : ''}
${jarticInfo.quietSpots.length > 0 ? `
✅ 現在空いている地点（この付近の国道は積極的に活用してよい）:
${jarticInfo.quietSpots.map(s => `  - (${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}) 交通量${s.volumePer5min}台/5分`).join('\n')}` : ''}

※ 国土交通省 JARTIC の ${jarticInfo.timeCode.slice(8, 10)}:${jarticInfo.timeCode.slice(10, 12)} 時点のリアルタイム計測値（周辺${jarticInfo.sensorCount}センサー）。` : ''}

## 出力形式（JSONのみ）
以下のJSON形式で${routeCount}つのルートを返してください。JSONのみを返し、前後の説明文は不要です。

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
        {"name": "実在施設・地点名（道の駅/SA/PA/展望台/神社/峠名など固有名詞のみ。「〇〇エリア」「〇〇地帯」等の架空名禁止）", "lat": 緯度（小数点4桁の実在座標、末尾ゼロ埋め禁止）, "lng": 経度（同上）, "description": "説明", "type": "start | waypoint | destination"}
      ],
      "highlightWaypoints": [
        {"name": "ハイライト地点名", "lat": 緯度, "lng": 経度, "description": "見どころの説明", "type": "highlight"}
      ]
    }
  ]
}
\`\`\`

## 重要な注意事項
1. waypointObjectsには【峠・展望台・道の駅・岬・湖・温泉地・観光地・絶景スポット】など走行上・観光上の意味がある地点のみ設定すること。市街地の交差点や住宅街の通過点は絶対に含めないこと。5〜9地点に絞ること（3bの入口・出口ペアを含む）
   【重要】全ての経由地は出発地〜終着地の自然な走行ルート上またはその近辺（直線距離で±30km以内の回り道）に配置すること。1か所だけ大きく離れた場所（他の経由地と50km以上離れている）を追加してはいけない。経由地全体が地図上で一本のルートとして視覚的に繋がるよう配置すること
2. highlightWaypointsには特に見どころとなる地点を2〜3か所設定すること
3. 緯度・経度は実際の日本の陸上地点に正確な値を使用すること。【絶対禁止】35.5000000や140.6700000のような末尾ゼロ埋めの座標は使わないこと（架空座標の証拠）。必ず小数点以下4桁以上の実在する座標（例: 35.5273, 140.6821）を使用すること
3a. 【waypointObjects の name は実在施設・地点名のみ】以下のルールを厳守すること：
    ✅ OK（Googleマップで検索できる実在名称）: 「道の駅 さんぶの森」「蓮田SA」「伊豆スカイライン 天城高原IC」「城ヶ崎海岸」「弘法山公園展望台」
    ❌ NG（架空エリア名・曖昧な地域名）: 「八千代市南部農道エリア」「印旛沼西部田園地帯」「真亀川沿い農道区間」「〇〇市北部の丘陵地帯」
    経由地のnameには必ず「道の駅・SA・PA・展望台・神社・公園・温泉・岬・ダム・橋・峠名」など固有名詞を持つ実在施設・地点名を使用すること。
    lat/lngはその施設の駐車場または道路上の座標を使用すること（施設名でGoogleマップ検索したときに表示される座標に近い値）。
3b. 【峠・スカイライン・ワインディング路など「その道を走ること」が目的の道路は入口＋出口の2点セット】
    Google Mapsは経由地の座標しか受け取れないため、1点だけ置くと並行するバイパスや別の道を選んでしまい、その道を走れない。
    「走らせたい道路」には必ず入口と出口の2点を waypointObjects に含めること。
    ✅ 例:「伊豆スカイライン 熱海峠IC」＋「伊豆スカイライン 天城高原IC」/「いろは坂入口（馬返）」＋「明智平展望台」
    立ち寄りスポット（道の駅・展望台・温泉・神社など）は従来どおり1点でよい。
3c. 【説明文とルートの一致・絶対厳守】
    description と caution に登場する道路名・峠名・スポット名は、必ず waypointObjects または highlightWaypoints に含まれている地点のみにすること。
    ❌ 禁止: 経由地に含まれていない道・場所を説明文に書くこと（ユーザーが地図を開いたとき「説明と違う」というクレームになる）
    ❌ 禁止: 走らない・立ち寄らない場所の魅力を説明文で語ること
    説明文を書く前に、登場する固有名詞がすべて waypointObjects / highlightWaypoints に存在するか確認すること。
4. バイク種類「${bikeType}」に適した道路を選ぶこと${bikeType === '小型125cc以下' ? '（125cc以下のため高速道路・自動車専用道路・バイパスは絶対に使用しないこと。一般道のみ）' : bikeType === 'オフロード' ? '（オフロード車のため林道・ダート道・未舗装路を積極的に活用すること）' : '（中型以上のため高速道路・有料道路・山岳道路など全ての道路を活用してよい）'}
5. 季節「${todayInfo.season}」と交通状況「${todayInfo.trafficLabel}」を考慮すること
6. ${routeCount}ルートはそれぞれ異なるキャラクター（難易度・方向・テーマ）を持たせること
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
    - 【徒歩・ハイキング絶対禁止】徒歩・ハイキング・登山を含むルートを絶対に提案しないこと。すべての移動はバイクで走行できる道路のみで完結させること
    - 車道のない山頂・登山道のみでアクセスする場所（例: 山頂の展望台で車道がないもの、登山でしか行けない場所）
    - 歩行者専用エリア・遊歩道のみの場所
    - 橋のない離島・フェリーのみでアクセスする島（本州・四国・九州・北海道と橋でつながっていない島）
    - 駐車場・車道が存在しない場所
    - 通行止め区間・冬季閉鎖中の道路（季節「${todayInfo.season}」を考慮）
    - 【絶対禁止】経由地・目的地の座標（lat/lng）を海上・川上・湖上・航路上・無人島に設定しないこと。必ず陸上の施設・道路・港・駐車場の座標を使うこと
    - 【フェリー・船舶 絶対禁止】フェリー・旅客船・高速船・渡船・カーフェリーなどあらゆる船舶を使うルートを絶対に提案しないこと。ルートはすべて陸路（道路・橋・トンネル）のみで完結させること
    - 【禁止ルートの具体例】東京湾フェリー（久里浜〜金谷）、竹芝〜伊豆諸島、本州〜佐渡、本州〜壱岐・対馬、九州〜屋久島・種子島、北海道〜利尻・礼文など
    - 【橋でつながっていない島・離島への経由・目的地は禁止】伊豆大島・三宅島・八丈島・佐渡島・隠岐・対馬・壱岐・屋久島・種子島・奄美大島など船でしか行けない島は絶対に使わないこと
    - 【陸路でアクセスできる島はOK】淡路島（明石海峡大橋）・小豆島は橋なし、能島なども禁止。本州四国連絡橋（瀬戸大橋・明石海峡大橋・しまなみ海道）・青函トンネルは陸路なのでOK
    - 港・フェリーターミナル・桟橋（竹芝桟橋・久里浜港・金谷港 等）を経由地に含めることも禁止
    - 【狭隘路・酷道禁止】バイク種類「${bikeType}」で安全に走行・転回できない狭隘路は避けること。具体的には：車のすれ違いが不可能な1車線狭路（いわゆる酷道・険道）、スイッチバックが必要な極端なヘアピン連続区間、落石・崩落リスクが高い険しい山岳路は提案しないこと。
    ✅ 正しい例：道の駅・展望台（駐車場あり・バイクで横付け可）・温泉施設・道路沿いの岬・湖畔の駐車場
    ❌ 悪い例：登山でしか行けない山頂、徒歩30分以上の展望台、橋のない島、歩行者専用の遊歩道終点、海上・水上の座標、フェリー乗り場
    【❌ 徒歩が必要な場所の具体例（絶対に含めない）】: 滝（駐車場から徒歩が必要なもの）・登山口・トレッキングコース起点・車両通行不可の展望台・山岳寺院（石段のみのもの）
${bikeType === '小型125cc以下' ? `【🚫 原付・小型バイク制限（125cc以下）絶対厳守】このバイクは道路交通法により高速道路・自動車専用道路の走行が法律で禁止されています。
    - 高速道路（首都高・東名・名神・圏央道・関越・東北道・中央道・常磐道など）の走行は完全禁止
    - 自動車専用道路・有料バイパスの走行も禁止
    - SA（サービスエリア）・PA（パーキングエリア）は高速道路上にあるため経由地に含めることも禁止
    - すべてのルートを一般道（国道・県道・市道・農道・峠道）のみで構成すること
    ✅ OK: 道の駅・一般道沿いの展望台・温泉・道路沿いの岬・湖畔
    ❌ NG: 〇〇SA・〇〇PA・〇〇IC・〇〇JCT・首都高・〇〇自動車道を経由するルート` : ''}
${preferences.includes('高速使わない') ? `【🚫 高速・有料道禁止】「高速使わない」が選択されています。以下を厳守すること：
    - 高速道路・自動車専用道路・有料バイパス・有料道路の走行は完全禁止
    - SA（サービスエリア）・PA（パーキングエリア）を経由地・休憩ポイントに含めることは禁止
    - すべての区間を無料の一般道（国道・県道・市道・農道・峠道・スカイライン等）のみで構成すること
    ❌ 禁止の具体例：〇〇SA・〇〇PA・道央自動車道・東名高速・名神高速・東北自動車道、など高速道路上の施設すべて` : ''}
${(todayInfo.season === '冬') ? `
【❄️ 冬期閉鎖警告】現在冬期のため、以下の山岳道路は冬期閉鎖中です。これらを含むルートは絶対に提案しないこと：
ビーナスライン（白樺湖〜美ヶ原区間）・志賀草津道路（草津〜志賀高原）・磐梯吾妻スカイライン・西吾妻スカイバレー・蔵王エコーライン・乗鞍スカイライン・富士スバルライン・富士山スカイライン・大雪山層雲峡〜黒岳ライン・知床横断道路、その他標高1,000m超の山岳道路・峠道全般` : ''}
${(todayInfo.season === '春') ? `
【🌸 春先・道路開通前警告】現在春先のため、以下の山岳道路は冬期閉鎖がまだ解除されていない可能性があります。開通確認ができない限りルートに含めないこと（例年4月〜5月上旬が開通時期）：
ビーナスライン・志賀草津道路・磐梯吾妻スカイライン・乗鞍スカイライン・蔵王エコーライン・富士スバルライン等の高山道路` : ''}
${purposes.includes('ワインディング') ? `11. 目的に「ワインディング」が含まれているため、以下の道路を最優先でルートに組み込むこと：
    【最優先】スカイライン（例: 伊豆スカイライン・箱根スカイライン・ビーナスライン・磐梯吾妻スカイライン・蔵王エコーライン・西吾妻スカイバレー・富士スカイライン・日本スカイライン・小浜温泉スカイライン など）
    【次点】ドライブウェイ（例: 十和田湖ドライブウェイ・磐梯山ゴールドライン・草津白根ドライブウェイ など）
    【その他優先】パノラマライン・グリーンライン・渓谷ライン・高原道路・有料山岳道路
    出発地点から行ける範囲にこれらの道路がある場合は、必ずルートに含めること。スカイライン・ドライブウェイを経由地として waypointObjects に明記すること` : ''}
${purposes.includes('林道') ? '11. 目的に「林道」が含まれているため、未舗装路・グラベル道・山岳林道・ダート道を積極的にルートに組み込むこと。舗装路よりも林道・砂利道・山道を優先し、オフロード走行の醍醐味が味わえるルートにすること。cautionには必ず路面状況（未舗装区間・ぬかるみ注意など）を記載すること' : ''}
${purposes.includes('農道') ? `11. 目的に「農道」が含まれているため、農道・農免道路・田園地帯を縫う一本道を積極的にルートに組み込むこと。信号がほぼなく交通量が極めて少ない農道を優先し、田んぼ・畑・水田の間をスロットル全開で走り続けられる爽快感を重視すること。北海道・東北・北陸・関東平野・九州平野など広大な農地エリアの直線路を積極的に活用すること。waypointObjectsには農道沿いの道の駅・産直施設・農産物直売所・展望スポットなど農道ツーリングならではの立ち寄りスポットを含めること。
    【重要・農道品質基準】「広域農道」「農免道路」など普通自動車・大型バイクが安全にすれ違える舗装路を対象とすること。軽トラしか通れない狭小農道・未舗装のあぜ道・農耕車専用路は絶対に含めないこと（目的に「林道」が含まれる場合を除く）。` : ''}
${purposes.includes('キャンプ') ? '12. 目的に「キャンプ」が含まれているため、キャンプ場・オートキャンプ場・無料キャンプ場を経由地に積極的に含めること。焚き火・テント泊に適した自然豊かなエリアを優先し、キャンプ場名をwaypointObjectsのnameに明記すること' : ''}
${purposes.includes('湖・高原') ? '13. 目的に「湖・高原」が含まれているため、湖畔・高原・山岳リゾートを経由地に積極的に含めること。湖の展望スポット・高原の絶景道路を優先し、季節の景色（新緑・紅葉・雪景色など）も考慮すること' : ''}
${purposes.includes('城・史跡') ? '14. 目的に「城・史跡」が含まれているため、城・城址・神社仏閣・古戦場・史跡公園などを経由地に積極的に含めること。歴史的価値の高いスポットを優先し、waypointObjectsのdescriptionに簡単な歴史的説明を加えること' : ''}
`;
}
