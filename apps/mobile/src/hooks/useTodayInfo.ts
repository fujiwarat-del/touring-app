import { useState, useEffect, useRef } from 'react';
import { getTodayInfo } from '@touring/shared';
import type { TodayInfo } from '@touring/shared';
import { TRAFFIC_LEVELS } from '@touring/shared';
import { fetchRealtimeTraffic } from '../services/trafficApi';

export interface TodayInfoWithRealtime extends TodayInfo {
  isRealtimeTraffic: boolean;  // Yahoo! APIから取得済みか
  trafficLoading: boolean;
}

export function useTodayInfo(lat?: number | null, lng?: number | null) {
  const [todayInfo, setTodayInfo] = useState<TodayInfoWithRealtime>(() => ({
    ...getTodayInfo(),
    isRealtimeTraffic: false,
    trafficLoading: false,
  }));
  const fetchedRef = useRef(false);

  // 深夜0時に日付情報をリフレッシュ
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + 1,
      0, 0, 5
    );
    const ms = tomorrow.getTime() - now.getTime();
    const timeout = setTimeout(() => {
      fetchedRef.current = false;
      setTodayInfo((prev) => ({
        ...getTodayInfo(),
        isRealtimeTraffic: false,
        trafficLoading: prev.trafficLoading,
      }));
    }, ms);
    return () => clearTimeout(timeout);
  }, []);

  // 位置情報が取れたらリアルタイム渋滞を取得（1回のみ）
  useEffect(() => {
    if (!lat || !lng || fetchedRef.current) return;

    fetchedRef.current = true;
    setTodayInfo((prev) => ({ ...prev, trafficLoading: true }));

    fetchRealtimeTraffic(lat, lng).then((result) => {
      if (!result) {
        // API未設定 or エラー → 計算値のまま
        setTodayInfo((prev) => ({ ...prev, trafficLoading: false }));
        return;
      }

      const config = TRAFFIC_LEVELS[result.level - 1] ?? TRAFFIC_LEVELS[2];
      setTodayInfo((prev) => ({
        ...prev,
        trafficLevel: result.level,
        trafficLabel: result.label,
        trafficColor: config.color,
        isRealtimeTraffic: true,
        trafficLoading: false,
      }));
    });
  }, [lat, lng]);

  return todayInfo;
}
