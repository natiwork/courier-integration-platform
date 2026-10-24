import type { CountryCode } from '../domain/countries.js';
import { computeTotalCents } from '../domain/money.js';
import { CURRENCY, type OrderItem, type PaymentStatus } from '../domain/order.js';
import type { OrderStatus } from '../domain/orderStatus.js';
import type { NewOrder } from '../repositories/orderRepository.js';

// Demo orders for local development and portfolio screenshots. Everything here is invented:
// people, addresses, products and tracking numbers. Couriers are the fictional mock providers.

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 270; // ~9 months
const SEED = 20260101;

// mulberry32: a tiny deterministic random number generator, so the same seed always gives the same data.
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface City {
  city: string;
  country: CountryCode;
  postalCodes: string[];
  streets: string[];
  numberFirst?: boolean; // "12 Rue Oberkampf" instead of "Torstraße 12"
  firstNames: string[];
  lastNames: string[];
}

const CITIES: City[] = [
  { city: 'Berlin', country: 'DE', postalCodes: ['10115', '10437', '12043'], streets: ['Torstraße', 'Kastanienallee', 'Sonnenallee'], firstNames: ['Lena', 'Jonas', 'Mia'], lastNames: ['Vogt', 'Schneider', 'Krüger'] },
  { city: 'Munich', country: 'DE', postalCodes: ['80331', '80799', '81667'], streets: ['Sendlinger Straße', 'Türkenstraße'], firstNames: ['Felix', 'Hannah'], lastNames: ['Huber', 'Wagner'] },
  { city: 'Hamburg', country: 'DE', postalCodes: ['20095', '22767'], streets: ['Große Bergstraße', 'Lange Reihe'], firstNames: ['Paul', 'Emma'], lastNames: ['Becker', 'Hoffmann'] },
  { city: 'Paris', country: 'FR', postalCodes: ['75003', '75011', '75018'], streets: ['Rue Oberkampf', 'Rue de Bretagne', 'Rue des Martyrs'], numberFirst: true, firstNames: ['Camille', 'Hugo', 'Léa'], lastNames: ['Martin', 'Dubois', 'Lefèvre'] },
  { city: 'Lyon', country: 'FR', postalCodes: ['69001', '69007'], streets: ['Rue de la République', 'Rue Mercière'], numberFirst: true, firstNames: ['Louis', 'Chloé'], lastNames: ['Bernard', 'Moreau'] },
  { city: 'Madrid', country: 'ES', postalCodes: ['28004', '28012', '28014'], streets: ['Calle de Fuencarral', 'Calle de Atocha'], firstNames: ['Lucía', 'Pablo', 'Sofía'], lastNames: ['García', 'Fernández', 'López'] },
  { city: 'Barcelona', country: 'ES', postalCodes: ['08001', '08012'], streets: ['Carrer de Verdi', 'Carrer del Carme'], firstNames: ['Marc', 'Laia'], lastNames: ['Puig', 'Serra'] },
  { city: 'Milan', country: 'IT', postalCodes: ['20121', '20144'], streets: ['Via Tortona', 'Corso Garibaldi'], firstNames: ['Giulia', 'Luca'], lastNames: ['Rossi', 'Bianchi'] },
  { city: 'Rome', country: 'IT', postalCodes: ['00153', '00185'], streets: ['Via del Corso', 'Via Merulana'], firstNames: ['Matteo', 'Chiara'], lastNames: ['Romano', 'Ricci'] },
  { city: 'Amsterdam', country: 'NL', postalCodes: ['1015 CJ', '1072 AB', '1094 KL'], streets: ['Haarlemmerdijk', 'Ferdinand Bolstraat'], firstNames: ['Daan', 'Sanne', 'Lotte'], lastNames: ['de Vries', 'Jansen', 'Bakker'] },
  { city: 'Rotterdam', country: 'NL', postalCodes: ['3011 AB', '3014 GE'], streets: ['Witte de Withstraat', 'Nieuwe Binnenweg'], firstNames: ['Sem', 'Fleur'], lastNames: ['Visser', 'Smit'] },
  { city: 'Vienna', country: 'AT', postalCodes: ['1060', '1070'], streets: ['Mariahilfer Straße', 'Neubaugasse'], firstNames: ['Lukas', 'Anna'], lastNames: ['Gruber', 'Bauer'] },
  { city: 'Brussels', country: 'BE', postalCodes: ['1000', '1050'], streets: ['Rue Antoine Dansaert', 'Rue du Bailli'], numberFirst: true, firstNames: ['Noah', 'Elise'], lastNames: ['Peeters', 'Janssens'] },
  { city: 'Warsaw', country: 'PL', postalCodes: ['00-001', '00-695', '02-516'], streets: ['ul. Marszałkowska', 'ul. Puławska'], firstNames: ['Zofia', 'Jakub'], lastNames: ['Kowalska', 'Nowak'] },
  { city: 'Prague', country: 'CZ', postalCodes: ['110 00', '120 00'], streets: ['Vinohradská', 'Dlouhá'], firstNames: ['Tereza', 'Tomáš'], lastNames: ['Nováková', 'Svoboda'] },
  { city: 'Lisbon', country: 'PT', postalCodes: ['1100-148', '1200-195'], streets: ['Rua Augusta', 'Rua da Rosa'], firstNames: ['Inês', 'Tiago'], lastNames: ['Silva', 'Santos'] },
  { city: 'Dublin', country: 'IE', postalCodes: ['D02 X285', 'D08 VF8H'], streets: ['Camden Street', 'Thomas Street'], numberFirst: true, firstNames: ['Aoife', 'Seán'], lastNames: ['Murphy', 'Byrne'] },
  { city: 'Copenhagen', country: 'DK', postalCodes: ['1050', '2200'], streets: ['Jægersborggade', 'Istedgade'], firstNames: ['Freja', 'Oskar'], lastNames: ['Jensen', 'Nielsen'] },
  { city: 'Stockholm', country: 'SE', postalCodes: ['111 20', '118 46'], streets: ['Götgatan', 'Hornsgatan'], firstNames: ['Elin', 'Emil'], lastNames: ['Andersson', 'Lindqvist'] },
  { city: 'Helsinki', country: 'FI', postalCodes: ['00100', '00530'], streets: ['Fredrikinkatu', 'Kalliolanrinne'], firstNames: ['Aino', 'Eero'], lastNames: ['Virtanen', 'Korhonen'] },
];

interface Product {
  sku: string;
  name: string;
  unitPriceCents: number;
  weightKg: number;
  popularity: number; // relative weight when picking products
}

const PRODUCTS: Product[] = [
  { sku: 'KIT-POUR-01', name: 'Pour-over coffee set', unitPriceCents: 3490, weightKg: 1.1, popularity: 9 },
  { sku: 'FLT-100', name: 'Paper filters, 100 pcs', unitPriceCents: 499, weightKg: 0.2, popularity: 10 },
  { sku: 'MUG-STONE-02', name: 'Stoneware mug', unitPriceCents: 1890, weightKg: 0.4, popularity: 8 },
  { sku: 'BAG-CANVAS-03', name: 'Canvas tote bag', unitPriceCents: 2450, weightKg: 0.3, popularity: 6 },
  { sku: 'LAMP-DESK-04', name: 'Desk lamp, matte green', unitPriceCents: 6900, weightKg: 1.8, popularity: 3 },
  { sku: 'BTL-STEEL-05', name: 'Insulated steel bottle', unitPriceCents: 2990, weightKg: 0.5, popularity: 7 },
  { sku: 'NB-A5-06', name: 'A5 dot-grid notebook', unitPriceCents: 1290, weightKg: 0.3, popularity: 8 },
  { sku: 'PEN-SET-07', name: 'Fineliner pen set', unitPriceCents: 1590, weightKg: 0.1, popularity: 5 },
  { sku: 'CANDLE-FIG-08', name: 'Soy candle, fig', unitPriceCents: 2190, weightKg: 0.6, popularity: 5 },
  { sku: 'TOWEL-LIN-09', name: 'Linen tea towel', unitPriceCents: 1450, weightKg: 0.2, popularity: 4 },
  { sku: 'POT-CER-10', name: 'Ceramic plant pot', unitPriceCents: 2790, weightKg: 1.4, popularity: 4 },
  { sku: 'THROW-WOOL-11', name: 'Wool throw blanket', unitPriceCents: 8900, weightKg: 1.6, popularity: 2 },
  { sku: 'BOARD-OAK-12', name: 'Oak serving board', unitPriceCents: 3990, weightKg: 1.2, popularity: 3 },
  { sku: 'SOCK-MER-13', name: 'Merino socks, 2 pairs', unitPriceCents: 2490, weightKg: 0.2, popularity: 6 },
  { sku: 'TEA-SET-14', name: 'Loose-leaf tea sampler', unitPriceCents: 1990, weightKg: 0.4, popularity: 5 },
];

const COURIERS = [
  { name: 'SwiftParcel', code: 'SP' },
  { name: 'NordCargo', code: 'NC' },
];

// Statuses that mean the parcel was handed to a courier.
const HANDED_OVER: ReadonlySet<OrderStatus> = new Set(['SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED']);

type Weighted<T> = [T, number][];

function pickWeighted<T>(random: () => number, options: Weighted<T>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1]![0];
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

// A UUID-shaped id from the seeded generator, so ids are stable between runs too.
function demoId(random: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16)).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function asciiEmail(first: string, last: string, index: number): string {
  const clean = (value: string) =>
    value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z]+/g, '');
  return `${clean(first)}.${clean(last)}${index % 7 === 0 ? index : ''}@example.com`;
}

// Older orders have mostly finished their journey; recent ones are still moving.
function statusForAge(random: () => number, ageDays: number): OrderStatus {
  if (ageDays < 1) return pickWeighted(random, [['PENDING', 50], ['PROCESSING', 35], ['SHIPPED', 15]]);
  if (ageDays < 3) return pickWeighted(random, [['PENDING', 5], ['PROCESSING', 20], ['SHIPPED', 35], ['IN_TRANSIT', 33], ['FAILED', 7]]);
  if (ageDays < 7) return pickWeighted(random, [['SHIPPED', 8], ['IN_TRANSIT', 35], ['DELIVERED', 46], ['FAILED', 7], ['CANCELLED', 4]]);
  if (ageDays < 30) return pickWeighted(random, [['IN_TRANSIT', 4], ['DELIVERED', 80], ['FAILED', 5], ['RETURNED', 6], ['CANCELLED', 5]]);
  // Old failures would have been retried or cancelled by now.
  return pickWeighted(random, [['DELIVERED', 87], ['RETURNED', 7], ['CANCELLED', 6]]);
}

function paymentFor(random: () => number, status: OrderStatus): PaymentStatus {
  switch (status) {
    case 'RETURNED':
      return 'REFUNDED';
    case 'CANCELLED':
      return pickWeighted(random, [['UNPAID', 60], ['REFUNDED', 40]]);
    case 'PENDING':
      return pickWeighted(random, [['PAID', 60], ['UNPAID', 40]]);
    case 'PROCESSING':
    case 'FAILED':
      return pickWeighted(random, [['PAID', 82], ['UNPAID', 18]]);
    default:
      return pickWeighted(random, [['PAID', 97], ['UNPAID', 3]]); // e.g. invoice not paid yet
  }
}

// How long after creation the current status was reached (days).
function daysUntilStatus(random: () => number, status: OrderStatus): number {
  switch (status) {
    case 'PENDING':
      return 0;
    case 'PROCESSING':
      return between(random, 0.05, 0.6);
    case 'SHIPPED':
      return between(random, 0.5, 1.5);
    case 'IN_TRANSIT':
      return between(random, 1, 2.5);
    case 'DELIVERED':
      return between(random, 2, 5);
    case 'FAILED':
      return between(random, 1, 4);
    case 'CANCELLED':
      return between(random, 0.1, 2);
    case 'RETURNED':
      return between(random, 8, 25);
  }
}

function buildItems(random: () => number): OrderItem[] {
  const count = pickWeighted(random, [[1, 55], [2, 30], [3, 15]]);
  const chosen = new Map<string, Product>();
  while (chosen.size < count) {
    const product = pickWeighted(random, PRODUCTS.map((p) => [p, p.popularity] as [Product, number]));
    chosen.set(product.sku, product);
  }
  return [...chosen.values()].map((product) => ({
    sku: product.sku,
    name: product.name,
    quantity: pickWeighted(random, [[1, 75], [2, 20], [3, 5]]),
    unitPriceCents: product.unitPriceCents,
  }));
}

function weightOf(items: readonly OrderItem[]): number {
  const kg = items.reduce((sum, item) => {
    const product = PRODUCTS.find((p) => p.sku === item.sku)!;
    return sum + product.weightKg * item.quantity;
  }, 0);
  return Math.round(kg * 10) / 10;
}

// A shop that grows steadily: twice as many orders per day now as 9 months ago.
// Inverse of the CDF of the linear density f(x) ∝ (1 + g) − g·x on [0, 1], where x = age / HISTORY_DAYS.
const GROWTH = 1;
function sampleAgeDays(random: () => number): number {
  const u = random();
  const x = (1 + GROWTH - Math.sqrt((1 + GROWTH) ** 2 - 2 * GROWTH * u * (1 + GROWTH / 2))) / GROWTH;
  return x * HISTORY_DAYS;
}

// The last few days always contain some live work, so the dashboard has something "in motion".
const PIPELINE: { minDays: number; maxDays: number; status: OrderStatus }[] = [
  { minDays: 0.02, maxDays: 0.4, status: 'PENDING' },
  { minDays: 0.02, maxDays: 0.4, status: 'PROCESSING' },
  { minDays: 0.05, maxDays: 0.4, status: 'PENDING' },
  { minDays: 1, maxDays: 2, status: 'SHIPPED' },
  { minDays: 1.5, maxDays: 3, status: 'IN_TRANSIT' },
  { minDays: 2, maxDays: 4, status: 'IN_TRANSIT' },
];

// Generates `count` orders spread over the last ~9 months, oldest first.
// Statuses, payments and timestamps are generated together so every order is internally consistent.
export function generateDemoOrders(now: Date, count = 150): NewOrder[] {
  const random = createRandom(SEED);
  const nowMs = now.getTime();

  const slots: { ageDays: number; status?: OrderStatus }[] = [
    ...PIPELINE.map((slot) => ({ ageDays: between(random, slot.minDays, slot.maxDays), status: slot.status })),
    ...Array.from({ length: count - PIPELINE.length }, () => ({ ageDays: sampleAgeDays(random) })),
  ].sort((a, b) => b.ageDays - a.ageDays);

  return slots.map(({ ageDays, status: fixedStatus }, index) => {
    const createdMs = Math.round(nowMs - ageDays * DAY_MS);
    const place = pick(random, CITIES);
    const firstName = pick(random, place.firstNames);
    const lastName = pick(random, place.lastNames);
    const status = fixedStatus ?? statusForAge(random, ageDays);
    const paymentStatus = paymentFor(random, status);
    const items = buildItems(random);
    const streetNumber = 1 + Math.floor(random() * 140);
    const street = pick(random, place.streets);

    // Never in the future: an order created an hour ago can't have been delivered "in 3 days".
    const reachedMs = createdMs + daysUntilStatus(random, status) * DAY_MS;
    const updatedMs = Math.max(createdMs, Math.min(reachedMs, nowMs - Math.round(between(random, 1, 30) * 60_000)));

    const courier = HANDED_OVER.has(status) || (status === 'FAILED' && random() < 0.5) ? pick(random, COURIERS) : null;

    return {
      id: demoId(random),
      customerName: `${firstName} ${lastName}`,
      customerEmail: asciiEmail(firstName, lastName, index),
      deliveryAddress: place.numberFirst ? `${streetNumber} ${street}` : `${street} ${streetNumber}`,
      destinationCity: place.city,
      postalCode: pick(random, place.postalCodes),
      destinationCountry: place.country,
      parcelWeightKg: Math.max(0.1, weightOf(items)),
      items,
      totalCents: computeTotalCents(items),
      currency: CURRENCY,
      paymentStatus,
      status,
      courierProvider: courier?.name ?? null,
      trackingNumber: courier ? `DEMO-${courier.code}-${String(100000 + index * 7919).slice(-6)}` : null,
      createdAt: new Date(createdMs).toISOString(),
      updatedAt: new Date(updatedMs).toISOString(),
    };
  });
}
