import { z } from 'zod';
import type { ProviderRegistry } from '../providers/providerRegistry.js';

// POST /api/orders/:id/ship. Built from the registry, so the allowed couriers and services
// are always the registered ones: an unknown courier or service is a 400 with a field path.
export function createShipOrderSchema(registry: ProviderRegistry) {
  return z
    .strictObject(
      {
        providerId: z
          .string({ error: (issue) => (issue.input === undefined ? 'Courier is required' : 'Courier must be a string') })
          .trim()
          .refine((id) => registry.has(id), 'Unknown courier provider'),
        service: z
          .string({ error: (issue) => (issue.input === undefined ? 'Service is required' : 'Service must be a string') })
          .trim()
          .min(1, 'Service is required'),
      },
      { error: (issue) => (issue.code === 'invalid_type' ? 'Request body must be a JSON object' : undefined) },
    )
    .superRefine(({ providerId, service }, ctx) => {
      if (!registry.has(providerId)) return; // already reported on providerId
      const provider = registry.get(providerId);
      const services = provider.capabilities.services.map((s) => s.id);
      if (!services.includes(service)) {
        ctx.addIssue({
          code: 'custom',
          path: ['service'],
          message: `${provider.name} has no "${service}" service. Choose one of: ${services.join(', ')}`,
        });
      }
    });
}

export type ShipOrderInput = z.infer<ReturnType<typeof createShipOrderSchema>>;
