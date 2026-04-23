import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { TodayInfo } from '@touring/shared';
import { TRAFFIC_LEVELS } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS } from '../theme/spacing';

interface TrafficBannerProps {
  todayInfo: TodayInfo;
}

export function TrafficBanner({ todayInfo }: TrafficBannerProps) {
  const config = TRAFFIC_LEVELS[todayInfo.trafficLevel - 1] ?? TRAFFIC_LEVELS[2];

  const trafficDots = Array.from({ length: 5 }, (_, i) => i < todayInfo.trafficLevel);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: config.bgColor, borderColor: config.color },
      ]}
    >
      <View style={styles.leftSection}>
        <Text style={styles.dateStr}>{todayInfo.dateStr}</Text>
        <View style={styles.tagRow}>
          <Text style={styles.seasonTag}>{todayInfo.season}</Text>
          {todayInfo.isHoliday && (
            <Text style={styles.holidayTag}>
              {todayInfo.holidayName ?? '休日'}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.rightSection}>
        <Text style={[styles.trafficLabel, { color: config.color }]}>
          {config.label}
        </Text>
        <View style={styles.dotsRow}>
          {trafficDots.map((filled, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: filled ? config.color : COLORS.border },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  leftSection: {
    flex: 1,
  },
  dateStr: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  seasonTag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    backgroundColor: COLORS.borderLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  holidayTag: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  trafficLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
