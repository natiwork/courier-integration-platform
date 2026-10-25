import type { Pool, PoolClient } from '../db/pool.js';
import { query, transaction } from '../db/query.js';
import type { OrderEvent } from '../domain/orderEvent.js';
import type { NewOrder } from '../repositories/orderRepository.js';
import { generateDemoEvents, generateDemoOrders } from './demoOrders.js';

// Any fixed number: two server processes starting at once take turns instead of both seeding.
const SEED_LOCK_ID = 9_000_002;
const FIRST_ORDER_NUMBER = 1001;

export interface SeedResult {
  seeded: boolean; // false: the database already had orders, nothing was written
  orders: number;
  events: number;
}

// Writes the same deterministic demo orders and events as the in-memory store, but only into an empty
// database, and all in one transaction: a restart never duplicates them, and a failure leaves nothing behind.
export async function seedDemoDataIfEmpty(pool: Pool, now: Date = new Date()): Promise<SeedResult> {
  return transaction(pool, async (client) => {
    // Held until COMMIT. The second process waits here, then sees the orders and does nothing.
    await query(client, 'SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_ID]);
    const existing = await query<{ any: boolean }>(client, 'SELECT EXISTS (SELECT 1 FROM orders) AS any');
    if (existing.rows[0]?.any) return { seeded: false, orders: 0, events: 0 };

    const orders = generateDemoOrders(now);
    const events = generateDemoEvents(orders);
    await insertOrders(client, orders);
    await insertEvents(client, events);
    return { seeded: true, orders: orders.length, events: events.length };
  });
}

// One INSERT per table: the values travel as arrays (one per column) and unnest() turns them back into rows.
// Order numbers are given explicitly (ORD-1001, ORD-1002, ... in generation order, as in memory), then the
// sequence is moved past them so the next real order continues from there.
async function insertOrders(client: PoolClient, orders: readonly NewOrder[]): Promise<void> {
  const column = <T>(pick: (order: NewOrder, index: number) => T) => orders.map(pick);
  await query(
    client,
    `INSERT INTO orders (id, order_seq, customer_name, customer_email, delivery_address, destination_city, postal_code,
       destination_country, parcel_weight_kg, total_cents, currency, payment_status, courier_provider, status,
       tracking_number, created_at, updated_at)
     SELECT * FROM unnest($1::uuid[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
       $8::text[], $9::float8[], $10::bigint[], $11::text[], $12::text[], $13::text[], $14::text[],
       $15::text[], $16::timestamptz[], $17::timestamptz[])`,
    [
      column((o) => o.id),
      column((_o, index) => FIRST_ORDER_NUMBER + index),
      column((o) => o.customerName),
      column((o) => o.customerEmail),
      column((o) => o.deliveryAddress),
      column((o) => o.destinationCity),
      column((o) => o.postalCode),
      column((o) => o.destinationCountry),
      column((o) => o.parcelWeightKg),
      column((o) => o.totalCents),
      column((o) => o.currency),
      column((o) => o.paymentStatus),
      column((o) => o.courierProvider),
      column((o) => o.status),
      column((o) => o.trackingNumber),
      column((o) => o.createdAt),
      column((o) => o.updatedAt),
    ],
  );
  await query(client, "SELECT setval(pg_get_serial_sequence('orders', 'order_seq'), $1)", [FIRST_ORDER_NUMBER + orders.length - 1]);

  const items = orders.flatMap((order) => order.items.map((item, position) => ({ orderId: order.id, position, ...item })));
  await query(
    client,
    `INSERT INTO order_items (order_id, position, sku, name, quantity, unit_price_cents)
     SELECT * FROM unnest($1::uuid[], $2::smallint[], $3::text[], $4::text[], $5::int[], $6::int[])`,
    [
      items.map((item) => item.orderId),
      items.map((item) => item.position),
      items.map((item) => item.sku),
      items.map((item) => item.name),
      items.map((item) => item.quantity),
      items.map((item) => item.unitPriceCents),
    ],
  );
}

// WITH ORDINALITY + ORDER BY: the rows get their seq in the generated order, which breaks timestamp ties
// the same way as the in-memory array.
async function insertEvents(client: PoolClient, events: readonly OrderEvent[]): Promise<void> {
  const column = <T>(pick: (event: OrderEvent) => T) => events.map(pick);
  await query(
    client,
    `INSERT INTO order_events (id, order_id, type, from_status, to_status, source, message, provider_id, code, attempts, created_at)
     SELECT id, order_id, type, from_status, to_status, source, message, provider_id, code, attempts, created_at
     FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
       $10::int[], $11::timestamptz[])
       WITH ORDINALITY AS e(id, order_id, type, from_status, to_status, source, message, provider_id, code, attempts, created_at, ord)
     ORDER BY ord`,
    [
      column((e) => e.id),
      column((e) => e.orderId),
      column((e) => e.type),
      column((e) => e.fromStatus),
      column((e) => e.toStatus),
      column((e) => e.source),
      column((e) => e.message),
      column((e) => e.providerId),
      column((e) => e.code),
      column((e) => e.attempts),
      column((e) => e.createdAt),
    ],
  );
}
