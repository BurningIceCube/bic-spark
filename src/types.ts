/**
 * A map of event names to their argument tuples.
 * @example { 'user:login': [string, number]; 'error': [Error] }
 */
export type EventMap = Record<string, any[]>;

/** A snapshot of a single emitted event stored in history. */
export interface EventRecord<TArgs extends any[] = any[]> {
  /** Name of the event that was emitted. */
  event: string;
  /** Arguments that were passed to the event. */
  args: TArgs;
  /** Unix timestamp (ms) at the moment of emission. */
  timestamp: number;
}

/** A strongly-typed event listener. */
export type Listener<TArgs extends any[]> = (...args: TArgs) => void;

/**
 * A global catch-all listener registered via `.onAny()`.
 * Receives the emitted event name as the first argument followed by all event args.
 */
export type AnyListener = (event: string, ...args: any[]) => void;

/** Options accepted by `.on()` and `.once()`. */
export interface ListenerOptions {
  /**
   * Listeners with a higher priority value are called before those with a lower value.
   * Listeners registered without a priority (or with the same priority) are called in
   * registration order within that priority group.
   * @default undefined  (no priority — appended after all priority listeners)
   */
  priority?: number;
}

/**
 * A middleware function for a single event.
 * Call `next()` to continue the chain; omit it to cancel the emission.
 *
 * - **Sync**: call `next()` immediately and return `void`.
 * - **Async**: return a `Promise<void>` and call `next()` inside it
 *   (only honoured by `emitAsync`; sync `emit` ignores the returned Promise).
 */
export type Middleware<TArgs extends any[]> = (
  args: TArgs,
  next: () => void
) => void | Promise<void>;

/** Minimal logger interface accepted by Spark (compatible with LogLayer, console, etc.). */
export interface SparkLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/** Options passed to the `Spark` constructor. */
export interface SparkOptions {
  /**
   * Maximum number of history entries kept per event.
   * Once the limit is reached the oldest entry is overwritten (ring buffer).
   * @default 50
   */
  historySize?: number;
  /** Optional logger (LogLayer, console-compatible, etc.). */
  logger?: SparkLogger;
}

