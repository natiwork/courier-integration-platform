import type { WebhookOutcome } from '../api/integrations';

export type OutcomeTone = 'success' | 'neutral' | 'warning' | 'danger';

// How each webhook outcome is shown: words first, the tone only supports them.
export const WEBHOOK_OUTCOMES: Record<WebhookOutcome, { label: string; tone: OutcomeTone; group: 'applied' | 'duplicate' | 'ignored' | 'refused' }> = {
  accepted: { label: 'Applied', tone: 'success', group: 'applied' },
  unchanged: { label: 'No change', tone: 'neutral', group: 'applied' },
  duplicate: { label: 'Duplicate', tone: 'neutral', group: 'duplicate' },
  ignored_transition: { label: 'Ignored transition', tone: 'warning', group: 'ignored' },
  unmapped_status: { label: 'Unknown status', tone: 'warning', group: 'ignored' },
  unknown_tracking: { label: 'Unknown tracking number', tone: 'warning', group: 'ignored' },
  invalid_signature: { label: 'Rejected signature', tone: 'danger', group: 'refused' },
  stale: { label: 'Too old (replay)', tone: 'danger', group: 'refused' },
  invalid_payload: { label: 'Invalid body', tone: 'danger', group: 'refused' },
  not_configured: { label: 'Not configured', tone: 'danger', group: 'refused' },
};

// "4 applied, 1 duplicate, 2 refused" — groups with zero are left out.
export function summarizeWebhooks(counts: Record<WebhookOutcome, number>): string {
  const groups = { applied: 0, duplicate: 0, ignored: 0, refused: 0 };
  for (const [outcome, count] of Object.entries(counts) as [WebhookOutcome, number][]) groups[WEBHOOK_OUTCOMES[outcome].group] += count;
  const parts = Object.entries(groups)
    .filter(([, count]) => count > 0)
    .map(([group, count]) => `${count} ${group === 'duplicate' && count > 1 ? 'duplicates' : group}`);
  return parts.length ? parts.join(', ') : 'No webhooks yet';
}
