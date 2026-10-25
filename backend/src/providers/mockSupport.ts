import type { OrderStatus } from '../domain/orderStatus.js';
import {
  permanentError,
  success,
  type CreatedShipment,
  type ProviderHealth,
  type ProviderResult,
  type ShipmentStatusReport,
} from './courierProvider.js';

// Shared plumbing for the fictional mock providers. Real integrations would call an HTTP API instead.

export interface MockProviderOptions {
  random: () => number; // seeded in tests, so every "random" outcome is repeatable
  now?: () => Date;
  simulateLatency?: boolean; // false in tests: no waiting
}

export type LatencyRange = readonly [minMs: number, maxMs: number];

// setTimeout doesn't block: the event loop keeps serving other requests while this promise waits.
// An aborted signal cancels the wait (and rejects), like a real HTTP call cancelled by its caller.
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal!.reason);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function latencyBetween(random: () => number, [min, max]: LatencyRange): number {
  return Math.round(min + random() * (max - min));
}

// A step in a mock shipment's life: the provider reports `code` once `afterHours` have passed since creation.
export interface TimelineStep<Code extends string> {
  afterHours: number;
  code: Code;
}

const HOUR_MS = 60 * 60 * 1000;

interface StoredShipment {
  createdAt: number; // epoch ms
}

// Remembers created shipments and derives their external status from the time since creation,
// so a test with a fixed clock always gets the same answer.
export class MockShipmentStore<Code extends string> {
  private readonly shipments = new Map<string, StoredShipment>();

  constructor(
    private readonly timeline: readonly TimelineStep<Code>[],
    private readonly normalize: (code: string) => OrderStatus | null,
    private readonly now: () => Date,
  ) {}

  // Tracking number = prefix + 6 random digits + a running number, so it is unique without a retry loop.
  add(prefix: string, random: () => number): ProviderResult<CreatedShipment> {
    const randomPart = String(Math.floor(random() * 1e6)).padStart(6, '0');
    const trackingNumber = `${prefix}${randomPart}${String(this.shipments.size + 1).padStart(4, '0')}`;
    this.shipments.set(trackingNumber, { createdAt: this.now().getTime() });
    const first = this.timeline[0]!;
    return success({ trackingNumber, status: this.normalize(first.code)!, externalStatus: first.code });
  }

  status(providerName: string, trackingNumber: string): ProviderResult<ShipmentStatusReport> {
    const shipment = this.shipments.get(trackingNumber);
    if (!shipment) {
      return permanentError('SHIPMENT_NOT_FOUND', `${providerName} has no shipment ${trackingNumber}`);
    }
    const ageHours = (this.now().getTime() - shipment.createdAt) / HOUR_MS;
    const reached = this.timeline.filter((step) => step.afterHours <= ageHours);
    const step = reached[reached.length - 1] ?? this.timeline[0]!;
    const status = this.normalize(step.code);
    if (!status) {
      return permanentError('UNMAPPED_STATUS', `${providerName} reported an unknown status "${step.code}"`);
    }
    return success({
      trackingNumber,
      status,
      externalStatus: step.code,
      updatedAt: new Date(shipment.createdAt + step.afterHours * HOUR_MS).toISOString(),
    });
  }
}

// Times a simulated ping. Honest about what it is: nothing outside this process is contacted.
export async function simulatedHealthCheck(
  options: MockProviderOptions,
  latency: LatencyRange,
  failureRate: number,
): Promise<ProviderHealth> {
  const now = options.now ?? (() => new Date());
  const started = performance.now();
  const waitMs = latencyBetween(options.random, latency);
  if (options.simulateLatency !== false) await sleep(waitMs);
  const responded = options.random() >= failureRate;
  return {
    status: responded ? 'up' : 'down',
    latencyMs: Math.round(performance.now() - started),
    checkedAt: now().toISOString(),
    simulated: true,
  };
}
