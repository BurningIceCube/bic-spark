import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';
import type { SparkLogger } from '../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Events = {
  greet: [name: string];
  count: [n: number];
  empty: [];
};

function makeLogger(): SparkLogger {
  return {
    debug: vi.fn(),
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
  };
}

// ─── on ───────────────────────────────────────────────────────────────────────

describe('logger – on()', () => {
  it('calls logger.debug with "[spark] on: <event>" when a listener is registered', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.on('greet', vi.fn());

    expect(logger.debug).toHaveBeenCalledWith('[spark] on: greet');
  });

  it('logs once per on() call', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.on('greet', vi.fn());
    spark.on('greet', vi.fn());

    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  it('logs the correct event name for different events', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.on('greet', vi.fn());
    spark.on('count', vi.fn());

    expect(logger.debug).toHaveBeenCalledWith('[spark] on: greet');
    expect(logger.debug).toHaveBeenCalledWith('[spark] on: count');
  });
});

// ─── once ─────────────────────────────────────────────────────────────────────

describe('logger – once()', () => {
  it('calls logger.debug with "[spark] once: <event>"', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.once('greet', vi.fn());

    expect(logger.debug).toHaveBeenCalledWith('[spark] once: greet');
  });

  it('logs once per once() call', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.once('count', vi.fn());
    spark.once('count', vi.fn());

    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenNthCalledWith(1, '[spark] once: count');
    expect(logger.debug).toHaveBeenNthCalledWith(2, '[spark] once: count');
  });
});

// ─── off ──────────────────────────────────────────────────────────────────────

describe('logger – off()', () => {
  it('calls logger.debug with "[spark] off: <event>"', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });
    const fn = vi.fn();

    spark.on('greet', fn);
    vi.clearAllMocks(); // reset after on()

    spark.off('greet', fn);

    expect(logger.debug).toHaveBeenCalledWith('[spark] off: greet');
  });

  it('logs once per off() call', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });
    const fn = vi.fn();

    spark.on('greet', fn);
    spark.on('count', fn);
    vi.clearAllMocks();

    spark.off('greet', fn);
    spark.off('count', fn);

    expect(logger.debug).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith('[spark] off: greet');
    expect(logger.debug).toHaveBeenCalledWith('[spark] off: count');
  });
});

// ─── emit ─────────────────────────────────────────────────────────────────────

describe('logger – emit()', () => {
  it('calls logger.debug with "[spark] emit: <event>" after middleware passes', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.on('greet', vi.fn());
    vi.clearAllMocks();

    spark.emit('greet', 'Alice');

    expect(logger.debug).toHaveBeenCalledWith('[spark] emit: greet');
  });

  it('logs once per successful emit()', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3);

    expect(logger.debug).toHaveBeenCalledTimes(3);
    expect(logger.debug).toHaveBeenCalledWith('[spark] emit: count');
  });

  it('does NOT log when middleware blocks the emission', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.use('greet', () => { /* blocked – no next() */ });
    spark.emit('greet', 'Bob');

    expect(logger.debug).not.toHaveBeenCalledWith('[spark] emit: greet');
  });

  it('logs emit even when there are no listeners', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.emit('greet', 'Carol');

    expect(logger.debug).toHaveBeenCalledWith('[spark] emit: greet');
  });

  it('logs emit for events with no arguments', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.emit('empty');

    expect(logger.debug).toHaveBeenCalledWith('[spark] emit: empty');
  });
});

// ─── emitAsync ────────────────────────────────────────────────────────────────

describe('logger – emitAsync()', () => {
  it('calls logger.debug with "[spark] emit: <event>" after async middleware passes', async () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.use('count', async (_args, next) => {
      await Promise.resolve();
      next();
    });
    spark.on('count', vi.fn());

    await spark.emitAsync('count', 42);

    expect(logger.debug).toHaveBeenCalledWith('[spark] emit: count');
  });

  it('does NOT log when async middleware blocks the emission', async () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.use('count', async () => { /* no next() */ });

    await spark.emitAsync('count', 42);

    expect(logger.debug).not.toHaveBeenCalledWith('[spark] emit: count');
  });
});

// ─── Operations that do NOT log ───────────────────────────────────────────────

describe('logger – operations that do not trigger debug logs', () => {
  it('removeAllListeners does not call logger', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.on('greet', vi.fn());
    vi.clearAllMocks();

    spark.removeAllListeners('greet');
    spark.removeAllListeners();

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('use() does not call logger', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.use('greet', (_args, next) => next());

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('getHistory() does not call logger', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.emit('greet', 'Dave');
    vi.clearAllMocks();

    spark.getHistory('greet');

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('clearHistory() does not call logger', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.emit('greet', 'Eve');
    vi.clearAllMocks();

    spark.clearHistory('greet');
    spark.clearHistory();

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('replay() does not call logger', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });

    spark.emit('greet', 'Frank');
    vi.clearAllMocks();

    spark.replay('greet', vi.fn());

    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('info / warn / error methods on the logger are never called by Spark itself', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });
    const fn = vi.fn();

    spark.on('greet', fn);
    spark.once('greet', fn);
    spark.emit('greet', 'Grace');
    spark.off('greet', fn);
    spark.replay('greet', vi.fn());
    spark.getHistory('greet');
    spark.clearHistory();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// ─── No logger (no-op) ────────────────────────────────────────────────────────

describe('logger – no logger provided', () => {
  it('does not throw when no logger is passed', () => {
    const spark = new Spark<Events>(); // no logger option

    expect(() => {
      spark.on('greet', vi.fn());
      spark.once('count', vi.fn());
      spark.emit('greet', 'Henry');
      spark.off('greet', vi.fn());
    }).not.toThrow();
  });

  it('still emits events correctly without a logger', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn);
    spark.emit('greet', 'Ivy');

    expect(fn).toHaveBeenCalledWith('Ivy');
  });
});

// ─── Chained call logging order ───────────────────────────────────────────────

describe('logger – chained call order', () => {
  it('logs on → once → emit → off in the correct sequence', () => {
    const logger = makeLogger();
    const spark = new Spark<Events>({ logger });
    const fn = vi.fn();

    spark.on('greet', fn);
    spark.once('greet', fn);
    spark.emit('greet', 'Jack');
    spark.off('greet', fn);

    const calls = vi.mocked(logger.debug).mock.calls.map(([msg]) => msg);
    expect(calls).toEqual([
      '[spark] on: greet',
      '[spark] once: greet',
      '[spark] emit: greet',
      '[spark] off: greet',
    ]);
  });
});

