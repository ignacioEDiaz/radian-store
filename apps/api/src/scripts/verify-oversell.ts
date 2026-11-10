/**
 * Verificación de SC-002 contra la API levantada: deja 1 unidad de una variante y lanza
 * 50 checkouts simultáneos (50 visitantes distintos). Debe venderse exactamente 1.
 * Uso: npm run verify:oversell -w @radian/api   (API en http://localhost:3000)
 */
const API = process.env['API_URL'] ?? 'http://localhost:3000';
const ORIGIN = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173';
const BUYERS = Number(process.env['BUYERS'] ?? 50);

const json = { 'content-type': 'application/json', origin: ORIGIN };
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email: process.env['ADMIN_EMAIL'] ?? 'admin@radian.store', password: process.env['ADMIN_PASSWORD'] ?? 'admin-password-123' }),
  });
  if (!login.ok) throw new Error(`Login admin falló: ${login.status}`);
  const admin = { ...json, cookie: cookieOf(login, 'rs_session') };

  const list = (await (await fetch(`${API}/api/catalog/products?available=true`)).json()) as { items: { slug: string }[] };
  const slug = list.items.at(-1)!.slug;
  const product = (await (await fetch(`${API}/api/catalog/products/${slug}`)).json()) as { id: string; title: string; variants: { id: string; available: boolean }[] };
  const variantId = product.variants.find((v) => v.available)!.id;
  const adminProduct = (await (await fetch(`${API}/api/admin/products/${product.id}`, { headers: admin })).json()) as { variants: { id: string; onHand: number; reserved: number }[] };
  const v = adminProduct.variants.find((x) => x.id === variantId)!;
  const delta = 1 + v.reserved - v.onHand;
  if (delta !== 0) {
    const adj = await fetch(`${API}/api/admin/inventory/${variantId}/adjustments`, { method: 'POST', headers: admin, body: JSON.stringify({ delta, reason: 'correction' }) });
    if (!adj.ok) throw new Error(`No se pudo ajustar el stock: ${await adj.text()}`);
  }
  console.log(`Variante de "${product.title}" con 1 unidad disponible. ${BUYERS} compradores en paralelo…`);

  // Cada comprador arma su carrito (el carrito no reserva stock).
  const carts = await Promise.all(
    Array.from({ length: BUYERS }, async () => {
      const res = await fetch(`${API}/api/cart/items`, { method: 'POST', headers: json, body: JSON.stringify({ variantId, quantity: 1 }) });
      return { cookie: cookieOf(res, 'rs_cart'), total: ((await res.json()) as { subtotalCents: number }).subtotalCents };
    }),
  );
  const quote = (await (await fetch(`${API}/api/checkout/quote`, { method: 'POST', headers: { ...json, cookie: carts[0]!.cookie }, body: JSON.stringify({ shippingMethod: 'express' }) })).json()) as {
    totals: { totalCents: number };
  };

  const t0 = Date.now();
  const results = await Promise.all(
    carts.map((c, i) =>
      fetch(`${API}/api/checkout/orders`, {
        method: 'POST',
        headers: { ...json, cookie: c.cookie, 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          email: `buyer${i}@example.com`,
          shippingAddress: { recipient: 'Test', line1: 'Calle 123', city: 'CABA', region: 'CABA', postalCode: '1000', country: 'AR', phone: '1155555555' },
          shippingMethod: 'express',
          card: { number: '4242424242424242', expMonth: 12, expYear: 2030, cvc: '123', holder: 'Test' },
          expectedTotalCents: quote.totals.totalCents,
        }),
      }).then(async (r) => ({ status: r.status, code: r.ok ? 'PAID' : ((await r.json()) as { code: string }).code })),
    ),
  );
  const tally = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [`${r.status} ${r.code}`]: (acc[`${r.status} ${r.code}`] ?? 0) + 1 }), {});
  console.table(tally);
  const paid = results.filter((r) => r.status === 201).length;
  console.log(`${paid === 1 ? '✔' : '✘'} Pedidos pagados: ${paid} (esperado 1) en ${Date.now() - t0} ms`);
  process.exit(paid === 1 ? 0 : 1);
}

await main();
