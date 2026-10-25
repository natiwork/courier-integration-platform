import type { OrderEventRepository } from './orderEventRepository.js';
import type { OrderRepository } from './orderRepository.js';

export interface Repositories {
  orders: OrderRepository;
  events: OrderEventRepository;
}

// Runs `work` so that all its writes happen together or not at all. With PostgreSQL the repositories handed to
// `work` share one connection inside BEGIN ... COMMIT (ROLLBACK if `work` throws). In memory nothing can fail
// half-way, so the work simply runs with the same repositories.
export type RunInTransaction = <T>(work: (repositories: Repositories) => Promise<T>) => Promise<T>;

export function withoutTransaction(repositories: Repositories): RunInTransaction {
  return (work) => work(repositories);
}
