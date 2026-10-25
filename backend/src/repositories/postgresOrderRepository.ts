import type { CountryCode } from '../domain/countries.js';
import type { Order, OrderItem, PaymentStatus } from '../domain/order.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import { query, type Queryable } from '../db/query.js';
import type { NewOrder, OrderChanges, OrderExpectation, OrderFilter, OrderRepository } from './orderRepository.js';

interface OrderRow {
  id: string;
  order_seq: string; // bigint arrives as a string
  customer_name: string;
  customer_email: string;
  delivery_address: string;
  destination_city: string;
  postal_code: string;
  destination_country: string;
  parcel_weight_kg: number;
  total_cents: string; // bigint
  currency: 'EUR';
  payment_status: PaymentStatus;
  courier_provider: string | null;
  status: OrderStatus;
  tracking_number: string | null;
  shipping_started_at: Date | null;
  shipping_provider_id: string | null;
  created_at: Date;
  updated_at: Date;
  items: OrderItem[];
}

// The order with its items as a JSON array, in the order they were entered. A subquery per order uses the
// order_items primary key, so the list needs one round trip instead of one query per order.
const ITEMS = `COALESCE((
    SELECT json_agg(json_build_object('sku', i.sku, 'name', i.name, 'quantity', i.quantity, 'unitPriceCents', i.unit_price_cents) ORDER BY i.position)
    FROM order_items i WHERE i.order_id = o.id
  ), '[]'::json) AS items`;

// Our ids are UUIDs. Anything else can't exist, and PostgreSQL would reject it with an error instead of "not found".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Field name → column. Only these names ever reach the SQL text; values always go in as parameters.
const COLUMNS = {
  status: 'status',
  paymentStatus: 'payment_status',
  courierProvider: 'courier_provider',
  trackingNumber: 'tracking_number',
  shippingStartedAt: 'shipping_started_at',
  shippingProviderId: 'shipping_provider_id',
  updatedAt: 'updated_at',
} as const satisfies Record<keyof OrderChanges | keyof OrderExpectation, string>;

const ORDER_NUMBER_PREFIX = 'ORD-';

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: `${ORDER_NUMBER_PREFIX}${row.order_seq}`,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    deliveryAddress: row.delivery_address,
    destinationCity: row.destination_city,
    postalCode: row.postal_code,
    destinationCountry: row.destination_country as CountryCode,
    parcelWeightKg: row.parcel_weight_kg,
    items: row.items,
    totalCents: Number(row.total_cents), // at most ~5·10¹¹, far below Number.MAX_SAFE_INTEGER
    currency: row.currency,
    paymentStatus: row.payment_status,
    courierProvider: row.courier_provider,
    status: row.status,
    trackingNumber: row.tracking_number,
    shippingStartedAt: row.shipping_started_at?.toISOString() ?? null,
    shippingProviderId: row.shipping_provider_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// LIKE treats % and _ as wildcards: a search for "50%" must match the text "50%", not "50 anything".
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly db: Queryable) {}

  // One statement inserts the order and its items, so they are stored together even outside a transaction.
  async create(order: NewOrder): Promise<Order> {
    const { rows } = await query<OrderRow>(
      this.db,
      `WITH o AS (
         INSERT INTO orders (id, customer_name, customer_email, delivery_address, destination_city, postal_code,
           destination_country, parcel_weight_kg, total_cents, currency, payment_status, courier_provider, status,
           tracking_number, shipping_started_at, shipping_provider_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *
       ), i AS (
         INSERT INTO order_items (order_id, position, sku, name, quantity, unit_price_cents)
         SELECT $1, t.ord - 1, t.sku, t.name, t.quantity, t.unit_price_cents
         FROM unnest($19::text[], $20::text[], $21::int[], $22::int[]) WITH ORDINALITY AS t(sku, name, quantity, unit_price_cents, ord)
       )
       SELECT o.*, (
         SELECT json_agg(json_build_object('sku', t.sku, 'name', t.name, 'quantity', t.quantity, 'unitPriceCents', t.unit_price_cents) ORDER BY t.ord)
         FROM unnest($19::text[], $20::text[], $21::int[], $22::int[]) WITH ORDINALITY AS t(sku, name, quantity, unit_price_cents, ord)
       ) AS items
       FROM o`,
      [
        order.id,
        order.customerName,
        order.customerEmail,
        order.deliveryAddress,
        order.destinationCity,
        order.postalCode,
        order.destinationCountry,
        order.parcelWeightKg,
        order.totalCents,
        order.currency,
        order.paymentStatus,
        order.courierProvider,
        order.status,
        order.trackingNumber,
        order.shippingStartedAt,
        order.shippingProviderId,
        order.createdAt,
        order.updatedAt,
        order.items.map((item) => item.sku),
        order.items.map((item) => item.name),
        order.items.map((item) => item.quantity),
        order.items.map((item) => item.unitPriceCents),
      ],
    );
    return toOrder({ ...rows[0]!, items: rows[0]!.items ?? [] });
  }

  async findAll(filter: OrderFilter = {}): Promise<Order[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.status) {
      values.push(filter.status);
      conditions.push(`o.status = $${values.length}`);
    }
    if (filter.search) {
      values.push(`%${escapeLike(filter.search)}%`);
      const p = `$${values.length}`;
      conditions.push(`(('${ORDER_NUMBER_PREFIX}' || o.order_seq) ILIKE ${p} OR o.customer_name ILIKE ${p} OR o.destination_city ILIKE ${p})`);
    }
    values.push(filter.limit ?? null); // LIMIT NULL = no limit
    const { rows } = await query<OrderRow>(
      this.db,
      `SELECT o.*, ${ITEMS} FROM orders o
       ${conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''}
       ORDER BY o.created_at DESC, o.order_seq DESC
       LIMIT $${values.length}`,
      values,
    );
    return rows.map(toOrder);
  }

  async findById(id: string): Promise<Order | null> {
    if (!UUID.test(id)) return null;
    const { rows } = await query<OrderRow>(this.db, `SELECT o.*, ${ITEMS} FROM orders o WHERE o.id = $1`, [id]);
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async findByTrackingNumber(trackingNumber: string): Promise<Order | null> {
    const { rows } = await query<OrderRow>(this.db, `SELECT o.*, ${ITEMS} FROM orders o WHERE o.tracking_number = $1`, [trackingNumber]);
    return rows[0] ? toOrder(rows[0]) : null;
  }

  async findShippingStartedBefore(before: string): Promise<Order[]> {
    const { rows } = await query<OrderRow>(
      this.db,
      `SELECT o.*, ${ITEMS} FROM orders o WHERE o.shipping_started_at IS NOT NULL AND o.shipping_started_at < $1 ORDER BY o.shipping_started_at`,
      [before],
    );
    return rows.map(toOrder);
  }

  // UPDATE ... WHERE id = $1 AND <every expected value still holds> RETURNING. The check and the write are one
  // statement: PostgreSQL locks the row while updating, and a second request waiting for that lock re-checks
  // the WHERE against the new values, finds no match and updates nothing.
  async update(id: string, expected: OrderExpectation, changes: OrderChanges): Promise<Order | null> {
    if (!UUID.test(id)) return null;
    const values: unknown[] = [id];
    const set = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => {
        values.push(value);
        return `${COLUMNS[field as keyof typeof COLUMNS]} = $${values.length}`;
      });
    const where = Object.entries(expected)
      .filter(([, value]) => value !== undefined)
      .map(([field, value]) => {
        const column = COLUMNS[field as keyof typeof COLUMNS];
        if (value === null) return `${column} IS NULL`;
        values.push(value);
        return `${column} = $${values.length}`;
      });
    const { rows } = await query<OrderRow>(
      this.db,
      `WITH o AS (
         UPDATE orders SET ${set.join(', ')} WHERE ${['id = $1', ...where].join(' AND ')} RETURNING *
       )
       SELECT o.*, ${ITEMS} FROM o`,
      values,
    );
    return rows[0] ? toOrder(rows[0]) : null;
  }
}
