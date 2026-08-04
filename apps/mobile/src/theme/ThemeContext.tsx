// ============================================================
// Touring App - Theme Context
// ダークモード・ライトモード・5テーマカラー管理
// ============================================================

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── 型定義 ──────────────────────────────────────────────────
export type ThemeMode     = 'auto' | 'light' | 'dark';
export type ThemeColorKey = 'green' | 'blue' | 'orange' | 'purple' | 'red';

// ── AsyncStorage キー ────────────────────────────────────────
const STORAGE_MODE_KEY  = '@touring_theme_mode';
const STORAGE_COLOR_KEY = '@touring_theme_color';

// ── 5つのアクセントテーマ ────────────────────────────────────
export const ACCENT_THEMES: Record<ThemeColorKey, {
  label: string;
  emoji: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryMid: string;
}> = {
  green:  {
    label: 'フォレストグリーン',
    emoji: '🌿',
    primary:      '#1D9E75',
    primaryDark:  '#157A5B',
    primaryLight: '#E8F8F3',
    primaryMid:   '#2BB88A',
  },
  blue:   {
    label: 'オーシャンブルー',
    emoji: '🌊',
    primary:      '#0077B6',
    primaryDark:  '#005A8A',
    primaryLight: '#E3F2FD',
    primaryMid:   '#0096C7',
  },
  orange: {
    label: 'サンセットオレンジ',
    emoji: '🌅',
    primary:      '#E76F51',
    primaryDark:  '#C85A3E',
    primaryLight: '#FEF0E8',
    primaryMid:   '#F4845F',
  },
  purple: {
    label: 'ディープパープル',
    emoji: '🔮',
    primary:      '#7B2D8B',
    primaryDark:  '#5C1F6A',
    primaryLight: '#F3E8F7',
    primaryMid:   '#9B3DAB',
  },
  red:    {
    label: 'チェリーレッド',
    emoji: '🍒',
    primary:      '#C1121F',
    primaryDark:  '#960D18',
    primaryLight: '#FDECEC',
    primaryMid:   '#D63B3B',
  },
};

// ── カラーセット生成 ─────────────────────────────────────────
export function buildColors(key: ThemeColorKey, isDark: boolean) {
  const a = ACCENT_THEMES[key];

  // 白ベースミニマル（Instagram風）: 無彩色ニュートラル＋アクセント色のみ
  const base = isDark
    ? {
        background:  '#0E0E0E',
        cardBg:      '#1A1A1A',
        border:      '#2C2C2C',
        borderLight: '#222222',
        textPrimary:   '#F5F5F5',
        textSecondary: '#B8B8B8',
        textLight:     '#8E8E8E',
        textMuted:     '#5C5C5C',
        chipBg:        '#242424',
        chipText:      '#B8B8B8',
        secondaryLight: '#2A1E00',
        infoLight:      '#071A2F',
        successLight:   '#0D1F0C',
        warningLight:   '#1E1400',
        dangerLight:    '#1F0A0A',
        starEmpty:      '#2C2C2C',
        tabInactive:    '#777777',
        overlay:        'rgba(0,0,0,0.6)',
        overlayLight:   'rgba(0,0,0,0.3)',
      }
    : {
        background:  '#FAFAFA',
        cardBg:      '#FFFFFF',
        border:      '#DBDBDB',
        borderLight: '#EFEFEF',
        textPrimary:   '#111111',
        textSecondary: '#555555',
        textLight:     '#8E8E8E',
        textMuted:     '#B5B5B5',
        chipBg:        '#F4F4F4',
        chipText:      '#555555',
        secondaryLight: '#FEF7E6',
        infoLight:      '#E3F2FD',
        successLight:   '#EDF7EC',
        warningLight:   '#FEF0E0',
        dangerLight:    '#FDECEC',
        starEmpty:      '#DBDBDB',
        tabInactive:    '#9A9A9A',
        overlay:        'rgba(0,0,0,0.4)',
        overlayLight:   'rgba(0,0,0,0.1)',
      };

  return {
    ...base,
    // アクセント（テーマ依存）
    primary:      a.primary,
    primaryDark:  a.primaryDark,
    primaryLight: a.primaryLight,
    primaryMid:   a.primaryMid,
    // 固定カラー
    white:     '#FFFFFF',
    secondary: '#F0A500',
    success:   '#5BB450',
    warning:   '#E07800',
    danger:    '#D63B3B',
    info:      '#2196F3',
    starFilled: '#F0A500',
    tabActive:  a.primary,
    // 交通状況（固定）
    trafficLow:     '#1D9E75',
    trafficMedLow:  '#5BB450',
    trafficMed:     '#F0A500',
    trafficMedHigh: '#E07800',
    trafficHigh:    '#D63B3B',
    // チップ
    chipSelected:     a.primary,
    chipSelectedText: '#FFFFFF',
  };
}

export type ThemeColors = ReturnType<typeof buildColors>;

// ── Context ─────────────────────────────────────────────────
interface ThemeCtxValue {
  mode: ThemeMode;
  colorKey: ThemeColorKey;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (m: ThemeMode) => void;
  setColorKey: (k: ThemeColorKey) => void;
}

const ThemeCtx = createContext<ThemeCtxValue | null>(null);

// ── Provider ─────────────────────────────────────────────────
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme              = useColorScheme();
  const [mode,     setModeRaw]    = useState<ThemeMode>('auto');
  const [colorKey, setColorKeyRaw] = useState<ThemeColorKey>('green');

  // 起動時にAsyncStorageから復元
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_MODE_KEY),
      AsyncStorage.getItem(STORAGE_COLOR_KEY),
    ]).then(([m, c]) => {
      if (m) setModeRaw(m as ThemeMode);
      if (c) setColorKeyRaw(c as ThemeColorKey);
    }).catch(() => {});
  }, []);

  const isDark = mode === 'auto' ? systemScheme === 'dark' : mode === 'dark';
  const colors = useMemo(() => buildColors(colorKey, isDark), [colorKey, isDark]);

  const setMode = (m: ThemeMode) => {
    setModeRaw(m);
    AsyncStorage.setItem(STORAGE_MODE_KEY, m).catch(() => {});
  };

  const setColorKey = (k: ThemeColorKey) => {
    setColorKeyRaw(k);
    AsyncStorage.setItem(STORAGE_COLOR_KEY, k).catch(() => {});
  };

  return (
    <ThemeCtx.Provider value={{ mode, colorKey, isDark, colors, setMode, setColorKey }}>
      {children}
    </ThemeCtx.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────
export function useTheme(): ThemeCtxValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
