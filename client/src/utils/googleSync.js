// Format a `googleSyncErrors` array (returned by server routes that fan
// out to Google Tasks) into a human-readable string suitable for a toast.
// Returns null when there's nothing to surface. Pair with useToast() —
// e.g. `const w = googleSyncWarning(res, 'date update'); if (w) show(w, 'warning');`
export function googleSyncWarning(response, action = 'sync') {
  const errors = response?.googleSyncErrors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  // A dead/expired token is actionable and shouldn't be shown as raw
  // "invalid_grant" — point the user at the fix. We only surface this once,
  // since flagged accounts are then skipped by the server's sync fan-out.
  if (errors.some((e) => e?.needsReauth)) {
    return 'A Google account needs reconnecting — open Account Settings to restore sync.';
  }
  const first = errors[0]?.error || 'Unknown error';
  const more = errors.length > 1 ? ` (and ${errors.length - 1} more)` : '';
  return `Google ${action} issue: ${first}${more}`;
}
