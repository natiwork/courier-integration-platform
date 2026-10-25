import { useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { markOrderPaid, shipOrder } from '../../api/orders';
import { useCouriers } from '../../context/couriersContext';
import { courierProblem } from '../../lib/courierEligibility';
import { countryName, formatMoney, formatNumber } from '../../lib/format';
import type { Order } from '../../types/order';
import { Button } from '../Button/Button';
import { ConfirmationDialog } from '../ConfirmationDialog/ConfirmationDialog';
import { EmptyState } from '../EmptyState/EmptyState';
import { ErrorState } from '../ErrorState/ErrorState';
import { Skeleton } from '../Skeleton/Skeleton';
import styles from './ShipPanel.module.css';

export type ShipResult = { ok: true; order: Order; courierName: string } | { ok: false; error: unknown };

interface ShipPanelProps {
  order: Order;
  // Why the previous attempt failed, from the order history, when this is a retry.
  lastFailure?: string;
  onResult: (result: ShipResult) => void;
  // The payment was recorded: the page reloads the order (it is now shippable) and the dashboard numbers.
  onPaymentRecorded: () => void;
}

// Courier and service choice for an order that hasn't been handed over yet, then a confirmation.
// Couriers that can't take this parcel are shown but disabled, with the reason next to them.
export function ShipPanel({ order, lastFailure, onResult, onPaymentRecorded }: ShipPanelProps) {
  const couriers = useCouriers();
  const id = useId();
  const [chosenCourierId, setChosenCourierId] = useState<string | null>(null);
  const [chosenServiceId, setChosenServiceId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: two clicks in the same tick must not send two requests (state updates too late).
  const submittingRef = useRef(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null);
  const paid = order.paymentStatus === 'PAID';

  if (couriers.status === 'error' && !couriers.data) {
    return (
      <ErrorState
        headingLevel={3}
        title="Couriers couldn't be loaded"
        description={couriers.error?.message ?? 'Something went wrong.'}
        onRetry={couriers.reload}
      />
    );
  }
  if (!couriers.data) {
    return <Skeleton label="Loading couriers" lines={[{ height: '5rem' }, { height: '5rem' }, { height: '2.75rem', width: '40%' }]} />;
  }

  const options = couriers.data.map((courier) => ({ courier, problem: courierProblem(courier, order) }));
  const eligible = options.filter((option) => !option.problem).map((option) => option.courier);
  // The user's choice if it is still possible, otherwise the first courier that can take the parcel.
  const courier = eligible.find((c) => c.id === chosenCourierId) ?? eligible[0];
  const service = courier?.capabilities.services.find((s) => s.id === chosenServiceId) ?? courier?.capabilities.services[0];
  const destination = `${order.destinationCity}, ${countryName(order.destinationCountry)}`;

  async function recordPayment() {
    if (recordingPayment) return;
    setRecordingPayment(true);
    try {
      await markOrderPaid(order.id);
      setPaymentMessage('Payment recorded. The order can be shipped now.');
      onPaymentRecorded();
    } catch (error) {
      setPaymentMessage(`The payment couldn't be recorded: ${error instanceof Error ? error.message : 'something went wrong'}.`);
    } finally {
      setRecordingPayment(false);
      setConfirmingPayment(false);
    }
  }

  async function confirm() {
    if (submittingRef.current || !courier || !service) return;
    submittingRef.current = true;
    setBusy(true);
    let result: ShipResult;
    try {
      result = { ok: true, order: await shipOrder(order.id, { providerId: courier.id, service: service.id }), courierName: courier.name };
    } catch (error) {
      result = { ok: false, error };
    }
    submittingRef.current = false;
    setBusy(false);
    setConfirming(false);
    onResult(result);
  }

  return (
    <div className={styles.panel}>
      {!paid && (
        <div className={styles.payment} id={`${id}-payment`}>
          <p>
            {order.paymentStatus === 'UNPAID' ? (
              <>
                <strong>Payment not received yet.</strong> Unpaid orders can't be shipped. Record the payment of {formatMoney(order.totalCents)} once
                it has arrived.
              </>
            ) : (
              <>
                <strong>This order was refunded.</strong> Refunded orders can't be shipped.
              </>
            )}
          </p>
          {order.paymentStatus === 'UNPAID' && (
            <Button variant="secondary" onClick={() => setConfirmingPayment(true)}>
              Mark as paid
            </Button>
          )}
          <ConfirmationDialog
            open={confirmingPayment}
            title={`Mark ${order.orderNumber} as paid?`}
            confirmLabel="Mark as paid"
            onConfirm={recordPayment}
            onCancel={() => setConfirmingPayment(false)}
            busy={recordingPayment}
          >
            <p>
              Do this once {formatMoney(order.totalCents)} has arrived. The payment is added to the order history and the order can then be shipped.
            </p>
          </ConfirmationDialog>
        </div>
      )}
      <p className={styles.paymentStatus} role="status">
        {paymentMessage}
      </p>

      {lastFailure && (
        <p className={styles.lastFailure}>
          <strong>Last attempt failed.</strong> {lastFailure}
        </p>
      )}

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Courier</legend>
        <div className={styles.couriers}>
          {options.map(({ courier: option, problem }) => {
            const selected = option.id === courier?.id;
            const infoId = `${id}-${option.id}`;
            return (
              <label
                key={option.id}
                className={[styles.courier, selected && styles.selected, problem && styles.unavailable].filter(Boolean).join(' ')}
              >
                <input
                  type="radio"
                  className={styles.radio}
                  name={`${id}-courier`}
                  value={option.id}
                  checked={selected}
                  disabled={Boolean(problem) || busy}
                  onChange={() => {
                    setChosenCourierId(option.id);
                    setChosenServiceId(null);
                  }}
                  // The label also contains the limits; the name should be just the courier, the rest is the description.
                  aria-label={option.name}
                  aria-describedby={infoId}
                />
                <span className={styles.courierName}>
                  {option.name}
                  {selected && <Check size={18} aria-hidden="true" className={styles.check} />}
                </span>
                <span id={infoId} className={styles.courierInfo}>
                  {problem ??
                    `Up to ${formatNumber(option.capabilities.maxParcelWeightKg)} kg, ${option.capabilities.supportedCountries.length} countries`}
                  {!problem && option.health.status === 'down' && (
                    <span className={styles.warning}> Didn't answer its last simulated health check, so it may fail now.</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!courier ? (
        <EmptyState
          size="compact"
          headingLevel={3}
          title="No courier can take this order"
          description="Each courier's reason is shown above. Change the order or add a courier that serves it."
        />
      ) : (
        <>
          <fieldset className={styles.group}>
            <legend className={styles.legend}>Service</legend>
            <div className={styles.services}>
              {courier.capabilities.services.map((option) => (
                <label key={option.id} className={[styles.service, option.id === service?.id && styles.serviceSelected].filter(Boolean).join(' ')}>
                  <input
                    type="radio"
                    className={styles.radio}
                    name={`${id}-service`}
                    value={option.id}
                    checked={option.id === service?.id}
                    disabled={busy}
                    onChange={() => setChosenServiceId(option.id)}
                  />
                  {option.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.footer}>
            <p className={styles.summary}>
              {formatNumber(order.parcelWeightKg)} kg to {destination}
            </p>
            <Button
              onClick={() => setConfirming(true)}
              disabled={busy || !paid}
              aria-describedby={paid ? undefined : `${id}-payment`}
            >
              Ship with {courier.name}
            </Button>
          </div>

          <ConfirmationDialog
            open={confirming}
            title={`Ship ${order.orderNumber} with ${courier.name}?`}
            confirmLabel={`Ship with ${courier.name}`}
            onConfirm={confirm}
            onCancel={() => setConfirming(false)}
            busy={busy}
          >
            <p>
              {courier.name} will be asked to create a shipment with its {service?.name} service for {formatNumber(order.parcelWeightKg)} kg to {destination}. If it
              accepts, the order is marked as shipped and gets a tracking number. A shipped order can't be shipped again.
            </p>
            {courier.mock && <p className={styles.mockNote}>{courier.name} is a mock courier: the request is simulated by the backend.</p>}
          </ConfirmationDialog>
        </>
      )}
    </div>
  );
}
