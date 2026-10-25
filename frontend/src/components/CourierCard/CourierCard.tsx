import { useId } from 'react';
import { CircleCheck, CircleX, Truck } from 'lucide-react';
import type { Courier } from '../../api/couriers';
import { courierCoverage } from '../../lib/coverage';
import { formatNumber, formatTime } from '../../lib/format';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './CourierCard.module.css';

interface CourierCardProps {
  courier: Courier;
  // From /api/meta/order-form: what the platform itself allows, to compare the courier against.
  platformCountries: string[];
  platformMaxWeightKg: number;
}

// One courier provider: whether it answered the (simulated) health check and what it accepts.
export function CourierCard({ courier, platformCountries, platformMaxWeightKg }: CourierCardProps) {
  const headingId = useId();
  const { capabilities, health } = courier;
  const coverage = courierCoverage(capabilities.supportedCountries, platformCountries);
  const up = health.status === 'up';
  const HealthIcon = up ? CircleCheck : CircleX;

  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <header className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          <Truck size={20} />
        </span>
        <h2 id={headingId} className={styles.name}>
          {courier.name}
        </h2>
        {courier.mock && (
          <span className={styles.mock} title="A fictional courier used by this demo, not a real company">
            Mock provider
          </span>
        )}
      </header>

      <section className={styles.health} aria-label="Health check">
        <p className={`${styles.healthStatus} ${up ? styles.up : styles.down}`}>
          <HealthIcon size={18} aria-hidden="true" />
          {up ? 'Responding' : 'Not responding'}
        </p>
        <p className={styles.healthMeta}>
          {up ? (
            <>
              <span className="tabular">{formatNumber(health.latencyMs)} ms</span> response
            </>
          ) : (
            <>
              No answer after <span className="tabular">{formatNumber(health.latencyMs)} ms</span>
            </>
          )}
          , checked at{' '}
          <time dateTime={health.checkedAt} className="tabular">
            {formatTime(health.checkedAt)}
          </time>
        </p>
        <p className={styles.note}>{health.note}</p>
      </section>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt className={styles.label}>Max parcel weight</dt>
          <dd>
            <span className={`${styles.weight} tabular`}>{formatNumber(capabilities.maxParcelWeightKg)} kg</span>
            <span className={styles.hint}>
              {capabilities.maxParcelWeightKg < platformMaxWeightKg
                ? `Stricter than the platform limit of ${formatNumber(platformMaxWeightKg)} kg`
                : 'Same as the platform limit'}
            </span>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.label}>Services</dt>
          <dd>
            <ul className={styles.services}>
              {capabilities.services.map((service) => (
                <li key={service.id} className={styles.service}>
                  {service.name}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className={styles.fact}>
          <dt className={styles.label}>Address check</dt>
          <dd className={styles.plain}>
            {capabilities.addressValidation ? 'Validates addresses before accepting a parcel' : 'Not offered'}
          </dd>
        </div>
      </dl>

      <section className={styles.coverage} aria-labelledby={`${headingId}-coverage`}>
        <div className={styles.coverageHeader}>
          <h3 id={`${headingId}-coverage`} className={styles.label}>
            Delivery coverage
          </h3>
          <p className={`${styles.coverageCount} tabular`}>
            {coverage.covered === coverage.total
              ? `All ${coverage.total} countries`
              : `${coverage.covered} of ${coverage.total} countries`}
          </p>
        </div>
        {/* One picture for screen readers: the label names the covered countries instead of reading 31 codes */}
        <div className={styles.grid} role="img" aria-label={coverage.label}>
          {coverage.cells.map((cell) => (
            <span
              key={cell.code}
              className={cell.covered ? styles.covered : styles.uncovered}
              title={`${cell.name}${cell.covered ? '' : ': not served'}`}
            >
              {cell.code}
            </span>
          ))}
        </div>
        <p className={styles.legend} aria-hidden="true">
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.covered}`} />
            Delivers
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.uncovered}`} />
            Not served
          </span>
        </p>
      </section>
    </article>
  );
}

// Placeholder in the shape of a courier card.
export function CourierCardSkeleton() {
  return (
    <div className={styles.card}>
      <Skeleton
        label="Loading courier"
        lines={[
          { height: '2rem', width: '55%' },
          { height: '5.5rem' },
          { height: '3.5rem', width: '40%' },
          { height: '2rem', width: '70%' },
          { height: '7rem' },
        ]}
      />
    </div>
  );
}
