import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';
import { createNamespace } from '../src/namespace.js';

type Events = {
  greet: [name: string];
  count: [n: number];
};

// ─── Basic many() ─────────────────────────────────────────────────────────────

describe('many()', () => {
  it('fires exactly n times then auto-removes itself', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.many('count', 3, fn);

    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3);
    spark.emit('count', 4); // should NOT fire
    spark.emit('count', 5); // should NOT fire

    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
    expect(fn).toHaveBeenNthCalledWith(3, 3);
  });

  it('n=1 behaves like once()', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.many('greet', 1, fn);
    spark.emit('greet', 'Alice');
    spark.emit('greet', 'Bob');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('Alice');
  });

  it('n=2 fires twice then stops', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.many('greet', 2, fn);
    spark.emit('greet', 'A');
    spark.emit('greet', 'B');
    spark.emit('greet', 'C');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RangeError for n < 1', () => {
    const spark = new Spark<Events>();
    expect(() => spark.many('count', 0, vi.fn())).toThrow(RangeError);
    expect(() => spark.many('count', -1, vi.fn())).toThrow(RangeError);
  });

  it('returns this for chaining', () => {
    const spark = new Spark<Events>();
    expect(spark.many('count', 2, vi.fn())).toBe(spark);
  });

  it('does not interfere with persistent listeners on the same event', () => {
    const spark = new Spark<Events>();
    const persistent = vi.fn();
    const limited = vi.fn();

    spark.on('count', persistent);
    spark.many('count', 2, limited);

    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3);

    expect(persistent).toHaveBeenCalledTimes(3);
    expect(limited).toHaveBeenCalledTimes(2);
  });

  it('can be removed early with off()', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.many('count', 5, fn);
    spark.emit('count', 1);
    spark.off('count', fn);
    spark.emit('count', 2);
    spark.emit('count', 3);

    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── many() with priority ──────────────────────────────────────────────────────

describe('many() with priority', () => {
  it('fires n times respecting priority order then auto-removes', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.many('count', 2, () => order.push('low'), { priority: 1 });
    spark.many('count', 2, () => order.push('high'), { priority: 10 });
    spark.on('count', () => order.push('none'));

    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3); // limited listeners should be gone

    expect(order).toEqual([
      'high', 'low', 'none', // emit 1
      'high', 'low', 'none', // emit 2
      'none',                // emit 3 — limited listeners exhausted
    ]);
  });

  it('priority many listener removed early via off()', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.many('count', 5, fn, { priority: 10 });
    spark.emit('count', 1);
    spark.off('count', fn);
    spark.emit('count', 2);

    expect(fn).toHaveBeenCalledOnce();
  });
});

// ─── many() with wildcards ─────────────────────────────────────────────────────

describe('many() with wildcard patterns', () => {
  type WildEvents = {
    'user:login': [id: string];
    'user:logout': [id: string];
    'user:profile:updated': [id: string];
  };

  it('fires n times across matching wildcard events then auto-removes', () => {
    const spark = new Spark<WildEvents>();
    const fn = vi.fn();

    spark.many('user:*', 3, fn);

    spark.emit('user:login', 'u1');
    spark.emit('user:logout', 'u2');
    spark.emit('user:login', 'u3');
    spark.emit('user:logout', 'u4'); // should NOT fire

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('many with ** wildcard fires n times across multi-segment events', () => {
    const spark = new Spark<WildEvents>();
    const fn = vi.fn();

    spark.many('user:**', 2, fn);

    spark.emit('user:login', 'u1');
    spark.emit('user:profile:updated', 'u2');
    spark.emit('user:login', 'u3'); // should NOT fire

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ─── many() logger ────────────────────────────────────────────────────────────

describe('many() logger', () => {
  it('calls logger.debug with many(n) label', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const spark = new Spark<Events>({ logger });

    spark.many('count', 3, vi.fn());

    expect(logger.debug).toHaveBeenCalledWith('[spark] many(3): count');
  });
});

// ─── many() via namespace ──────────────────────────────────────────────────────

describe('many() via createNamespace', () => {
  type AuthEvents = { login: [userId: string] };
  type AppEvents = { 'auth:login': [userId: string] };

  it('fires n times through namespace then auto-removes', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.many('login', 2, fn);

    auth.emit('login', 'u1');
    auth.emit('login', 'u2');
    auth.emit('login', 'u3'); // should NOT fire

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'u1');
    expect(fn).toHaveBeenNthCalledWith(2, 'u2');
  });
});

