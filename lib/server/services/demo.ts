import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { DEMO_FILE_PLAN, loadDemoIntoVault } from '@/lib/core/demoAccounts';
import type { ImportRecord } from '@/lib/core/types';
import { signup } from '../auth';
import { listUsers, withVault } from '../repo';

export const DEMO_USER = { name: 'Aisha', email: 'aisha@demo.com', password: 'demo1234' };

function demoDir() {
  return path.join(process.cwd(), 'public', 'demo');
}

const read = (name: string) => fs.readFileSync(path.join(demoDir(), name), 'utf8');

/** Load the demo accounts + files into this user's vault via the normal import path (loading twice adds 0). */
export function loadDemo(userId: string): Promise<{ imports: ImportRecord[]; added: number; duplicates: number }> {
  const files = DEMO_FILE_PLAN.map((f) => ({ ...f, text: read(f.fileName) }));
  const accounts = read('accounts.json');
  return withVault(userId, (vault) => {
    const imports = loadDemoIntoVault(vault, { accounts, files }, { newId: randomUUID, nowIso: new Date().toISOString(), today: new Date().toISOString().slice(0, 10) });
    return { imports, added: imports.reduce((s, i) => s + i.added, 0), duplicates: imports.reduce((s, i) => s + i.duplicates, 0) };
  });
}

/** On first start, if there are no users, create the demo user with demo data preloaded. */
export async function seedDemoIfEmpty(): Promise<boolean> {
  if (listUsers().length > 0) return false;
  const { user } = await signup(DEMO_USER);
  await loadDemo(user.id);
  return true;
}
