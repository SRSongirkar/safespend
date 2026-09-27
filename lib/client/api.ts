// Typed fetch wrappers for /api/*. Client components never import lib/server — only this file.
import type {
  Account,
  AffordResult,
  AnalysisResult,
  ColumnMapping,
  CorrectionAction,
  EnrichedTransaction,
  ImportRecord,
  MonthlySummary,
  Settings,
} from '@/lib/core/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  hasPassword?: boolean;
  google?: boolean;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const hasBody = opts.body !== undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (hasBody ? 'POST' : 'GET'),
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    throw new ApiError(401, 'Please sign in');
  }
  if (res.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Request failed (${res.status})`);
  return data as T;
}

// ---------- endpoints ----------

export const authApi = {
  login: (email: string, password: string) => api<{ user: PublicUser }>('/api/auth/login', { body: { email, password } }),
  signup: (name: string, email: string, password: string) => api<{ user: PublicUser }>('/api/auth/signup', { body: { name, email, password } }),
  logout: () => api<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => api<{ user: PublicUser; googleEnabled: boolean }>('/api/auth/me'),
};

export const analysisApi = {
  get: () => api<AnalysisResult>('/api/analysis'),
  afford: (amountCents: number, date: string, repeat: 'once' | 'monthly') => api<AffordResult>('/api/afford', { body: { amountCents, date, repeat } }),
  spending: (months: number) => api<{ months: MonthlySummary[] }>(`/api/spending?months=${months}`),
  loadDemo: () => api<{ added: number; duplicates: number; imports: ImportRecord[] }>('/api/demo/load', { method: 'POST' }),
  correct: (seriesKey: string, action: CorrectionAction, amount?: number) => api('/api/corrections', { body: { seriesKey, action, amount } }),
  uncorrect: (seriesKey: string) => api('/api/corrections', { method: 'DELETE', body: { seriesKey } }),
};

export interface TxListResponse {
  items: EnrichedTransaction[];
  total: number;
  months: string[];
}

export const txApi = {
  list: (params: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
    return api<TxListResponse>(`/api/transactions?${q.toString()}`);
  },
  create: (body: { accountId: string; date: string; description: string; amountCents: number; category?: string }) =>
    api<{ transaction: EnrichedTransaction }>('/api/transactions', { body }),
  patch: (id: string, body: { categoryOverride?: string | null; note?: string; applyToMerchant?: boolean }) =>
    api<{ updated: number }>(`/api/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/api/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export interface AccountInput {
  name?: string;
  type?: Account['type'];
  statementCloseDay?: number | null;
  dueDay?: number | null;
  autopayFromId?: string | null;
  openingBalanceCents?: number | null;
}

export const accountsApi = {
  list: () => api<{ accounts: Account[] }>('/api/accounts'),
  create: (body: AccountInput) => api<{ account: Account }>('/api/accounts', { body }),
  update: (id: string, body: AccountInput) => api<{ account: Account }>(`/api/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export interface ImportPreview {
  kind: ImportRecord['kind'];
  format: ImportRecord['format'] | 'unknown';
  headerSignature?: string;
  header?: string[];
  needsMapping: boolean;
  needsAccount: boolean;
  suggestedAccountType?: Account['type'];
  rows: number;
  added: number;
  duplicates: number;
  errors: string[];
  sample: { date: string; description: string; amount: number; duplicate: boolean }[];
}

export interface ImportBody {
  fileName: string;
  text: string;
  accountId?: string;
  mapping?: Omit<ColumnMapping, 'headerSignature'>;
  kind?: 'receipt_text';
}

export const importApi = {
  preview: (body: ImportBody) => api<ImportPreview>('/api/import/preview', { body }),
  commit: (body: ImportBody) => api<{ import: ImportRecord; preview: ImportPreview }>('/api/import/commit', { body }),
  list: () => api<{ imports: ImportRecord[] }>('/api/imports'),
  undo: (id: string) => api<{ removed: number }>(`/api/imports/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export const settingsApi = {
  get: () => api<{ settings: Settings }>('/api/settings'),
  patch: (body: { currency?: string; bufferCents?: number; asOfOverride?: string | null }) => api<{ settings: Settings }>('/api/settings', { method: 'PATCH', body }),
  changePassword: (currentPassword: string, newPassword: string) => api('/api/settings/password', { body: { currentPassword, newPassword } }),
  deleteMe: (password: string) => api('/api/me', { method: 'DELETE', body: { password } }),
};
