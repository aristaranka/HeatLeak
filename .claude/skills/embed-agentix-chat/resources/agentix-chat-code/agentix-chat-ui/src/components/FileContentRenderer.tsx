/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseCsv } from '../lib/csv';
import { Button } from './ui/button';
import { DataGrid, type DataGridColumn } from './ui/data-grid';

export interface FileContentRendererProps {
  /** Filename or path — used only to sniff the `.md`/`.csv` extension. */
  fileName: string;
  content: string;
  /** Exact className the caller previously used on its plain-text `<pre>`, preserved for the
   *  plain fallback and the markdown raw-source view so those paths stay visually unchanged. */
  preClassName?: string;
  /** Exact `data-testid` the caller previously used on its plain-text `<pre>`, preserved on the
   *  plain fallback and the markdown raw-source view so existing tests keep finding it. */
  preTestId?: string;
  /** True when `content` is a byte/line-capped prefix of a larger file (preview or capped view),
   *  not the whole file. Forces the plain `<pre>` fallback regardless of extension — rendering a
   *  cut-off `.md` table or `.csv` through the rich renderer produces a header row with no data
   *  (or a misaligned table) that reads as broken/empty content rather than "truncated". */
  truncated?: boolean;
}

type RichKind = 'markdown' | 'csv' | 'plain';

function detectRichKind(fileName: string): RichKind {
  if (/\.md$/i.test(fileName)) return 'markdown';
  if (/\.csv$/i.test(fileName)) return 'csv';
  return 'plain';
}

function padRow(row: string[], length: number): string[] {
  if (row.length === length) return row;
  const padded = row.slice(0, length);
  while (padded.length < length) padded.push('');
  return padded;
}

/** Shared file-content view for the workspace file viewer, the chat attachment preview
 *  modal, and the Automations run-artifact browser: renders `.md` as formatted Markdown
 *  (with a raw-source toggle), `.csv` as a table via the shared `DataGrid`, and anything
 *  else exactly as the plain `<pre>` block all three callers used before. */
export default function FileContentRenderer({
  fileName,
  content,
  preClassName,
  preTestId,
  truncated,
}: FileContentRendererProps) {
  const { t } = useTranslation('common');
  const richKind = useMemo(() => (truncated ? 'plain' : detectRichKind(fileName)), [truncated, fileName]);
  const [showRaw, setShowRaw] = useState(false);

  const csvRows = useMemo(() => {
    if (richKind !== 'csv') return null;
    try {
      const parsed = parseCsv(content);
      return parsed.length > 0 ? parsed : null;
    } catch (err) {
      console.error('FileContentRenderer: failed to parse CSV', { fileName }, err);
      return null;
    }
  }, [richKind, content, fileName]);

  if (richKind === 'csv' && csvRows) {
    const [header, ...body] = csvRows;
    const columns: DataGridColumn<string[]>[] = header.map((label, idx) => ({
      id: `col-${idx}`,
      header: label,
      cell: (row) => row[idx] ?? '',
    }));
    const rows = body.map((row) => padRow(row, header.length));
    return (
      <div data-testid="file-content-renderer-csv" className="overflow-auto">
        <DataGrid columns={columns} data={rows} getRowId={(_row, index) => String(index)} />
      </div>
    );
  }

  if (richKind === 'markdown') {
    return (
      <div data-testid="file-content-renderer-markdown">
        <div className="mb-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            data-testid="file-content-renderer-raw-toggle"
            onClick={() => setShowRaw((prev) => !prev)}
          >
            {showRaw ? t('fileContent.viewRendered') : t('fileContent.viewRaw')}
          </Button>
        </div>
        {showRaw ? (
          <pre className={preClassName} data-testid={preTestId}>
            {content}
          </pre>
        ) : (
          <div className="markdown-body prose prose-sm dark:prose-invert max-w-none leading-[1.7] text-foreground prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    );
  }

  return (
    <pre className={preClassName} data-testid={preTestId}>
      {content}
    </pre>
  );
}
