import { describe, expect, it } from 'vitest';
import { CommandBus, QueryBus } from '../../../../src/shared/application/buses.js';

describe('CommandBus / QueryBus', () => {
  it('despacha al handler registrado y devuelve su resultado', async () => {
    const bus = new CommandBus();
    bus.register('Greet', async (c: { type: 'Greet'; name: string }) => `hola ${c.name}`);
    await expect(bus.execute({ type: 'Greet', name: 'Ana' })).resolves.toBe('hola Ana');
  });

  it('falla si no hay handler', async () => {
    await expect(new QueryBus().execute({ type: 'Nope' })).rejects.toThrow(/Nope/);
  });

  it('no permite registrar dos handlers para el mismo tipo', () => {
    const bus = new QueryBus();
    bus.register('Q', async () => 1);
    expect(() => bus.register('Q', async () => 2)).toThrow(/Q/);
  });
});
