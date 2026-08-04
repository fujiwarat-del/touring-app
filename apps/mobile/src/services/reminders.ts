// ============================================================
// 期日リマインダー（ローカル通知）
// 車検・自賠責・任意保険（車両ごと）＋ 免許証（ユーザー）の
// 満了日に対して 30日前・7日前・当日 の朝9時に通知する。
//
// サーバー不要のローカル通知（expo-notifications の日時トリガー）。
// 期日を変更するたびに rescheduleAllReminders() で全再登録する
// シンプルな方式（通知IDの個別管理を避けて確実性を優先）。
// ============================================================

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGarageBikes } from './garage';

const LICENSE_DATE_KEY = '@touring_app_license_date';

/** 通知タイミング（満了日の何日前か） */
const REMIND_OFFSETS_DAYS = [30, 7, 0];
/** 通知時刻（時） */
const REMIND_HOUR = 9;

// ─── 免許証有効期限（ユーザー単位・端末保存） ────────────

export async function getLicenseDate(): Promise<string | null> {
  return AsyncStorage.getItem(LICENSE_DATE_KEY);
}

export async function setLicenseDate(iso: string | null): Promise<void> {
  if (iso) {
    await AsyncStorage.setItem(LICENSE_DATE_KEY, iso);
  } else {
    await AsyncStorage.removeItem(LICENSE_DATE_KEY);
  }
  await rescheduleAllReminders();
}

// ─── 通知スケジューリング ─────────────────────────────────

interface ReminderItem {
  label: string;    // 例: "車検（CB750）" "免許証"
  dateIso: string;
}

async function collectReminderItems(): Promise<ReminderItem[]> {
  const items: ReminderItem[] = [];

  const bikes = await getGarageBikes().catch(() => []);
  for (const bike of bikes) {
    if (bike.shakenDate) items.push({ label: `車検（${bike.name}）`, dateIso: bike.shakenDate });
    if (bike.jibaisekiDate) items.push({ label: `自賠責保険（${bike.name}）`, dateIso: bike.jibaisekiDate });
    if (bike.insuranceDate) items.push({ label: `任意保険（${bike.name}）`, dateIso: bike.insuranceDate });
  }

  const license = await getLicenseDate();
  if (license) items.push({ label: '運転免許証', dateIso: license });

  return items;
}

/**
 * すべての期日リマインダーを再登録する。
 * 車両の保存/削除・免許期限の変更後、およびアプリ起動時に呼ぶこと。
 */
export async function rescheduleAllReminders(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return; // 権限なしなら何もしない（起動時の権限リクエストに任せる）

    // 既存のローカル通知を全消去して作り直す
    await Notifications.cancelAllScheduledNotificationsAsync();

    const items = await collectReminderItems();
    const now = Date.now();
    let count = 0;

    for (const item of items) {
      const expiry = new Date(item.dateIso);
      if (isNaN(expiry.getTime())) continue;

      for (const offset of REMIND_OFFSETS_DAYS) {
        const fireDate = new Date(expiry);
        fireDate.setDate(fireDate.getDate() - offset);
        fireDate.setHours(REMIND_HOUR, 0, 0, 0);
        if (fireDate.getTime() <= now) continue; // 過去はスキップ

        const body =
          offset === 0
            ? `本日が${item.label}の満了日です。手続きはお済みですか？`
            : `${item.label}の満了まであと${offset}日です。早めの更新手続きをおすすめします。`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `⏰ ${item.label}の期限が近づいています`,
            body,
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireDate,
          },
        });
        count++;
      }
    }
    console.log(`[Reminders] Scheduled ${count} notifications for ${items.length} items`);
  } catch (e: any) {
    console.warn('[Reminders] reschedule failed:', e?.message);
  }
}
