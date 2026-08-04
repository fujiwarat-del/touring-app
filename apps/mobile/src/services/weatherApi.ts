import { WEATHER_CODES } from '@touring/shared';
import type { WeatherInfo } from '@touring/shared';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    precipitation: number;
    relative_humidity_2m: number;
  };
}

/**
 * Fetch current weather from Open-Meteo API (free, no API key needed)
 */
export async function fetchWeather(
  lat: number,
  lng: number
): Promise<WeatherInfo> {
  const currentFields = [
    'temperature_2m',
    'weather_code',
    'wind_speed_10m',
    'wind_direction_10m',
    'precipitation',
    'relative_humidity_2m',
  ].join(',');

  // URLSearchParams encodes commas as %2C which some APIs reject — build URL manually
  const url = `${BASE_URL}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=${currentFields}&timezone=Asia%2FTokyo&forecast_days=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data: OpenMeteoResponse = await response.json();
  const current = data.current;

  const code = current.weather_code;
  const weatherInfo = WEATHER_CODES[code] ?? {
    description: '不明',
    icon: '🌡️',
  };

  const isGoodForRiding = determineRidingCondition(
    code,
    current.wind_speed_10m,
    current.precipitation,
    current.temperature_2m
  );

  const ridingAdvice = getRidingAdvice(
    code,
    current.wind_speed_10m,
    current.precipitation,
    current.temperature_2m
  );

  return {
    temperature: Math.round(current.temperature_2m),
    weatherCode: code,
    weatherDescription: weatherInfo.description,
    windSpeed: Math.round(current.wind_speed_10m),
    windDirection: current.wind_direction_10m,
    precipitation: current.precipitation,
    humidity: current.relative_humidity_2m,
    icon: weatherInfo.icon,
    isGoodForRiding,
    ridingAdvice,
  };
}

// ── 日別予報（3日間） ──────────────────────────────
export interface DailyForecast {
  date: string;         // YYYY-MM-DD
  weatherCode: number;
  description: string;
  icon: string;
  tempMax: number;
  tempMin: number;
}

/**
 * Open-Meteo の日別予報を取得（無料・APIキー不要）
 * WeatherWidget / DestWeatherBadge 共用
 */
export async function fetchDailyForecast(
  lat: number,
  lng: number,
  days = 3
): Promise<DailyForecast[]> {
  const url = `${BASE_URL}?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&forecast_days=${days}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather forecast API error: ${response.status}`);
  }

  const data = await response.json();
  const daily = data?.daily;
  if (!daily?.time?.length) {
    throw new Error('Weather forecast API returned empty daily data');
  }

  return (daily.time as string[]).map((date, i) => {
    const code = Number(daily.weather_code?.[i] ?? -1);
    const info = WEATHER_CODES[code] ?? { description: '不明', icon: '🌡️' };
    return {
      date,
      weatherCode: code,
      description: info.description,
      icon: info.icon,
      tempMax: Math.round(Number(daily.temperature_2m_max?.[i] ?? 0)),
      tempMin: Math.round(Number(daily.temperature_2m_min?.[i] ?? 0)),
    };
  });
}

function determineRidingCondition(
  code: number,
  windSpeed: number,
  precipitation: number,
  temperature: number
): boolean {
  if (code >= 61 || (code >= 71 && code <= 77)) return false; // Rain or snow
  if (code >= 95) return false; // Thunderstorm
  if (windSpeed > 40) return false; // Strong wind
  if (precipitation > 1) return false;
  if (temperature < 0 || temperature > 38) return false;
  return true;
}

function getRidingAdvice(
  code: number,
  windSpeed: number,
  precipitation: number,
  temperature: number
): string {
  if (code >= 95) return '⛈️ 雷雨のため走行は危険です';
  if (code >= 71 && code <= 77) return '❄️ 積雪・凍結の恐れあり。走行注意';
  if (code >= 61) return '🌧️ 雨天のため視界・路面状況に注意';
  if (windSpeed > 40) return '💨 強風注意。ハンドル操作に気をつけて';
  if (windSpeed > 25) return '🌬️ やや強い風。開けた場所では注意';
  if (precipitation > 0.5) return '☔ 弱い雨。レインウェアを推奨';
  if (temperature < 5) return '🥶 気温が低いです。防寒装備必須';
  if (temperature < 0) return '🧊 氷点下。路面凍結の危険あり';
  if (temperature > 35) return '🌡️ 酷暑。熱中症対策と水分補給を';
  if (code <= 1) return '☀️ ツーリング日和！';
  if (code <= 3) return '⛅ まずまずのコンディションです';
  return '走行可能なコンディションです';
}
