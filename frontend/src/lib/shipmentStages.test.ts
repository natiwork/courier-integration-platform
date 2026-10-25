import { describe, expect, it } from 'vitest';
import type { Order, OrderEvent, OrderStatus } from '../types/order';
import { buildStages } from './shipmentStages';
import { formatDateTime } from './format';

function order(status: OrderStatus, courierProvider: string | null = null): Order {
  return {
    id: 'o-1',
    orderNumber: 'ORD-1',
    customerName: 'Freja Jensen',
    customerEmail: 'freja@example.com',
    deliveryAddress: 'Jægersborggade 12',
    destinationCity: 'Copenhagen',
    postalCode: '2200',
    destinationCountry: 'DK',
    parcelWeightKg: 1,
    items: [],
    totalCents: 0,
    currency: 'EUR',
    paymentStatus: 'PAID',
    courierProvider,
    status,
    trackingNumber: null,
    createdAt: '2026-10-24T08:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z',
  };
}

let n = 0;
function event(toStatus: OrderStatus, createdAt: string, extra: Partial<OrderEvent> = {}): OrderEvent {
  n += 1;
  return {
    id: `e-${n}`,
    orderId: 'o-1',
    type: 'STATUS_CHANGED',
    fromStatus: null,
    toStatus,
    source: 'api',
    message: 'step',
    providerId: null,
    code: null,
    createdAt,
    ...extra,
  };
}

describe('buildStages', () => {
  it('takes every reached stage time from its event', () => {
    const stages = buildStages(order('SHIPPED', 'swiftparcel'), [
      event('PENDING', '2026-10-24T08:00:00.000Z', { type: 'ORDER_CREATED' }),
      event('PROCESSING', '2026-10-24T08:30:00.000Z'),
      event('SHIPPED', '2026-10-24T09:00:00.000Z', { source: 'provider', message: 'SwiftParcel accepted the parcel' }),
    ]);

    expect(stages.map((s) => [s.key, s.state, s.dateTime ?? null])).toEqual([
      ['placed', 'done', '2026-10-24T08:00:00.000Z'],
      ['processing', 'done', '2026-10-24T08:30:00.000Z'],
      ['shipped', 'current', '2026-10-24T09:00:00.000Z'],
      ['transit', 'upcoming', null],
      ['delivered', 'upcoming', null],
    ]);
    expect(stages[1]!.time).toBe(formatDateTime('2026-10-24T08:30:00.000Z'));
    // Only courier answers are shown as details; our own steps speak for themselves.
    expect(stages[2]!.detail).toBe('SwiftParcel accepted the parcel');
    expect(stages[1]!.detail).toBeUndefined();
  });

  it('uses the latest attempt after a retry and shows why a shipment failed', () => {
    const events = [
      event('PENDING', '2026-10-24T08:00:00.000Z', { type: 'ORDER_CREATED' }),
      event('PROCESSING', '2026-10-24T08:10:00.000Z'),
      event('FAILED', '2026-10-24T08:11:00.000Z', { source: 'provider', message: 'NordCargo was unavailable' }),
      event('PROCESSING', '2026-10-24T09:00:00.000Z'),
      event('FAILED', '2026-10-24T09:01:00.000Z', { source: 'provider', message: 'NordCargo rejected the shipment: no house number' }),
    ];

    const stages = buildStages(order('FAILED'), events);

    expect(stages.map((s) => s.key)).toEqual(['placed', 'processing', 'failed']);
    expect(stages[1]!.dateTime).toBe('2026-10-24T09:00:00.000Z');
    expect(stages[2]).toMatchObject({ label: 'Shipping failed', tone: 'danger', detail: 'NordCargo rejected the shipment: no house number' });
  });

  it('never dates a stage with a recorded payment, which keeps the status', () => {
    const stages = buildStages(order('PENDING'), [
      event('PENDING', '2026-10-24T08:00:00.000Z', { type: 'ORDER_CREATED' }),
      event('PENDING', '2026-10-24T11:00:00.000Z', { type: 'PAYMENT_RECORDED' }),
    ]);
    expect(stages[0]!.dateTime).toBe('2026-10-24T08:00:00.000Z');
  });

  it('says so honestly when a step has no recorded event', () => {
    const stages = buildStages(order('PROCESSING'), []);
    expect(stages[0]!.time).toBe('Time not recorded');
    expect(stages[0]!.dateTime).toBeUndefined();
  });

  it('calls a failure after the handover a failed delivery', () => {
    const stages = buildStages(order('FAILED', 'nordcargo'), [event('FAILED', '2026-10-24T10:00:00.000Z')]);
    expect(stages.map((s) => s.key)).toEqual(['placed', 'processing', 'shipped', 'failed']);
    expect(stages.at(-1)!.label).toBe('Delivery failed');
  });
});
