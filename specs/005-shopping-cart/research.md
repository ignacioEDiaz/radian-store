# Research: Carrito

## Persistencia del carrito de visitante

- **Decision**: carrito en el backend + cookie firmada (`@fastify/cookie` con `COOKIE_SECRET`)
  que contiene el id.
- **Rationale**: requisito de persistir en el backend; firmar evita adivinar ids ajenos.
- **Alternatives**: localStorage (no cumple el requisito, precios manipulables), Redis
  (la constitución exige que Redis sea prescindible).

## Validación de stock contra otro contexto

- **Decision**: puerto `CatalogAvailability` con adaptador SQL de solo lectura sobre write-db
  (tablas de catalog/inventory).
- **Rationale**: validar una invariante del comando requiere el dato fuerte (constitución III);
  el adaptador actúa como capa anticorrupción y evita importar el dominio de catalog.
- **Alternatives**: leer read-db (eventualmente consistente para una validación), llamar al
  dominio de catalog (acoplamiento entre contextos).

## Concurrencia

- **Decision**: versión optimista + reintento acotado en el servidor.
- **Rationale**: los conflictos son raros (mismo usuario, dos pestañas) y reaplicar la operación
  es seguro.
