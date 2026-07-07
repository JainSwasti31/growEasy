'use client';

import { useCallback, useRef, useState } from 'react';
import Spinner from './Spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  onFileSelected: (file: File) => void;
  /** Disable the whole uploader (e.g. while a later step is loading) */
  disabled?: boolean;
}

type DropState = 'idle' | 'hover' | 'error';

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateFile(file: File): string | null {
  const isCSV =
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel' ||
    file.name.toLowerCase().endsWith('.csv');

  if (!isCSV) return `"${file.name}" is not a CSV file. Please upload a .csv file.`;
  if (file.size === 0) return 'The file is empty. Please choose a non-empty CSV file.';
  if (file.size > MAX_SIZE_BYTES)
    return `File is too large (${formatBytes(file.size)}). Maximum allowed size is ${MAX_SIZE_MB} MB.`;
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CsvUploader({ onFileSelected, disabled = false }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dropState, setDropState] = useState<DropState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── File acceptance ──────────────────────────────────────────────────────────

  const acceptFile = useCallback(
    (file: File) => {
      const error = validateFile(file);
      if (error) {
        setErrorMessage(error);
        setSelectedFile(null);
        setDropState('error');
        return;
      }
      setErrorMessage(null);
      setDropState('idle');
      setSelectedFile(file);
      console.log('[CsvUploader] File selected:', file.name, formatBytes(file.size));
      onFileSelected(file);
    },
    [onFileSelected]
  );

  // ── Input change ─────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
    // Reset so the same file can be re-selected after replacement
    e.target.value = '';
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDropState('hover');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only reset if leaving the drop zone entirely (not a child element)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropState(errorMessage ? 'error' : 'idle');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    setDropState('idle');
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  // ── Replace ──────────────────────────────────────────────────────────────────

  const handleReplace = () => {
    setSelectedFile(null);
    setErrorMessage(null);
    setDropState('idle');
    inputRef.current?.click();
  };

  // ── Derived styles ────────────────────────────────────────────────────────────

  const borderColor =
    disabled
      ? 'border-slate-200'
      : dropState === 'hover'
      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
      : dropState === 'error'
      ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
      : selectedFile
      ? 'border-brand-400 bg-brand-50/40 dark:bg-brand-900/10'
      : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-brand-500 dark:hover:bg-slate-800/50';

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,application/vnd.ms-excel"
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled}
        aria-label="Upload CSV file"
      />

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="CSV file drop zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !selectedFile && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !selectedFile)
            inputRef.current?.click();
        }}
        className={[
          'relative flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center',
          'rounded-2xl border-2 border-dashed px-6 py-10 text-center',
          'transition-all duration-200 outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          disabled ? 'cursor-not-allowed opacity-50' : '',
          borderColor,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {selectedFile ? (
          /* ── File selected state ── */
          <SelectedFileView
            file={selectedFile}
            onReplace={handleReplace}
            disabled={disabled}
          />
        ) : (
          /* ── Empty / hover / error state ── */
          <EmptyState dropState={dropState} errorMessage={errorMessage} />
        )}

        {/* Hover overlay label */}
        {dropState === 'hover' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-brand-600/10">
            <span className="text-lg font-semibold text-brand-700">Drop it here</span>
          </div>
        )}
        {/* Show inline spinner when disabled (e.g., importing) */}
        {disabled && (
          <div className="pointer-events-none absolute right-4 top-4">
            <Spinner size={18} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EmptyState({
  dropState,
  errorMessage,
}: {
  dropState: DropState;
  errorMessage: string | null;
}) {
  return (
    <>
      {/* Icon */}
      <div
        className={[
          'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl',
          dropState === 'error'
            ? 'bg-red-100 text-red-500'
            : dropState === 'hover'
            ? 'bg-brand-100 text-brand-600'
            : 'bg-slate-100 text-slate-400',
        ].join(' ')}
      >
        {dropState === 'error' ? (
          <ErrorIcon />
        ) : (
          <UploadIcon />
        )}
      </div>

      {/* Main copy */}
      {dropState === 'error' && errorMessage ? (
        <p className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">{errorMessage}</p>
      ) : (
        <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <span className="text-brand-600 underline underline-offset-2 dark:text-brand-300">Choose a file</span>
          {' '}or drag and drop it here
        </p>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">CSV files only · max {10} MB</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">Supported format: comma-delimited with header row.</p>

      {/* Try again nudge on error */}
      {dropState === 'error' && (
        <p className="mt-2 text-xs text-slate-500">Click or drag a valid .csv file to try again</p>
      )}
    </>
  );
}

function SelectedFileView({
  file,
  onReplace,
  disabled,
}: {
  file: File;
  onReplace: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      {/* File card */}
      <div className="flex w-full max-w-sm items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
          <CsvIcon />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p
            className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100"
            title={file.name}
          >
            {file.name}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatBytes(file.size)}</p>
        </div>
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckIcon />
        </div>
      </div>

      {/* Replace link */}
      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReplace();
          }}
          className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded"
        >
          Choose a different file
        </button>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function CsvIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}
