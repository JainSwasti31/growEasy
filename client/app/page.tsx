import ImportWizard from '@/components/ImportWizard';

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-brand-500/25 to-transparent blur-3xl" />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
        <section className="rounded-[2rem] border border-slate-200/80 bg-white/90 px-8 py-10 shadow-2xl shadow-slate-900/5 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/90">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl">
              CSV Importer for CRM data
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-slate-600 dark:text-slate-400">
              Upload your CSV, preview columns, and let AI automatically map your data to the CRM format with clean results and actionable import feedback.
            </p>
          </div>
        </section>
        <ImportWizard />
      </div>
    </main>
  );
}
