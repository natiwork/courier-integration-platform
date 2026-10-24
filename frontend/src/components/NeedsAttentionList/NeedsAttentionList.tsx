import { useState } from 'react';
import { Clock } from 'lucide-react';
import type { AttentionItem } from '../../api/types';
import { formatDateTime, formatMoney, formatRelative } from '../../lib/format';
import { ATTENTION_LABELS } from '../../lib/labels';
import { Button, ButtonLink } from '../Button/Button';
import styles from './NeedsAttentionList.module.css';

const COLLAPSED_COUNT = 4;

interface NeedsAttentionListProps {
  items: AttentionItem[];
  total: number;
}

export function NeedsAttentionList({ items, total }: NeedsAttentionListProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <div className={styles.wrapper}>
      <ul role="list" id="attention-list" className={styles.list}>
        {visible.map((item) => (
          <li key={item.orderId} className={styles.item}>
            <div className={styles.meta}>
              <span className={`${styles.tag} ${styles[item.reason]}`}>{ATTENTION_LABELS[item.reason]}</span>
              <time className={styles.time} dateTime={item.since} title={formatDateTime(item.since)}>
                <Clock aria-hidden="true" size={14} />
                {formatRelative(item.since)}
              </time>
            </div>
            <p className={styles.title}>
              <span className="tabular">{item.orderNumber}</span>
              <span className={`${styles.amount} tabular`}>{formatMoney(item.totalCents)}</span>
            </p>
            <p className={styles.customer}>{item.customerName}</p>
            <ButtonLink to={`/shipments/${item.orderId}`} variant="secondary" size="sm" block>
              Open order<span className="visually-hidden"> {item.orderNumber}</span>
            </ButtonLink>
          </li>
        ))}
      </ul>

      {items.length > COLLAPSED_COUNT && (
        <Button variant="quiet" size="sm" aria-expanded={expanded} aria-controls="attention-list" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      )}
      {total > items.length && (
        <p className={styles.footnote}>
          Showing the {items.length} most recent of {total}.
        </p>
      )}
    </div>
  );
}
