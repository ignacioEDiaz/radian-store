/**
 * Ejecuta un caso de uso dentro de una transacción de la base de escritura.
 * `R` es el conjunto de repositorios del contexto, ligados a esa transacción;
 * al guardar un agregado, sus eventos van al outbox en la misma transacción.
 */
export interface UnitOfWork<R> {
  run<T>(work: (repos: R) => Promise<T>): Promise<T>;
}
