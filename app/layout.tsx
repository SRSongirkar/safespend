import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Committed — what’s already promised before payday',
  description: 'A private personal finance tracker that shows how much of your money is already committed before payday, and whether you can afford it.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfdfc' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a19' },
  ],
};

// Apply a saved light/dark choice before first paint (no flash).
const themeScript = `(function(){try{var t=localStorage.getItem('cm_theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
