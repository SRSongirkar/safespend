import { affordCheck, type AffordRequest } from '@/lib/core/afford';
import { analyze, type AnalysisBundle } from '@/lib/core/analyze';
import { monthlySummaries } from '@/lib/core/monthly';
import type { AffordResult, MonthlySummary } from '@/lib/core/types';
import { readVault, vaultVersion } from '../repo';

// Analysis is cached per user in memory, keyed by the vault version counter (bumped on every write).
const g = globalThis as unknown as { __committedAnalysis?: Map<string, { version: number; bundle: AnalysisBundle }> };
const cache = (g.__committedAnalysis ??= new Map());

const today = () => new Date().toISOString().slice(0, 10);

export function getBundle(userId: string): AnalysisBundle {
  const version = vaultVersion(userId);
  const hit = cache.get(userId);
  if (hit && hit.version === version) return hit.bundle;
  const bundle = analyze(readVault(userId), { today: today() });
  cache.set(userId, { version, bundle });
  return bundle;
}

export function getAnalysis(userId: string) {
  return getBundle(userId).result;
}

export function afford(userId: string, req: AffordRequest): AffordResult {
  return affordCheck(getBundle(userId).model, req);
}

export function spending(userId: string, months: number): MonthlySummary[] {
  const all = monthlySummaries(getBundle(userId).enriched);
  return all.slice(-months);
}

export function __resetAnalysisCache() {
  cache.clear();
}

export function forgetUser(userId: string) {
  cache.delete(userId);
}
