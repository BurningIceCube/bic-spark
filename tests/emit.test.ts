import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';
import { createNamespace } from '../src/namespace.js';

// ─── Shared event map ──────────────────────────────────────────────────────────

type Events = {
  greet: [name: string];
  count: [n: number];
  empty: [];
};

// ─── Basic emit / subscribe ────────────────────────────────────────────────────

describe('on / emit', () => {
  it('calls a registered listener with the correct arguments', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn);
    spark.emit('greet', 'Alice');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('Alice');
  });

  it('returns true when there are listeners, false when there are none', () => {
    const spark = new Spark<Events>();
    expect(spark.emit('greet', 'Bob')).toBe(false);

    spark.on('greet', vi.fn());
    expect(spark.emit('greet', 'Bob')).toBe(true);
  });

  it('supports multiple listeners on the same event', () => {
    const spark = new Spark<Events>();
    const a = vi.fn();
    const b = vi.fn();

    spark.on('greet', a).on('greet', b);
    spark.emit('greet', 'Carol');

    expect(a).toHaveBeenCalledWith('Carol');
    expect(b).toHaveBeenCalledWith('Carol');
  });

  it('handles events with no arguments', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('empty', fn);
    spark.emit('empty');

    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── once ─────────────────────────────────────────────────────────────────────

describe('once', () => {
  it('fires exactly once then auto-removes itself', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.once('count', fn);
    spark.emit('count', 1);
    spark.emit('count', 2);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1);
  });
});

// ─── off ──────────────────────────────────────────────────────────────────────

describe('off', () => {
  it('stops delivering events after unsubscribing', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn);
    spark.emit('greet', 'Dave');
    spark.off('greet', fn);
    spark.emit('greet', 'Eve');

    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── removeAllListeners ───────────────────────────────────────────────────────

describe('removeAllListeners', () => {
  it('removes all listeners for a specific event', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn).on('count', fn);
    spark.removeAllListeners('greet');

    spark.emit('greet', 'x');
    spark.emit('count', 99);

    expect(fn).toHaveBeenCalledOnce(); // only count fired
    expect(fn).toHaveBeenCalledWith(99);
  });

  it('removes all listeners for every event when called without arguments', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn).on('count', fn);
    spark.removeAllListeners();

    spark.emit('greet', 'x');
    spark.emit('count', 1);

    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── listenerCount ────────────────────────────────────────────────────────────

describe('listenerCount', () => {
  it('returns the correct count', () => {
    const spark = new Spark<Events>();
    expect(spark.listenerCount('greet')).toBe(0);

    const a = vi.fn();
    const b = vi.fn();
    spark.on('greet', a).on('greet', b);
    expect(spark.listenerCount('greet')).toBe(2);

    spark.off('greet', a);
    expect(spark.listenerCount('greet')).toBe(1);
  });
});

// ─── History ──────────────────────────────────────────────────────────────────

describe('history', () => {
  it('records every emission in order', () => {
    const spark = new Spark<Events>();

    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3);

    const history = spark.getHistory('count');
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.args[0])).toEqual([1, 2, 3]);
  });

  it('records event name and a timestamp on each entry', () => {
    const spark = new Spark<Events>();
    const before = Date.now();
    spark.emit('greet', 'Frank');
    const after = Date.now();

    const [rec] = spark.getHistory('greet');
    expect(rec.event).toBe('greet');
    expect(rec.timestamp).toBeGreaterThanOrEqual(before);
    expect(rec.timestamp).toBeLessThanOrEqual(after);
  });

  it('history is independent per event', () => {
    const spark = new Spark<Events>();

    spark.emit('greet', 'G');
    spark.emit('count', 7);

    expect(spark.getHistory('greet')).toHaveLength(1);
    expect(spark.getHistory('count')).toHaveLength(1);
  });

  it('returns an empty array for events that were never emitted', () => {
    const spark = new Spark<Events>();
    expect(spark.getHistory('greet')).toEqual([]);
  });

  it('respects historySize and wraps around (ring buffer)', () => {
    const spark = new Spark<Events>({ historySize: 3 });

    for (let i = 1; i <= 5; i++) spark.emit('count', i);

    const history = spark.getHistory('count');
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.args[0])).toEqual([3, 4, 5]);
  });

  it('clearHistory(event) clears only that event', () => {
    const spark = new Spark<Events>();

    spark.emit('greet', 'H');
    spark.emit('count', 1);
    spark.clearHistory('greet');

    expect(spark.getHistory('greet')).toHaveLength(0);
    expect(spark.getHistory('count')).toHaveLength(1);
  });

  it('clearHistory() clears all events', () => {
    const spark = new Spark<Events>();

    spark.emit('greet', 'I');
    spark.emit('count', 2);
    spark.clearHistory();

    expect(spark.getHistory('greet')).toHaveLength(0);
    expect(spark.getHistory('count')).toHaveLength(0);
  });
});

// ─── Replay ───────────────────────────────────────────────────────────────────

describe('replay', () => {
  it('invokes the callback once per history entry in order', () => {
    const spark = new Spark<Events>();

    spark.emit('count', 10);
    spark.emit('count', 20);
    spark.emit('count', 30);

    const replayed: number[] = [];
    spark.replay('count', (n) => replayed.push(n));

    expect(replayed).toEqual([10, 20, 30]);
  });

  it('does not invoke new live listeners during replay', () => {
    const spark = new Spark<Events>();
    const live = vi.fn();

    spark.emit('greet', 'J');
    spark.on('greet', live);
    spark.replay('greet', vi.fn());

    // replay shouldn't trigger the on() listener
    expect(live).not.toHaveBeenCalled();
  });

  it('does nothing when history is empty', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();
    spark.replay('count', fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────

describe('middleware', () => {
  it('runs middleware before the listener', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.use('greet', (_args, next) => {
      order.push('mw');
      next();
    });
    spark.on('greet', () => order.push('listener'));
    spark.emit('greet', 'K');

    expect(order).toEqual(['mw', 'listener']);
  });

  it('allows middleware to mutate arguments', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', (args, next) => {
      args[0] = args[0].toUpperCase();
      next();
    });
    spark.on('greet', fn);
    spark.emit('greet', 'hello');

    expect(fn).toHaveBeenCalledWith('HELLO');
  });

  it('blocks emission when middleware does not call next()', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', () => { /* intentionally blocked */ });
    spark.on('greet', fn);
    const result = spark.emit('greet', 'L');

    expect(fn).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('blocked emissions are NOT recorded in history', () => {
    const spark = new Spark<Events>();

    spark.use('greet', () => { /* blocked */ });
    spark.emit('greet', 'M');

    expect(spark.getHistory('greet')).toHaveLength(0);
  });

  it('chains multiple middleware in registration order', () => {
    const spark = new Spark<Events>();
    const order: number[] = [];

    spark.use('count', (_args, next) => { order.push(1); next(); });
    spark.use('count', (_args, next) => { order.push(2); next(); });
    spark.use('count', (_args, next) => { order.push(3); next(); });

    spark.on('count', () => order.push(4));
    spark.emit('count', 0);

    expect(order).toEqual([1, 2, 3, 4]);
  });
});

// ─── Logging ──────────────────────────────────────────────────────────────────

describe('logger', () => {
  it('calls logger.debug on on/once/off/emit', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const spark = new Spark<Events>({ logger });
    const fn = vi.fn();

    spark.on('greet', fn);
    expect(logger.debug).toHaveBeenCalledWith('[spark] on: greet');

    spark.once('count', fn);
    expect(logger.debug).toHaveBeenCalledWith('[spark] once: count');

    spark.off('greet', fn);
    expect(logger.debug).toHaveBeenCalledWith('[spark] off: greet');

    spark.emit('count', 5);
    expect(logger.debug).toHaveBeenCalledWith('[spark] emit: count');
  });
});

// ─── Namespace ────────────────────────────────────────────────────────────────

describe('createNamespace', () => {
  type AuthEvents = { login: [userId: string]; logout: [] };
  type AppEvents = { 'auth:login': [userId: string]; 'auth:logout': [] };

  it('routes events to the parent under the prefixed key', () => {
    const spark = new Spark<AppEvents>();
    const parentFn = vi.fn();
    spark.on('auth:login', parentFn);

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.emit('login', 'u-1');

    expect(parentFn).toHaveBeenCalledWith('u-1');
  });

  it('exposes the prefix', () => {
    const spark = new Spark<AppEvents>();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    expect(auth.prefix).toBe('auth');
  });

  it('on/off work through the namespace', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.on('login', fn);
    auth.emit('login', 'u-2');
    expect(fn).toHaveBeenCalledWith('u-2');

    auth.off('login', fn);
    auth.emit('login', 'u-3');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('once works through the namespace', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.once('login', fn);
    auth.emit('login', 'u-4');
    auth.emit('login', 'u-5');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('u-4');
  });

  it('history and replay work through the namespace', () => {
    const spark = new Spark<AppEvents>();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.emit('login', 'u-10');
    auth.emit('login', 'u-11');

    const history = auth.getHistory('login');
    expect(history).toHaveLength(2);
    expect(history[0].args[0]).toBe('u-10');

    const replayed: string[] = [];
    auth.replay('login', (id) => replayed.push(id));
    expect(replayed).toEqual(['u-10', 'u-11']);
  });

  it('middleware works through the namespace', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.use('login', (args, next) => { args[0] = `prefixed-${args[0]}`; next(); });
    auth.on('login', fn);
    auth.emit('login', 'u-20');

    expect(fn).toHaveBeenCalledWith('prefixed-u-20');
  });
});

