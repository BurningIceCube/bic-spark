import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';
import { createNamespace } from '../src/namespace.js';

type Events = {
  greet: [name: string];
  count: [n: number];
  empty: [];
};

// ─── Basic onAny ──────────────────────────────────────────────────────────────

describe('onAny()', () => {
  it('fires for every emitted event', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    spark.emit('greet', 'Alice');
    spark.emit('count', 42);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'greet', 'Alice');
    expect(fn).toHaveBeenNthCalledWith(2, 'count', 42);
  });

  it('passes the event name as the first argument', () => {
    const spark = new Spark<Events>();
    const events: string[] = [];

    spark.onAny((event) => events.push(event));
    spark.emit('greet', 'Bob');
    spark.emit('count', 1);

    expect(events).toEqual(['greet', 'count']);
  });

  it('fires even when there are no other listeners', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    spark.emit('greet', 'Carol');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('greet', 'Carol');
  });

  it('fires for events with no args', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    spark.emit('empty');

    expect(fn).toHaveBeenCalledWith('empty');
  });

  it('multiple onAny listeners all fire', () => {
    const spark = new Spark<Events>();
    const a = vi.fn();
    const b = vi.fn();

    spark.onAny(a).onAny(b);
    spark.emit('count', 7);

    expect(a).toHaveBeenCalledWith('count', 7);
    expect(b).toHaveBeenCalledWith('count', 7);
  });

  it('does NOT fire when middleware blocks the emission', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', () => { /* blocked — no next() */ });
    spark.onAny(fn);
    spark.emit('greet', 'Dave');

    expect(fn).not.toHaveBeenCalled();
  });

  it('fires after normal listeners', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet', () => order.push('listener'));
    spark.onAny(() => order.push('any'));
    spark.emit('greet', 'Eve');

    expect(order).toEqual(['listener', 'any']);
  });

  it('returns this for chaining', () => {
    const spark = new Spark<Events>();
    expect(spark.onAny(vi.fn())).toBe(spark);
  });
});

// ─── offAny ───────────────────────────────────────────────────────────────────

describe('offAny()', () => {
  it('stops the listener from firing after removal', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    spark.emit('greet', 'Frank');

    spark.offAny(fn);
    spark.emit('greet', 'Grace');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('greet', 'Frank');
  });

  it('only removes the specified listener, leaving others intact', () => {
    const spark = new Spark<Events>();
    const a = vi.fn();
    const b = vi.fn();

    spark.onAny(a).onAny(b);
    spark.offAny(a);
    spark.emit('count', 9);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith('count', 9);
  });

  it('is a no-op when listener was never registered', () => {
    const spark = new Spark<Events>();
    expect(() => spark.offAny(vi.fn())).not.toThrow();
  });

  it('returns this for chaining', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();
    spark.onAny(fn);
    expect(spark.offAny(fn)).toBe(spark);
  });
});

// ─── removeAllListeners clears onAny ──────────────────────────────────────────

describe('removeAllListeners() clears onAny listeners', () => {
  it('clears all onAny listeners when called without args', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    spark.removeAllListeners();
    spark.emit('greet', 'Henry');

    expect(fn).not.toHaveBeenCalled();
  });

  it('does NOT clear onAny listeners when called with a specific event', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    spark.removeAllListeners('greet');
    spark.emit('greet', 'Iris');

    expect(fn).toHaveBeenCalledWith('greet', 'Iris');
  });
});

// ─── onAny with emitAsync ─────────────────────────────────────────────────────

describe('onAny() with emitAsync', () => {
  it('fires on async emissions', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.onAny(fn);
    await spark.emitAsync('greet', 'Jake');

    expect(fn).toHaveBeenCalledWith('greet', 'Jake');
  });

  it('does NOT fire when async middleware blocks', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', async () => { /* blocked */ });
    spark.onAny(fn);
    await spark.emitAsync('greet', 'Kate');

    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── onAny logger ─────────────────────────────────────────────────────────────

describe('onAny() logger', () => {
  it('calls logger.debug on onAny and offAny', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const spark = new Spark<Events>({ logger });
    const fn = vi.fn();

    spark.onAny(fn);
    expect(logger.debug).toHaveBeenCalledWith('[spark] onAny');

    spark.offAny(fn);
    expect(logger.debug).toHaveBeenCalledWith('[spark] offAny');
  });
});

// ─── onAny via namespace ──────────────────────────────────────────────────────

describe('onAny() via createNamespace', () => {
  type AuthEvents = { login: [userId: string]; logout: [] };
  type AppEvents = { 'auth:login': [userId: string]; 'auth:logout': [] };

  it('fires only for events under the namespace prefix', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.onAny(fn);
    auth.emit('login', 'u-1');
    auth.emit('logout');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('delivers the un-prefixed event name', () => {
    const spark = new Spark<AppEvents>();
    const events: string[] = [];
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.onAny((event) => events.push(event));
    auth.emit('login', 'u-2');
    auth.emit('logout');

    expect(events).toEqual(['login', 'logout']);
  });

  it('delivers the correct args', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.onAny(fn);
    auth.emit('login', 'u-3');

    expect(fn).toHaveBeenCalledWith('login', 'u-3');
  });

  it('does not fire for events from a different namespace', () => {
    type BillingEvents = { 'billing:paid': [amount: number] };
    type FullEvents = AppEvents & BillingEvents;

    const spark = new Spark<FullEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.onAny(fn);
    spark.emit('billing:paid', 99);

    expect(fn).not.toHaveBeenCalled();
  });

  it('offAny removes the scoped listener', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.onAny(fn);
    auth.emit('login', 'u-4');
    auth.offAny(fn);
    auth.emit('login', 'u-5');

    expect(fn).toHaveBeenCalledOnce();
  });
});

