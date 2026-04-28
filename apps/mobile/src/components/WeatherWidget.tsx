import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface DayWeather {
  date: string;
  emoji: string;
  temp: number;
  description: string;
}

interface Props {
  lat?: number;
  lng?: number;
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

function getDayLabel(index: number): string {
  if (index === 0) return '今日';
  if (index === 1) return '明日';
  return '明後日';
}

export function WeatherWidget({ lat, lng }: Props) {
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
      `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&lang=ja&cnt=24`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!data.list) {
          setError(true);
          setLoading(false);
          return;
        }

        // 日付ごとに1件（昼12時に最も近いもの）を選ぶ
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

        const result: DayWeather[] = Object.values(days)
          .slice(0, 3)
          .map((item: any, index: number) => ({
            date: item.dt_txt.split(' ')[0],
            emoji: getWeatherEmoji(item.weather[0].id),
            temp: Math.round(item.main.temp),
            description: item.weather[0].description,
          }));

        setWeather(result);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [lat, lng, apiKey]);

  // APIキー未設定・座標なし・エラーは非表示
  if (!apiKey || !lat || !lng || error) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📍 出発地付近の天気予報</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#fff" style={{ marginTop: 8 }} />
      ) : (
        <View style={styles.days}>
          {weather.map((day, index) => (
            <View key={day.date} style={styles.dayItem}>
              <Text style={styles.dayLabel}>{getDayLabel(index)}</Text>
              <Text style={styles.emoji}>{day.emoji}</Text>
              <Text style={styles.temp}>{day.temp}℃</Text>
              <Text style={styles.desc} numberOfLines={2}>{day.description}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  days: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  dayItem: {
    alignItems: 'center',
    flex: 1,
  },
  dayLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  emoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  temp: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  desc: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
});
