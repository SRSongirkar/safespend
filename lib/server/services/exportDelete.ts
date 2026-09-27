import type { UserVault } from '@/lib/core/types';
import type { PublicUser } from '../auth';
import { readVault } from '../repo';

/** Everything we store about this user, decrypted, as a downloadable JSON document. */
export function exportData(user: PublicUser): { exportedAt: string; user: PublicUser; data: UserVault } {
  return { exportedAt: new Date().toISOString(), user, data: readVault(user.id) };
}
