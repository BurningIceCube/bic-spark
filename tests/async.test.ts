import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';

type Events = {
  save:   [payload: string];
  count:  [n: number];
  empty:  [];
};

/** Small helper to create a resolved-after-N-ms promise. */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── emitAsync – basic behaviour ──────────────────────────────────────────────

describe('emitAsync – basic', () => {
  it('resolves to true when there are listeners', async () => {
    const spark = new Spark<Events>();
    spark.on('save', vi.fn());
    await expect(spark.emitAsync('save', 'doc')).resolves.toBe(true);
  });

  it('resolves to false when there are no listeners', async () => {
    const spark = new Spark<Events>();
    await expect(spark.emitAsync('save', 'doc')).resolves.toBe(false);
  });

  it('calls the listener with the correct arguments', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();
    spark.on('save', fn);

    await spark.emitAsync('save', 'hello');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('hello');
  });

  it('works for events with no arguments', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();
    spark.on('empty', fn);

    await spark.emitAsync('empty');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('records the emission in history', async () => {
    const spark = new Spark<Events>();
    await spark.emitAsync('save', 'x');

    const history = spark.getHistory('save');
    expect(history).toHaveLength(1);
    expect(history[0].args[0]).toBe('x');
  });
});

// ─── emitAsync – async middleware ─────────────────────────────────────────────

describe('emitAsync – async middleware', () => {
  it('awaits async middleware before calling the listener', async () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.use('save', async (_args, next) => {
      await delay(5);
      order.push('mw');
      next();
    });
    spark.on('save', () => order.push('listener'));

    await spark.emitAsync('save', 'doc');
    expect(order).toEqual(['mw', 'listener']);
  });

  it('async middleware can mutate arguments', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('save', async (args, next) => {
      await delay(1);
      args[0] = args[0].toUpperCase();
      next();
    });
    spark.on('save', fn);

    await spark.emitAsync('save', 'hello');
    expect(fn).toHaveBeenCalledWith('HELLO');
  });

  it('async middleware can block the emission by not calling next()', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('save', async (_args, _next) => {
      await delay(1);
      // intentionally no next() call
    });
    spark.on('save', fn);

    const result = await spark.emitAsync('save', 'doc');
    expect(fn).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('blocked async emission is NOT recorded in history', async () => {
    const spark = new Spark<Events>();

    spark.use('save', async () => { await delay(1); /* no next */ });
    await spark.emitAsync('save', 'doc');

    expect(spark.getHistory('save')).toHaveLength(0);
  });

  it('chains multiple async middleware in order', async () => {
    const spark = new Spark<Events>();
    const order: number[] = [];

    spark.use('count', async (_args, next) => { await delay(2); order.push(1); next(); });
    spark.use('count', async (_args, next) => { await delay(1); order.push(2); next(); });
    spark.use('count', (_args, next)        => { order.push(3); next(); });

    spark.on('count', () => order.push(4));
    await spark.emitAsync('count', 0);

    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('mixed sync and async middleware chain works correctly', async () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.use('save', (_args, next) => { order.push('sync-mw'); next(); });
    spark.use('save', async (_args, next) => { await delay(2); order.push('async-mw'); next(); });
    spark.on('save', () => order.push('listener'));

    await spark.emitAsync('save', 'x');
    expect(order).toEqual(['sync-mw', 'async-mw', 'listener']);
  });

  it('first blocking middleware stops the rest of the chain', async () => {
    const spark = new Spark<Events>();
    const second = vi.fn();
    const listener = vi.fn();

    spark.use('save', async () => { await delay(1); /* blocked */ });
    spark.use('save', second);
    spark.on('save', listener);

    await spark.emitAsync('save', 'doc');

    expect(second).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});

// ─── emitAsync – sync middleware compatibility ────────────────────────────────

describe('emitAsync – sync middleware via emitAsync', () => {
  it('sync middleware registered with use() works fine with emitAsync', async () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('save', (args, next) => { args[0] += '!'; next(); });
    spark.on('save', fn);

    await spark.emitAsync('save', 'hi');
    expect(fn).toHaveBeenCalledWith('hi!');
  });
});

// ─── emit (sync) ignores returned Promises ────────────────────────────────────

describe('sync emit with async middleware (fire-and-forget behaviour)', () => {
  it('sync emit returns immediately without awaiting async middleware', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    // This middleware is async so next() is never called synchronously
    spark.use('save', async (_args, next) => {
      await delay(50);
      next();
    });
    spark.on('save', fn);

    // Sync emit: returns immediately, promise from middleware ignored
    spark.emit('save', 'doc');

    // Listener was NOT called because next() hasn't fired yet
    expect(fn).not.toHaveBeenCalled();
  });
});

