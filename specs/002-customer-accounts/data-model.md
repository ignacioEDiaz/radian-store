# Data Model: Cuentas

## Dominio

- **Customer** (agregado): `id: uuid`, `email: Email`, `name: PersonName` (2–80), `passwordHash`,
  `role: 'customer' | 'admin'`, `status: 'active' | 'disabled'`, `defaultAddress: Address | null`,
  `version`, `createdAt`, `updatedAt`.
- **Address** (VO): `recipient` (2–80), `line1` (3–120), `line2?` (≤120), `city` (2–80),
  `region` (2–80), `postalCode` (2–12), `country` (ISO-3166 alpha-2), `phone` (6–20, dígitos,
  espacios, `+`, `-`).
- **Eventos**: `identity.CustomerRegistered {email, name, role}`,
  `identity.CustomerProfileUpdated {name, defaultAddress}`, `identity.CustomerDeactivated {}`.

## write-db

### `customers`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | uuid | PK |
| email | text | UNIQUE (ya normalizado) |
| name | text | NOT NULL |
| password_hash | text | NOT NULL |
| role | text | CHECK in ('customer','admin') |
| status | text | CHECK in ('active','disabled') |
| default_address | jsonb | NULL |
| version | int | NOT NULL |
| created_at, updated_at | timestamptz | |

Guardado con concurrencia optimista: `UPDATE ... WHERE id=$1 AND version=$2` (0 filas →
`ConflictError`).

## read-db

### `customer_profiles`

| Columna | Tipo |
|---------|------|
| id | uuid PK |
| email | text |
| name | text |
| role | text |
| status | text |
| default_address | jsonb |
| created_at, updated_at | timestamptz |

Proyección: `CustomerRegistered` → INSERT; `CustomerProfileUpdated` → UPDATE;
`CustomerDeactivated` → UPDATE status. Invalida tag `customer:<id>`.
