import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { CommunityPost } from '../../../packages/shared/src/types/index';

// ============================================================
// Firebase Admin initialization
// ============================================================

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }
  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  return adminApp;
}

// ============================================================
// GET /api/routes/popular
// Returns popular community routes sorted by likes
// ============================================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    // Query parameters
    const limitCount = Math.min(
      50,
      Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10)
    );
    const departureArea = typeof req.query.area === 'string' ? req.query.area : undefined;

    // Build query
    let query = db
      .collection('communityPosts')
      .orderBy('likes', 'desc')
      .limit(limitCount);

    if (departureArea) {
      query = db
        .collection('communityPosts')
        .where('departureArea', '==', departureArea)
        .orderBy('likes', 'desc')
        .limit(limitCount);
    }

    const snapshot = await query.get();

    const posts: CommunityPost[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId ?? '',
        userDisplayName: data.userDisplayName ?? '匿名ライダー',
        userPhotoUrl: data.userPhotoUrl ?? null,
        route: data.route ?? {},
        photos: data.photos ?? [],
        comment: data.comment ?? '',
        likes: data.likes ?? 0,
        likedBy: data.likedBy ?? [],
        departureArea: data.departureArea ?? '-',
        tags: data.tags ?? [],
        createdAt:
          data.createdAt?.toDate?.()?.toISOString() ??
          new Date().toISOString(),
      } as CommunityPost;
    });

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    res.status(200).json({
      posts,
      total: posts.length,
      area: departureArea ?? 'all',
    });
  } catch (err: unknown) {
    console.error('Routes API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({
      error: 'ルートの取得に失敗しました',
      code: 'FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? message : undefined,
    });
  }
}
