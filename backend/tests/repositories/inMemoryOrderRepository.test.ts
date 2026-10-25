import { describe, expect, it } from 'vitest';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { orderRepositoryContract } from '../contracts/orderRepository.contract.js';
import { buildOrder } from '../fixtures/orders.js';

orderRepositoryContract('InMemoryOrderRepository', async () => new InMemoryOrderRepository());

describe('InMemoryOrderRepository', () => {
  it('returns deep copies, so changing a returned order never changes the store', async () => {
    const repository = new InMemoryOrderRepository();
    const { orderNumber: _ignored, ...newOrder } = buildOrder({ id: 'a' });
    // Snapshot taken before any mutation: comparing with newOrder.items would compare a value with itself.
    const originalItems = structuredClone(newOrder.items);

    const created = await repository.create(newOrder);
    created.items[0]!.quantity = 999;
    newOrder.items[0]!.name = 'Changed by the caller';
    const listed = await repository.findAll();
    listed[0]!.items.push({ sku: 'X-1', name: 'Injected', quantity: 1, unitPriceCents: 1 });

    const stored = await repository.findById('a');
    expect(stored?.items).toEqual(originalItems);
  });
});
