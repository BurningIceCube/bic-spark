import type { EventMap, EventRecord, Listener, ListenerOptions, Middleware } from './types.js';
import type { Spark } from './TypedEmitter.js';

/**
 * A prefixed view over a parent `Spark` instance.
 * All event names are automatically namespaced as `"prefix:event"`.
 */
export interface NamespacedSpark<TEvents extends EventMap> {
  on<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>, options?: ListenerOptions): this;
  on(event: string, listener: Listener<any[]>, options?: ListenerOptions): this;
  once<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>, options?: ListenerOptions): this;
  once(event: string, listener: Listener<any[]>, options?: ListenerOptions): this;
  many<K extends keyof TEvents & string>(event: K, n: number, listener: Listener<TEvents[K]>, options?: ListenerOptions): this;
  many(event: string, n: number, listener: Listener<any[]>, options?: ListenerOptions): this;
  off<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this;
  off(event: string, listener: Listener<any[]>): this;
  emit<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]): boolean;
  emitAsync<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]): Promise<boolean>;
  use<K extends keyof TEvents & string>(event: K, middleware: Middleware<TEvents[K]>): this;
  getHistory<K extends keyof TEvents & string>(event: K): EventRecord<TEvents[K]>[];
  replay<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this;
  /** The namespace prefix used by this instance. */
  readonly prefix: string;
}

/**
 * Create a namespaced sub-emitter backed by a parent `Spark`.
 *
 * All events are stored on the parent under the key `"<prefix>:<event>"`.
 *
 * @example
 * ```ts
 * type AuthEvents = { login: [userId: string]; logout: [] };
 * type AppEvents = { 'auth:login': [userId: string]; 'auth:logout': [] };
 *
 * const spark = new Spark<AppEvents>();
 * const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
 *
 * auth.on('login', id => console.log('logged in', id));
 * auth.emit('login', 'u-42');
 * ```
 */
export function createNamespace<
  TEvents extends EventMap,
  TPrefix extends string,
>(
  spark: Spark<{ [K in keyof TEvents & string as `${TPrefix}:${K}`]: TEvents[K] }>,
  prefix: TPrefix,
): NamespacedSpark<TEvents> {
  type PrefixedSpark = Spark<{ [K in keyof TEvents & string as `${TPrefix}:${K}`]: TEvents[K] }>;

  const prefixed = <K extends keyof TEvents & string>(event: K) =>
    `${prefix}:${event}` as `${TPrefix}:${K}`;

  const ns: NamespacedSpark<TEvents> = {
    prefix,

    on(event: any, listener: any, options?: ListenerOptions) {
      (spark as any).on(`${prefix}:${event}`, listener, options);
      return this;
    },

    once(event: any, listener: any, options?: ListenerOptions) {
      (spark as any).once(`${prefix}:${event}`, listener, options);
      return this;
    },

    many(event: any, n: number, listener: any, options?: ListenerOptions) {
      (spark as any).many(`${prefix}:${event}`, n, listener, options);
      return this;
    },

    off(event: any, listener: any) {
      (spark as any).off(`${prefix}:${event}`, listener);
      return this;
    },

    emit<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]) {
      return (spark as PrefixedSpark).emit(prefixed(event), ...(args as any));
    },

    emitAsync<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]) {
      return (spark as PrefixedSpark).emitAsync(prefixed(event), ...(args as any));
    },

    use<K extends keyof TEvents & string>(event: K, middleware: Middleware<TEvents[K]>) {
      (spark as PrefixedSpark).use(prefixed(event), middleware as any);
      return this;
    },

    getHistory<K extends keyof TEvents & string>(event: K) {
      return (spark as PrefixedSpark).getHistory(prefixed(event)) as unknown as EventRecord<TEvents[K]>[];
    },

    replay<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>) {
      (spark as PrefixedSpark).replay(prefixed(event), listener as any);
      return this;
    },
  };

  return ns;
}

