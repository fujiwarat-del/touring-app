import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '../theme/colors';
import { fetchDailyForecast, type DailyForecast } from '../services/weatherApi';

interface Props {
  lat: number;
  lng: number;
  locationName?: string;
}

export function DestWeatherBadge({ lat, lng, locationName }: Props) {
  const [weather, setWeather] = useState<DailyForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!lat || !lng) {
      setLoading(false);
      return;
    }

    fetchDailyForecast(lat, lng, 2)
      .then((forecast) => {
        setWeather(forecast);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [lat, lng]);

  if (!lat || !lng || error) return null;

  const labels = ['今日', '明日'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        🗺️ ツーリング先の天気{locationName ? `（${locationName}付近）` : ''}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 6 }} />
      ) : (
        <View style={styles.row}>
          {weather.map((day, i) => (
            <View key={day.date} style={styles.dayItem}>
              <Text style={styles.dayLabel}>{labels[i] ?? ''}</Text>
              <Text style={styles.emoji}>{day.icon}</Text>
              <Text style={styles.temp}>{day.tempMax}℃</Text>
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
