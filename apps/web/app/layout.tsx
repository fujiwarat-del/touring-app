import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ツーリングプランナー - AIが最高のルートを提案',
  description:
    'Claude AIが天気・交通・バイク種類を考慮して、あなただけのバイクツーリングルートを自動生成します。GPS出発地点から最適な3つのルートを提案。',
  keywords: [
    'バイク',
    'ツーリング',
    'ルート',
    'AI',
    'Claude',
    'ルート生成',
    'ワインディング',
    '温泉',
    '絶景',
    'GPS',
  ],
  openGraph: {
    title: 'ツーリングプランナー',
    description: 'AIが天気・交通情報を考慮してバイクツーリングルートを自動生成',
    type: 'website',
    locale: 'ja_JP',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
