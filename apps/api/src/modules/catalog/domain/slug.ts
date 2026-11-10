import { DomainError } from '../../../shared/domain/errors.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Identificador legible y único para URLs (p. ej. `sharp-leather-boot`). */
export class Slug {
  private constructor(readonly value: string) {}

  static create(raw: string): Slug {
    if (raw.length < 2 || raw.length > 80 || !SLUG.test(raw)) throw new DomainError('INVALID_SLUG', `Slug inválido: ${raw}`);
    return new Slug(raw);
  }

  static fromTitle(title: string): Slug {
    const value = title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72)
      .replace(/-+$/g, '');
    return Slug.create(value || 'producto');
  }

  withSuffix(n: number): Slug {
    return Slug.create(`${this.value}-${n}`);
  }
}
