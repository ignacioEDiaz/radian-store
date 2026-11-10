import type { ComponentStatus, HealthReport } from '@radian/contracts';
import { useHealth } from './useHealth';
import { ErrorState } from '../../shared/ui/ErrorState';
import styles from './StatusPage.module.css';

const GLOBAL_LABEL: Record<HealthReport['status'], string> = { ok: 'Operativo', degraded: 'Degradado', down: 'Caído' };
const COMPONENT_LABEL: Record<ComponentStatus['status'], string> = { up: 'Operativo', degraded: 'Degradado', down: 'Caído' };
const NAMES: Record<keyof HealthReport['checks'], string> = {
  writeDb: 'Base de escritura',
  readDb: 'Base de lectura',
  cache: 'Caché',
  projector: 'Sincronizador (proyector)',
};

export function StatusPage() {
  const { data, isPending, isError, error, refetch } = useHealth();

  return (
    <section className={styles.page} aria-labelledby="status-title">
      <h1 id="status-title">Estado del sistema</h1>
      {isPending && <p aria-busy="true">Consultando…</p>}
      {isError && !data && (
        <ErrorState message={`No se pudo consultar el estado: ${error.message}`} onRetry={() => void refetch()} />
      )}
      {data && (
        <>
          <p className={styles.summary}>
            Estado general:{' '}
            <strong data-status={data.status} className={styles[data.status]}>
              {GLOBAL_LABEL[data.status]}
            </strong>{' '}
            · versión {data.version} · activo hace {Math.round(data.uptimeSeconds)} s
          </p>
          <table className={styles.table}>
            <caption>Componentes</caption>
            <thead>
              <tr>
                <th scope="col">Componente</th>
                <th scope="col">Estado</th>
                <th scope="col">Latencia</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(NAMES) as (keyof HealthReport['checks'])[]).map((key) => {
                const check = data.checks[key];
                return (
                  <tr key={key}>
                    <th scope="row">{NAMES[key]}</th>
                    <td className={styles[check.status]}>{COMPONENT_LABEL[check.status]}</td>
                    <td>{check.latencyMs} ms</td>
                    <td>
                      {check.detail}
                      {key === 'projector' &&
                        ` atraso ${data.checks.projector.lagSeconds} s · ${data.checks.projector.pending} pendientes`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className={styles.table}>
            <caption>Pools de conexiones</caption>
            <thead>
              <tr>
                <th scope="col">Pool</th>
                <th scope="col">En uso / máximo</th>
                <th scope="col">Libres</th>
                <th scope="col">En espera</th>
              </tr>
            </thead>
            <tbody>
              {(['write', 'read'] as const).map((name) => {
                const p = data.pools[name];
                return (
                  <tr key={name}>
                    <th scope="row">Pool {name}</th>
                    <td>
                      {p.inUse} / {p.max}
                    </td>
                    <td>{p.idle}</td>
                    <td>{p.waiting}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
