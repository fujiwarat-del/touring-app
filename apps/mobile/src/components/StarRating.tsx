import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme/colors';
import { FONT_SIZE } from '../theme/spacing';

interface StarRatingProps {
  score: number;       // 1-5
  maxScore?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showNumber?: boolean;
}

export function StarRating({
  score,
  maxScore = 5,
  label,
  size = 'md',
  showNumber = false,
}: StarRatingProps) {
  const clampedScore = Math.max(0, Math.min(score, maxScore));
  const fontSize =
    size === 'sm' ? FONT_SIZE.xs :
    size === 'lg' ? FONT_SIZE.xl :
    FONT_SIZE.md;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { fontSize: fontSize - 2 }]}>{label}</Text>}
      <View style={styles.starsRow}>
        {Array.from({ length: maxScore }, (_, i) => (
          <Text
            key={i}
            style={[
              styles.star,
              {
                fontSize,
                color: i < clampedScore ? COLORS.starFilled : COLORS.starEmpty,
              },
            ]}
          >
            ★
          </Text>
        ))}
        {showNumber && (
          <Text style={[styles.number, { fontSize: fontSize - 2 }]}>
            {clampedScore}
          </Text>
        )}
      </View>
    </View>
  );
}

// Compact row version for cards
interface StarRowProps {
  windingScore: number;
  sceneryScore: number;
  trafficScore: number;
  difficultyScore: number;
}

export function StarRow({
  windingScore,
  sceneryScore,
  trafficScore,
  difficultyScore,
}: StarRowProps) {
  const items = [
    { label: 'ワインディング', score: windingScore, icon: '〜' },
    { label: '景観', score: sceneryScore, icon: '🗻' },
    { label: '交通量', score: trafficScore, icon: '🚗' },
    { label: '難易度', score: difficultyScore, icon: '⚡' },
  ];

  return (
    <View style={rowStyles.container}>
      {items.map((item) => (
        <View key={item.label} style={rowStyles.item}>
          <Text style={rowStyles.itemLabel}>
            {item.icon} {item.label}
          </Text>
          <StarRating score={item.score} size="sm" />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    color: COLORS.textSecondary,
    marginRight: 4,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    marginRight: 1,
  },
  number: {
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
});

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  item: {
    minWidth: '45%',
  },
  itemLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
});
