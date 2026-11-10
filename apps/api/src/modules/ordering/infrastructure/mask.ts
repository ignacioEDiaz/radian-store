import type { OrderDetail, OrderSummary } from '@radian/contracts';

/** `ana@example.com` → `a***@example.com` */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

const maskDigits = (value: string, keep: number) => {
  const digits = value.replace(/\D/g, '');
  return `•••• ${digits.slice(-keep)}`;
};

/**
 * Vista de un pedido para la cuenta de solo lectura: conserva productos, totales y estados,
 * pero enmascara los datos personales del cliente (email, nombre, dirección, teléfono).
 */
export function maskOrder(order: OrderDetail): OrderDetail {
  const a = order.shippingAddress;
  const { line2: _line2, ...address } = a;
  return {
    ...order,
    email: maskEmail(order.email),
    shippingAddress: {
      ...address,
      recipient: `${a.recipient.slice(0, 1)}***`,
      line1: '•••',
      postalCode: `${a.postalCode.slice(0, 2)}${'•'.repeat(Math.max(0, a.postalCode.length - 2))}`,
      phone: maskDigits(a.phone, 2),
    },
  };
}

export const maskSummary = (s: OrderSummary): OrderSummary => ({ ...s, email: maskEmail(s.email) });
