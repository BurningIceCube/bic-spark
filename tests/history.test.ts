import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';

type Events = {
  click:  [x: number, y: number];
  msg:    [text: string];
  ping:   [];
};

// ─── Basic recording ──────────────────────────────────────────────────────────

describe('history – recording', () => {
  it('records args and event name for every emission', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'hello');

    const [rec] = spark.getHistory('msg');
    expect(rec.event).toBe('msg');
    expect(rec.args).toEqual(['hello']);
  });

  it('records a timestamp close to Date.now()', () => {
    const spark = new Spark<Events>();
    const before = Date.now();
    spark.emit('ping');
    const after = Date.now();

    const [rec] = spark.getHistory('ping');
    expect(rec.timestamp).toBeGreaterThanOrEqual(before);
    expect(rec.timestamp).toBeLessThanOrEqual(after);
  });

  it('records multiple arguments correctly', () => {
    const spark = new Spark<Events>();
    spark.emit('click', 10, 20);

    const [rec] = spark.getHistory('click');
    expect(rec.args).toEqual([10, 20]);
  });

  it('records events without arguments', () => {
    const spark = new Spark<Events>();
    spark.emit('ping');

    const [rec] = spark.getHistory('ping');
    expect(rec.args).toEqual([]);
  });

  it('records multiple emissions in insertion order', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.emit('msg', 'b');
    spark.emit('msg', 'c');

    const texts = spark.getHistory('msg').map(r => r.args[0]);
    expect(texts).toEqual(['a', 'b', 'c']);
  });

  it('keeps history per-event independently', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'x');
    spark.emit('ping');
    spark.emit('click', 1, 2);

    expect(spark.getHistory('msg')).toHaveLength(1);
    expect(spark.getHistory('ping')).toHaveLength(1);
    expect(spark.getHistory('click')).toHaveLength(1);
  });

  it('returns an empty array before the first emission', () => {
    const spark = new Spark<Events>();
    expect(spark.getHistory('msg')).toEqual([]);
  });

  it('does NOT require a listener to record history', () => {
    const spark = new Spark<Events>();
    // no listeners attached
    spark.emit('msg', 'no-listener');
    expect(spark.getHistory('msg')).toHaveLength(1);
  });
});

// ─── Ring-buffer / capacity ───────────────────────────────────────────────────

describe('history – ring buffer capacity', () => {
  it('keeps at most historySize entries', () => {
    const spark = new Spark<Events>({ historySize: 4 });
    for (let i = 0; i < 10; i++) spark.emit('msg', String(i));

    expect(spark.getHistory('msg')).toHaveLength(4);
  });

  it('returns the NEWEST N entries when the buffer wraps', () => {
    const spark = new Spark<Events>({ historySize: 3 });
    ['a', 'b', 'c', 'd', 'e'].forEach(t => spark.emit('msg', t));

    const texts = spark.getHistory('msg').map(r => r.args[0]);
    expect(texts).toEqual(['c', 'd', 'e']);
  });

  it('oldest entry is in position 0 (insertion order)', () => {
    const spark = new Spark<Events>({ historySize: 2 });
    spark.emit('msg', 'first');
    spark.emit('msg', 'second');
    spark.emit('msg', 'third');

    const [oldest, newest] = spark.getHistory('msg');
    expect(oldest.args[0]).toBe('second');
    expect(newest.args[0]).toBe('third');
  });

  it('defaults to historySize 50', () => {
    const spark = new Spark<Events>();
    for (let i = 0; i < 60; i++) spark.emit('msg', String(i));

    expect(spark.getHistory('msg')).toHaveLength(50);
  });

  it('capacity=1 always returns only the last emission', () => {
    const spark = new Spark<Events>({ historySize: 1 });
    spark.emit('msg', 'old');
    spark.emit('msg', 'new');

    const history = spark.getHistory('msg');
    expect(history).toHaveLength(1);
    expect(history[0].args[0]).toBe('new');
  });
});

// ─── Middleware interaction ────────────────────────────────────────────────────

describe('history – middleware interaction', () => {
  it('records the mutated args, not the original', () => {
    const spark = new Spark<Events>();
    spark.use('msg', (args, next) => { args[0] = args[0].toUpperCase(); next(); });
    spark.emit('msg', 'hello');

    expect(spark.getHistory('msg')[0].args[0]).toBe('HELLO');
  });

  it('does NOT record blocked emissions', () => {
    const spark = new Spark<Events>();
    spark.use('msg', () => { /* blocked */ });
    spark.emit('msg', 'secret');

    expect(spark.getHistory('msg')).toHaveLength(0);
  });

  it('records only the emissions that pass through middleware', () => {
    const spark = new Spark<Events>();
    let allow = true;
    spark.use('msg', (args, next) => { if (allow) next(); });

    spark.emit('msg', 'pass');
    allow = false;
    spark.emit('msg', 'block');
    spark.emit('msg', 'block-too');

    const history = spark.getHistory('msg');
    expect(history).toHaveLength(1);
    expect(history[0].args[0]).toBe('pass');
  });
});

// ─── clearHistory ─────────────────────────────────────────────────────────────

describe('history – clearHistory', () => {
  it('clearHistory(event) sets that event to empty', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.clearHistory('msg');
    expect(spark.getHistory('msg')).toHaveLength(0);
  });

  it('clearHistory(event) leaves other events intact', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.emit('ping');
    spark.clearHistory('msg');

    expect(spark.getHistory('msg')).toHaveLength(0);
    expect(spark.getHistory('ping')).toHaveLength(1);
  });

  it('clearHistory() empties all event histories', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'a');
    spark.emit('ping');
    spark.emit('click', 1, 2);
    spark.clearHistory();

    expect(spark.getHistory('msg')).toHaveLength(0);
    expect(spark.getHistory('ping')).toHaveLength(0);
    expect(spark.getHistory('click')).toHaveLength(0);
  });

  it('new emissions after clear are recorded from scratch', () => {
    const spark = new Spark<Events>();
    spark.emit('msg', 'old');
    spark.clearHistory('msg');
    spark.emit('msg', 'new');

    const history = spark.getHistory('msg');
    expect(history).toHaveLength(1);
    expect(history[0].args[0]).toBe('new');
  });

  it('clearing a non-emitted event is a no-op', () => {
    const spark = new Spark<Events>();
    expect(() => spark.clearHistory('msg')).not.toThrow();
    expect(spark.getHistory('msg')).toHaveLength(0);
  });
});

