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

export type BikeType = '大型' | '中型' | 'オフロード' | 'スクーター';
export type TouringPurpose = 'ワインディング' | '温泉' | '海沿い' | 'グルメ' | '道の駅' | '絶景';
export type RidingPreference = '信号少な目' | '高速使わない' | '峠道' | '下道' | '川沿い';
export type RouteMode = 'free' | 'destination';
export type ReturnType = 'none' | 'loop' | 'same';
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
