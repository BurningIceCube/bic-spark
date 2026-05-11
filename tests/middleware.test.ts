/*
intercepts and transforms args
can block an event by not calling next()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';
import { createNamespace } from '../src/namespace.js';

type Events = {
  greet: [name: string];
  count: [n: number];
  multi: [a: string, b: number];
  empty: [];
};

// ─── Intercept & transform ────────────────────────────────────────────────────

describe('middleware – intercepts and transforms args', () => {
  it('runs before the listener and receives the emitted args', () => {
    const spark = new Spark<Events>();
    const received: string[] = [];

    spark.use('greet', (args, next) => {
      received.push(args[0]);
      next();
    });
    spark.on('greet', vi.fn());
    spark.emit('greet', 'Alice');

    expect(received).toEqual(['Alice']);
  });

  it('mutates a single argument in-place before the listener sees it', () => {
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

  it('mutates multiple arguments in-place', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('multi', (args, next) => {
      args[0] = args[0].trim();
      args[1] = args[1] * 2;
      next();
    });
    spark.on('multi', fn);
    spark.emit('multi', '  hi  ', 5);

    expect(fn).toHaveBeenCalledWith('hi', 10);
  });

  it('chained middleware each see the already-mutated args', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', (args, next) => { args[0] = args[0] + '!'; next(); });
    spark.use('greet', (args, next) => { args[0] = args[0].toUpperCase(); next(); });
    spark.on('greet', fn);
    spark.emit('greet', 'hello');

    expect(fn).toHaveBeenCalledWith('HELLO!');
  });

  it('multiple middleware run in registration order', () => {
    const spark = new Spark<Events>();
    const order: number[] = [];

    spark.use('count', (_args, next) => { order.push(1); next(); });
    spark.use('count', (_args, next) => { order.push(2); next(); });
    spark.use('count', (_args, next) => { order.push(3); next(); });

    spark.on('count', () => order.push(4));
    spark.emit('count', 0);

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('records the transformed (post-middleware) args in history', () => {
    const spark = new Spark<Events>();

    spark.use('greet', (args, next) => {
      args[0] = args[0].toUpperCase();
      next();
    });
    spark.emit('greet', 'world');

    const [rec] = spark.getHistory('greet');
    expect(rec.args[0]).toBe('WORLD');
  });
});

// ─── Blocking ─────────────────────────────────────────────────────────────────

describe('middleware – can block an event by not calling next()', () => {
  it('prevents the listener from being called', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', () => { /* intentionally no next() */ });
    spark.on('greet', fn);
    spark.emit('greet', 'Bob');

    expect(fn).not.toHaveBeenCalled();
  });

  it('returns false when middleware blocks the emission', () => {
    const spark = new Spark<Events>();

    spark.use('greet', () => { /* blocked */ });
    spark.on('greet', vi.fn());

    expect(spark.emit('greet', 'Carol')).toBe(false);
  });

  it('does NOT record a blocked emission in history', () => {
    const spark = new Spark<Events>();

    spark.use('count', () => { /* blocked */ });
    spark.emit('count', 99);

    expect(spark.getHistory('count')).toHaveLength(0);
  });

  it('stops the chain when a middle middleware omits next()', () => {
    const spark = new Spark<Events>();
    const order: number[] = [];

    spark.use('count', (_args, next) => { order.push(1); next(); });
    spark.use('count', (_args, _next) => { order.push(2); /* no next */ });
    spark.use('count', (_args, next) => { order.push(3); next(); });

    spark.on('count', () => order.push(4));
    spark.emit('count', 0);

    expect(order).toEqual([1, 2]);
  });

  it('still allows other events to pass through when one is blocked', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', () => { /* block greet */ });
    spark.on('count', fn);
    spark.emit('greet', 'Dave');
    spark.emit('count', 7);

    expect(fn).toHaveBeenCalledWith(7);
  });

  it('a guard middleware only blocks when condition is met', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', (args, next) => {
      if (!args[0]) return; // block empty string
      next();
    });
    spark.on('greet', fn);

    spark.emit('greet', '');    // blocked
    spark.emit('greet', 'Eve'); // allowed

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('Eve');
  });
});

// ─── Middleware on events with no listeners ───────────────────────────────────

describe('middleware – interaction with listeners / history', () => {
  it('middleware still runs even without a listener registered', () => {
    const spark = new Spark<Events>();
    const mw = vi.fn((_args: [string], next: () => void) => next());

    spark.use('greet', mw);
    spark.emit('greet', 'Frank');

    expect(mw).toHaveBeenCalledOnce();
  });

  it('history is recorded after all middleware pass, even with no listener', () => {
    const spark = new Spark<Events>();

    spark.use('greet', (_args, next) => next());
    spark.emit('greet', 'Grace');

    expect(spark.getHistory('greet')).toHaveLength(1);
  });

  it('successive allowed emissions accumulate in history', () => {
    const spark = new Spark<Events>();

    spark.use('count', (_args, next) => next());

    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3);

    const history = spark.getHistory('count');
    expect(history).toHaveLength(3);
    expect(history.map((r) => r.args[0])).toEqual([1, 2, 3]);
  });
});

// ─── Namespace middleware ─────────────────────────────────────────────────────

describe('middleware – namespace', () => {
  type AuthEvents = { login: [userId: string]; logout: [] };
  type AppEvents  = { 'auth:login': [userId: string]; 'auth:logout': [] };

  it('namespace middleware transforms args before the listener', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.use('login', (args, next) => { args[0] = `ns-${args[0]}`; next(); });
    auth.on('login', fn);
    auth.emit('login', 'u-1');

    expect(fn).toHaveBeenCalledWith('ns-u-1');
  });

  it('namespace middleware can block an emission', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.use('login', () => { /* blocked */ });
    auth.on('login', fn);
    auth.emit('login', 'u-2');

    expect(fn).not.toHaveBeenCalled();
  });
});
