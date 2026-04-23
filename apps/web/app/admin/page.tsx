import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Link from 'next/link';

// Initialize Firebase Admin (server-side only)
function getAdminDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

async function getAdminStats() {
  try {
    const db = getAdminDb();

    // Get total community posts count
    const postsSnap = await db.collection('communityPosts').count().get();
    const totalPosts = postsSnap.data().count;

    // Get recent community posts
    const recentPostsSnap = await db
      .collection('communityPosts')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    const recentPosts = recentPostsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        routeName: data.route?.name ?? 'Unknown',
        userName: data.userDisplayName ?? '匿名',
        departureArea: data.departureArea ?? '-',
        likes: data.likes ?? 0,
        createdAt: data.createdAt?.toDate?.()?.toLocaleDateString('ja-JP') ?? '-',
      };
    });

    // Get popular routes
    const popularSnap = await db
      .collection('communityPosts')
      .orderBy('likes', 'desc')
      .limit(5)
      .get();

    const popularRoutes = popularSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        routeName: data.route?.name ?? 'Unknown',
        departureArea: data.departureArea ?? '-',
        likes: data.likes ?? 0,
        distance: data.route?.distance ?? '-',
      };
    });

    return {
      totalPosts,
      recentPosts,
      popularRoutes,
    };
  } catch (err) {
    console.error('Admin stats error:', err);
    return {
      totalPosts: 0,
      recentPosts: [],
      popularRoutes: [],
    };
  }
}

export default async function AdminPage() {
  const stats = await getAdminStats();

  const summaryCards = [
    { label: 'コミュニティ投稿数', value: stats.totalPosts.toLocaleString(), icon: '📸', color: 'bg-blue-50 text-blue-600' },
    { label: '人気ルート Top', value: stats.popularRoutes[0]?.routeName ?? '-', icon: '🔥', color: 'bg-orange-50 text-orange-600' },
    { label: '最新投稿エリア', value: stats.recentPosts[0]?.departureArea ?? '-', icon: '📍', color: 'bg-green-50 text-green-600' },
    { label: '総いいね数', value: stats.recentPosts.reduce((sum, p) => sum + p.likes, 0).toLocaleString(), icon: '❤️', color: 'bg-red-50 text-red-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/70 hover:text-white text-sm">← サイトへ</Link>
            <span className="text-white/40">|</span>
            <h1 className="text-xl font-bold">🏍️ 管理ダッシュボード</h1>
          </div>
          <span className="text-sm text-white/70">
            {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"
            >
              <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 text-2xl ${card.color}`}>
                {card.icon}
              </div>
              <div className="text-2xl font-extrabold text-gray-900 truncate">{card.value}</div>
              <div className="text-sm text-gray-500 mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Routes Table */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">🕐 最新の投稿ルート</h2>
            </div>
            {stats.recentPosts.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400">
                <p>投稿データがありません</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">ルート名</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">投稿者</th>
                      <th className="text-left px-4 py-3 text-gray-600 font-semibold">エリア</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-semibold">いいね</th>
                      <th className="text-right px-4 py-3 text-gray-600 font-semibold">投稿日</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.recentPosts.map((post) => (
                      <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                          {post.routeName}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{post.userName}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-light text-primary">
                            {post.departureArea}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-red-500 font-semibold">
                          ❤️ {post.likes}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs">
                          {post.createdAt}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Popular Routes Sidebar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">🔥 人気ルート Top 5</h2>
            </div>
            {stats.popularRoutes.length === 0 ? (
              <div className="px-6 py-12 text-center text-gray-400">
                <p>データなし</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {stats.popularRoutes.map((route, i) => (
                  <div key={route.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <span className={`
                        flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-extrabold
                        ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}
                      `}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {route.routeName}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">{route.departureArea}</span>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">{route.distance}</span>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-red-500 flex-shrink-0">
                        ❤️ {route.likes}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">⚡ クイックアクション</h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Firebase Console', href: 'https://console.firebase.google.com', icon: '🔥' },
              { label: 'Vercel Dashboard', href: 'https://vercel.com/dashboard', icon: '▲' },
              { label: 'Anthropic Console', href: 'https://console.anthropic.com', icon: '🤖' },
              { label: 'Sentry', href: 'https://sentry.io', icon: '🛡️' },
            ].map((action) => (
              <a
                key={action.label}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium text-sm px-4 py-2 rounded-lg transition-colors border border-gray-200"
              >
                <span>{action.icon}</span>
                {action.label}
                <span className="text-gray-400 text-xs">↗</span>
              </a>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
