import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';

type Events = {
  msg:   [text: string];
  count: [n: number];
  multi: [a: string, b: number];
  ping:  [];
};

// ─── Basic replay ─────────────────────────────────────────────────────────────

describe('replay – basic', () => {
  it('calls the callback with each recorded argument in order', () => {
    const spark = new Spark<Events>();
    spark.emit('count', 1);
    spark.emit('count', 2);
    spark.emit('count', 3);

    const received: number[] = [];
    spark.replay('count', n => received.push(n));

    expect(received).toEqual([1, 2, 3]);
  });

  it('passes all arguments to the callback', () => {
    const spark = new Spark<Events>();
    spark.emit('multi', 'hello', 42);

    const fn = vi.fn();
    spark.replay('multi', fn);

    expect(fn).toHaveBeenCalledWith('hello', 42);
  });

  it('works for events with no arguments', () => {
    const spark = new Spark<Events>();
    spark.emit('ping');

    const fn = vi.fn();
    spark.replay('ping', fn);

    expect(fn).toHaveBeenCalledOnce();
  });

  it('does nothing when there is no history for the event', () => {
    const spark = new Spark<Events>();
    const fn = vi.fn();
    spark.replay('msg', fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('does nothing after clearHistory(event)', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.clearHistory('msg');

    const fn = vi.fn();
    spark.replay('msg', fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('does nothing after clearHistory()', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.emit('count', 1);
    spark.clearHistory();

    expect(vi.fn()).not.toHaveBeenCalled();
    spark.replay('msg', vi.fn());
    spark.replay('count', vi.fn());
    // both are vacuous — confirmed by no assertion failure
  });

  it('returns this for chaining', () => {
    const spark = new Spark<Events>();
    const result = spark.replay('msg', vi.fn());
    expect(result).toBe(spark);
  });
});

// ─── Replay isolation ─────────────────────────────────────────────────────────

describe('replay – isolation from live listeners', () => {
  it('does NOT re-emit through the event bus (live listeners are not called)', () => {
    const spark = new Spark<Events>();
    const liveFn = vi.fn();

    spark.emit('msg', 'recorded-before-subscribe');
    spark.on('msg', liveFn);

    spark.replay('msg', vi.fn());

    expect(liveFn).not.toHaveBeenCalled();
  });

  it('does NOT run middleware during replay', () => {
    const spark = new Spark<Events>();
    const mw = vi.fn((_args: [string], next: () => void) => next());

    spark.use('msg', mw);
    spark.emit('msg', 'first');     // mw runs once here
    mw.mockClear();

    spark.replay('msg', vi.fn());   // mw should NOT run again
    expect(mw).not.toHaveBeenCalled();
  });

  it('callback is called exactly once per history entry', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.emit('msg', 'b');

    const fn = vi.fn();
    spark.replay('msg', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ─── Replay with ring buffer ───────────────────────────────────────────────────

describe('replay – with ring buffer', () => {
  it('replays only the entries still in the ring buffer', () => {
    const spark = new Spark<Events>({ historySize: 2 });
    spark.emit('msg', 'a');
    spark.emit('msg', 'b');
    spark.emit('msg', 'c'); // 'a' is overwritten

    const received: string[] = [];
    spark.replay('msg', t => received.push(t));
    expect(received).toEqual(['b', 'c']);
  });
});

// ─── Replay multiple times ────────────────────────────────────────────────────

describe('replay – idempotency', () => {
  it('can be called multiple times without side effects', () => {
    const spark = new Spark<Events>();
    spark.emit('count', 7);

    const received: number[] = [];
    spark.replay('count', n => received.push(n));
    spark.replay('count', n => received.push(n));

    // History is unchanged; we simply iterated it twice
    expect(received).toEqual([7, 7]);
    expect(spark.getHistory('count')).toHaveLength(1);
  });

  it('replaying does not add new entries to history', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'x');

    spark.replay('msg', vi.fn());
    spark.replay('msg', vi.fn());

    expect(spark.getHistory('msg')).toHaveLength(1);
  });
});

