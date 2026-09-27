'use client';

import { CATEGORY_LABELS } from './meta';

const EDITABLE = Object.keys(CATEGORY_LABELS).filter((c) => c !== 'transfer' && c !== 'card payment');

export default function CategorySelect({
  value,
  overridden,
  onChange,
  disabled,
  id,
  label = 'Category',
}: {
  value: string;
  overridden?: boolean;
  onChange: (category: string | null) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <select
      id={id}
      className="select select-sm"
      style={{ width: 'auto', minWidth: 150, maxWidth: '100%' }}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.value === '__auto' ? null : e.target.value)}
    >
      {EDITABLE.map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS[c]}
        </option>
      ))}
      {!EDITABLE.includes(value) ? <option value={value}>{CATEGORY_LABELS[value] ?? value}</option> : null}
      {overridden ? <option value="__auto">↺ Choose for me</option> : null}
    </select>
  );
}
