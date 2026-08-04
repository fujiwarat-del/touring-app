import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { fetchDailyForecast, type DailyForecast } from '../services/weatherApi';

interface Props {
  lat?: number;
  lng?: number;
}

function getDayLabel(index: number): string {
  if (index === 0) return '今日';
  if (index === 1) return '明日';
  return '明後日';
}

export function WeatherWidget({ lat, lng }: Props) {
  const [weather, setWeather] = useState<DailyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lat || !lng) {
      setLoading(false);
      return;
    }

    fetchDailyForecast(lat, lng, 3)
      .then((forecast) => {
        setWeather(forecast);
        setLoading(false);
      })
      .catch((err) => {
        console.error('[WeatherWidget] forecast failed:', err?.message ?? err);
        setError(true);
        setLoading(false);
      });
  }, [lat, lng]);

  // 座標なし・エラーは非表示
  if (!lat || !lng || error) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📍 出発地付近の天気予報</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#8E8E8E" style={{ marginTop: 8 }} />
      ) : (
        <View style={styles.days}>
          {weather.map((day, index) => (
            <View key={day.date} style={styles.dayItem}>
              <Text style={styles.dayLabel}>{getDayLabel(index)}</Text>
              <Text style={styles.emoji}>{day.icon}</Text>
              <Text style={styles.temp}>{day.tempMax}℃</Text>
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
    backgroundColor: '#F4F4F4',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: '#555555',
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
    color: '#8E8E8E',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  emoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  temp: {
    color: '#111111',
    fontSize: 16,
    fontWeight: 'bold',
  },
  desc: {
    color: '#8E8E8E',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
});
