import type { StorageKind } from './config/env.js';
import { transaction } from './db/query.js';
import type { Pool } from './db/pool.js';
import type { IdempotencyStore } from './idempotency/idempotencyStore.js';
import { PostgresIdempotencyStore } from './idempotency/postgresIdempotencyStore.js';
import { InMemoryOrderEventRepository } from './repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import type { OrderEventRepository } from './repositories/orderEventRepository.js';
import type { OrderRepository } from './repositories/orderRepository.js';
import { PostgresOrderEventRepository } from './repositories/postgresOrderEventRepository.js';
import { PostgresOrderRepository } from './repositories/postgresOrderRepository.js';
import type { RunInTransaction } from './repositories/transaction.js';
import { PostgresWebhookEventStore } from './webhooks/postgresWebhookEventStore.js';
import { PostgresWebhookLog } from './webhooks/postgresWebhookLog.js';
import type { WebhookEventStore } from './webhooks/webhookEventStore.js';
import type { WebhookLog } from './webhooks/webhookLog.js';

// Everything the app stores, behind the same interfaces whichever storage is chosen (STORAGE=memory|postgres).
// The services never know which one they use.
export interface Storage {
  kind: StorageKind;
  orderRepository: OrderRepository;
  orderEventRepository: OrderEventRepository;
  runInTransaction?: RunInTransaction;
  // Not set in memory: createApp then makes its own in-memory stores.
  idempotencyStore?: IdempotencyStore;
  webhookEventStore?: WebhookEventStore;
  webhookLog?: WebhookLog;
  // Removes expired idempotency keys and webhook claims (in memory they are dropped on access). Returns the count.
  deleteExpired?: () => Promise<number>;
}

// Lost on restart. The default when no database is configured, and what the unit tests use.
export function createMemoryStorage(): Storage {
  return {
    kind: 'memory',
    orderRepository: new InMemoryOrderRepository(),
    orderEventRepository: new InMemoryOrderEventRepository(),
  };
}

export function createPostgresStorage(pool: Pool, now?: () => Date): Storage {
  const idempotencyStore = new PostgresIdempotencyStore(pool, { now });
  const webhookEventStore = new PostgresWebhookEventStore(pool, { now });
  return {
    kind: 'postgres',
    orderRepository: new PostgresOrderRepository(pool),
    orderEventRepository: new PostgresOrderEventRepository(pool),
    // Inside a transaction the repositories use the transaction's own connection, not the pool.
    runInTransaction: (work) =>
      transaction(pool, (client) => work({ orders: new PostgresOrderRepository(client), events: new PostgresOrderEventRepository(client) })),
    idempotencyStore,
    webhookEventStore,
    webhookLog: new PostgresWebhookLog(pool),
    deleteExpired: async () => (await idempotencyStore.deleteExpired()) + (await webhookEventStore.deleteExpired()),
  };
}
