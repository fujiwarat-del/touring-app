import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS } from '../theme/colors';
import { FONT_SIZE, SPACING } from '../theme/spacing';

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
  const safeScore = typeof score === 'number' && !isNaN(score) ? score : Number(score) || 0;
  const clampedScore = Math.max(0, Math.min(safeScore, maxScore));
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
  windingScore = 0,
  sceneryScore = 0,
  trafficScore = 0,
  difficultyScore = 0,
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

// ─── 入力用（投稿時に自分で評価を付ける） ─────────────────────
interface StarInputProps {
  label: string;
  icon: string;
  hint?: string;
  score: number;          // 0 = 未評価
  onChange: (score: number) => void;
  labelColor?: string;
  hintColor?: string;
}

export function StarInput({
  label, icon, hint, score, onChange, labelColor, hintColor,
}: StarInputProps) {
  return (
    <View style={inputStyles.container}>
      <View style={inputStyles.labelWrap}>
        <Text style={[inputStyles.label, labelColor ? { color: labelColor } : null]}>
          {icon} {label}
        </Text>
        {hint && (
          <Text style={[inputStyles.hint, hintColor ? { color: hintColor } : null]}>{hint}</Text>
        )}
      </View>
      <View style={inputStyles.starsRow}>
        {Array.from({ length: 5 }, (_, i) => (
          <TouchableOpacity
            key={i}
            // 同じ星をもう一度押すと解除（未評価に戻す）
            onPress={() => onChange(score === i + 1 ? 0 : i + 1)}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text
              style={[
                inputStyles.star,
                { color: i < score ? COLORS.starFilled : COLORS.starEmpty },
              ]}
            >
              ★
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  labelWrap: { flex: 1 },
  label: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  starsRow: { flexDirection: 'row' },
  star: {
    fontSize: 28,
    marginLeft: 2,
  },
});

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
