import { InMemoryIdempotencyStore } from '../../src/idempotency/idempotencyStore.js';
import { idempotencyStoreContract } from '../contracts/idempotencyStore.contract.js';

idempotencyStoreContract('InMemoryIdempotencyStore', async (now, ttlMs) => new InMemoryIdempotencyStore(now, ttlMs));
