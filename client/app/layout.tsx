import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/theme';
import ThemeToggle from '@/components/ThemeToggle';

export const metadata: Metadata = {
  title: 'CSV Importer',
  description: 'AI-powered CSV to CRM importer',
};

function GrowEasyLogo() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm shadow-slate-900/5 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100">
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
        <span className="text-lg font-black">G</span>
      </div>
      <div>
        <div>GrowEasy</div>
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">CSV Importer</div>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <div className="fixed left-4 top-4 z-50">
            <GrowEasyLogo />
          </div>
          <div className="fixed right-4 top-4 z-50">
            <ThemeToggle />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
