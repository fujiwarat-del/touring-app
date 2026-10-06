// ============================================================
// 端末固有の設定案内
//
// 実機検証で、Xiaomi 系（HyperOS/MIUI）は最近のアプリ画面でアプリを
// ロックしないと背景の位置取得を止めてしまうことが分かった。
// 自動起動・バックグラウンドランニング・電池最適化をすべて許可しても
// 止まり、ロックすると取得率が 3〜15% から約100% まで回復した。
//
// 利用者がこの設定を自力で行うとは期待できないため、該当する端末では
// 共有を始める前に案内を出す。
// ============================================================

import { Platform } from 'react-native';
import * as Device from 'expo-device';

/** 背景処理に強い制限をかけることで知られるメーカー */
const AGGRESSIVE_VENDORS = ['xiaomi', 'redmi', 'poco', 'oppo', 'vivo', 'realme', 'huawei', 'honor'];

export function needsBackgroundHint(): boolean {
  if (Platform.OS !== 'android') return false;
  const vendor = `${Device.manufacturer ?? ''} ${Device.brand ?? ''}`.toLowerCase();
  return AGGRESSIVE_VENDORS.some((v) => vendor.includes(v));
}

export const BACKGROUND_HINT = {
  title: '端末の設定をご確認ください',
  body:
    'お使いの端末は、画面を消すとアプリの位置取得を止めてしまうことがあります。\n\n' +
    '最近のアプリ（タスク一覧）を開き、このアプリのカードを長押しして' +
    '鍵アイコンをタップしてロックしてください。\n\n' +
    'ロックしないと、到着予定が途中で更新されなくなります。',
};
