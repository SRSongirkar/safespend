import Icon from './Icon';

export default function EmptyState({
  icon = 'sparkle',
  title,
  children,
  actions,
}: {
  icon?: string;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {actions ? <div className="row-wrap" style={{ justifyContent: 'center', marginTop: 8 }}>{actions}</div> : null}
    </div>
  );
}

export function ErrorAlert({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <Icon name="alert" size={18} />
      <div className="spacer">{message}</div>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
