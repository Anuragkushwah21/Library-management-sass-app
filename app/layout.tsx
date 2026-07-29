import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ToastProvider } from '@/components/ToastProvider'; // path adjust karo
import { ThemeProvider } from '@/components/theme-provider';

const _geist = Geist({ subsets: ['latin'] });
const _geistMono = Geist_Mono({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Library Management System',
  description: 'Organize. Manage. Empower knowledge.',
  generator: 'Anurag kushwah',
  openGraph: {
    title: 'Library Management System',
    description: 'Organize. Manage. Empower knowledge.',
    images: ['/logo-full.png'],
  },
  // icons yahan set nahi karte — app/icon.png, app/apple-icon.png aur
  // app/favicon.ico file convention se Next khud <link> tags generate karta hai
  // aur hashed URLs deta hai (cache-busting free me).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning zaroori hai — next-themes hydration se pehle
    // <html> par class set karta hai, warna React mismatch warn karta hai
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  );
}