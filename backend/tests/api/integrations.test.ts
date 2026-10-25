import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createRandom } from '../../src/lib/random.js';
import { ProviderRegistry } from '../../src/providers/providerRegistry.js';
import { SwiftParcelProvider } from '../../src/providers/swiftParcel.js';
import { InMemoryOrderEventRepository } from '../../src/repositories/inMemoryOrderEventRepository.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { generateDemoEvents, generateDemoOrders } from '../../src/seed/demoOrders.js';
import { FakeProvider } from '../fixtures/fakeProvider.js';
import { validOrderBody } from '../fixtures/orders.js';

const paidOrder = { ...validOrderBody, paymentStatus: 'PAID' };

const ship = { providerId: 'fake', service: 'standard' };

describe('GET /api/integrations/activity', () => {
  it('lists real courier calls newest first, with outcome, code and order number, and sums them per courier', async () => {
    const fake = new FakeProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(fake);
    providerRegistry.register(new SwiftParcelProvider({ random: createRandom(1), simulateLatency: false }));
    let tick = Date.parse('2026-10-24T09:00:00.000Z');
    const app = createApp({ providerRegistry, now: () => new Date((tick += 1000)) });
    const newOrder = async () => (await request(app).post('/api/orders').send(paidOrder).expect(201)).body.data;

    const first = await newOrder();
    await request(app).post(`/api/orders/${first.id}/ship`).send(ship).expect(200);
    fake.next = { kind: 'permanent', code: 'INVALID_ADDRESS', message: 'No such street' };
    const second = await newOrder();
    await request(app).post(`/api/orders/${second.id}/ship`).send(ship).expect(422);
    fake.next = { kind: 'transient', code: 'PROVIDER_UNAVAILABLE', message: 'Try later' };
    await request(app).post(`/api/orders/${second.id}/ship`).send(ship).expect(502);

    const res = await request(app).get('/api/integrations/activity').expect(200);

    expect(res.body.data.operations.map((op: { outcome: string; orderNumber: string; code: string | null }) => [op.outcome, op.orderNumber, op.code])).toEqual([
      ['unavailable', second.orderNumber, 'PROVIDER_UNAVAILABLE'],
      ['rejected', second.orderNumber, 'INVALID_ADDRESS'],
      ['succeeded', first.orderNumber, null],
    ]);
    expect(res.body.data.operations[1]).toMatchObject({
      providerId: 'fake',
      providerName: 'Fake Courier',
      message: 'Fake Courier rejected the shipment: No such street',
      orderId: second.id,
    });
    expect(res.body.data.summary).toEqual([
      { providerId: 'fake', providerName: 'Fake Courier', succeeded: 1, rejected: 1, unavailable: 1, lastOperationAt: res.body.data.operations[0].createdAt },
      { providerId: 'swiftparcel', providerName: 'SwiftParcel', succeeded: 0, rejected: 0, unavailable: 0, lastOperationAt: null },
    ]);
  });

  it('does not count refusals made before calling the courier', async () => {
    const app = createApp();
    const id = (await request(app).post('/api/orders').send({ ...paidOrder, destinationCountry: 'IT' }).expect(201)).body.data.id;
    await request(app).post(`/api/orders/${id}/ship`).send({ providerId: 'nordcargo', service: 'standard' }).expect(422);

    const res = await request(app).get('/api/integrations/activity').expect(200);
    expect(res.body.data.operations).toEqual([]);
  });

  it('never shows the generated demo history as courier calls', async () => {
    const now = new Date('2026-10-24T12:00:00.000Z');
    const orderRepository = new InMemoryOrderRepository();
    const orderEventRepository = new InMemoryOrderEventRepository();
    const orders = generateDemoOrders(now);
    for (const order of orders) await orderRepository.create(order);
    for (const event of generateDemoEvents(orders)) await orderEventRepository.append(event);

    const res = await request(createApp({ orderRepository, orderEventRepository })).get('/api/integrations/activity').expect(200);

    expect(res.body.data.operations).toEqual([]);
    expect(res.body.data.summary.every((s: { succeeded: number }) => s.succeeded === 0)).toBe(true);
  });
});
