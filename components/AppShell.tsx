'use client';

import type { PublicUser } from '@/lib/client/api';
import Icon from './Icon';
import { BrandLink, SidebarNav, TabBar } from './Nav';
import { ToastProvider } from './Toast';
import UserMenu from './UserMenu';

export default function AppShell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="shell">
        <aside className="sidebar">
          <BrandLink />
          <SidebarNav />
          <div className="sidebar-foot">
            <div className="privacy-note">
              <Icon name="shield" size={15} />
              <span>Your private space. Encrypted at rest, never shared, no bank logins.</span>
            </div>
            <UserMenu user={user} placement="up" />
          </div>
        </aside>
        <header className="topbar">
          <BrandLink />
          <UserMenu user={user} placement="down" />
        </header>
        <main className="main" id="main">
          {children}
        </main>
        <TabBar />
      </div>
    </ToastProvider>
  );
}
