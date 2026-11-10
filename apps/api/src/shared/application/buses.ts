export interface Message {
  readonly type: string;
}

type Handler<M extends Message, R> = (message: M) => Promise<R>;

class Bus<Kind extends string> {
  private readonly handlers = new Map<string, Handler<Message, unknown>>();

  constructor(private readonly kind: Kind) {}

  register<M extends Message, R>(type: M['type'], handler: Handler<M, R>): void {
    if (this.handlers.has(type)) {
      throw new Error(`${this.kind} "${type}" ya tiene un handler registrado`);
    }
    this.handlers.set(type, handler as Handler<Message, unknown>);
  }

  async execute<R = unknown, M extends Message = Message>(message: M): Promise<R> {
    const handler = this.handlers.get(message.type);
    if (!handler) throw new Error(`No hay handler para ${this.kind} "${message.type}"`);
    return (await handler(message)) as R;
  }
}

/** Comandos: modifican estado en la base de escritura. */
export class CommandBus extends Bus<'command'> {
  constructor() {
    super('command');
  }
}

/** Consultas: leen exclusivamente del modelo de lectura. */
export class QueryBus extends Bus<'query'> {
  constructor() {
    super('query');
  }
}
