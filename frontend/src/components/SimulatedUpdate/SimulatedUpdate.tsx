import { useId, useState } from 'react';
import { RadioTower } from 'lucide-react';
import { getSimulatorOptions, sendSimulatedUpdate } from '../../api/devSimulator';
import { useApi } from '../../hooks/useApi';
import { STATUS_LABELS } from '../../lib/labels';
import type { Order } from '../../types/order';
import { Button } from '../Button/Button';
import styles from './SimulatedUpdate.module.css';

const RESULT_TEXT: Record<string, string> = {
  accepted: 'Accepted: the order status changed.',
  unchanged: 'Accepted, but nothing changed: it means the same status for us.',
  duplicate: 'Ignored as a duplicate: this event was already handled.',
  ignored: 'Received but ignored: the order is recorded with a warning.',
};

// Plays the courier for a shipped order: sends one signed webhook through the real endpoint logic.
// Only shown when the server has the simulator on (dev/demo); the secret stays on the server.
export function SimulatedUpdate({ order, onSent }: { order: Order; onSent: () => void }) {
  const id = useId();
  const simulator = useApi((signal) => getSimulatorOptions(order.id, signal), `${order.id}:${order.status}`);
  const [chosen, setChosen] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Turned off on this server, or not loaded (an error here shouldn't distract from the real order data).
  if (!simulator.data) return null;
  const { options, providerName, demo } = simulator.data;
  const selected = options.find((option) => option.externalStatus === chosen) ?? options[0];

  async function send() {
    if (!selected || sending) return;
    setSending(true);
    try {
      const { result, sent } = await sendSimulatedUpdate(order.id, selected.externalStatus);
      setMessage(`${RESULT_TEXT[result.status] ?? result.status} Event ${sent.eventId}.`);
      setChosen(null);
      onSent();
    } catch (error) {
      setMessage(`Not sent: ${error instanceof Error ? error.message : 'something went wrong'}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.simulator} aria-labelledby={`${id}-title`}>
      <div className={styles.header}>
        <RadioTower size={18} aria-hidden="true" />
        <h3 id={`${id}-title`} className={styles.title}>
          Simulate a courier update
        </h3>
        <span className={styles.badge}>Simulation</span>
      </div>
      <p className={styles.explain}>
        Sends a webhook signed like {providerName} would, to this server's real webhook endpoint: the signature check,
        duplicate check and status rules all apply.{demo && ' This is a demo shipment: only our order changes.'}
      </p>

      {options.length === 0 ? (
        <p className={styles.explain}>{providerName} has no further update that this order's status allows.</p>
      ) : (
        <>
          <fieldset className={styles.options}>
            <legend className={styles.legend}>{providerName} reports</legend>
            {options.map((option) => (
              <label key={option.externalStatus} className={[styles.option, option === selected && styles.selected].filter(Boolean).join(' ')}>
                <input
                  type="radio"
                  className={styles.radio}
                  name={`${id}-status`}
                  checked={option === selected}
                  onChange={() => setChosen(option.externalStatus)}
                  disabled={sending}
                />
                <span className={styles.code}>{option.externalStatus}</span>
                <span className={styles.meaning}>{STATUS_LABELS[option.status]}</span>
              </label>
            ))}
          </fieldset>
          <Button variant="secondary" onClick={send} loading={sending}>
            Send signed update
          </Button>
        </>
      )}
      <p className={styles.result} role="status">
        {message}
      </p>
    </section>
  );
}
