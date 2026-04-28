import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../theme/colors';

interface DayWeather {
  label: string;
  emoji: string;
  temp: number;
}

interface Props {
  lat: number;
  lng: number;
  locationName?: string;
}

function getWeatherEmoji(id: number): string {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  if (id === 801) return '🌤️';
  if (id >= 802) return '☁️';
  return '🌡️';
}

export function DestWeatherBadge({ lat, lng, locationName }: Props) {
  const [weather, setWeather] = useState<DayWeather[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const apiKey = process.env.EXPO_PUBLIC_OPENWEATHER_API_KEY;

  useEffect(() => {
    if (!apiKey || !lat || !lng) {
      setLoading(false);
      return;
    }

    fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ja&cnt=16`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!data.list) { setError(true); setLoading(false); return; }

        // 日付ごとに昼12時に最も近いものを1件選ぶ
        const days: { [date: string]: any } = {};
        data.list.forEach((item: any) => {
          const [date, time] = item.dt_txt.split(' ');
          const hour = parseInt(time.split(':')[0], 10);
          if (!days[date]) {
            days[date] = item;
          } else {
            const existingHour = parseInt(days[date].dt_txt.split(' ')[1].split(':')[0], 10);
            if (Math.abs(hour - 12) < Math.abs(existingHour - 12)) {
              days[date] = item;
            }
          }
        });

        const labels = ['今日', '明日', '明後日'];
        const result: DayWeather[] = Object.values(days)
          .slice(0, 2)
          .map((item: any, i: number) => ({
            label: labels[i] ?? '',
            emoji: getWeatherEmoji(item.weather[0].id),
            temp: Math.round(item.main.temp),
          }));

        setWeather(result);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [lat, lng, apiKey]);

  if (!apiKey || !lat || !lng || error) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        🗺️ ツーリング先の天気{locationName ? `（${locationName}付近）` : ''}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 6 }} />
      ) : (
        <View style={styles.row}>
          {weather.map((day) => (
            <View key={day.label} style={styles.dayItem}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <Text style={styles.emoji}>{day.emoji}</Text>
              <Text style={styles.temp}>{day.temp}℃</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EBF8F3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#C6EAD9',
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  dayItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dayLabel: {
    fontSize: 11,
    color: '#555',
    fontWeight: '600',
  },
  emoji: {
    fontSize: 16,
  },
  temp: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
});
