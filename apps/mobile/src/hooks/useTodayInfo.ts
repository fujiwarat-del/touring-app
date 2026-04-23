import { useState, useEffect } from 'react';
import { getTodayInfo } from '@touring/shared';
import type { TodayInfo } from '@touring/shared';

export function useTodayInfo() {
  const [todayInfo, setTodayInfo] = useState<TodayInfo>(() => getTodayInfo());

  useEffect(() => {
    // Refresh at midnight
    const now = new Date();
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5, // 5 seconds past midnight
    );
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    const timeout = setTimeout(() => {
      setTodayInfo(getTodayInfo());
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, []);

  return todayInfo;
}
