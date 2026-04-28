import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin 初期化（環境変数から）
function getAdminDb() {
  try {
    const app = getApps().length === 0
      ? initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          }),
        })
      : getApp();
    return getFirestore(app);
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { recipientUid, actorName, postName } = req.body ?? {};
  if (!recipientUid || !actorName || !postName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Firestore からプッシュトークンを取得
    const db = getAdminDb();
    if (!db) return res.status(200).json({ sent: false, reason: 'firebase not configured' });

    const profileSnap = await db.collection('userProfiles').doc(recipientUid).get();
    if (!profileSnap.exists) return res.status(200).json({ sent: false, reason: 'no profile' });

    const pushToken = profileSnap.data()?.expoPushToken as string | undefined;
    if (!pushToken || !pushToken.startsWith('ExponentPushToken[')) {
      return res.status(200).json({ sent: false, reason: 'no push token' });
    }

    // Expo Push API に送信
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        title: '❤️ いいねされました！',
        body: `${actorName} さんが「${postName}」にいいねしました`,
        sound: 'default',
        data: { type: 'like' },
      }),
    });

    const result = await response.json();
    return res.status(200).json({ sent: true, result });
  } catch (err: any) {
    console.error('[notify] error:', err);
    return res.status(200).json({ sent: false, reason: err.message });
  }
}
