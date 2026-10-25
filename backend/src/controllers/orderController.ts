import type { RequestHandler } from 'express';
import type { OrderService } from '../services/orderService.js';
import type { ShipmentService } from '../services/shipmentService.js';
import type { CreateOrderInput, ListOrdersQuery } from '../validation/orderSchemas.js';
import type { ShipOrderInput } from '../validation/shipmentSchemas.js';

// HTTP layer only: read the request, call the service, choose the status code.
// Errors are simply thrown; Express 5 forwards rejected promises to errorHandler.
export function createOrderController(orderService: OrderService, shipmentService: ShipmentService) {
  const list: RequestHandler = async (_req, res) => {
    // Parsed and checked by validateQuery(ListOrdersQuerySchema).
    const orders = await orderService.listOrders(res.locals.query as ListOrdersQuery);
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

  const events: RequestHandler<{ id: string }> = async (req, res) => {
    const history = await orderService.listEvents(req.params.id);
    res.status(200).json({ data: history });
  };

  const ship: RequestHandler<{ id: string }> = async (req, res) => {
    // On 422/502 the error handler answers, but the order has already moved to FAILED: clients reload it.
    const order = await shipmentService.ship(req.params.id, req.body as ShipOrderInput);
    res.status(200).json({ data: order });
  };

  const tracking: RequestHandler<{ id: string }> = async (req, res) => {
    const report = await shipmentService.track(req.params.id);
    res.status(200).json({ data: report });
  };

  return { list, getById, create, events, ship, tracking };
}
