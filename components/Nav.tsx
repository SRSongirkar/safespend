'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from './Icon';

export const NAV_ITEMS = [
  { href: '/', label: 'Home', short: 'Home', icon: 'home' },
  { href: '/transactions', label: 'Transactions', short: 'Activity', icon: 'list' },
  { href: '/spending', label: 'Spending', short: 'Spending', icon: 'chart' },
  { href: '/accounts', label: 'Accounts', short: 'Accounts', icon: 'wallet' },
  { href: '/import', label: 'Import', short: 'Import', icon: 'upload' },
  { href: '/settings', label: 'Settings', short: 'Settings', icon: 'settings' },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

export function BrandLink() {
  return (
    <Link href="/" className="brand" aria-label="Committed home">
      <span className="brand-mark">
        <Icon name="lock" size={16} strokeWidth={2.4} />
      </span>
      Committed
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="nav-list">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                <Icon name={item.icon} size={19} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className={`tab ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon name={item.icon} size={21} />
            {item.short}
          </Link>
        );
      })}
    </nav>
  );
}
