import { useId } from 'react';
import { countryName, formatDate } from '../../lib/format';
import { routeProgress } from '../../lib/shipmentStages';
import type { Order } from '../../types/order';
import styles from './RouteSchematic.module.css';

// A fixed, made-up path: this is a diagram of the stages, not a map. We have no coordinates.
const POINTS: [number, number][] = [
  [48, 226],
  [48, 160],
  [170, 160],
  [170, 96],
  [300, 96],
  [300, 44],
  [352, 44],
];

const segmentLengths = POINTS.slice(1).map(([x, y], i) => Math.hypot(x - POINTS[i]![0], y - POINTS[i]![1]));
const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);

// The point at `fraction` (0..1) of the way along the path.
function pointAt(fraction: number): [number, number] {
  let remaining = fraction * totalLength;
  for (let i = 0; i < segmentLengths.length; i++) {
    const length = segmentLengths[i]!;
    if (remaining <= length) {
      const [x1, y1] = POINTS[i]!;
      const [x2, y2] = POINTS[i + 1]!;
      const t = length === 0 ? 0 : remaining / length;
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    remaining -= length;
  }
  return POINTS[POINTS.length - 1]!;
}

const HANDOVER = 0.42; // where the courier stop sits on the drawing

// Where the marker sits: the share of the route covered, or the handover point for a failed parcel.
function markerFraction(order: Order): number {
  const progress = routeProgress(order.status);
  if (progress !== null) return order.status === 'PENDING' ? 0 : progress === 1 ? 1 : Math.max(0, (progress - 0.2) / 0.8);
  if (order.status === 'FAILED') return order.courierProvider ? HANDOVER + 0.2 : HANDOVER / 2;
  return 0; // cancelled: never left
}

export function RouteSchematic({ order }: { order: Order }) {
  const patternId = useId();
  const fraction = markerFraction(order);
  const [mx, my] = pointAt(fraction);
  const [hx, hy] = pointAt(HANDOVER);
  const [sx, sy] = POINTS[0]!;
  const [ex, ey] = POINTS[POINTS.length - 1]!;
  const path = `M ${POINTS.map(([x, y]) => `${x} ${y}`).join(' L ')}`;
  const failed = order.status === 'FAILED';
  const cancelled = order.status === 'CANCELLED';

  return (
    <div className={styles.route}>
      <div className={styles.canvas}>
        <svg viewBox="0 0 400 270" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <defs>
            <pattern id={patternId} width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
              <path d="M 0 0 L 36 0 M 0 0 L 0 36" className={styles.streets} />
            </pattern>
          </defs>
          <rect width="400" height="270" fill={`url(#${patternId})`} />
          <path d={path} className={styles.pathPlanned} />
          {!cancelled && (
            <path
              d={path}
              pathLength={100}
              className={failed ? styles.pathFailed : styles.pathDone}
              strokeDasharray={`${fraction * 100} 100`}
            />
          )}
          <circle cx={sx} cy={sy} r="7" className={styles.stop} />
          <circle cx={hx} cy={hy} r="7" className={styles.stop} />
          <circle cx={ex} cy={ey} r="9" className={styles.destination} />
          {!cancelled && (
            <g className={failed ? styles.markerFailed : styles.marker}>
              <circle cx={mx} cy={my} r="16" className={styles.halo} />
              <circle cx={mx} cy={my} r="8" />
            </g>
          )}
        </svg>
        <p className={styles.badge}>Schematic</p>
      </div>

      <ol className={styles.legend}>
        <li>
          <span className={styles.legendTitle}>Order placed</span>
          <span className={styles.legendValue}>{formatDate(order.createdAt)}</span>
        </li>
        <li>
          <span className={styles.legendTitle}>Courier</span>
          <span className={styles.legendValue}>{order.courierProvider ?? 'Not assigned yet'}</span>
        </li>
        <li>
          <span className={styles.legendTitle}>Destination</span>
          <span className={styles.legendValue}>
            {order.postalCode} {order.destinationCity}, {countryName(order.destinationCountry)}
          </span>
        </li>
      </ol>

      <p className={styles.disclaimer}>
        A diagram of the delivery stages, not a map: there is no live location or real route.
      </p>
    </div>
  );
}
