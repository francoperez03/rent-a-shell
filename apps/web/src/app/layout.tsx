import type { Metadata, Viewport } from 'next';
import { Archivo, Martian_Mono } from 'next/font/google';
import { Nav } from '@/components/Nav';
import { catalog } from '@/server/hub';
import { Providers } from './providers';
import '@/styles/globals.css';
import '@/motion-kit/motion-kit.css';

// The width axis feeds font-stretch (.wide-112 / .wide-106 / .narrow-90): an instrument nameplate.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], variable: '--font-sans', display: 'swap' });
const mono = Martian_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

// The catalog is live data: never render it at build time.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://rent-a-shell.vercel.app'),
  title: 'Rent a Shell · Drive real hardware from your code',
  description:
    'Real hardware by the minute. Rent El Tucu, a real robot arm in Tucumán, Argentina, in five-minute blocks: send it commands and watch it on camera. Pay in USDC on Solana devnet with Solana Pay or x402.',
  openGraph: {
    title: 'Rent a Shell · Drive real hardware from your code',
    description: 'A real robot arm rented by the minute for small hardware teams and their AI agents. USD 0.05 per five-minute block, on devnet.',
    type: 'website',
    images: ['/og.png'],
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.svg', apple: '/icon.png' },
  alternates: { types: { 'text/plain': '/llms.txt' } },
};

export const viewport: Viewport = { themeColor: '#F7F3EB', viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const shells = await catalog();
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body>
        <Providers shells={shells}>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
