'use client';

import type { ImportRecord } from '@/lib/core/types';
import { formatDateYear, plural } from '@/lib/client/format';
import Icon from './Icon';

const KIND_LABEL: Record<ImportRecord['kind'], string> = { csv: 'Statement', payslips: 'Payslips', receipts: 'Receipts', receipt_text: 'Pasted email' };

export default function ImportHistory({ imports, onUndo, empty = 'No imports yet.' }: { imports: ImportRecord[]; onUndo: (r: ImportRecord) => void; empty?: string }) {
  if (imports.length === 0) return <p className="small faint">{empty}</p>;
  return (
    <ul className="history">
      {imports.map((r) => (
        <li key={r.id}>
          <Icon name={r.kind === 'csv' ? 'file' : r.kind === 'payslips' ? 'coins' : 'mail'} size={15} className="faint" />
          <div className="spacer" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.fileName}>
              {r.fileName}
            </div>
            <div className="tiny faint">
              {KIND_LABEL[r.kind]} · {formatDateYear(r.createdAt.slice(0, 10))} · {plural(r.added, 'new item')}
              {r.duplicates ? `, ${r.duplicates} duplicates skipped` : ''}
            </div>
          </div>
          {r.added > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUndo(r)}>
              <Icon name="undo" size={14} /> Undo
            </button>
          ) : (
            <span className="badge">Nothing added</span>
          )}
        </li>
      ))}
    </ul>
  );
}
