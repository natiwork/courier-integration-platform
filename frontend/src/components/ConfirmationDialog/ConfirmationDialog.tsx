import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import styles from './ConfirmationDialog.module.css';

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  children: ReactNode; // what will happen, in plain words
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  // While the action runs: the confirm button shows a spinner and the dialog can't be dismissed.
  busy?: boolean;
}

// A modal built on the native <dialog>. showModal() gives the accessibility basics for free:
// the rest of the page becomes inert (focus can't leave the dialog), Escape fires "cancel",
// and screen readers announce it as a modal dialog with the linked title and description.
export function ConfirmationDialog({ open, title, children, confirmLabel, onConfirm, onCancel, busy = false }: ConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      // The action can't be undone, so focus starts on the safe choice.
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function cancel() {
    if (busy) return;
    onCancel();
    // Back to the button that opened the dialog, if it is still on the page.
    const target = returnFocusTo.current;
    if (target?.isConnected) requestAnimationFrame(() => target.focus());
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Escape: the browser would close the dialog on its own; let React state decide instead.
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div id={descriptionId} className={styles.body}>
        {children}
      </div>
      <div className={styles.actions}>
        <Button ref={cancelRef} variant="secondary" onClick={cancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
