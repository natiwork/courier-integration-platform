import type { RequestHandler } from 'express';
import type { OrderService } from '../services/orderService.js';
import type { CreateOrderInput } from '../validation/orderSchemas.js';

// HTTP layer only: read the request, call the service, choose the status code.
// Errors are simply thrown; Express 5 forwards rejected promises to errorHandler.
export function createOrderController(orderService: OrderService) {
  const list: RequestHandler = async (_req, res) => {
    const orders = await orderService.listOrders();
    res.status(200).json({ data: orders });
  };

  const getById: RequestHandler<{ id: string }> = async (req, res) => {
    const order = await orderService.getOrderById(req.params.id);
    res.status(200).json({ data: order });
  };

  const create: RequestHandler = async (req, res) => {
    // req.body has already been checked and normalized by validateBody(CreateOrderSchema).
    const order = await orderService.createOrder(req.body as CreateOrderInput);
    res.status(201).location(`/api/orders/${order.id}`).json({ data: order });
  };

  return { list, getById, create };
}
