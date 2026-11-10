import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/httpClient';
import { queryKeys } from '../../../shared/api/queryKeys';
import { PUBLISH_REASON } from '../labels';
import styles from '../admin.module.css';

/** Muestra el error de un comando; en conflicto de versión ofrece recargar el producto. */
export function CommandError({ error, productId }: { error: unknown; productId?: string }) {
  const queryClient = useQueryClient();
  if (!error) return null;
  const api = error instanceof ApiError ? error : null;
  const reasons = (api?.problem?.meta?.['reasons'] as string[] | undefined) ?? [];
  return (
    <div role="alert" className={styles.alert}>
      <div>
        <strong>{api?.message ?? 'No se pudo completar la operación'}</strong>
        {reasons.length > 0 && (
          <ul>
            {reasons.map((r) => (
              <li key={r}>{PUBLISH_REASON[r] ?? r}</li>
            ))}
          </ul>
        )}
        {api?.status === 400 && api.problem?.errors && (
          <ul>
            {api.problem.errors.map((e) => (
              <li key={e.path}>
                {e.path}: {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      {api?.code === 'VERSION_CONFLICT' && productId && (
        <button type="button" className="btn btn--ghost" onClick={() => void queryClient.invalidateQueries({ queryKey: queryKeys.admin.product(productId) })}>
          Recargar
        </button>
      )}
    </div>
  );
}
