import { DomainError } from '../../../shared/domain/errors.js';

export interface AddressProps {
  recipient: string;
  line1: string;
  line2?: string | undefined;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
}

export type AddressData = Omit<AddressProps, 'line2'> & { line2?: string };

const LIMITS: Record<Exclude<keyof AddressProps, 'line2'>, [number, number]> = {
  recipient: [2, 80],
  line1: [3, 120],
  city: [2, 80],
  region: [2, 80],
  postalCode: [2, 12],
  country: [2, 2],
  phone: [6, 20],
};

/** Dirección postal (value object inmutable). */
export class Address {
  private constructor(private readonly props: AddressData) {}

  static create(input: AddressProps): Address {
    const clean = {} as Record<string, string>;
    for (const [field, [min, max]] of Object.entries(LIMITS)) {
      const value = String(input[field as keyof AddressProps] ?? '').trim();
      if (value.length < min || value.length > max) {
        throw new DomainError('INVALID_ADDRESS', `Dirección inválida: ${field}`, { field });
      }
      clean[field] = value;
    }
    if (!/^\+?[\d\s-]{6,20}$/.test(clean['phone']!)) {
      throw new DomainError('INVALID_ADDRESS', 'Dirección inválida: phone', { field: 'phone' });
    }
    const line2 = input.line2?.trim();
    return new Address({
      ...(clean as Omit<AddressData, 'line2'>),
      country: clean['country']!.toUpperCase(),
      ...(line2 ? { line2: line2.slice(0, 120) } : {}),
    });
  }

  toJSON(): AddressData {
    return { ...this.props };
  }

  equals(other: Address | null): boolean {
    return other !== null && JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
