import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { WeatherInfo } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS } from '../theme/spacing';

interface WeatherBarProps {
  weather: WeatherInfo | null;
  loading?: boolean;
  error?: string | null;
}

export function WeatherBar({ weather, loading, error }: WeatherBarProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.loadingText}>天気情報を取得中...</Text>
      </View>
    );
  }

  if (error || !weather) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorIcon}>🌡️</Text>
        <Text style={styles.errorText}>天気情報を取得できませんでした</Text>
      </View>
    );
  }

  const bgColor = weather.isGoodForRiding ? COLORS.primaryLight : '#FEF0E0';
  const borderColor = weather.isGoodForRiding ? COLORS.primary : COLORS.warning;

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderColor }]}>
      <View style={styles.mainInfo}>
        <Text style={styles.icon}>{weather.icon}</Text>
        <View style={styles.details}>
          <Text style={styles.description}>{weather.weatherDescription}</Text>
          <Text style={styles.stats}>
            {weather.temperature}°C　風{weather.windSpeed}km/h　湿度{weather.humidity}%
          </Text>
        </View>
      </View>
      <View style={styles.adviceRow}>
        <Text style={[styles.advice, { color: weather.isGoodForRiding ? COLORS.primary : COLORS.warning }]}>
          {weather.ridingAdvice}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
  },
  errorContainer: {
    backgroundColor: '#F5F5F5',
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 28,
    marginRight: SPACING.md,
  },
  details: {
    flex: 1,
  },
  description: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  stats: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  adviceRow: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  advice: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginLeft: SPACING.sm,
  },
  errorIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  errorText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});
