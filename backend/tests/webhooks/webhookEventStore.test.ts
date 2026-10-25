import { InMemoryWebhookEventStore } from '../../src/webhooks/webhookEventStore.js';
import { webhookEventStoreContract } from '../contracts/webhookEventStore.contract.js';

webhookEventStoreContract('InMemoryWebhookEventStore', async (now, ttlMs) => new InMemoryWebhookEventStore(now, ttlMs));
