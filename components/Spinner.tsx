export default function Spinner({ large = false, label }: { large?: boolean; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="row" style={{ gap: 10 }}>
      <span className={`spinner ${large ? 'spinner-lg' : ''}`} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block">
      <Spinner large label={label} />
    </div>
  );
}
