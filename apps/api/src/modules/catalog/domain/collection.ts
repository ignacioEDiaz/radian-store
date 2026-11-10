import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { ConflictError, DomainError } from '../../../shared/domain/errors.js';
import type { CollectionEvent, CollectionImage, CollectionSnapshot } from './events.js';
import type { Slug } from './slug.js';

type State = Omit<CollectionSnapshot, 'id' | 'version'>;

function title(raw: string): string {
  const t = raw.trim();
  if (t.length < 2 || t.length > 80) throw new DomainError('INVALID_COLLECTION', 'El título debe tener entre 2 y 80 caracteres');
  return t;
}

/** Agrupación editorial de productos con orden manual. */
export class Collection extends AggregateRoot<CollectionEvent> {
  readonly aggregateType = 'Collection';

  private constructor(id: string, version: number, private s: State) {
    super(id, version);
  }

  static create(input: { id: string; slug: Slug; title: string; description: string; image: CollectionImage | null; now: Date }): Collection {
    const c = new Collection(input.id, 0, {
      slug: input.slug.value,
      title: title(input.title),
      description: input.description.trim().slice(0, 1000),
      image: input.image,
      productIds: [],
      createdAt: input.now,
      updatedAt: input.now,
    });
    c.emit('catalog.CollectionCreated', input.now);
    return c;
  }

  static rehydrate(snapshot: CollectionSnapshot): Collection {
    const { id, version, ...state } = snapshot;
    return new Collection(id, version, structuredClone(state));
  }

  get productIds(): readonly string[] {
    return this.s.productIds;
  }

  assertVersion(expected: number): void {
    if (expected !== this.version) throw new ConflictError('VERSION_CONFLICT', 'La colección fue modificada por otra persona', { currentVersion: this.version });
  }

  update(changes: { title?: string; description?: string; image?: CollectionImage | null }, now: Date): void {
    this.s = {
      ...this.s,
      ...(changes.title !== undefined ? { title: title(changes.title) } : {}),
      ...(changes.description !== undefined ? { description: changes.description.trim().slice(0, 1000) } : {}),
      ...(changes.image !== undefined ? { image: changes.image } : {}),
      updatedAt: now,
    };
    this.emit('catalog.CollectionUpdated', now);
  }

  setProducts(productIds: string[], now: Date): void {
    this.s = { ...this.s, productIds: [...new Set(productIds)], updatedAt: now };
    this.emit('catalog.CollectionProductsSet', now);
  }

  removeProduct(productId: string, now: Date): void {
    if (!this.s.productIds.includes(productId)) return;
    this.setProducts(this.s.productIds.filter((p) => p !== productId), now);
  }

  toSnapshot(): CollectionSnapshot {
    return { id: this.id, version: this.version, ...structuredClone(this.s) };
  }

  private emit(type: CollectionEvent['type'], now: Date): void {
    this.record(type, { snapshot: { ...this.toSnapshot(), version: this.version + 1 } }, now);
  }
}
