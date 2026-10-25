import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { shipErrorMessage, trackingErrorMessage } from './apiErrorMessages';

const courierDetail = { providerId: 'nordcargo', code: 'INVALID_ADDRESS', message: 'NordCargo requires a house number in the street address' };

describe('shipErrorMessage', () => {
  it.each([
    [new ApiError(422, 'PROVIDER_REJECTED', 'NordCargo rejected the request: …', 'req-1', [courierDetail]), 'The courier rejected the shipment', 'NordCargo requires a house number in the street address. The order is marked as failed.'],
    [new ApiError(502, 'PROVIDER_UNAVAILABLE', 'NordCargo is temporarily unavailable.', 'req-1', [courierDetail]), 'The courier is temporarily unavailable', 'you can safely try again'],
    [new ApiError(422, 'COURIER_CANNOT_TAKE_ORDER', '…', 'req-1', [{ providerId: 'nordcargo', code: 'WEIGHT_LIMIT_EXCEEDED', message: 'NordCargo accepts parcels up to 30 kg' }]), "This courier can't take the order", 'NordCargo accepts parcels up to 30 kg. Choose another courier.'],
    [new ApiError(409, 'ALREADY_SHIPPED', 'Order ORD-1001 was already shipped (tracking number SP1)', 'req-1'), 'This order was already shipped', 'Nothing was sent again.'],
    [new ApiError(409, 'INVALID_STATUS_TRANSITION', 'Cannot change…', 'req-1'), "This order can't be shipped now", 'current status'],
    [new ApiError(409, 'SHIPMENT_IN_PROGRESS', '…', 'req-1'), 'This order is already being shipped', 'waiting for the courier'],
    [new ApiError(404, 'ORDER_NOT_FOUND', '…', 'req-1'), 'This order no longer exists', 'shipments list'],
    [new ApiError(400, 'VALIDATION_ERROR', '…', 'req-1', [{ path: 'service', message: 'NordCargo has no "express" service.' }]), 'Choose a courier and a service', 'NordCargo has no "express" service.'],
    [new ApiError(0, 'NETWORK_ERROR', "The server didn't respond."), 'The server could not be reached', 'The order was not changed.'],
  ])('explains %s', (error, title, text) => {
    const message = shipErrorMessage(error);
    expect(message.title).toBe(title);
    expect(message.text).toContain(text);
  });

  it('adds the request id when there is one', () => {
    expect(shipErrorMessage(new ApiError(502, 'PROVIDER_UNAVAILABLE', 'x', 'abc-123')).text).toMatch(/Request id: abc-123\.$/);
    expect(shipErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'x')).text).not.toContain('Request id');
  });

  it('has a fallback for anything unexpected', () => {
    expect(shipErrorMessage(new Error('boom')).title).toBe('Something went wrong');
  });
});

describe('trackingErrorMessage', () => {
  it('explains that mock couriers forget shipments on restart', () => {
    const error = new ApiError(422, 'PROVIDER_REJECTED', '…', 'r', [{ providerId: 'swiftparcel', code: 'SHIPMENT_NOT_FOUND', message: 'no' }]);
    expect(trackingErrorMessage(error)).toMatchObject({ title: 'The courier has no record of this shipment' });
  });

  it('labels demo shipments', () => {
    expect(trackingErrorMessage(new ApiError(409, 'DEMO_SHIPMENT', '…')).title).toBe('Demo shipment');
  });
});
