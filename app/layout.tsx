import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sonus web-call SDK test',
  description: 'Minimal example of embedding a Sonus voice agent in a web app.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
