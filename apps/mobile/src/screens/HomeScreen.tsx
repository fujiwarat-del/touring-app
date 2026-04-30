import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  BIKE_TYPES,
  PURPOSES,
  PREFS,
  DURATION_OPTIONS,
  DISTANCE_OPTIONS,
  APP_CONFIG,
} from '@touring/shared';
import type {
  BikeType,
  TouringPurpose,
  RidingPreference,
  RouteMode,
  ReturnType,
  WeatherInfo,
  PlanningMode,
} from '@touring/shared';
import type { RootStackParamList } from '../../App';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, FONT_WEIGHT, SHADOW } from '../theme/spacing';
import { WeatherBar } from '../components/WeatherBar';
import { TrafficBanner } from '../components/TrafficBanner';
import { useLocation } from '../hooks/useLocation';
import { useTodayInfo } from '../hooks/useTodayInfo';
import { fetchWeather } from '../services/weatherApi';
import { callClaude } from '../services/claudeApi';

type NavigationProp = StackNavigationProp<RootStackParamList, 'HomeTabs'>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const location = useLocation();
  const todayInfo = useTodayInfo(location.lat, location.lng);

  // Weather
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  // Form state
  const [bikeType, setBikeType] = useState<BikeType>('大型');
  const [selectedPurposes, setSelectedPurposes] = useState<TouringPurpose[]>(['ワインディング']);
  const [selectedPrefs, setSelectedPrefs] = useState<RidingPreference[]>([]);
  const [duration, setDuration] = useState(APP_CONFIG.defaultDuration);
  const [routeMode, setRouteMode] = useState<RouteMode>('free');
  const [returnType, setReturnType] = useState<ReturnType>('none');
  const [destination, setDestination] = useState('');
  const [roadSearchMode, setRoadSearchMode] = useState<'normal' | 'empty'>('normal');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('time');
  const [targetDistance, setTargetDistance] = useState(200); // km
  const [generating, setGenerating] = useState(false);

  // Manual departure location
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualLocationText, setManualLocationText] = useState('');
  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLng, setManualLng] = useState<number | null>(null);
  const [manualLocationName, setManualLocationName] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  // Fetch weather when location changes
  useEffect(() => {
    if (location.lat && location.lng && !weatherLoading) {
      setWeatherLoading(true);
      setWeatherError(null);
      fetchWeather(location.lat, location.lng)
        .then((w) => {
          setWeather(w);
          setWeatherLoading(false);
        })
        .catch((err) => {
          setWeatherError('天気情報の取得に失敗しました');
          setWeatherLoading(false);
        });
    }
  }, [location.lat, location.lng]);

  // Effective location (manual overrides GPS)
  const effectiveLat = isManualMode ? manualLat : location.lat;
  const effectiveLng = isManualMode ? manualLng : location.lng;
  const effectiveLocationName = isManualMode ? manualLocationName : location.locationName;

  const handleGeocode = useCallback(async () => {
    if (!manualLocationText.trim()) return;
    setGeocoding(true);
    try {
      // OpenStreetMap Nominatim API（デバイス依存なし・無料）
      const query = encodeURIComponent(manualLocationText.trim());
      const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=ja&countrycodes=jp`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TouringPlannerApp/1.0' },
      });
      if (!res.ok) throw new Error('network error');
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        setManualLat(parseFloat(lat));
        setManualLng(parseFloat(lon));
        // 表示名を簡略化（最初の2〜3要素）
        const shortName = (display_name as string)
          .split(',')
          .slice(0, 2)
          .map((s: string) => s.trim())
          .join(' ');
        setManualLocationName(shortName || manualLocationText.trim());
      } else {
        Alert.alert('場所が見つかりませんでした', '別のキーワードで試してください（例: 箱根、静岡市）');
      }
    } catch {
      Alert.alert('エラー', 'ネットワークエラーが発生しました。通信状態を確認してください。');
    } finally {
      setGeocoding(false);
    }
  }, [manualLocationText]);

  const togglePurpose = (p: TouringPurpose) => {
    setSelectedPurposes((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const togglePref = (p: RidingPreference) => {
    setSelectedPrefs((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const handleGenerate = useCallback(async () => {
    if (!effectiveLat || !effectiveLng) {
      if (isManualMode) {
        Alert.alert('出発地点を検索してください', 'キーワードを入力して検索ボタンを押してください');
      } else {
        Alert.alert(
          '位置情報が必要です',
          '現在地を取得してからルートを生成してください。',
          [
            { text: 'キャンセル', style: 'cancel' },
            { text: '位置情報を取得', onPress: location.fetchLocation },
          ]
        );
      }
      return;
    }

    if (selectedPurposes.length === 0) {
      Alert.alert('ツーリング目的を選択してください');
      return;
    }

    if (routeMode === 'destination' && !destination.trim()) {
      Alert.alert('目的地を入力してください');
      return;
    }

    setGenerating(true);
    try {
      // 距離モード時は距離から推算した所要時間をdurationに設定
      const avgSpeed = roadSearchMode === 'empty' ? 28 : 55;
      const derivedDuration = planningMode === 'distance'
        ? Math.min(360, Math.max(30, Math.round(targetDistance / avgSpeed * 60 / 30) * 30)) as any
        : duration as any;

      const result = await callClaude({
        lat: effectiveLat,
        lng: effectiveLng,
        locationName: effectiveLocationName ?? undefined,
        bikeType,
        purposes: selectedPurposes,
        preferences: selectedPrefs,
        duration: derivedDuration,
        routeMode,
        returnType,
        destination: destination.trim() || undefined,
        emptyRoadMode: roadSearchMode === 'empty',
        todayInfo,
        weatherInfo: weather ?? undefined,
        planningMode,
        targetDistanceKm: planningMode === 'distance' ? targetDistance : undefined,
      });

      navigation.navigate('Results', {
        routes: result.routes,
        startLat: effectiveLat,
        startLng: effectiveLng,
      });
    } catch (err: any) {
      Alert.alert(
        'ルート生成に失敗しました',
        err.message ?? '通信エラーが発生しました。しばらく後でお試しください。'
      );
    } finally {
      setGenerating(false);
    }
  }, [
    effectiveLat,
    effectiveLng,
    effectiveLocationName,
    isManualMode,
    location.fetchLocation,
    bikeType,
    selectedPurposes,
    selectedPrefs,
    duration,
    routeMode,
    returnType,
    destination,
    roadSearchMode,
    planningMode,
    targetDistance,
    todayInfo,
    weather,
    navigation,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏍️ ツーリングプランナー</Text>
        <Text style={styles.headerSubtitle}>AIがあなたの最高のルートを提案</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Traffic Banner */}
        <TrafficBanner todayInfo={todayInfo} />

        {/* Weather Bar */}
        <WeatherBar
          weather={weather}
          loading={weatherLoading}
          error={weatherError}
        />

        {/* Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 出発地点</Text>
          {/* Mode toggle */}
          <View style={styles.locationModeRow}>
            <TouchableOpacity
              style={[styles.locationModeBtn, !isManualMode && styles.locationModeBtnActive]}
              onPress={() => setIsManualMode(false)}
            >
              <Text style={[styles.locationModeText, !isManualMode && styles.locationModeTextActive]}>
                📡 現在地
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.locationModeBtn, isManualMode && styles.locationModeBtnActive]}
              onPress={() => setIsManualMode(true)}
            >
              <Text style={[styles.locationModeText, isManualMode && styles.locationModeTextActive]}>
                ✏️ 手動入力
              </Text>
            </TouchableOpacity>
          </View>

          {isManualMode ? (
            <View>
              <View style={styles.manualInputRow}>
                <TextInput
                  style={styles.manualInput}
                  placeholder="例: 箱根、静岡市、東京都新宿区"
                  placeholderTextColor={COLORS.textMuted}
                  value={manualLocationText}
                  onChangeText={setManualLocationText}
                  onSubmitEditing={handleGeocode}
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={styles.geocodeBtn}
                  onPress={handleGeocode}
                  disabled={geocoding || !manualLocationText.trim()}
                >
                  {geocoding ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.geocodeBtnText}>検索</Text>
                  )}
                </TouchableOpacity>
              </View>
              {manualLat && manualLng && (
                <Text style={styles.manualResult}>
                  ✅ {manualLocationName}（{manualLat.toFixed(4)}, {manualLng.toFixed(4)}）
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.locationBox}>
              {location.loading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : location.lat ? (
                <View style={styles.locationInfo}>
                  <Text style={styles.locationName}>
                    {location.locationName ?? '現在地'}
                  </Text>
                  <Text style={styles.locationCoords}>
                    {location.lat.toFixed(4)}, {location.lng?.toFixed(4)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.locationPlaceholder}>
                  {location.error ?? '位置情報が未取得です'}
                </Text>
              )}
              <TouchableOpacity
                style={styles.locationBtn}
                onPress={location.fetchLocation}
                disabled={location.loading}
              >
                <Text style={styles.locationBtnText}>
                  {location.loading ? '取得中...' : '📡 現在地取得'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Bike Type Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏍️ バイクの種類</Text>
          <View style={styles.chipGrid}>
            {BIKE_TYPES.map((bt) => (
              <TouchableOpacity
                key={bt.value}
                style={[
                  styles.chip,
                  bikeType === bt.value && styles.chipSelected,
                ]}
                onPress={() => setBikeType(bt.value)}
              >
                <Text style={styles.chipIcon}>{bt.icon}</Text>
                <Text
                  style={[
                    styles.chipLabel,
                    bikeType === bt.value && styles.chipLabelSelected,
                  ]}
                >
                  {bt.label}
                </Text>
                <Text
                  style={[
                    styles.chipSub,
                    bikeType === bt.value && styles.chipSubSelected,
                  ]}
                >
                  {bt.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Route Mode Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗺️ ルートモード</Text>
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                routeMode === 'free' && styles.modeToggleBtnActive,
              ]}
              onPress={() => setRouteMode('free')}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  routeMode === 'free' && styles.modeToggleTextActive,
                ]}
              >
                🆓 フリー
              </Text>
              <Text
                style={[
                  styles.modeToggleSub,
                  routeMode === 'free' && styles.modeToggleSubActive,
                ]}
              >
                自由にルートを生成
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                routeMode === 'destination' && styles.modeToggleBtnActive,
              ]}
              onPress={() => setRouteMode('destination')}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  routeMode === 'destination' && styles.modeToggleTextActive,
                ]}
              >
                🎯 目的地指定
              </Text>
              <Text
                style={[
                  styles.modeToggleSub,
                  routeMode === 'destination' && styles.modeToggleSubActive,
                ]}
              >
                目的地に向かうルート
              </Text>
            </TouchableOpacity>
          </View>
          {routeMode === 'destination' && (
            <TextInput
              style={styles.destinationInput}
              placeholder="目的地を入力 (例: 箱根)"
              placeholderTextColor={COLORS.textMuted}
              value={destination}
              onChangeText={setDestination}
            />
          )}
        </View>

        {/* Touring Purpose */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 ツーリング目的（複数選択可）</Text>
          <View style={styles.purposeGrid}>
            {PURPOSES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.purposeChip,
                  selectedPurposes.includes(p.value) && styles.purposeChipSelected,
                ]}
                onPress={() => togglePurpose(p.value)}
              >
                <Text style={styles.purposeIcon}>{p.icon}</Text>
                <Text
                  style={[
                    styles.purposeLabel,
                    selectedPurposes.includes(p.value) && styles.purposeLabelSelected,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Riding Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚙️ 走行スタイル（複数選択可）</Text>
          <View style={styles.purposeGrid}>
            {PREFS.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[
                  styles.purposeChip,
                  selectedPrefs.includes(p.value) && styles.purposeChipSelected,
                ]}
                onPress={() => togglePref(p.value)}
              >
                <Text style={styles.purposeIcon}>{p.icon}</Text>
                <Text
                  style={[
                    styles.purposeLabel,
                    selectedPrefs.includes(p.value) && styles.purposeLabelSelected,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Road Search Mode ← 走行時間の前に移動 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛣️ ルート検索タイプ</Text>
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                roadSearchMode === 'normal' && styles.modeToggleBtnActive,
              ]}
              onPress={() => setRoadSearchMode('normal')}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  roadSearchMode === 'normal' && styles.modeToggleTextActive,
                ]}
              >
                🕐 時間優先
              </Text>
              <Text
                style={[
                  styles.modeToggleSub,
                  roadSearchMode === 'normal' && styles.modeToggleSubActive,
                ]}
              >
                高速・有料道路を活用
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeToggleBtn,
                roadSearchMode === 'empty' && styles.modeToggleBtnActive,
              ]}
              onPress={() => setRoadSearchMode('empty')}
            >
              <Text
                style={[
                  styles.modeToggleText,
                  roadSearchMode === 'empty' && styles.modeToggleTextActive,
                ]}
              >
                🌿 空いている道
              </Text>
              <Text
                style={[
                  styles.modeToggleSub,
                  roadSearchMode === 'empty' && styles.modeToggleSubActive,
                ]}
              >
                交通量の少ない道を優先
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Planning Mode + Duration/Distance */}
        <View style={[styles.section, routeMode === 'destination' && styles.sectionDisabled]}
              pointerEvents={routeMode === 'destination' ? 'none' : 'auto'}>
          <Text style={[styles.sectionTitle, routeMode === 'destination' && styles.textDisabled]}>
            📐 プランニング{routeMode === 'destination' ? '（目的地指定時は不使用）' : ''}
          </Text>

          {/* 時間 / 距離 トグル */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, planningMode === 'time' && styles.modeToggleBtnActive]}
              onPress={() => setPlanningMode('time')}
            >
              <Text style={[styles.modeToggleText, planningMode === 'time' && styles.modeToggleTextActive]}>
                ⏱️ 走行時間
              </Text>
              <Text style={[styles.modeToggleSub, planningMode === 'time' && styles.modeToggleSubActive]}>
                時間を指定してルート提案
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleBtn, planningMode === 'distance' && styles.modeToggleBtnActive]}
              onPress={() => setPlanningMode('distance')}
            >
              <Text style={[styles.modeToggleText, planningMode === 'distance' && styles.modeToggleTextActive]}>
                📍 走行距離
              </Text>
              <Text style={[styles.modeToggleSub, planningMode === 'distance' && styles.modeToggleSubActive]}>
                距離を指定してルート提案
              </Text>
            </TouchableOpacity>
          </View>

          {planningMode === 'time' ? (
            <>
              <Text style={styles.planningSubLabel}>走行時間を選択</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.durationScroll}
              >
                {DURATION_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[
                      styles.durationChip,
                      duration === d.value && styles.durationChipSelected,
                    ]}
                    onPress={() => setDuration(d.value)}
                  >
                    <Text style={[styles.durationText, duration === d.value && styles.durationTextSelected]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {routeMode !== 'destination' && (() => {
                const hours = duration / 60;
                const avgSpeed = roadSearchMode === 'empty' ? 28 : 55;
                const maxDist = Math.round(hours * avgSpeed);
                const minDist = Math.round(maxDist * 0.8);
                return (
                  <View style={styles.distanceGuide}>
                    <Text style={styles.distanceGuideText}>
                      📏 走行距離の目安：約{minDist}〜{maxDist}km
                    </Text>
                    <Text style={styles.distanceGuideSub}>
                      {roadSearchMode === 'empty' ? '山道・ワインディング中心のため短め' : '高速活用により長距離走行可能'}
                    </Text>
                  </View>
                );
              })()}
            </>
          ) : (
            <>
              <Text style={styles.planningSubLabel}>走行距離を選択</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.durationScroll}
              >
                {DISTANCE_OPTIONS.map((d) => (
                  <TouchableOpacity
                    key={d.value}
                    style={[
                      styles.durationChip,
                      targetDistance === d.value && styles.durationChipSelected,
                    ]}
                    onPress={() => setTargetDistance(d.value)}
                  >
                    <Text style={[styles.durationText, targetDistance === d.value && styles.durationTextSelected]}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {routeMode !== 'destination' && (() => {
                const avgSpeed = roadSearchMode === 'empty' ? 28 : 55;
                const estimatedHours = Math.round(targetDistance / avgSpeed * 10) / 10;
                return (
                  <View style={styles.distanceGuide}>
                    <Text style={styles.distanceGuideText}>
                      ⏱️ 所要時間の目安：約{estimatedHours}時間
                    </Text>
                    <Text style={styles.distanceGuideSub}>
                      {roadSearchMode === 'empty' ? '山道・ワインディング中心の推算値' : '高速活用時の推算値'}
                    </Text>
                  </View>
                );
              })()}
            </>
          )}
        </View>

        {/* Return Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔄 帰り方</Text>
          <View style={styles.returnRow}>
            {[
              { value: 'none' as ReturnType, label: '帰りなし', icon: '→' },
              { value: 'same' as ReturnType, label: '折り返し', icon: '↩️' },
              { value: 'different' as ReturnType, label: '違うルート', icon: '🔀' },
            ].map((rt) => (
              <TouchableOpacity
                key={rt.value}
                style={[
                  styles.returnChip,
                  returnType === rt.value && styles.returnChipSelected,
                ]}
                onPress={() => setReturnType(rt.value)}
              >
                <Text style={styles.returnIcon}>{rt.icon}</Text>
                <Text
                  style={[
                    styles.returnLabel,
                    returnType === rt.value && styles.returnLabelSelected,
                  ]}
                >
                  {rt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Generate Buttons */}
        <View style={styles.generateSection}>
          <TouchableOpacity
            style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <View style={styles.generatingContent}>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.generateBtnText}>AIがルートを考えています...</Text>
              </View>
            ) : (
              <Text style={styles.generateBtnText}>
                🚀 AIルートを生成する (3プラン)
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.generateNote}>
            Claude AIがあなたの条件に合わせた最適ルートを提案します
          </Text>
        </View>

        <View style={{ height: SPACING.xxxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingTop: SPACING.xl,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.md,
  },
  section: {
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    ...SHADOW.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  locationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textPrimary,
  },
  locationCoords: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  locationPlaceholder: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
  },
  locationBtn: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    marginLeft: SPACING.md,
  },
  locationBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    width: '47%',
    backgroundColor: COLORS.chipBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  chipIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  chipLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textPrimary,
  },
  chipLabelSelected: {
    color: COLORS.white,
  },
  chipSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textLight,
    marginTop: 2,
  },
  chipSubSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modeToggleBtn: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  modeToggleBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  modeToggleText: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textSecondary,
  },
  modeToggleTextActive: {
    color: COLORS.primary,
  },
  modeToggleSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  modeToggleSubActive: {
    color: COLORS.primaryDark,
  },
  destinationInput: {
    marginTop: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  purposeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  purposeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.chipBg,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 6,
  },
  purposeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  purposeIcon: {
    fontSize: FONT_SIZE.md,
  },
  purposeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.chipText,
  },
  purposeLabelSelected: {
    color: COLORS.white,
  },
  planningSubLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  durationScroll: {
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  durationChip: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.chipBg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  durationChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  durationText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.chipText,
  },
  durationTextSelected: {
    color: COLORS.white,
  },
  returnRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  returnChip: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  returnChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  returnIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  returnLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textSecondary,
  },
  returnLabelSelected: {
    color: COLORS.primary,
  },
  sectionDisabled: {
    opacity: 0.4,
  },
  textDisabled: {
    color: COLORS.textMuted,
  },
  locationModeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  locationModeBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  locationModeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  locationModeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textSecondary,
  },
  locationModeTextActive: {
    color: COLORS.primary,
  },
  manualInputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  geocodeBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  geocodeBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  manualResult: {
    marginTop: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHT.semiBold,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },
  switchTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semiBold,
    color: COLORS.textPrimary,
  },
  switchDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  distanceGuide: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  distanceGuideText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primary,
  },
  distanceGuideSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primaryDark,
    marginTop: 2,
  },
  generateSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  generateBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xl,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.lg,
  },
  generateBtnDisabled: {
    backgroundColor: COLORS.textLight,
  },
  generatingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  generateBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  generateNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
});
