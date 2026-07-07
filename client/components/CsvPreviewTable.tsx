'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ParseResult } from '@/lib/useCsvParser';

interface Props {
  result: ParseResult;
}

const ROW_HEIGHT = 36; // px — matches py-2 + text-xs line height
const TABLE_MAX_HEIGHT = 420; // px

/**
 * Virtualised CSV preview table using TanStack Virtual.
 *
 * Renders only the visible rows (+ overscan buffer) regardless of total row
 * count — a 10,000-row CSV renders as fast as a 10-row one.
 *
 * Sticky header is preserved via CSS position:sticky on <thead>.
 * Horizontal scroll works via overflow-x:auto on the outer wrapper.
 */
export default function CsvPreviewTable({ result }: Props) {
  const { headers, rows, totalRows } = result;

  // The scrollable container the virtualizer measures
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  return (
    <div className="flex flex-col gap-2">
      {/* Stats bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {totalRows.toLocaleString()}
          </span>{' '}
          {totalRows === 1 ? 'row' : 'rows'} ·{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {headers.length}
          </span>{' '}
          columns
          {totalRows > 100 && (
            <span className="ml-2 text-slate-400 dark:text-slate-500">(virtualised)</span>
          )}
        </p>
      </div>

      {/* Scrollable container — virtualizer measures this */}
      <div
        ref={parentRef}
        className="overflow-auto rounded-xl border border-slate-200 shadow-sm bg-white dark:border-slate-700 dark:bg-slate-950"
        style={{ maxHeight: TABLE_MAX_HEIGHT }}
      >
        <table className="min-w-full border-collapse text-sm">
          {/* Sticky header — outside the virtualised body */}
          <thead className="sticky top-0 z-10 bg-slate-50/95 shadow-sm dark:bg-slate-900">
            <tr>
              <th
                scope="col"
                className="w-10 border-b border-slate-200 px-3 py-2.5 text-right text-xs font-medium text-slate-400 dark:border-slate-800 dark:text-slate-500 select-none"
                aria-label="Row number"
              >
                #
              </th>
              {headers.map((header) => (
                <th
                  key={header}
                  scope="col"
                  className="border-b border-slate-200 px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-slate-600 dark:border-slate-800 dark:text-slate-300 max-w-[180px]"
                >
                  <span className="block truncate" title={header}>{header}</span>
                </th>
              ))}
            </tr>
          </thead>

          {/*
            Virtualised body:
            - A single <tbody> with explicit height = totalVirtualHeight
            - Only virtualRows are rendered inside it
            - Each virtual row is absolutely offset via paddingTop/paddingBottom
              (the recommended TanStack pattern for table bodies)
          */}
          <tbody
            className="bg-white dark:bg-slate-950"
            style={{ height: totalVirtualHeight, position: 'relative' }}
          >
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              const isEven = virtualRow.index % 2 === 0;
              return (
                <tr
                  key={virtualRow.index}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={[
                    'absolute w-full transition-colors hover:bg-brand-50/40 dark:hover:bg-slate-800/50',
                    isEven ? 'bg-white dark:bg-slate-950' : 'bg-slate-50/60 dark:bg-slate-900/60',
                  ].join(' ')}
                  style={{ top: virtualRow.start }}
                >
                  <td className="w-10 px-3 py-2 text-right text-xs tabular-nums text-slate-400 dark:text-slate-500 select-none">
                    {virtualRow.index + 1}
                  </td>
                  {headers.map((header) => (
                    <td
                      key={header}
                      className="max-w-[200px] px-4 py-2 text-xs text-slate-700 dark:text-slate-200"
                    >
                      <CellValue value={row?.[header] ?? ''} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        All {totalRows.toLocaleString()} rows rendered via TanStack Virtual — only visible rows are in the DOM.
      </p>
    </div>
  );
}

function CellValue({ value }: { value: string }) {
  const TRUNCATE_AT = 80;
  const trimmed = value.trim();
  if (!trimmed) return <span className="italic text-slate-300 dark:text-slate-600">—</span>;
  if (trimmed.length > TRUNCATE_AT) {
    return (
      <span title={trimmed} className="cursor-help">
        {trimmed.slice(0, TRUNCATE_AT)}
        <span className="text-slate-400">…</span>
      </span>
    );
  }
  return <span>{trimmed}</span>;
}
