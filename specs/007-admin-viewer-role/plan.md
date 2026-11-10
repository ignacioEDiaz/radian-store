# Implementation Plan: Rol de solo lectura para el panel

**Branch**: `007-admin-viewer-role` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Nuevo rol `viewer`. Un único guard del área de administración (`requireAdminArea`) decide por
método HTTP: `GET/HEAD` → admin o viewer; cualquier otro método → solo admin; viewer recibe 403
`READ_ONLY_ACCOUNT` con mensaje explicativo. Se reemplaza `requireRole('admin')` en todas las rutas
de administración (catálogo, inventario, media, pedidos). Los pedidos se enmascaran para viewer en
la capa HTTP. La web trata viewer como "staff" para navegar, muestra un banner y un diálogo global
cuando una mutación vuelve con `READ_ONLY_ACCOUNT` (MutationCache de React Query).

## Constitution Check

| Principio | Cumplimiento |
|-----------|--------------|
| I. TDD | tests de dominio (rol), guard, contrato que recorre TODAS las rutas admin de modificación, enmascarado; tests web de banner y diálogo |
| II. DDD | el rol es parte del agregado `Customer` (`changeRole`); el guard vive en identity/infrastructure y se inyecta |
| III. CQRS | sin cambios; el rol se proyecta como antes |
| V. Observabilidad | el rechazo queda en métricas HTTP (403 por ruta) |
| Seguridad | la restricción se aplica en el servidor; la UI solo explica |

**Result**: PASS.

## Diseño

- Migración write `0008_viewer_role.sql`: amplía el CHECK de `customers.role`.
- `Customer.changeRole(role)` reemplaza a `promoteToAdmin`; `EnsureStaffAccount` (ex EnsureAdmin)
  crea o ajusta la cuenta con el rol pedido. Config `VIEWER_EMAIL` / `VIEWER_PASSWORD`.
- `AuthGuards.requireAdminArea` (método-aware).
- `maskOrder()` en ordering/infrastructure para respuestas a viewer.
- Web: `useSession` expone `isStaff`/`isReadOnly`; `RequireAdmin` admite staff; `ReadOnlyBanner`;
  `ReadOnlyDialog` escucha un evento emitido por el `MutationCache` global; el login muestra la
  cuenta demo si `VITE_DEMO_VIEWER` está definida.
