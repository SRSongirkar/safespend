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
          <h1>Your bank balance is not the full story.</h1>
          <p>See the bills you must pay before your next salary — rent, credit card bill, subscriptions, renewals — and check if you can afford something new.</p>
        </div>
        <div className="auth-preview" aria-hidden="true">
          <div>
            <span>Bills before payday</span>
            <b>₹88,114</b>
          </div>
          <div>
            <span>Lowest balance</span>
            <b>₹25,000</b>
          </div>
          <div>
            <span>Safe to spend</span>
            <b>₹12,500</b>
          </div>
        </div>
        <div className="auth-trust">
          <span>
            <Icon name="lock" size={15} /> Your data is encrypted
          </span>
          <span>
            <Icon name="shield" size={15} /> No bank login, no sharing
          </span>
          <span>
            <Icon name="download" size={15} /> Download or delete any time
          </span>
        </div>
      </section>
      <section className="auth-side">{children}</section>
    </div>
  );
}
