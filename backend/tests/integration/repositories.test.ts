import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import { PostgresOrderEventRepository } from '../../src/repositories/postgresOrderEventRepository.js';
import { PostgresOrderRepository } from '../../src/repositories/postgresOrderRepository.js';
import { orderEventRepositoryContract } from '../contracts/orderEventRepository.contract.js';
import { orderRepositoryContract } from '../contracts/orderRepository.contract.js';
import { buildOrder } from '../fixtures/orders.js';
import { createTestPool, resetDatabase } from './support/db.js';

const pool = createTestPool();
afterAll(() => pool.end());

orderRepositoryContract('PostgresOrderRepository', async () => {
  await resetDatabase(pool);
  return new PostgresOrderRepository(pool);
});

orderEventRepositoryContract('PostgresOrderEventRepository', async () => {
  await resetDatabase(pool);
  const orders = new PostgresOrderRepository(pool);
  const ids: [string, string] = [randomUUID(), randomUUID()];
  for (const id of ids) {
    const { orderNumber: _n, ...order } = buildOrder({ id });
    await orders.create(order);
  }
  return { events: new PostgresOrderEventRepository(pool), orderIds: ids };
});
