export interface WaypointObject {
  name: string;
  lat: number;
  lng: number;
  description?: string;
  type?: 'start' | 'waypoint' | 'destination' | 'highlight';
}

export interface Route {
  id?: string;
  name: string;
  congestion: string;
  distance: string;
  time: string;
  difficulty: string;
  windingScore: number;
  sceneryScore: number;
  trafficScore: number;
  difficultyScore: number;
  type: string;
  description: string;
  caution: string;
  waypointObjects: WaypointObject[];
  highlightWaypoints: WaypointObject[];
  createdAt?: string;
  userId?: string;
  isSaved?: boolean;
  distanceVerified?: boolean; // Google Maps Routes API で距離・時間を検証済み
  trafficRatio?: number;      // 渋滞込み時間 ÷ 通常時間（1.0=渋滞なし）
}

export interface TodayInfo {
  dateStr: string;
  isHoliday: boolean;
  holidayName?: string;
  season: string;
  trafficLevel: number;
  trafficLabel: string;
  trafficColor: string;
  dow: string;
  isWeekend: boolean;
}

export interface WeatherInfo {
  temperature: number;
  weatherCode: number;
  weatherDescription: string;
  windSpeed: number;
  windDirection: number;
  precipitation: number;
  humidity: number;
  icon: string;
  isGoodForRiding: boolean;
  ridingAdvice: string;
}

export type BikeType = '大型' | '中型' | 'オフロード' | '小型125cc以下';
export type TouringPurpose =
  | 'ワインディング'
  | '温泉'
  | '海沿い'
  | '川沿い'
  | 'グルメ'
  | '道の駅'
  | '絶景'
  | '林道'
  | '農道'
  | 'キャンプ'
  | '湖・高原'
  | '城・史跡';
export type RidingPreference = '信号少な目' | '高速使わない' | '峠道';
export type RouteMode = 'free' | 'destination';
export type ReturnType = 'none' | 'loop' | 'same' | 'different';
export type Duration = 30 | 60 | 90 | 120 | 150 | 180 | 240 | 300 | 360;

export interface CommunityPost {
  id?: string;
  userId: string;
  userDisplayName: string;
  userPhotoUrl?: string;
  route: Route;
  photos: string[];
  comment: string;
  likes: number;
  likedBy: string[];
  departureArea: string;
  tags: string[];
  createdAt: string | object;
  updatedAt?: string | object;
}

export type PlanningMode = 'time' | 'distance';

export interface TrafficSpot {
  lat: number;
  lng: number;
  volumePer5min: number;
}

export interface JarticCongestion {
  busySpots: TrafficSpot[];
  quietSpots: TrafficSpot[];
  sensorCount: number;
  timeCode: string;
}

export interface GenerateRouteRequest {
  lat: number;
  lng: number;
  locationName?: string;
  bikeType: BikeType;
  purposes: TouringPurpose[];
  preferences: RidingPreference[];
  duration: Duration;
  routeMode: RouteMode;
  returnType: ReturnType;
  destination?: string;
  destinationLat?: number;
  destinationLng?: number;
  emptyRoadMode: boolean;
  todayInfo: TodayInfo;
  weatherInfo?: WeatherInfo;
  planningMode?: PlanningMode;     // 'time'（デフォルト） or 'distance'
  targetDistanceKm?: number;       // 距離モード時のみ（km）
  departureTime?: string;          // 出発予定日時（ISO 8601）。未指定=今すぐ出発
  jarticInfo?: JarticCongestion;   // JARTIC リアルタイム交通量（オプション）
}
