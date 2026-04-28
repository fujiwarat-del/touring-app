// ============================================================
// Touring App - Shared TypeScript Interfaces
// ============================================================

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
  congestion: string;         // e.g. "低" | "中" | "高"
  distance: string;           // e.g. "約150km"
  time: string;               // e.g. "約3.5時間"
  difficulty: string;         // e.g. "中級"
  windingScore: number;       // 1-5
  sceneryScore: number;       // 1-5
  trafficScore: number;       // 1-5
  difficultyScore: number;    // 1-5
  type: string;               // e.g. "ワインディング" | "温泉" etc.
  description: string;
  caution: string;
  waypointObjects: WaypointObject[];
  highlightWaypoints: WaypointObject[];
  mapUrl?: string;            // Google Maps 共有URL（手動投稿時）
  createdAt?: string;         // ISO date string
  userId?: string;
  isSaved?: boolean;
}

export interface TodayInfo {
  dateStr: string;            // e.g. "2025年1月1日(水)"
  isHoliday: boolean;
  holidayName?: string;
  season: string;             // e.g. "冬" | "春" | "夏" | "秋"
  trafficLevel: number;       // 1-5
  trafficLabel: string;       // e.g. "混雑予想: 中"
  trafficColor: string;       // hex color
  dow: string;                // e.g. "水"
  isWeekend: boolean;
}

export interface WeatherInfo {
  temperature: number;        // Celsius
  weatherCode: number;        // WMO weather code
  weatherDescription: string;
  windSpeed: number;          // km/h
  windDirection: number;      // degrees
  precipitation: number;      // mm
  humidity: number;           // percent
  icon: string;               // emoji or icon name
  isGoodForRiding: boolean;
  ridingAdvice: string;
}

export interface CommunityPost {
  id?: string;
  userId: string;
  userDisplayName: string;
  userPhotoUrl?: string;
  route: Route;
  photos: string[];           // Storage URLs
  comment: string;
  likes: number;
  likedBy: string[];
  reactions?: Record<string, number>;  // スタンプリアクション (type → count)
  departureArea: string;      // e.g. "関東" | "北海道" etc.
  prefectures: string[];      // e.g. ["神奈川", "静岡"] (複数可)
  tags: string[];
  createdAt: string | object;  // ISO date string or Firestore FieldValue/Timestamp
  updatedAt?: string | object;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoUrl?: string;
  bikeType?: BikeType;
  homeArea?: string;
  savedRouteCount: number;
  postedRouteCount: number;
  createdAt: string;
}

// ============================================================
// Enums / Union Types
// ============================================================

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
  | 'キャンプ'
  | '湖・高原'
  | '城・史跡';

export type RidingPreference =
  | '信号少な目'
  | '高速使わない'
  | '峠道';

export type RouteMode = 'free' | 'destination';

export type ReturnType = 'none' | 'loop' | 'same' | 'different';

export type Duration = 30 | 60 | 90 | 120 | 150 | 180 | 240 | 300 | 360;

// ============================================================
// API Request/Response types
// ============================================================

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
  emptyRoadMode: boolean;
  todayInfo: TodayInfo;
  weatherInfo?: WeatherInfo;
}

export interface GenerateRouteResponse {
  routes: Route[];
  generatedAt: string;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: string;
}
