'use client';

import { formatMonth } from '@/lib/client/format';
import Icon from './Icon';

export default function MonthPicker({ months, value, onChange, partial }: { months: string[]; value: string; onChange: (m: string) => void; partial?: string }) {
  const idx = months.indexOf(value);
  return (
    <div className="row" role="group" aria-label="Month">
      <button type="button" className="btn btn-icon" aria-label="Previous month" disabled={idx <= 0} onClick={() => onChange(months[idx - 1])}>
        <Icon name="chevron_left" size={18} />
      </button>
      <select className="select" style={{ width: 190 }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Choose month">
        {[...months].reverse().map((m) => (
          <option key={m} value={m}>
            {formatMonth(m, true)}
            {m === partial ? ' (so far)' : ''}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-icon" aria-label="Next month" disabled={idx < 0 || idx >= months.length - 1} onClick={() => onChange(months[idx + 1])}>
        <Icon name="chevron_right" size={18} />
      </button>
    </div>
  );
}
