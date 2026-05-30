// Format a `googleSyncErrors` array (returned by server routes that fan
// out to Google Tasks) into a human-readable string suitable for a toast.
// Returns null when there's nothing to surface. Pair with useToast() —
// e.g. `const w = googleSyncWarning(res, 'date update'); if (w) show(w, 'warning');`
export function googleSyncWarning(response, action = 'sync') {
  const errors = response?.googleSyncErrors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0]?.error || 'Unknown error';
  const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';
  return `Google ${action} issue: ${first}${more}`;
}
