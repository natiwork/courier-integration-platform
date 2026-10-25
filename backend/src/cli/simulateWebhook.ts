import { parseArgs } from 'node:util';
import { createProviderRegistry } from '../providers/index.js';
import { buildSimulatedWebhook } from '../webhooks/simulator.js';

// Sends one signed courier webhook to the local server, the way the courier would.
//   npm run simulate:webhook -- --provider swiftparcel --tracking SP1234567890 --status in_transit
// Options to see the protections work:
//   --event-id evt_1   reuse an id: the second request is answered "duplicate"
//   --age 600          sign as if sent 10 minutes ago: 401 STALE_WEBHOOK
//   --bad-signature    break the signature: 401 INVALID_SIGNATURE
// The secret comes from backend/.env (WEBHOOK_SECRET_<PROVIDER>), the same one the server uses.

const USAGE = 'Usage: npm run simulate:webhook -- --provider <swiftparcel|nordcargo> --tracking <number> --status <courier status>';

const { values } = parseArgs({
  options: {
    provider: { type: 'string' },
    tracking: { type: 'string' },
    status: { type: 'string' },
    'event-id': { type: 'string' },
    age: { type: 'string' },
    'bad-signature': { type: 'boolean', default: false },
    url: { type: 'string', default: `http://localhost:${process.env.PORT ?? 3000}` },
  },
});

function fail(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(2);
}

if (!values.provider || !values.tracking || !values.status) fail('Missing --provider, --tracking or --status.');

const registry = createProviderRegistry({ seed: 1, simulateLatency: false });
if (!registry.has(values.provider)) fail(`Unknown provider "${values.provider}". Known: ${registry.list().map((p) => p.id).join(', ')}.`);
const provider = registry.get(values.provider);
const spec = provider.webhook;
if (!spec.statusCodes.includes(values.status)) {
  console.warn(`Note: "${values.status}" is not a ${provider.name} status (${spec.statusCodes.join(', ')}). Sending it anyway.`);
}

const secretName = `WEBHOOK_SECRET_${provider.id.toUpperCase()}`;
const secret = process.env[secretName];
if (!secret) fail(`${secretName} is not set. Add it to backend/.env (openssl rand -hex 32).`);

const webhook = buildSimulatedWebhook({
  spec,
  secret,
  trackingNumber: values.tracking,
  externalStatus: values.status,
  eventId: values['event-id'],
  ageSeconds: values.age ? Number(values.age) : 0,
  tamper: values['bad-signature'],
});

const url = `${values.url}/api/webhooks/${provider.id}`;
console.log(`SIMULATED ${provider.name} webhook → POST ${url}`);
for (const [name, value] of Object.entries(webhook.headers)) console.log(`  ${name}: ${value}`);
console.log(`  ${webhook.rawBody.toString()}`);

try {
  // The exact signed bytes, not a re-serialized string.
  const response = await fetch(url, { method: 'POST', headers: webhook.headers, body: new Uint8Array(webhook.rawBody) });
  const text = await response.text();
  console.log(`← ${response.status} ${response.statusText}`);
  console.log(`  ${text}`);
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  fail(`Could not reach ${url}: ${(error as Error).message}. Is the backend running (npm run dev)?`);
}
