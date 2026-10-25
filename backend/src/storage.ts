import type { StorageKind } from './config/env.js';
import { transaction } from './db/query.js';
import type { Pool } from './db/pool.js';
import { InMemoryOrderEventRepository } from './repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from './repositories/inMemoryOrderRepository.js';
import type { OrderEventRepository } from './repositories/orderEventRepository.js';
import type { OrderRepository } from './repositories/orderRepository.js';
import { PostgresOrderEventRepository } from './repositories/postgresOrderEventRepository.js';
import { PostgresOrderRepository } from './repositories/postgresOrderRepository.js';
import type { RunInTransaction } from './repositories/transaction.js';

// Everything the app stores, behind the same interfaces whichever storage is chosen (STORAGE=memory|postgres).
// The services never know which one they use.
export interface Storage {
  kind: StorageKind;
  orderRepository: OrderRepository;
  orderEventRepository: OrderEventRepository;
  runInTransaction?: RunInTransaction;
}

// Lost on restart. The default when no database is configured, and what the unit tests use.
export function createMemoryStorage(): Storage {
  return {
    kind: 'memory',
    orderRepository: new InMemoryOrderRepository(),
    orderEventRepository: new InMemoryOrderEventRepository(),
  };
}

export function createPostgresStorage(pool: Pool): Storage {
  return {
    kind: 'postgres',
    orderRepository: new PostgresOrderRepository(pool),
    orderEventRepository: new PostgresOrderEventRepository(pool),
    // Inside a transaction the repositories use the transaction's own connection, not the pool.
    runInTransaction: (work) =>
      transaction(pool, (client) => work({ orders: new PostgresOrderRepository(client), events: new PostgresOrderEventRepository(client) })),
  };
}
