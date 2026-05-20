import EventEmitter from 'eventemitter3';
import { RingBuffer } from './RingBuffer.js';
import type {
  EventMap,
  EventRecord,
  AnyListener,
  Listener,
  ListenerOptions,
  Middleware,
  SparkOptions,
} from './types.js';

interface PriorityEntry<TArgs extends any[]> {
  priority: number;
  listener: Listener<TArgs>;
  /** Remaining invocations before auto-removal. `Infinity` = persistent. */
  remaining: number;
}

interface WildcardEntry {
  pattern: string;
  regex: RegExp;
  listener: Listener<any>;
  /** Remaining invocations before auto-removal. `Infinity` = persistent. */
  remaining: number;
  priority?: number;
}

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
  private readonly priorityListeners: Map<string, PriorityEntry<any>[]>;
  private readonly wildcardListeners: WildcardEntry[];
  /** Maps original listener → EE wrapper for many() with no priority */
  private readonly manyWrappers: Map<string, Map<Listener<any>, Listener<any>>>;
  /** Global catch-all listeners registered via onAny() */
  private readonly anyListeners: AnyListener[];
  private readonly historySize: number;
  private readonly logger: SparkOptions['logger'];

  constructor(options: SparkOptions = {}) {
    this.ee = new EventEmitter();
    this.history = new Map();
    this.middlewares = new Map();
    this.priorityListeners = new Map();
    this.wildcardListeners = [];
    this.manyWrappers = new Map();
    this.anyListeners = [];
    this.historySize = options.historySize ?? 50;
    this.logger = options.logger;
  }

  // ─── Subscription ────────────────────────────────────────────────────────────

  /** Subscribe to an event. Returns `this` for chaining. */
  on<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>, options?: ListenerOptions): this;
  /** Subscribe to a wildcard pattern (e.g. `'user:*'`, `'user:**'`). */
  on(event: string, listener: Listener<any[]>, options?: ListenerOptions): this;
  on(event: any, listener: any, options?: ListenerOptions): this {
    this.logger?.debug(`[spark] on: ${event}`);
    if (event.includes('*')) {
      this.wildcardListeners.push({ pattern: event, regex: this._wildcardToRegex(event), listener, remaining: Infinity, priority: options?.priority });
      return this;
    }
    if (options?.priority !== undefined) {
      this._addPriorityListener(event, listener, options.priority, Infinity);
    } else {
      this.ee.on(event, listener as (...args: any[]) => void);
    }
    return this;
  }

  /** Subscribe once; the listener is removed after its first invocation. */
  once<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>, options?: ListenerOptions): this;
  /** Subscribe once to a wildcard pattern. */
  once(event: string, listener: Listener<any[]>, options?: ListenerOptions): this;
  once(event: any, listener: any, options?: ListenerOptions): this {
    this.logger?.debug(`[spark] once: ${event}`);
    return this._manyInternal(event, 1, listener, options);
  }

  /**
   * Subscribe for exactly `n` invocations; the listener is auto-removed after firing `n` times.
   * Passing `n = 1` is equivalent to `.once()`.
   */
  many<K extends keyof TEvents & string>(event: K, n: number, listener: Listener<TEvents[K]>, options?: ListenerOptions): this;
  /** Subscribe for exactly `n` invocations on a wildcard pattern. */
  many(event: string, n: number, listener: Listener<any[]>, options?: ListenerOptions): this;
  many(event: any, n: number, listener: any, options?: ListenerOptions): this {
    if (n < 1) throw new RangeError(`many() requires n >= 1, got ${n}`);
    this.logger?.debug(`[spark] many(${n}): ${event}`);
    return this._manyInternal(event, n, listener, options);
  }

  private _manyInternal(
    event: string,
    n: number,
    listener: Listener<any>,
    options?: ListenerOptions
  ): this {
    if (event.includes('*')) {
      this.wildcardListeners.push({ pattern: event, regex: this._wildcardToRegex(event), listener, remaining: n, priority: options?.priority });
      return this;
    }
    if (options?.priority !== undefined) {
      this._addPriorityListener(event, listener, options.priority, n);
    } else {
      let count = 0;
      const wrapper = (...args: any[]): void => {
        count++;
        (listener as (...a: any[]) => void)(...args);
        if (count >= n) {
          this.ee.off(event, wrapper);
          this._deleteManyWrapper(event, listener);
        }
      };
      this._storeManyWrapper(event, listener, wrapper);
      this.ee.on(event, wrapper);
    }
    return this;
  }

  /** Unsubscribe a previously registered listener. */
  off<K extends keyof TEvents & string>(event: K, listener: Listener<TEvents[K]>): this;
  /** Unsubscribe a wildcard listener. */
  off(event: string, listener: Listener<any[]>): this;
  off(event: any, listener: any): this {
    this.logger?.debug(`[spark] off: ${event}`);
    // Check if there's a many() wrapper for this listener
    const wrapper = this._getManyWrapper(event, listener);
    if (wrapper) {
      this.ee.off(event, wrapper);
      this._deleteManyWrapper(event, listener);
    } else {
      this.ee.off(event, listener as (...args: any[]) => void);
    }
    // Also remove from priority store if present
    const entries = this.priorityListeners.get(event);
    if (entries) {
      const idx = entries.findIndex(e => e.listener === listener);
      if (idx !== -1) entries.splice(idx, 1);
    }
    // Also remove from wildcard listeners if present
    const wcIdx = this.wildcardListeners.findIndex(e => e.pattern === event && e.listener === listener);
    if (wcIdx !== -1) this.wildcardListeners.splice(wcIdx, 1);
    return this;
  }

  /** Remove all listeners for an event, or every listener when called without an argument. */
  removeAllListeners<K extends keyof TEvents & string>(event?: K): this {
    if (event) {
      this.ee.removeAllListeners(event);
      this.priorityListeners.delete(event);
      this.manyWrappers.delete(event);
      // Remove wildcard entries matching this pattern
      for (let i = this.wildcardListeners.length - 1; i >= 0; i--) {
        if (this.wildcardListeners[i].pattern === event) {
          this.wildcardListeners.splice(i, 1);
        }
      }
    } else {
      this.ee.removeAllListeners();
      this.priorityListeners.clear();
      this.manyWrappers.clear();
      this.wildcardListeners.length = 0;
      this.anyListeners.length = 0;
    }
    return this;
  }

  /**
   * Register a global catch-all listener that fires on **every** successfully emitted event.
   * The listener receives the event name as its first argument followed by all emitted args.
   *
   * @example
   * ```ts
   * spark.onAny((event, ...args) => console.log(event, args));
   * spark.emit('user:login', 'u-42'); // logs: "user:login" ["u-42"]
   * ```
   */
  onAny(listener: AnyListener): this {
    this.logger?.debug('[spark] onAny');
    this.anyListeners.push(listener);
    return this;
  }

  /**
   * Remove a global catch-all listener previously registered with `.onAny()`.
   */
  offAny(listener: AnyListener): this {
    this.logger?.debug('[spark] offAny');
    const idx = this.anyListeners.indexOf(listener);
    if (idx !== -1) this.anyListeners.splice(idx, 1);
    return this;
  }

  /** Number of listeners currently attached to an event. */
  listenerCount<K extends keyof TEvents & string>(event: K): number {
    return (
      this.ee.listenerCount(event) +
      (this.priorityListeners.get(event)?.length ?? 0)
    );
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
        this.getOrCreateBuffer(event).push({ event, args, timestamp: Date.now() });
        this.logger?.debug(`[spark] emit: ${event}`);
        const priorityFired = this._dispatchPriorityListeners(event, args);
        const eeFired = this.ee.emit(event, ...args);
        const wildcardFired = this._dispatchWildcardListeners(event, args);
        this._dispatchAnyListeners(event, args);
        result = priorityFired || eeFired || wildcardFired;
        return;
      }

      let nextCalled = false;
      const next = (): void => { nextCalled = true; };
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
        const priorityFired = this._dispatchPriorityListeners(event, args);
        const eeFired = this.ee.emit(event, ...args);
        const wildcardFired = this._dispatchWildcardListeners(event, args);
        this._dispatchAnyListeners(event, args);
        result = priorityFired || eeFired || wildcardFired;
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

  private _addPriorityListener(
    event: string,
    listener: Listener<any>,
    priority: number,
    remaining: number
  ): void {
    const entries: PriorityEntry<any>[] = this.priorityListeners.get(event) ?? [];
    entries.push({ priority, listener, remaining });
    // Keep sorted: higher priority first; stable via splice position
    entries.sort((a, b) => b.priority - a.priority);
    this.priorityListeners.set(event, entries);
  }

  /**
   * Calls all priority listeners for the event in sorted order (highest priority first).
   * Decrements `remaining` and removes entries that reach zero.
   * Returns `true` if at least one listener was called.
   */
  private _dispatchPriorityListeners(event: string, args: any[]): boolean {
    const entries = this.priorityListeners.get(event);
    if (!entries || entries.length === 0) return false;

    // Snapshot to handle mutations (removals) safely
    const snapshot = entries.slice();
    const toRemove: PriorityEntry<any>[] = [];

    for (const entry of snapshot) {
      entry.listener(...args);
      if (entry.remaining !== Infinity) {
        entry.remaining--;
        if (entry.remaining <= 0) toRemove.push(entry);
      }
    }

    for (const entry of toRemove) {
      const idx = entries.indexOf(entry);
      if (idx !== -1) entries.splice(idx, 1);
    }

    return true;
  }

  /**
   * Dispatches wildcard listeners whose pattern matches the emitted event.
   * Decrements `remaining` and removes entries that reach zero.
   */
  private _dispatchWildcardListeners(event: string, args: any[]): boolean {
    const toRemove: number[] = [];
    let fired = false;

    for (let i = 0; i < this.wildcardListeners.length; i++) {
      const entry = this.wildcardListeners[i];
      if (entry.regex.test(event)) {
        entry.listener(...args);
        fired = true;
        if (entry.remaining !== Infinity) {
          entry.remaining--;
          if (entry.remaining <= 0) toRemove.push(i);
        }
      }
    }

    // Remove exhausted entries in reverse order to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.wildcardListeners.splice(toRemove[i], 1);
    }

    return fired;
  }


  /**
   * Calls all onAny listeners with the event name + args.
   * Always fires after the normal dispatch when middleware chain completes.
   */
  private _dispatchAnyListeners(event: string, args: any[]): void {
    for (const listener of this.anyListeners.slice()) {
      listener(event, ...args);
    }
  }

  /**
   * Converts a wildcard pattern to a RegExp.
   * - `**` matches any characters (multi-segment, crosses `:` boundaries)
   * - `*` matches a single segment (anything except `:`)
   */
  private _wildcardToRegex(pattern: string): RegExp {
    const regexStr = '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\u0000')
      .replace(/\*/g, '[^:]*')
      .replace(/\u0000/g, '.*') + '$';
    return new RegExp(regexStr);
  }

  // ─── many() wrapper helpers ───────────────────────────────────────────────

  private _storeManyWrapper(event: string, original: Listener<any>, wrapper: Listener<any>): void {
    let eventMap = this.manyWrappers.get(event);
    if (!eventMap) {
      eventMap = new Map();
      this.manyWrappers.set(event, eventMap);
    }
    eventMap.set(original, wrapper);
  }

  private _getManyWrapper(event: string, original: Listener<any>): Listener<any> | undefined {
    return this.manyWrappers.get(event)?.get(original);
  }

  private _deleteManyWrapper(event: string, original: Listener<any>): void {
    this.manyWrappers.get(event)?.delete(original);
  }
}

