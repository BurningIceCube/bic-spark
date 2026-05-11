import EventEmitter from 'eventemitter3';
import { RingBuffer } from './RingBuffer.js';
import type {
  EventMap,
  EventRecord,
  Listener,
  Middleware,
  SparkOptions,
} from './types.js';

/**
 * `Spark` — a typed EventEmitter3 wrapper with history, replay, and middleware.
 *
 * @example
 * ```ts
 * type Events = { greet: [name: string]; count: [n: number] };
 * const spark = new Spark<Events>({ historySize: 10 });
 *
 * spark.on('greet', name => console.log(`Hello, ${name}!`));
 * spark.emit('greet', 'world');
 * spark.replay('greet', name => console.log('replaying:', name));
 * ```
 */
export class Spark<TEvents extends EventMap = EventMap> {
  private readonly ee: EventEmitter;
  private readonly history: Map<string, RingBuffer<EventRecord>>;
  private readonly middlewares: Map<string, Middleware<any>[]>;
  private readonly historySize: number;
  private readonly logger: SparkOptions['logger'];

  constructor(options: SparkOptions = {}) {
    this.ee = new EventEmitter();
    this.history = new Map();
    this.middlewares = new Map();
    this.historySize = options.historySize ?? 50;
    this.logger = options.logger;
  }

  // ─── Subscription ────────────────────────────────────────────────────────────

  /** Subscribe to an event. Returns `this` for chaining. */
  on<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>
  ): this {
    this.logger?.debug(`[spark] on: ${event}`);
    this.ee.on(event, listener as (...args: any[]) => void);
    return this;
  }

  /** Subscribe once; the listener is removed after its first invocation. */
  once<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>
  ): this {
    this.logger?.debug(`[spark] once: ${event}`);
    this.ee.once(event, listener as (...args: any[]) => void);
    return this;
  }

  /** Unsubscribe a previously registered listener. */
  off<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>
  ): this {
    this.logger?.debug(`[spark] off: ${event}`);
    this.ee.off(event, listener as (...args: any[]) => void);
    return this;
  }

  /** Remove all listeners for an event, or every listener when called without an argument. */
  removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
    if (event) {
      this.ee.removeAllListeners(event);
    } else {
      this.ee.removeAllListeners();
    }
    return this;
  }

  /** Number of listeners currently attached to an event. */
  listenerCount<K extends keyof TEvents & string>(event: K): number {
    return this.ee.listenerCount(event);
  }

  // ─── Emit ─────────────────────────────────────────────────────────────────

  /**
   * Emit an event, running it through the middleware chain first.
   * If any middleware omits calling `next()` the event is swallowed.
   *
   * Returns `true` if listeners were notified, `false` if the event was
   * blocked by middleware or had no listeners.
   */
  emit<K extends keyof TEvents & string>(event: K, ...args: TEvents[K]): boolean {
    const mws = this.middlewares.get(event) ?? [];
    let result = false;

    const run = (index: number): void => {
      if (index >= mws.length) {
        // Persist in history before notifying listeners
        this.getOrCreateBuffer(event).push({
          event,
          args,
          timestamp: Date.now(),
        });
        this.logger?.debug(`[spark] emit: ${event}`);
        result = this.ee.emit(event, ...args);
        return;
      }

      let nextCalled = false;
      const next = (): void => {
        nextCalled = true;
      };

      mws[index](args, next);
      if (nextCalled) run(index + 1);
    };

    run(0);
    return result;
  }

  // ─── Middleware ───────────────────────────────────────────────────────────

  /**
   * Register a middleware function for an event.
   * Middleware functions are executed in registration order.
   * Call `next()` to continue the chain; skip it to cancel the emission.
   */
  use<K extends keyof TEvents & string>(
    event: K,
    middleware: Middleware<TEvents[K]>
  ): this {
    const arr = this.middlewares.get(event) ?? [];
    arr.push(middleware as Middleware<any>);
    this.middlewares.set(event, arr);
    return this;
  }

  // ─── History & Replay ─────────────────────────────────────────────────────

  /**
   * Return all history records for an event in insertion order (oldest first).
   * History is only recorded for emits that pass through the middleware chain.
   */
  getHistory<K extends keyof TEvents & string>(
    event: K
  ): EventRecord<TEvents[K]>[] {
    return (this.history.get(event)?.toArray() ??
      []) as EventRecord<TEvents[K]>[];
  }

  /**
   * Replay all history for an event by invoking `listener` with the recorded
   * arguments in insertion order. Does not re-emit through middleware.
   */
  replay<K extends keyof TEvents & string>(
    event: K,
    listener: Listener<TEvents[K]>
  ): this {
    for (const record of this.getHistory(event)) {
      listener(...(record.args as TEvents[K]));
    }
    return this;
  }

  /**
   * Clear history for a specific event, or all history when called without an argument.
   */
  clearHistory<K extends keyof TEvents & string>(event?: K): this {
    if (event) {
      this.history.get(event)?.clear();
    } else {
      this.history.forEach((buf) => buf.clear());
    }
    return this;
  }

  // ─── Async emit ───────────────────────────────────────────────────────────

  /**
   * Async variant of `emit`. Runs the middleware chain sequentially, awaiting
   * any middleware that returns a `Promise`. Listeners are still called
   * synchronously via EventEmitter3 after the chain resolves.
   *
   * Returns `true` if at least one listener was notified, `false` if the event
   * was blocked by middleware or had no listeners.
   *
   * @example
   * ```ts
   * spark.use('save', async (args, next) => {
   *   await db.validate(args[0]);
   *   next();
   * });
   * const notified = await spark.emitAsync('save', payload);
   * ```
   */
  async emitAsync<K extends keyof TEvents & string>(
    event: K,
    ...args: TEvents[K]
  ): Promise<boolean> {
    const mws = this.middlewares.get(event) ?? [];
    let result = false;

    const run = async (index: number): Promise<void> => {
      if (index >= mws.length) {
        this.getOrCreateBuffer(event).push({
          event,
          args,
          timestamp: Date.now(),
        });
        this.logger?.debug(`[spark] emit: ${event}`);
        result = this.ee.emit(event, ...args);
        return;
      }

      let nextCalled = false;
      const next = (): void => {
        nextCalled = true;
      };

      const ret = mws[index](args, next);
      if (ret instanceof Promise) await ret;

      if (nextCalled) await run(index + 1);
    };

    await run(0);
    return result;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private getOrCreateBuffer(event: string): RingBuffer<EventRecord> {
    let buf = this.history.get(event);
    if (!buf) {
      buf = new RingBuffer<EventRecord>(this.historySize);
      this.history.set(event, buf);
    }
    return buf;
  }
}

