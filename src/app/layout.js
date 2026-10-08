import './globals.css';
import { Outfit, JetBrains_Mono } from 'next/font/google';
import { AppContextProvider } from '@/context/AppContext';
import Navigation from '@/components/Navigation';

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata = {
  title: 'Grepolis Toolkit - Tactical Command Center & Intelligence',
  description: 'Military-grade tactical tool suite for Grepolis: multi-world maps, scoreboards, precision recall sniping, and empire optimization.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className={`${outfit.className} antialiased`}>
        <AppContextProvider>
          <Navigation />
          <main className="container">
            {children}
          </main>
        </AppContextProvider>
      </body>
    </html>
  );
}

