// ============================================================
// ツーリング前チェックリスト項目定義
// 「ネンオシャチエブクトウバシメ」ベースの8項目・固定リスト
//
// 将来拡張メモ:
// - order: 並び順変更機能を追加する場合はユーザー設定で上書き
// - visible フラグを追加すれば項目の表示/非表示切り替えに対応可能
// ============================================================

export interface CheckItemDef {
  key: string;
  label: string;
  hint: string;   // UI上に小さく表示する補足説明
  icon: string;
  order: number;
}

export const CHECK_ITEMS: CheckItemDef[] = [
  { key: 'fuel',   label: '燃料',     hint: '残量は十分か',               icon: '⛽', order: 1 },
  { key: 'oil',    label: 'オイル',   hint: '量・にじみはないか',         icon: '🛢️', order: 2 },
  { key: 'tire',   label: 'タイヤ',   hint: '溝・空気圧・ひび割れ',       icon: '🛞', order: 3 },
  { key: 'chain',  label: 'チェーン', hint: '緩み・注油の状態',           icon: '⛓️', order: 4 },
  { key: 'brake',  label: 'ブレーキ', hint: '効き・レバーの遊び',         icon: '🛑', order: 5 },
  { key: 'light',  label: '灯火類',   hint: 'ヘッド/テール/ウインカー',   icon: '💡', order: 6 },
  { key: 'clutch', label: 'クラッチ', hint: '遊び・つながり',             icon: '🎚️', order: 7 },
  { key: 'bolt',   label: '各部締付', hint: 'ミラー・レバー等のガタ',     icon: '🔩', order: 8 },
];

export type CheckStatus = 'ok' | 'concern';

export interface CheckResultItem {
  key: string;
  status: CheckStatus;
  memo: string | null; // 「気になる」時のみ入力可
  // 将来拡張: photoUrl（Firebase Storage 導入後）
}

/** key から定義を引く */
export function getCheckItemDef(key: string): CheckItemDef | undefined {
  return CHECK_ITEMS.find((i) => i.key === key);
}
