'use client';

import { useEffect, useRef, useState } from 'react';
import type { CrmRecord, ImportResponse, SkippedRow } from '@groweasy/shared';
import CsvUploader from './CsvUploader';
import CsvPreviewTable from './CsvPreviewTable';
import ImportResults from './ImportResults';
import { useCsvParser } from '@/lib/useCsvParser';
import { importCsvStream } from '@/lib/apiClient';
import Spinner from './Spinner';

// ── Step type ─────────────────────────────────────────────────────────────────

type Step = 'upload' | 'preview' | 'importing' | 'results';

// ── Wizard ────────────────────────────────────────────────────────────────────

export default function ImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [completedSteps, setCompletedSteps] = useState<number>(0); // 0..4
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { status: parseStatus, result: parseResult, error: parseError, parse, reset: resetParse } = useCsvParser();

  // Import state
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<string>('');
  const [estimatedBatches, setEstimatedBatches] = useState<number>(0);

  // Live streaming counters
  const [streamImported, setStreamImported] = useState(0);
  const [streamSkipped, setStreamSkipped] = useState(0);
  const [streamBatch, setStreamBatch] = useState(0);

  // Accumulate partial results in a ref so they survive re-renders mid-stream
  const partialImported = useRef<CrmRecord[]>([]);
  const partialSkipped = useRef<SkippedRow[]>([]);

  useEffect(() => {
    if (selectedFile) parse(selectedFile);
  }, [selectedFile, parse]);

  useEffect(() => {
    // Update completed steps when wizard step changes
    if (step === 'upload') setCompletedSteps(0);
    if (step === 'preview') setCompletedSteps(1);
    if (step === 'importing') setCompletedSteps(2);
    if (step === 'results') setCompletedSteps(4);
  }, [step]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleFileSelected = (file: File) => {
    resetParse();
    setSelectedFile(file);
    setStep('preview');
  };

  const handleBack = () => {
    resetParse();
    setSelectedFile(null);
    setImportError(null);
    setImportResult(null);
    setImportProgress('');
    partialImported.current = [];
    partialSkipped.current = [];
    setStreamImported(0);
    setStreamSkipped(0);
    setStreamBatch(0);
    setStep('upload');
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || !parseResult) return;

    const BATCH_SIZE = 25;
    const batches = Math.ceil(parseResult.totalRows / BATCH_SIZE);
    setEstimatedBatches(batches);
    setImportError(null);
    setImportResult(null);
    setImportProgress('Connecting…');
    partialImported.current = [];
    partialSkipped.current = [];
    setStreamImported(0);
    setStreamSkipped(0);
    setStreamBatch(0);
    setStep('importing');

    try {
      await importCsvStream(selectedFile, {
        onStart: (totalRows, totalBatches) => {
          setImportProgress(`Processing ${totalRows.toLocaleString()} rows in ${totalBatches} batch${totalBatches !== 1 ? 'es' : ''}…`);
        },
        onBatch: (event) => {
          partialImported.current.push(...event.imported);
          partialSkipped.current.push(...event.skipped);
          setStreamImported(event.runningImported);
          setStreamSkipped(event.runningSkipped);
          setStreamBatch(event.batchIndex + 1);
          setImportProgress(`Batch ${event.batchIndex + 1} of ${event.totalBatches} complete`);
        },
        onDone: async (event) => {
          setImportResult({
            totalRows: event.totalRows,
            imported: event.imported,
            skipped: event.skipped,
            totalImported: event.totalImported,
            totalSkipped: event.totalSkipped,
          });
          // Animate step completion: mark mapping complete, then review
          setCompletedSteps(3);
          setImportProgress('Finalizing results…');
          await new Promise((r) => setTimeout(r, 600));
          setCompletedSteps(4);
          await new Promise((r) => setTimeout(r, 200));
          setStep('results');
        },
        onError: (message) => {
          // Stream errored mid-way — show what succeeded so far + error
          if (partialImported.current.length > 0) {
            setImportResult({
              totalRows: parseResult.totalRows,
              imported: partialImported.current,
              skipped: partialSkipped.current,
              totalImported: partialImported.current.length,
              totalSkipped: partialSkipped.current.length,
            });
            setImportError(`Import partially completed. ${message}`);
            setStep('results');
          } else {
            setImportError(message);
            setStep('preview');
          }
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      // Network disconnect — show partial results if any
      if (partialImported.current.length > 0) {
        setImportResult({
          totalRows: parseResult.totalRows,
          imported: partialImported.current,
          skipped: partialSkipped.current,
          totalImported: partialImported.current.length,
          totalSkipped: partialSkipped.current.length,
        });
        setImportError(`Connection lost. Showing ${partialImported.current.length} records received before disconnect. ${msg}`);
        setStep('results');
      } else {
        setImportError(msg);
        setStep('preview');
      }
    }
  };

  const handleFullReset = () => {
    resetParse();
    setSelectedFile(null);
    setImportResult(null);
    setImportError(null);
    setImportProgress('');
    setEstimatedBatches(0);
    partialImported.current = [];
    partialSkipped.current = [];
    setStreamImported(0);
    setStreamSkipped(0);
    setStreamBatch(0);    setStep('upload');
  };

  // ── Results view (full page replacement) ─────────────────────────────────────

  if (step === 'results' && importResult && selectedFile) {
    return (
      <div className="w-full space-y-4">
        {/* Partial-success warning banner */}
        {importError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 dark:border-amber-800/40 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-amber-500"><AlertIcon /></div>
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Partial import</p>
                <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-500">{importError}</p>
              </div>
            </div>
          </div>
        )}
        <ImportResults
          result={importResult}
          fileName={selectedFile.name}
          headers={parseResult?.headers ?? []}
          onReset={handleFullReset}
        />
      </div>
    );
  }

  // ── Wizard card ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200/90 bg-white shadow-2xl shadow-slate-950/5 dark:border-slate-700/90 dark:bg-slate-900 dark:shadow-slate-950/20">

        {/* Steps indicator */}
        <div className="px-6 pt-6">
          <StepsIndicator completed={completedSteps} currentStep={step} streamBatch={streamBatch} estimatedBatches={estimatedBatches} />
        </div>

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <>
            <CardHeader
              step={1}
              title="Upload your CSV"
              subtitle="Any format — Facebook Ads, Google Ads, manual spreadsheets, real estate exports"
            />
            <div className="px-6 py-6">
              <CsvUploader onFileSelected={handleFileSelected} disabled={false} />
            </div>
            <CardFooter
              leftText="Select a file to continue"
              primaryLabel="Preview CSV"
              primaryDisabled
              onPrimary={() => {}}
            />
          </>
        )}

        {/* ── Step 2: Preview ── */}
        {step === 'preview' && (
          <>
            <CardHeader
              step={2}
              title={selectedFile ? `Preview — ${selectedFile.name}` : 'Preview'}
              subtitle={
                parseStatus === 'parsing'
                  ? 'Parsing your CSV…'
                  : parseStatus === 'done' && parseResult
                  ? `${parseResult.totalRows.toLocaleString()} rows · ${parseResult.headers.length} columns detected`
                  : parseStatus === 'error'
                  ? 'There was a problem reading this file'
                  : ''
              }
            />

            <div className="px-6 py-6 space-y-4">
              {/* Client-side parse spinner */}
              {parseStatus === 'parsing' && (
                <div role="status" aria-live="polite" className="flex min-h-[200px] items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-300">
                  <Spinner size={18} />
                  Parsing CSV…
                </div>
              )}

              {/* Client-side parse error */}
              {parseStatus === 'error' && parseError && (
                <InlineError
                  title="Could not parse this file"
                  message={parseError}
                  action={{ label: '← Choose a different file', onClick: handleBack }}
                />
              )}

              {/* Network / import error (if user retried after a failed import) */}
              {importError && (
                <InlineError
                  title="Import failed"
                  message={importError}
                  action={{ label: 'Dismiss', onClick: () => setImportError(null) }}
                  variant="warning"
                />
              )}

              {/* Preview table */}
              {parseStatus === 'done' && parseResult && (
                <CsvPreviewTable result={parseResult} />
              )}
            </div>

            <CardFooter
              leftText={
                parseStatus === 'done' && parseResult
                  ? `${parseResult.totalRows.toLocaleString()} rows ready to import`
                  : parseStatus === 'error'
                  ? 'Fix the file to continue'
                  : 'Parsing…'
              }
              onBack={handleBack}
              backLabel="← Change file"
              primaryLabel="Confirm Import"
              primaryDisabled={parseStatus !== 'done'}
              onPrimary={handleConfirmImport}
            />
          </>
        )}

        {/* ── Step 3: Importing (AI processing) ── */}
        {step === 'importing' && (
          <>
            <CardHeader
              step={3}
              title="AI is mapping your data"
              subtitle={`Processing ${parseResult?.totalRows.toLocaleString() ?? ''} rows in ${estimatedBatches} batch${estimatedBatches !== 1 ? 'es' : ''}…`}
            />
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-6 px-6 py-10">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <svg className="absolute inset-0 h-20 w-20 animate-spin text-brand-200" viewBox="0 0 80 80" fill="none" aria-hidden="true">
                  <circle cx="40" cy="40" r="36" stroke="currentColor" strokeWidth="6" strokeDasharray="180 40" />
                </svg>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
              </div>

              <div role="status" aria-live="polite" className="w-full max-w-xs text-center space-y-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{importProgress}</p>

                {/* Live counters — update as each batch arrives */}
                {streamBatch > 0 && (
                  <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-800">
                      <span className="h-2 w-2 rounded-full bg-green-500 inline-block" />
                      Imported {streamImported.toLocaleString()}
                      <span className="text-slate-400">/</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
                        Skipped {streamSkipped.toLocaleString()}
                      </span>
                      <span className="text-slate-400">·</span>
                      Batch {streamBatch} of {estimatedBatches}
                    </span>
                  </div>
                )}

                {/* Determinate progress bar once batches start streaming */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  {estimatedBatches > 0 && streamBatch > 0 ? (
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (streamBatch / estimatedBatches) * 100)}%` }}
                    />
                  ) : (
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-400" />
                  )}
                </div>

                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {streamBatch > 0
                    ? 'Streaming results live from the AI import endpoint…'
                    : 'Connecting to AI…'}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Future step indicators */}
      <div className="mt-3 space-y-2">
        {step === 'upload' && (
          <>
            <FutureStep number={2} label="Preview &amp; verify columns" />
            <FutureStep number={3} label="AI maps fields to CRM schema" />
            <FutureStep number={4} label="Review results &amp; import" />
          </>
        )}
        {step === 'preview' && (
          <>
            <FutureStep number={3} label="AI maps fields to CRM schema" />
            <FutureStep number={4} label="Review results &amp; import" />
          </>
        )}
        {step === 'importing' && (
          <FutureStep number={4} label="Review results &amp; import" />
        )}
      </div>
    </div>
  );
}

// ── Shared card sub-components ─────────────────────────────────────────────────

function CardHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-100 px-6 py-6 dark:border-slate-700/60">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <StepBadge number={step} active />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              Step {step} of 3
            </span>
          </div>
          <h2 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function CardFooter({
  leftText, onBack, backLabel = '← Back',
  primaryLabel, primaryDisabled, onPrimary,
}: {
  leftText: string;
  onBack?: () => void;
  backLabel?: string;
  primaryLabel: string;
  primaryDisabled: boolean;
  onPrimary: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 dark:border-slate-700/60">
      <div className="flex items-center gap-4">
        {onBack && (
          <button type="button" onClick={onBack}
            className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 dark:focus-visible:ring-offset-slate-950">
            {backLabel}
          </button>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">{leftText}</p>
      </div>
      <button type="button" disabled={primaryDisabled} onClick={onPrimary}
        className={[
          'inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold shadow-lg transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50',
          !primaryDisabled
            ? 'bg-brand-600 text-white shadow-brand-500/20 hover:bg-brand-700 active:scale-[0.98]'
            : 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
        ].join(' ')}>
        {primaryLabel}
        {!primaryDisabled && <ArrowRightIcon />}
      </button>
    </div>
  );
}

function InlineError({
  title, message, action, variant = 'error',
}: {
  title: string;
  message: string;
  action: { label: string; onClick: () => void };
  variant?: 'error' | 'warning';
}) {
  const border = variant === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50';
  const titleCls = variant === 'warning' ? 'text-amber-700' : 'text-red-700';
  const msgCls = variant === 'warning' ? 'text-amber-600' : 'text-red-600';
  const iconCls = variant === 'warning' ? 'text-amber-500' : 'text-red-500';
  const btnCls = variant === 'warning' ? 'text-amber-700 hover:text-amber-900' : 'text-red-700 hover:text-red-900';

  return (
    <div className={`rounded-xl border px-5 py-4 ${border}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${iconCls}`}><AlertIcon /></div>
        <div>
          <p className={`text-sm font-semibold ${titleCls}`}>{title}</p>
          <p className={`mt-1 text-sm ${msgCls}`}>{message}</p>
          <button type="button" onClick={action.onClick}
            className={`mt-3 text-sm font-medium underline underline-offset-2 ${btnCls}`}>
            {action.label}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBadge({ number, active }: { number: number; active?: boolean }) {
  return (
    <div className={[
      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
      active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400',
    ].join(' ')}>
      {number}
    </div>
  );
}

function FutureStep({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 opacity-80 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 dark:text-slate-400">
      <StepBadge number={number} />
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </div>
  );
}

function StepsIndicator({ completed, currentStep, streamBatch, estimatedBatches }: { completed: number; currentStep: Step; streamBatch?: number; estimatedBatches?: number }) {
  const steps = [
    { id: 1, label: 'Upload' },
    { id: 2, label: 'Preview' },
    { id: 3, label: 'Mapping' },
    { id: 4, label: 'Review' },
  ];
  const stepIndex = (s: Step) => (s === 'upload' ? 1 : s === 'preview' ? 2 : s === 'importing' ? 3 : 4);
  const current = stepIndex(currentStep);

  return (
    <div className="mb-4 flex w-full items-center gap-4">
      {steps.map((s, i) => {
        const isCompleted = completed >= s.id;
        const isActive = current === s.id && completed < s.id;
        const percent = s.id === 3 && estimatedBatches && estimatedBatches > 0 ? Math.round((Math.min(streamBatch ?? 0, estimatedBatches) / estimatedBatches) * 100) : 0;
        return (
          <div key={s.id} className="flex items-center gap-3 flex-1">
            <div className="flex items-center gap-3">
              <div className={[
                'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold shadow-sm',
                isCompleted ? 'bg-green-600 text-white' : isActive ? 'bg-brand-600 text-white animate-pulse' : 'bg-slate-100 text-slate-500',
              ].join(' ')}>
                {isCompleted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414-1.414L7 12.172 4.707 9.879a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l9-9z" clipRule="evenodd"/></svg>
                ) : s.id}
              </div>
              {i < steps.length - 1 && (
                <div className={[
                  'ml-3 h-0.5 flex-1',
                  completed > s.id ? 'bg-green-200' : 'bg-slate-100'
                ].join(' ')} />
              )}
            </div>
            <div className="min-w-0">
              <div className={[
                'text-xs font-semibold',
                isCompleted ? 'text-green-700' : isActive ? 'text-brand-700' : 'text-slate-500'
              ].join(' ')}>{s.label}</div>
              {s.id === 3 && estimatedBatches && estimatedBatches > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="text-[11px] text-slate-400">{percent}%</div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="h-5 w-5 animate-spin text-brand-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}
