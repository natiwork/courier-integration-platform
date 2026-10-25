import type { RequestHandler } from 'express';
import type { CourierService } from '../services/courierService.js';

export function createCourierController(courierService: CourierService) {
  const list: RequestHandler = async (_req, res) => {
    const couriers = await courierService.listCouriers();
    res.status(200).json({ data: couriers });
  };

  return { list };
}
