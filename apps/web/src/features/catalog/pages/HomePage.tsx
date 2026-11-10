import { Link } from 'react-router';
import { ErrorState } from '../../../shared/ui/ErrorState';
import { useHome } from '../hooks/useCatalog';
import { GridSkeleton, ProductGrid } from '../components/ProductGrid';
import { ResponsiveImage } from '../components/ResponsiveImage';
import styles from '../catalog.module.css';

export function HomePage() {
  const { data, isPending, isError, refetch } = useHome();
  const hero = data?.newArrivals[0]?.image ?? data?.bestSellers[0]?.image;

  return (
    <>
      <section className={styles.hero}>
        {hero && <ResponsiveImage image={hero} sizes="100vw" priority className={styles.heroImage} alt="" />}
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>Otoño / Invierno 26</p>
          <h1>
            Negro como punto de partida. <span className="serif">Bordó como acento.</span>
          </h1>
          <Link to="/tienda" className="btn btn--accent">
            Ver la colección
          </Link>
        </div>
      </section>

      {isError && (
        <div className="container">
          <ErrorState message="No pudimos cargar la portada." onRetry={() => void refetch()} />
        </div>
      )}

      {data && data.featuredCollections.length > 0 && (
        <section className={`container ${styles.homeSection}`} aria-labelledby="collections-title">
          <h2 id="collections-title">Colecciones</h2>
          <ul className={styles.collections}>
            {data.featuredCollections.map((c) => (
              <li key={c.id}>
                <Link to={`/colecciones/${c.slug}`} className={styles.collectionCard}>
                  {c.image && <ResponsiveImage image={c.image} sizes="(min-width: 900px) 25vw, 50vw" alt="" />}
                  <span>
                    {c.title} <small>{c.productCount} productos</small>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`container ${styles.homeSection}`} aria-labelledby="new-title">
        <h2 id="new-title">Novedades</h2>
        {isPending ? <GridSkeleton count={4} /> : data && <ProductGrid products={data.newArrivals.slice(0, 8)} priorityCount={0} />}
      </section>

      <section className={`container ${styles.homeSection}`} aria-labelledby="best-title">
        <h2 id="best-title">Más vendidos</h2>
        {data && <ProductGrid products={data.bestSellers.slice(0, 4)} priorityCount={0} />}
      </section>
    </>
  );
}
