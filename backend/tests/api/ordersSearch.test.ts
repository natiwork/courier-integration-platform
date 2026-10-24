import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { InMemoryOrderRepository } from '../../src/repositories/inMemoryOrderRepository.js';
import { buildOrder } from '../fixtures/orders.js';

// Orders are written straight to the repository so each one can have its own status.
async function appWithOrders(): Promise<Express> {
  const repository = new InMemoryOrderRepository();
  const orders = [
    buildOrder({ id: 'a', customerName: 'Lena Vogt', destinationCity: 'Berlin', status: 'DELIVERED', createdAt: '2026-03-01T10:00:00.000Z' }),
    buildOrder({ id: 'b', customerName: 'Marco Rossi', destinationCity: 'Milan', status: 'PENDING', createdAt: '2026-03-02T10:00:00.000Z' }),
    buildOrder({ id: 'c', customerName: 'Sophie Martin', destinationCity: 'Berlin', status: 'PENDING', createdAt: '2026-03-03T10:00:00.000Z' }),
    buildOrder({ id: 'd', customerName: 'Jan de Vries', destinationCity: 'Amsterdam', status: 'FAILED', createdAt: '2026-03-04T10:00:00.000Z' }),
  ];
  for (const { orderNumber: _ignored, ...order } of orders) {
    await repository.create(order);
  }
  return createApp({ orderRepository: repository });
}

const names = (body: { data: { customerName: string }[] }) => body.data.map((order) => order.customerName);

describe('GET /api/orders filters', () => {
  let app: Express;

  beforeEach(async () => {
    app = await appWithOrders();
  });

  it('returns every order, newest first, without filters', async () => {
    const res = await request(app).get('/api/orders').expect(200);
    expect(names(res.body)).toEqual(['Jan de Vries', 'Sophie Martin', 'Marco Rossi', 'Lena Vogt']);
  });

  it('searches by customer name, case-insensitively', async () => {
    const res = await request(app).get('/api/orders').query({ search: 'ROSSI' }).expect(200);
    expect(names(res.body)).toEqual(['Marco Rossi']);
  });

  it('searches by city', async () => {
    const res = await request(app).get('/api/orders').query({ search: 'berlin' }).expect(200);
    expect(names(res.body)).toEqual(['Sophie Martin', 'Lena Vogt']);
  });

  it('searches by order number', async () => {
    const all = (await request(app).get('/api/orders')).body.data as { orderNumber: string; customerName: string }[];
    const target = all.find((order) => order.customerName === 'Marco Rossi')!;

    const res = await request(app).get('/api/orders').query({ search: target.orderNumber.toLowerCase() }).expect(200);
    expect(names(res.body)).toEqual(['Marco Rossi']);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/orders').query({ status: 'PENDING' }).expect(200);
    expect(names(res.body)).toEqual(['Sophie Martin', 'Marco Rossi']);
  });

  it('combines search and status', async () => {
    const res = await request(app).get('/api/orders').query({ search: 'berlin', status: 'DELIVERED' }).expect(200);
    expect(names(res.body)).toEqual(['Lena Vogt']);
  });

  it('limits the number of results, keeping the newest', async () => {
    const res = await request(app).get('/api/orders').query({ limit: '2' }).expect(200);
    expect(names(res.body)).toEqual(['Jan de Vries', 'Sophie Martin']);
  });

  it('treats empty parameters as "no filter"', async () => {
    const res = await request(app).get('/api/orders?search=&status=&limit=').expect(200);
    expect(res.body.data).toHaveLength(4);
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await request(app).get('/api/orders').query({ search: 'nobody' }).expect(200);
    expect(res.body).toEqual({ data: [] });
  });

  it.each([
    ['an unknown status', 'status=LOST', 'status'],
    ['a non-numeric limit', 'limit=ten', 'limit'],
    ['a limit above 100', 'limit=101', 'limit'],
    ['a repeated search parameter', 'search=a&search=b', 'search'],
    ['a search longer than 100 characters', `search=${'a'.repeat(101)}`, 'search'],
  ])('returns 400 for %s', async (_name, query, path) => {
    const res = await request(app).get(`/api/orders?${query}`).expect(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Query parameters are invalid' });
    expect(res.body.error.details[0].path).toBe(path);
  });
});
