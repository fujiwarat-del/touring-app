import Link from 'next/link';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI ルート生成',
    description: 'Claude AIが天気・交通・バイク種類を考慮して3つの最適ルートを自動提案。あなただけのオーダーメイドコースを瞬時に生成します。',
  },
  {
    icon: '📡',
    title: 'GPS出発地点',
    description: '現在地をGPSで自動取得。出発地点から今すぐ走り出せるルートを生成します。',
  },
  {
    icon: '🌤️',
    title: 'リアルタイム天気',
    description: 'Open-Meteo APIで現在の天気を自動取得。ツーリング適性も判定してアドバイスします。',
  },
  {
    icon: '🚦',
    title: '交通状況予測',
    description: '平日・祝日・季節・曜日から混雑を予測。ゴールデンウィークや行楽シーズンも考慮済み。',
  },
  {
    icon: '🗺️',
    title: 'Google Maps連携',
    description: '生成したルートをワンタップでGoogle Mapsで表示。経由地つきナビゲーションで迷わず走行できます。',
  },
  {
    icon: '⭐',
    title: 'ルート保存・共有',
    description: '気に入ったルートをFirebaseに保存。コミュニティに写真付きで投稿して仲間と共有できます。',
  },
  {
    icon: '🏍️',
    title: 'バイク種類対応',
    description: '大型・中型・オフロード・スクーターそれぞれの特性に合わせたルートを生成します。',
  },
  {
    icon: '🛣️',
    title: 'エンプティロードモード',
    description: '高速・有料道路を完全回避。交通量の少ない空いた道だけを選んだ贅沢なルートを生成します。',
  },
];

const PURPOSES = [
  { icon: '〜', label: 'ワインディング' },
  { icon: '♨️', label: '温泉' },
  { icon: '🌊', label: '海沿い' },
  { icon: '🍜', label: 'グルメ' },
  { icon: '🏪', label: '道の駅' },
  { icon: '🗻', label: '絶景' },
];

const ROUTE_STATS = [
  { value: '3,000+', label: '生成ルート数' },
  { value: '800+', label: 'アクティブユーザー' },
  { value: '4.8', label: 'App Store評価' },
  { value: '全国47都道府県', label: '対応エリア' },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏍️</span>
            <span className="text-lg font-bold text-primary">ツーリングプランナー</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-600 hover:text-primary transition-colors">機能</a>
            <a href="#purposes" className="text-sm text-gray-600 hover:text-primary transition-colors">目的</a>
            <a href="#download" className="text-sm text-gray-600 hover:text-primary transition-colors">ダウンロード</a>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-primary transition-colors">管理</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-16 bg-gradient-to-br from-primary via-primary-mid to-emerald-600 text-white overflow-hidden">
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative max-w-6xl mx-auto px-4 py-24 md:py-36">
          <div className="max-w-3xl animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6">
              <span className="text-sm font-semibold">✨ Claude AI搭載</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
              AIが見つける<br />
              <span className="text-yellow-300">あなたの最高の</span><br />
              ツーリングルート
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 leading-relaxed">
              天気・交通・バイク種類・好みを考慮して<br className="hidden md:block" />
              Claude AIが最適な3つのルートを瞬時に生成。<br className="hidden md:block" />
              今すぐ走り出せるオーダーメイドコースをあなたに。
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="#download"
                className="inline-flex items-center justify-center gap-2 bg-white text-primary font-bold text-lg px-8 py-4 rounded-xl hover:bg-yellow-50 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                📱 無料でダウンロード
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 bg-white/20 backdrop-blur-sm text-white font-semibold text-lg px-8 py-4 rounded-xl hover:bg-white/30 transition-all border border-white/30"
              >
                機能を見る →
              </a>
            </div>
          </div>
        </div>
        {/* Decorative wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 80L1440 80L1440 40C1200 80 960 0 720 40C480 80 240 20 0 40L0 80Z" fill="white"/>
          </svg>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {ROUTE_STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-extrabold text-primary mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
              充実の機能
            </h2>
            <p className="text-gray-600 text-lg">
              ライダーのために設計されたすべての機能
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow border border-gray-100"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Touring Purposes */}
      <section id="purposes" className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
              6つのツーリング目的
            </h2>
            <p className="text-gray-600 text-lg">
              あなたの「今日の気分」に合わせたルートを生成
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {PURPOSES.map((p) => (
              <div
                key={p.label}
                className="flex flex-col items-center gap-3 bg-primary-light rounded-2xl p-6 hover:bg-primary hover:text-white transition-all cursor-default group"
              >
                <span className="text-4xl">{p.icon}</span>
                <span className="text-sm font-bold text-primary group-hover:text-white transition-colors">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">
              使い方は簡単3ステップ
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: '📍',
                title: '現在地を取得',
                desc: 'GPSで出発地点を自動取得。手動入力も可能です。',
              },
              {
                step: '02',
                icon: '⚙️',
                title: '条件を設定',
                desc: 'バイク種類・目的・時間・好みを選択するだけ。',
              },
              {
                step: '03',
                icon: '🚀',
                title: 'AIがルート生成',
                desc: 'Claude AIが3つの最適ルートを即座に提案します。',
              },
            ].map((step) => (
              <div key={step.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-white text-2xl font-extrabold mb-4">
                  {step.step}
                </div>
                <div className="text-3xl mb-3">{step.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-sm text-gray-600">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshot Placeholder */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
              アプリスクリーンショット
            </h2>
          </div>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            {['ホーム画面', 'ルート結果', 'コミュニティ', '保存済み'].map((label) => (
              <div
                key={label}
                className="w-48 h-96 bg-gradient-to-b from-primary-light to-white rounded-3xl border-2 border-primary/20 flex flex-col items-center justify-center gap-3 shadow-md"
              >
                <span className="text-4xl">📱</span>
                <span className="text-sm font-semibold text-primary">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section id="download" className="bg-gradient-to-br from-primary to-emerald-600 text-white py-24">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6">
            今すぐ無料で始めよう
          </h2>
          <p className="text-white/90 text-lg mb-10">
            AIがあなたの最高のツーリングルートを見つけます。
            インストールは完全無料。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#"
              className="inline-flex items-center justify-center gap-3 bg-black text-white font-bold px-8 py-4 rounded-xl hover:bg-gray-900 transition-colors shadow-lg"
            >
              <span className="text-2xl">🍎</span>
              <div className="text-left">
                <div className="text-xs opacity-80">ダウンロード</div>
                <div className="text-lg">App Store</div>
              </div>
            </a>
            <a
              href="#"
              className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-bold px-8 py-4 rounded-xl hover:bg-gray-50 transition-colors shadow-lg"
            >
              <span className="text-2xl">🤖</span>
              <div className="text-left">
                <div className="text-xs opacity-60">ダウンロード</div>
                <div className="text-lg">Google Play</div>
              </div>
            </a>
          </div>
          <p className="text-white/60 text-sm mt-6">iOS 15+ / Android 8.0+ 対応</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏍️</span>
              <span className="text-white font-bold">ツーリングプランナー</span>
            </div>
            <div className="flex gap-6 text-sm">
              <a href="#" className="hover:text-white transition-colors">プライバシーポリシー</a>
              <a href="#" className="hover:text-white transition-colors">利用規約</a>
              <a href="#" className="hover:text-white transition-colors">お問い合わせ</a>
              <Link href="/admin" className="hover:text-white transition-colors">管理画面</Link>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-sm">
            <p>Powered by Claude AI (claude-sonnet-4-6) | 天気: Open-Meteo | 地図: Google Maps</p>
            <p className="mt-2">&copy; {new Date().getFullYear()} ツーリングプランナー. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
