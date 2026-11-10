# Quickstart: Checkout y pedidos

Web: carrito → "Finalizar compra" (`/checkout`).

Tarjetas de prueba (cualquier vencimiento futuro y CVC de 3 dígitos):

| Número | Resultado |
|--------|-----------|
| 4242 4242 4242 4242 | aprobada |
| 4000 0000 0000 0002 | rechazada |
| 4000 0000 0000 9995 | fondos insuficientes |
| 4000 0000 0000 0119 | timeout del proveedor (queda pendiente y vence a los 15 min) |

Código de descuento: `WELCOME20` (20 %, una vez por email).

```bash
# concurrencia: 50 compras de la última unidad (script de verificación)
npm run verify:oversell -w apps/api      # espera: 1 pedido pagado, 49 INSUFFICIENT_STOCK
```

Validación:

1. Compra aprobada → confirmación `RS-000001`, carrito vacío, stock descontado (admin).
2. Doble clic en "Pagar" → un solo pedido (ver `/cuenta/pedidos`).
3. Admin → Pedidos → marcar enviado con seguimiento → el cliente lo ve "Enviado".
4. Cancelar un pedido pagado → stock repuesto.
5. Grafana: paneles "Orders" y "Payments" con datos.
