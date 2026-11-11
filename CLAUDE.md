# Radian Store — guía para agentes

Tienda de moda (portafolio) construida con Spec-Driven Development (Spec Kit).
Constitución: `.specify/memory/constitution.md`. Specs: `specs/NNN-*/`.

## Stack

- Monorepo npm workspaces: `apps/api` (Fastify 5 + TypeScript 6), `apps/web` (React 19 + Vite +
  TanStack Query 5 + React Router), `packages/contracts` (Zod 4).
- PostgreSQL 17 ×2 (write-db / read-db), Redis 8 (caché), Prometheus + Grafana (`infra/`).
- Tests: Vitest 5 + Testcontainers (API), Testing Library + MSW (web), Playwright (e2e).

## Reglas que no se negocian

- TDD: test que falla → implementación → refactor.
- Capas por bounded context: `domain` (sin dependencias técnicas) ← `application`
  (commands/queries) ← `infrastructure`. `npm run arch` lo verifica.
- CQRS: commands solo en write-db (+ outbox); queries solo en read-db (+ caché).
- Acceso a bases solo vía pools de `shared/infrastructure/db/pool.ts`.
- Web: `fetch` solo dentro de `shared/api/httpClient.ts`; componentes → hooks React Query →
  services.
- **El diseño es el del tema original y no se cambia.** `apps/web/theme/home.original.html` y
  `apps/web/public/{cdn,_hosts}` se conservan tal cual. La portada es ese documento; las páginas
  internas se montan en su `<main>` y usan su markup y estilos (`src/theme-ui`). Los estilos
  propios viven dentro de `.app-root` (`src/styles/app.css`).
- El tema habla con el backend a través de `src/theme-bridge` (responde sus pedidos de carrito y
  búsqueda con los services). No se edita el JavaScript del tema.

## Comandos

```bash
npm run dev:infra && npm run db:migrate && npm run dev
npm test && npm run test:integration && npm run lint && npm run typecheck && npm run arch
```
