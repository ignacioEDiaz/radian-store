import { ConflictError } from '../../../shared/domain/errors.js';
import type { SqlExecutor } from '../../../shared/infrastructure/db/pool.js';
import { isUniqueViolation } from '../../../shared/infrastructure/db/pg-errors.js';
import { appendToOutbox } from '../../../shared/infrastructure/outbox/outbox-writer.js';
import { toImageView } from '../../catalog/infrastructure/read-model/pg-catalog-read-model.js';
import { Cart, type CartLine, type CartRepository } from '../domain/cart.js';
import type { CartOwner, CartReadModel, CatalogLookup, VariantLookup } from '../application/ports.js';

interface CartRow {
  id: string;
  customer_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  lines: CartLine[];
}

const SELECT = `SELECT c.*, COALESCE((SELECT json_agg(json_build_object('id', l.id, 'variantId', l.variant_id, 'productId', l.product_id,
  'quantity', l.quantity, 'unitPriceCents', l.unit_price_cents) ORDER BY l.position) FROM cart_lines l WHERE l.cart_id = c.id), '[]') AS lines FROM carts c`;

const toDomain = (r: CartRow) =>
  Cart.rehydrate({ id: r.id, customerId: r.customer_id, lines: r.lines, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at });

export class PgCartRepository implements CartRepository {
  constructor(private readonly db: SqlExecutor) {}

  async findById(id: string) {
    const { rows } = await this.db.query<CartRow>(`${SELECT} WHERE c.id = $1`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByCustomer(customerId: string) {
    const { rows } = await this.db.query<CartRow>(`${SELECT} WHERE c.customer_id = $1`, [customerId]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(cart: Cart): Promise<void> {
    if (!cart.hasChanges) return;
    const s = cart.toSnapshot();
    try {
      if (cart.persistedVersion === 0) {
        await this.db.query('INSERT INTO carts (id, customer_id, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)', [s.id, s.customerId, s.version, s.createdAt, s.updatedAt]);
      } else {
        const { rowCount } = await this.db.query('UPDATE carts SET version = $2, updated_at = $3 WHERE id = $1 AND version = $4', [s.id, s.version, s.updatedAt, cart.persistedVersion]);
        if (rowCount === 0) throw new ConflictError('VERSION_CONFLICT', 'El carrito cambió en otra pestaña');
      }
    } catch (err) {
      // Dos pedidos simultáneos crean el carrito del mismo cliente: el segundo reintenta y lo encuentra.
      if (isUniqueViolation(err, 'carts_customer_id_key')) throw new ConflictError('VERSION_CONFLICT', 'El carrito ya existía');
      throw err;
    }
    await this.db.query('DELETE FROM cart_lines WHERE cart_id = $1', [s.id]);
    if (s.lines.length) {
      const values: unknown[] = [];
      const rows = s.lines.map((l, i) => {
        values.push(l.id, s.id, l.variantId, l.productId, l.quantity, l.unitPriceCents, i);
        const o = i * 7;
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`;
      });
      await this.db.query(`INSERT INTO cart_lines (id, cart_id, variant_id, product_id, quantity, unit_price_cents, position) VALUES ${rows.join(', ')}`, values);
    }
    await appendToOutbox(this.db, cart.pullEvents());
  }

  async delete(cart: Cart): Promise<void> {
    await this.db.query('DELETE FROM carts WHERE id = $1', [cart.id]);
    await appendToOutbox(this.db, cart.pullEvents());
  }

  async staleGuestCarts(before: Date, limit: number): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>('SELECT id FROM carts WHERE customer_id IS NULL AND updated_at < $1 ORDER BY updated_at LIMIT $2', [before, limit]);
    return rows.map((r) => r.id);
  }
}

interface LookupRow {
  variant_id: string;
  product_id: string;
  slug: string;
  title: string;
  color: string;
  size: string;
  price_cents: number;
  published: boolean;
  available: number;
  image: { mediaId: string; width: number; height: number; widths: number[]; alt: string } | null;
}

function toLookup(rows: LookupRow[]): Map<string, VariantLookup> {
  return new Map(
    rows.map((r) => [
      r.variant_id,
      {
        variantId: r.variant_id,
        productId: r.product_id,
        productSlug: r.slug,
        title: r.title,
        color: r.color,
        size: r.size,
        priceCents: r.price_cents,
        published: r.published,
        available: Math.max(0, r.available),
        image: r.image ? toImageView(r.image, r.title, 320) : null,
      },
    ]),
  );
}

/** ACL sobre la base de ESCRITURA de catalog/inventory: dato fuerte para validar comandos. */
export class PgWriteCatalogLookup implements CatalogLookup {
  constructor(private readonly db: SqlExecutor) {}

  async lookup(variantIds: string[]) {
    if (variantIds.length === 0) return new Map<string, VariantLookup>();
    const { rows } = await this.db.query<LookupRow>(
      `SELECT v.id AS variant_id, v.product_id, p.slug, p.title, v.color, v.size, COALESCE(v.price_cents, p.price_cents) AS price_cents,
              p.status = 'published' AS published, COALESCE(i.on_hand - i.reserved, 0) AS available,
              (SELECT json_build_object('mediaId', im.media_id, 'width', im.width, 'height', im.height, 'widths', im.widths, 'alt', im.alt)
                 FROM product_images im WHERE im.product_id = p.id ORDER BY (im.color = v.color) DESC NULLS LAST, im.position LIMIT 1) AS image
         FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory_items i ON i.variant_id = v.id
        WHERE v.id = ANY($1::uuid[])`,
      [variantIds],
    );
    return toLookup(rows);
  }
}

/** Lecturas del carrito sobre la base de LECTURA (snapshot + catálogo proyectado). */
export class PgCartReadModel implements CartReadModel {
  readonly catalog: CatalogLookup;

  constructor(private readonly readDb: SqlExecutor) {
    this.catalog = {
      lookup: async (variantIds) => {
        if (variantIds.length === 0) return new Map();
        const { rows } = await this.readDb.query<LookupRow>(
          `SELECT v.variant_id, v.product_id, p.slug, p.title, v.color, v.size, v.price_cents, p.status = 'published' AS published, v.available_qty AS available,
                  (SELECT img FROM jsonb_array_elements(p.doc->'images') img ORDER BY (img->>'color' = v.color) DESC NULLS LAST, (img->>'position')::int LIMIT 1) AS image
             FROM catalog_variants v JOIN catalog_products p ON p.id = v.product_id
            WHERE v.variant_id = ANY($1::uuid[])`,
          [variantIds],
        );
        return toLookup(rows);
      },
    };
  }

  async find(owner: CartOwner) {
    const { rows } =
      'customerId' in owner
        ? await this.readDb.query<{ cart_id: string; lines: CartLine[] }>('SELECT cart_id, lines FROM cart_snapshots WHERE customer_id = $1', [owner.customerId])
        : owner.guestCartId
          ? await this.readDb.query<{ cart_id: string; lines: CartLine[] }>('SELECT cart_id, lines FROM cart_snapshots WHERE cart_id = $1 AND customer_id IS NULL', [owner.guestCartId])
          : { rows: [] };
    const r = rows[0];
    return r ? { id: r.cart_id, lines: r.lines } : null;
  }
}
