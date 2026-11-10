import { Link } from 'react-router';

/** Portada provisoria hasta la feature 004 (catálogo). */
export function PlaceholderHome() {
  return (
    <section className="container" style={{ paddingBlock: 'var(--space-16)' }}>
      <h1>
        La tienda está en construcción. <span className="serif">Pronto.</span>
      </h1>
      <p>
        Mientras tanto podés ver el <Link to="/estado">estado del sistema</Link>.
      </p>
    </section>
  );
}
