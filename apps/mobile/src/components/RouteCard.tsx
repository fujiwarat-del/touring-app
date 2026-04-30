import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import type { Route } from '@touring/shared';
import { makeMapUrl } from '@touring/shared';
import { COLORS } from '../theme/colors';
import { SPACING, FONT_SIZE, RADIUS, SHADOW } from '../theme/spacing';
import { StarRow } from './StarRating';
import { DestWeatherBadge } from './DestWeatherBadge';

interface RouteCardProps {
  route: Route;
  index?: number;
  onSave?: (route: Route) => void;
  onShare?: (route: Route) => void;
  onShowMap?: (route: Route) => void;
  isSaved?: boolean;
  startLat?: number;
  startLng?: number;
  showActions?: boolean;
}

const CONGESTION_COLORS: Record<string, string> = {
  低: COLORS.trafficLow,
  中: COLORS.trafficMed,
  高: COLORS.trafficHigh,
};

const DIFFICULTY_COLORS: Record<string, string> = {
  初級: COLORS.success,
  中級: COLORS.secondary,
  上級: COLORS.danger,
};

export function RouteCard({
  route,
  index,
  onSave,
  onShare,
  onShowMap,
  isSaved = false,
  startLat,
  startLng,
  showActions = true,
}: RouteCardProps) {
  const [expanded, setExpanded] = useState(false);

  const congestionColor = CONGESTION_COLORS[route.congestion] ?? COLORS.textSecondary;
  const difficultyColor = DIFFICULTY_COLORS[route.difficulty] ?? COLORS.textSecondary;

  const handleOpenMap = async () => {
    const url = makeMapUrl(route, startLat, startLng);
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('エラー', 'Google Mapsを開けませんでした。Google Mapsアプリがインストールされているか確認してください。');
    }
  };

  const handleSave = () => {
    onSave?.(route);
  };

  const handleShare = () => {
    onShare?.(route);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        {index !== undefined && (
          <View style={styles.indexBadge}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>
        )}
        <View style={styles.titleSection}>
          <Text style={styles.routeName} numberOfLines={2}>
            {route.name}
          </Text>
          <Text style={styles.routeType}>{route.type}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statIcon}>📍</Text>
          <Text style={styles.statValue}>{route.distance}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statIcon}>⏱️</Text>
          <Text style={styles.statValue}>{route.time}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: congestionColor + '20' }]}>
          <Text style={[styles.badgeText, { color: congestionColor }]}>
            混雑: {route.congestion}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: difficultyColor + '20' }]}>
          <Text style={[styles.badgeText, { color: difficultyColor }]}>
            {route.difficulty}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.description} numberOfLines={expanded ? undefined : 2}>
        {route.description}
      </Text>

      {/* Star ratings */}
      <View style={styles.ratingsSection}>
        <StarRow
          windingScore={route.windingScore}
          sceneryScore={route.sceneryScore}
          trafficScore={route.trafficScore}
          difficultyScore={route.difficultyScore}
        />
      </View>

      {/* Waypoints */}
      {route.waypointObjects && route.waypointObjects.length > 0 && (
        <View style={styles.waypointsSection}>
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={styles.waypointToggle}
          >
            <Text style={styles.waypointToggleText}>
              {expanded ? '▲ 経由地を折りたたむ' : `▼ 経由地 ${route.waypointObjects.length}地点`}
            </Text>
          </TouchableOpacity>
          {expanded && (
            <View style={styles.waypointList}>
              {route.waypointObjects.map((wp, i) => (
                <View key={i} style={styles.waypointItem}>
                  <View style={styles.waypointDot}>
                    <Text style={styles.waypointDotText}>
                      {i === 0 ? '発' : i === route.waypointObjects.length - 1 ? '着' : String(i)}
                    </Text>
                  </View>
                  <View style={styles.waypointInfo}>
                    <Text style={styles.waypointName}>{wp.name}</Text>
                    {wp.description && (
                      <Text style={styles.waypointDesc} numberOfLines={1}>
                        {wp.description}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Destination Weather */}
      {(() => {
        const dest = route.waypointObjects?.[route.waypointObjects.length - 1];
        if (!dest?.lat || !dest?.lng) return null;
        return (
          <DestWeatherBadge
            lat={dest.lat}
            lng={dest.lng}
            locationName={dest.name}
          />
        );
      })()}

      {/* Caution */}
      {route.caution && (
        <View style={styles.cautionBox}>
          <Text style={styles.cautionIcon}>⚠️</Text>
          <Text style={styles.cautionText}>{route.caution}</Text>
        </View>
      )}

      {/* Action buttons */}
      {showActions && (
        <View style={styles.actionsRow}>
          {onShowMap && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.inAppMapBtn]}
              onPress={() => onShowMap(route)}
            >
              <Text style={styles.inAppMapBtnText}>📍 地図</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.actionBtn, styles.mapBtn]}
            onPress={handleOpenMap}
          >
            <Text style={styles.mapBtnText}>🗺️ Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.saveBtn,
              isSaved && styles.savedBtn,
            ]}
            onPress={handleSave}
          >
            <Text style={[styles.saveBtnText, isSaved && styles.savedBtnText]}>
              {isSaved ? '⭐ 保存済み' : '☆ 保存'}
            </Text>
          </TouchableOpacity>
          {onShare && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.shareBtn]}
              onPress={handleShare}
            >
              <Text style={styles.shareBtnText}>📤 共有</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    ...SHADOW.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    marginTop: 2,
    flexShrink: 0,
  },
  indexText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  titleSection: {
    flex: 1,
  },
  routeName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  routeType: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    marginTop: 2,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: FONT_SIZE.md,
  },
  statValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  badgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  description: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  ratingsSection: {
    marginBottom: SPACING.md,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.borderLight,
  },
  waypointsSection: {
    marginBottom: SPACING.md,
  },
  waypointToggle: {
    paddingVertical: SPACING.xs,
  },
  waypointToggleText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  waypointList: {
    marginTop: SPACING.sm,
    gap: SPACING.sm,
  },
  waypointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  waypointDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    flexShrink: 0,
    marginTop: 2,
  },
  waypointDotText: {
    fontSize: 9,
    color: COLORS.primary,
    fontWeight: '700',
  },
  waypointInfo: {
    flex: 1,
  },
  waypointName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  waypointDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  cautionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.secondaryLight,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  cautionIcon: {
    fontSize: FONT_SIZE.md,
  },
  cautionText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    lineHeight: 18,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inAppMapBtn: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    flex: 1,
  },
  inAppMapBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  mapBtn: {
    backgroundColor: COLORS.primary,
    flex: 2,
  },
  mapBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  savedBtn: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  saveBtnText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  savedBtnText: {
    color: COLORS.white,
  },
  shareBtn: {
    backgroundColor: COLORS.borderLight,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  shareBtnText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
});
