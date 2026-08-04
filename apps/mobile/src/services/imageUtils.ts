// ============================================================
// 画像圧縮 共通ユーティリティ
// アルバム機能・（将来）チェックリスト写真添付で共用する
//
// 【重要】Storage コスト抑制のため、アップロード前に必ずこの関数を通すこと
// ============================================================

import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/** 圧縮後の長辺上限（px） */
export const IMAGE_MAX_LONG_SIDE = 1280;
/** JPEG 品質 */
export const IMAGE_JPEG_QUALITY = 0.7;

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err)
    );
  });
}

/**
 * 画像を長辺1280px・JPEG品質0.7に圧縮する。
 * 元画像が1280px以下の場合はリサイズせず再圧縮のみ行う。
 * @returns 圧縮後のローカルURI
 */
export async function compressImage(uri: string): Promise<string> {
  let resize: { width: number } | { height: number } | null = null;
  try {
    const { width, height } = await getImageSize(uri);
    const longSide = Math.max(width, height);
    if (longSide > IMAGE_MAX_LONG_SIDE) {
      resize = width >= height ? { width: IMAGE_MAX_LONG_SIDE } : { height: IMAGE_MAX_LONG_SIDE };
    }
  } catch {
    // サイズ取得に失敗しても圧縮のみ実施
  }

  const result = await ImageManipulator.manipulateAsync(
    uri,
    resize ? [{ resize }] : [],
    { compress: IMAGE_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}
