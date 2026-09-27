import fs from 'fs';
import path from 'path';
import { DEMO_FILE_PLAN, emptyVault, loadDemoIntoVault } from '@/lib/core/demoAccounts';
import type { UserVault } from '@/lib/core/types';

export const DEMO_DIR = path.join(__dirname, '..', 'public', 'demo');
export const readDemo = (name: string) => fs.readFileSync(path.join(DEMO_DIR, name), 'utf8');

let counter = 0;
export const newId = () => `id-${++counter}`;

export function demoVault(): UserVault {
  const vault = emptyVault();
  loadDemoIntoVault(
    vault,
    { accounts: readDemo('accounts.json'), files: DEMO_FILE_PLAN.map((f) => ({ ...f, text: readDemo(f.fileName) })) },
    { newId, nowIso: '2026-09-24T20:00:00.000Z', today: '2026-09-24' },
  );
  return vault;
}
