export const BRANCHES = ['Torres', 'Central'];
export const DEFAULT_BRANCH = 'Torres';

export function normalizeBranch(value, fallback = DEFAULT_BRANCH) {
  const raw = String(value || '').trim();
  const match = BRANCHES.find((branch) => branch.toLowerCase() === raw.toLowerCase());
  return match || fallback;
}

export function branchFilter(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = BRANCHES.find((branch) => branch.toLowerCase() === raw.toLowerCase());
  if (!match) throw Object.assign(new Error('Sucursal invalida'), { status: 400 });
  return match;
}
