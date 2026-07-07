'use client';

import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ImportResponse, CrmRecord } from '@groweasy/shared';
import Toast from './Toast';
import Spinner from './Spinner';

interface Props {
  result: ImportResponse;
  fileName: string;
  headers: string[];
  onReset: () => void;
}

const CRM_COLUMNS: { key: keyof CrmRecord; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'country_code', label: 'CC' },
  { key: 'mobile_without_country_code', label: 'Mobile' },
  { key: 'company', label: 'Company' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
  { key: 'crm_status', label: 'Status' },
  { key: 'data_source', label: 'Source' },
  { key: 'lead_owner', label: 'Owner' },
  { key: 'crm_note', label: 'Note' },
  { key: 'possession_time', label: 'Possession' },
  { key: 'created_at', label: 'Created At' },
];

const ROW_HEIGHT = 36;

export default function ImportResults({ result, fileName, headers, onReset }: Props) {
  const [localImported, setLocalImported] = useState<CrmRecord[]>(result.imported);
  const [localSkipped, setLocalSkipped] = useState<ImportResponse['skipped']>(result.skipped);
  const [toast, setToast] = useState<{msg: string; type?: 'success'|'error'|'info'} | null>(null);

  const totalRows = result.totalRows;
  const totalImported = localImported.length;
  const totalSkipped = localSkipped.length;
  const successRate = totalRows > 0 ? (totalImported / totalRows) * 100 : 0;

  return (
    <div className="w-full max-w-5xl space-y-6">
      {/* Summary banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import complete</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400" title={fileName}>{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <UploadIcon />
            Import another file
          </button>
        </div>
        <div className="mt-5 grid grid-cols-4 gap-3">
          <StatCard label="Total rows" value={totalRows} color="slate" />
          <StatCard label="Imported" value={totalImported} color="green" />
          <StatCard label="Skipped" value={totalSkipped} color={totalSkipped > 0 ? 'amber' : 'slate'} />
          <StatCard label="Success" value={`${successRate.toFixed(1)}%`} color="green" isPercent />
        </div>
      </div>

      {localImported.length > 0 && (
        <Section title={`Imported records (${totalImported.toLocaleString()})`} accent="green">
          <VirtualImportedTable rows={localImported} />
        </Section>
      )}

      {localSkipped.length > 0 && (
        <Section title={`Skipped rows (${totalSkipped.toLocaleString()})`} accent="amber">
          <p className="mb-3 text-sm text-amber-600">These rows were skipped during import. Review the reason and the original data below.</p>
          {toast && <Toast message={toast.msg} type={toast.type || 'info'} onClose={() => setToast(null)} />}
          <VirtualSkippedTable rows={localSkipped} />
        </Section>
      )}
    </div>
  );
}

// ── Virtualised imported records table ────────────────────────────────────────

function VirtualImportedTable({ rows }: { rows: CrmRecord[] }) {
  // Use a regular scrollable table to preserve column alignment and ensure
  // each value sits under its header. If performance becomes an issue we can
  // reintroduce a column-aligned virtualization approach.
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950" style={{ maxHeight: 480 }}>
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50/90 backdrop-blur-sm dark:bg-slate-900/90">
          <tr>
            <th className="w-10 border-b-2 border-slate-200 px-3 py-2.5 text-right text-[11px] font-semibold uppercase text-slate-400 dark:border-slate-800 dark:text-slate-500 select-none">#</th>
            {CRM_COLUMNS.map((col) => (
              <th key={col.key} className="border-b-2 border-slate-200 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-slate-600 dark:border-slate-800 dark:text-slate-300">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-slate-950">
          {rows.map((record, idx) => (
            <tr key={idx} className={[ 'transition-colors hover:bg-brand-50/30 dark:hover:bg-slate-800/50', idx % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/60 dark:bg-slate-900/60', ].join(' ')}>
              <td className="w-10 px-3 py-2 text-right tabular-nums text-slate-300 select-none">{idx + 1}</td>
              {CRM_COLUMNS.map((col) => {
                const val = record[col.key] ?? '';
                return (
                  <td key={col.key} className="max-w-[160px] px-3 py-2 align-middle text-slate-700 dark:text-slate-200">
                    <div className="truncate overflow-hidden whitespace-nowrap" title={String(val)}>
                      {col.key === 'crm_status' ? <StatusBadge value={val as string} /> : <CellValue value={val as string} />}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 50 && (
        <p className="border-t border-slate-100 py-2 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          {rows.length.toLocaleString()} rows
        </p>
      )}
    </div>
  );
}

// ── Virtualised skipped rows table ────────────────────────────────────────────

function VirtualSkippedTable({ rows }: { rows: ImportResponse['skipped'] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  return (
    <div ref={parentRef} className="overflow-auto rounded-xl border border-amber-100 bg-white dark:border-amber-300/20 dark:bg-slate-950" style={{ maxHeight: 420 }}>
      <div style={{ height: totalVirtualHeight, position: 'relative' }}>
        {virtualRows.map((vr) => {
          const { row, reason } = rows[vr.index];
          return (
            <div key={vr.index} data-index={vr.index} ref={rowVirtualizer.measureElement} style={{ top: vr.start, position: 'absolute', left: 0, right: 0 }}>
              <div className="mx-4 my-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-700/30 dark:bg-amber-900/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-amber-700 select-none">#{vr.index + 1}</div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{reason}</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(row).map(([k, v]) => (
                    <div key={k} className="flex gap-3">
                      <div className="w-36 text-xs font-medium text-slate-400 whitespace-nowrap">{k}</div>
                      <div className={v ? 'text-slate-700 dark:text-slate-200' : 'italic text-slate-400 dark:text-slate-600'}>{v || '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function StatCard({ label, value, color, isPercent }: { label: string; value: number | string; color: 'slate' | 'green' | 'amber'; isPercent?: boolean }) {
  const bg = color === 'green' ? 'bg-green-50 dark:bg-emerald-900/40' : color === 'amber' ? 'bg-amber-50 dark:bg-amber-900/40' : 'bg-slate-50 dark:bg-slate-800/60';
  const text = color === 'green' ? 'text-green-700 dark:text-emerald-200' : color === 'amber' ? 'text-amber-700 dark:text-amber-200' : 'text-slate-700 dark:text-slate-200';
  const sub = color === 'green' ? 'text-green-500 dark:text-emerald-400' : color === 'amber' ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500';
  if (isPercent) {
    return (
      <div className={`rounded-xl ${bg} px-4 py-3 text-center`}>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
          <p className={`text-3xl font-bold tabular-nums ${text}`}>{typeof value === 'number' ? `${value.toFixed(1)}%` : value}</p>
        </div>
        <p className={`mt-2 text-xs font-medium ${sub}`}>{label}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl ${bg} px-4 py-3 text-center`}>
      <p className={`text-2xl font-bold tabular-nums ${text}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
      <p className={`mt-0.5 text-xs font-medium ${sub}`}>{label}</p>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: 'green' | 'amber'; children: React.ReactNode }) {
  const dot = accent === 'green' ? 'bg-green-500' : 'bg-amber-500';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${dot}`} />
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  GOOD_LEAD_FOLLOW_UP: 'bg-green-100 text-green-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  DID_NOT_CONNECT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  BAD_LEAD: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  SALE_DONE: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
};

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="italic text-slate-300 dark:text-slate-600">—</span>;
  const cls = STATUS_COLORS[value] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>{value.replace(/_/g, ' ')}</span>;
}

function CellValue({ value }: { value: string }) {
  if (!value?.trim()) return <span className="italic text-slate-300 dark:text-slate-600">—</span>;
  if (value.length > 60) return <span title={value} className="cursor-help">{value.slice(0, 60)}<span className="text-slate-400">…</span></span>;
  return <span>{value}</span>;
}

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
