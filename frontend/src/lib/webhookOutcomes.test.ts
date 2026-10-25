import { describe, expect, it } from 'vitest';
import type { WebhookOutcome } from '../api/integrations';
import { summarizeWebhooks } from './webhookOutcomes';

const zero: Record<WebhookOutcome, number> = {
  accepted: 0,
  duplicate: 0,
  unchanged: 0,
  ignored_transition: 0,
  unmapped_status: 0,
  unknown_tracking: 0,
  invalid_signature: 0,
  stale: 0,
  invalid_payload: 0,
  not_configured: 0,
};

describe('summarizeWebhooks', () => {
  it('groups outcomes into applied, duplicates, ignored and refused, leaving out empty groups', () => {
    expect(summarizeWebhooks({ ...zero, accepted: 3, unchanged: 1, duplicate: 2, invalid_signature: 1, stale: 1 })).toBe(
      '4 applied, 2 duplicates, 2 refused',
    );
  });

  it('says so when nothing has arrived', () => {
    expect(summarizeWebhooks(zero)).toBe('No webhooks yet');
  });
});
