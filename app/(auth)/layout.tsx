import Icon from '@/components/Icon';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <section className="auth-brand" aria-label="About Committed">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="lock" size={16} strokeWidth={2.4} />
          </span>
          Committed
        </div>
        <div className="auth-pitch">
          <h1>Your bank balance says one thing. Your commitments say another.</h1>
          <p>See how much of your money is already promised before payday — rent, the card bill, subscriptions, renewals — and whether you can say yes to that purchase.</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div>
            <span>Already committed</span>
            <b>$3,525</b>
          </div>
          <div>
            <span>Lowest point</span>
            <b>$1,000</b>
          </div>
          <div>
            <span>Safe to spend</span>
            <b>$500</b>
          </div>
        </div>
        <div className="auth-trust">
          <span>
            <Icon name="lock" size={15} /> AES-256 encrypted per user
          </span>
          <span>
            <Icon name="shield" size={15} /> No bank logins, no third parties
          </span>
          <span>
            <Icon name="download" size={15} /> Export or delete anytime
          </span>
        </div>
      </section>
      <section className="auth-side">{children}</section>
    </div>
  );
}
