import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { orderEventRepositoryContract } from '../contracts/orderEventRepository.contract.js';

// In memory nothing checks that the orders exist, so any ids do.
orderEventRepositoryContract('InMemoryOrderEventRepository', async () => ({
  events: new InMemoryOrderEventRepository(),
  orderIds: [crypto.randomUUID(), crypto.randomUUID()],
}));
