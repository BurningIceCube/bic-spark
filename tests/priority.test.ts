import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';

// ─── Shared event map ──────────────────────────────────────────────────────────

type Events = {
  greet: [name: string];
  count: [n: number];
  empty: [];
};

// ─── Basic priority ordering ──────────────────────────────────────────────────

describe('priority listeners — ordering', () => {
  it('higher priority listener is called before a lower priority listener', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet', () => order.push('low'),  { priority: 1  });
    spark.on('greet', () => order.push('high'), { priority: 10 });

    spark.emit('greet', 'Alice');

    expect(order).toEqual(['high', 'low']);
  });

  it('listeners with the same priority are called in registration order', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet', () => order.push('first'),  { priority: 5 });
    spark.on('greet', () => order.push('second'), { priority: 5 });
    spark.on('greet', () => order.push('third'),  { priority: 5 });

    spark.emit('greet', 'Bob');

    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('negative priority is called after zero-priority listeners', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet', () => order.push('zero'), { priority: 0  });
    spark.on('greet', () => order.push('neg'),  { priority: -1 });

    spark.emit('greet', 'Carol');

    expect(order).toEqual(['zero', 'neg']);
  });

  it('priority listeners fire before non-priority (plain on()) listeners', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet', () => order.push('plain'));
    spark.on('greet', () => order.push('priority'), { priority: 1 });

    spark.emit('greet', 'Dave');

    expect(order).toEqual(['priority', 'plain']);
  });

  it('mixed priorities + plain listeners are all called in the correct order', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('count', () => order.push('plain-1'));
    spark.on('count', () => order.push('p5'),     { priority: 5  });
    spark.on('count', () => order.push('p10'),    { priority: 10 });
    spark.on('count', () => order.push('plain-2'));
    spark.on('count', () => order.push('p5-b'),   { priority: 5  });

    spark.emit('count', 1);

    // p10 first, then p5/p5-b in registration order, then the two plain listeners
    expect(order).toEqual(['p10', 'p5', 'p5-b', 'plain-1', 'plain-2']);
  });
});

// ─── Priority + once ──────────────────────────────────────────────────────────

describe('priority listeners — once', () => {
  it('once with priority fires exactly once and then removes itself', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.once('count', fn, { priority: 10 });
    spark.emit('count', 1);
    spark.emit('count', 2);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('once with priority respects ordering relative to other priority listeners', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet',   () => order.push('persistent'), { priority: 5  });
    spark.once('greet', () => order.push('once'),        { priority: 10 });

    spark.emit('greet', 'Eve');

    expect(order).toEqual(['once', 'persistent']);
  });

  it('after once fires, listenerCount reflects the removal', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.once('count', fn, { priority: 10 });
    expect(spark.listenerCount('count')).toBe(1);

    spark.emit('count', 1);
    expect(spark.listenerCount('count')).toBe(0);
  });

  it('multiple once listeners at different priorities each fire once', () => {
    const spark = new Spark<Events>();
    const high = vi.fn();
    const low  = vi.fn();

    spark.once('count', high, { priority: 10 });
    spark.once('count', low,  { priority: 1  });

    spark.emit('count', 42);
    spark.emit('count', 43);

    expect(high).toHaveBeenCalledOnce();
    expect(low).toHaveBeenCalledOnce();
    expect(high).toHaveBeenCalledWith(42);
    expect(low).toHaveBeenCalledWith(42);
  });
});

// ─── Priority + off / removeAllListeners ─────────────────────────────────────

describe('priority listeners — removal', () => {
  it('off() removes a priority listener so it is no longer called', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn, { priority: 10 });
    spark.off('greet', fn);
    spark.emit('greet', 'Frank');

    expect(fn).not.toHaveBeenCalled();
  });

  it('off() only removes the target listener, leaving others intact', () => {
    const spark = new Spark<Events>();
    const a = vi.fn();
    const b = vi.fn();

    spark.on('greet', a, { priority: 10 });
    spark.on('greet', b, { priority: 5  });
    spark.off('greet', a);
    spark.emit('greet', 'Grace');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('removeAllListeners(event) removes all priority listeners for that event', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn, { priority: 10 });
    spark.on('greet', fn, { priority: 5  });
    spark.removeAllListeners('greet');
    spark.emit('greet', 'Hank');

    expect(fn).not.toHaveBeenCalled();
    expect(spark.listenerCount('greet')).toBe(0);
  });

  it('removeAllListeners() (no args) clears priority listeners for all events', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.on('greet', fn, { priority: 10 });
    spark.on('count', fn, { priority: 10 });
    spark.removeAllListeners();

    spark.emit('greet', 'Ivan');
    spark.emit('count', 1);

    expect(fn).not.toHaveBeenCalled();
  });
});

// ─── Priority + listenerCount ─────────────────────────────────────────────────

describe('priority listeners — listenerCount', () => {
  it('counts priority listeners alongside plain listeners', () => {
    const spark = new Spark<Events>();

    spark.on('greet', vi.fn());
    spark.on('greet', vi.fn(), { priority: 10 });
    spark.on('greet', vi.fn(), { priority: 5  });

    expect(spark.listenerCount('greet')).toBe(3);
  });

  it('returns 0 when there are no listeners at all', () => {
    const spark = new Spark<Events>();
    expect(spark.listenerCount('greet')).toBe(0);
  });
});

// ─── Priority + emit return value ─────────────────────────────────────────────

describe('priority listeners — emit return value', () => {
  it('emit returns true when only priority listeners are registered', () => {
    const spark = new Spark<Events>();
    spark.on('count', vi.fn(), { priority: 10 });
    expect(spark.emit('count', 1)).toBe(true);
  });

  it('emit returns false when no listeners are registered (priority or plain)', () => {
    const spark = new Spark<Events>();
    expect(spark.emit('count', 1)).toBe(false);
  });
});

// ─── Priority + middleware ─────────────────────────────────────────────────────

describe('priority listeners — middleware interaction', () => {
  it('middleware runs before priority listeners', () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.use('greet', (_args, next) => { order.push('middleware'); next(); });
    spark.on('greet', () => order.push('priority'), { priority: 10 });

    spark.emit('greet', 'Jane');

    expect(order).toEqual(['middleware', 'priority']);
  });

  it('blocked middleware prevents priority listeners from firing', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', () => { /* intentionally blocked — no next() */ });
    spark.on('greet', fn, { priority: 10 });

    const result = spark.emit('greet', 'Karl');

    expect(fn).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('middleware can mutate args seen by priority listeners', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();

    spark.use('greet', (args, next) => { args[0] = args[0].toUpperCase(); next(); });
    spark.on('greet', fn, { priority: 10 });

    spark.emit('greet', 'hello');

    expect(fn).toHaveBeenCalledWith('HELLO');
  });
});

// ─── Priority + history ───────────────────────────────────────────────────────

describe('priority listeners — history', () => {
  it('emits to priority listeners are recorded in history', () => {
    const spark = new Spark<Events>();
    spark.on('count', vi.fn(), { priority: 10 });

    spark.emit('count', 7);
    spark.emit('count', 8);

    const history = spark.getHistory('count');
    expect(history).toHaveLength(2);
    expect(history.map(r => r.args[0])).toEqual([7, 8]);
  });
});

// ─── Priority + emitAsync ─────────────────────────────────────────────────────

describe('priority listeners — emitAsync', () => {
  it('emitAsync fires priority listeners in the correct order', async () => {
    const spark = new Spark<Events>();
    const order: string[] = [];

    spark.on('greet', () => order.push('low'),  { priority: 1  });
    spark.on('greet', () => order.push('high'), { priority: 10 });

    await spark.emitAsync('greet', 'Laura');

    expect(order).toEqual(['high', 'low']);
  });

  it('emitAsync returns true when only priority listeners are registered', async () => {
    const spark = new Spark<Events>();
    spark.on('count', vi.fn(), { priority: 10 });
    expect(await spark.emitAsync('count', 1)).toBe(true);
  });
});

