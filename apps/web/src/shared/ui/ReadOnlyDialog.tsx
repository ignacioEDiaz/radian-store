import { useEffect, useRef, useState } from 'react';
import { READ_ONLY_EVENT } from '../api/readOnly';
import styles from './ReadOnlyDialog.module.css';

/** Diálogo global que explica por qué una cuenta de solo lectura no puede modificar datos. */
export function ReadOnlyDialog() {
  const [message, setMessage] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onReadOnly = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener(READ_ONLY_EVENT, onReadOnly);
    return () => window.removeEventListener(READ_ONLY_EVENT, onReadOnly);
  }, []);

  useEffect(() => {
    if (!message) return;
    button.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMessage(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [message]);

  if (!message) return null;
  return (
    <div className={styles.overlay}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="read-only-title" aria-describedby="read-only-text" className={styles.dialog}>
        <h2 id="read-only-title">Cuenta de solo lectura</h2>
        <p id="read-only-text">{message}</p>
        <p className={styles.muted}>Ningún cambio fue aplicado.</p>
        <button ref={button} type="button" className="btn" onClick={() => setMessage(null)}>
          Entendido
        </button>
      </div>
    </div>
  );
}
