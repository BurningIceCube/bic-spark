import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/index.js';

type Events = {
  'user:login': [userId: string];
  'user:logout': [userId: string];
  'order:created': [orderId: string];
  'user:*': [any];
};

describe('Wildcard subscriptions', () => {
  it('matches events with the given prefix', () => {
    const spark = new Spark<Events>();
    const handler = vi.fn();

    spark.on('user:*', handler);
    spark.emit('user:login', 'u-1');
    spark.emit('user:logout', 'u-2');

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith('u-1');
    expect(handler).toHaveBeenCalledWith('u-2');
  });

  it('does not match events that do not share the prefix', () => {
    const spark = new Spark<Events>();
    const handler = vi.fn();

    spark.on('user:*', handler);
    spark.emit('order:created', 'o-1');

    expect(handler).not.toHaveBeenCalled();
  });

  it('once wildcard fires only once', () => {
    const spark = new Spark<Events>();
    const handler = vi.fn();

    spark.once('user:*', handler);
    spark.emit('user:login', 'u-1');
    spark.emit('user:logout', 'u-2');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('u-1');
  });

  it('off removes the wildcard listener', () => {
    const spark = new Spark<Events>();
    const handler = vi.fn();

    spark.on('user:*', handler);
    spark.off('user:*', handler);
    spark.emit('user:login', 'u-1');

    expect(handler).not.toHaveBeenCalled();
  });

  it('removeAllListeners() clears wildcard listeners', () => {
    const spark = new Spark<Events>();
    const handler = vi.fn();

    spark.on('user:*', handler);
    spark.removeAllListeners();
    spark.emit('user:login', 'u-1');

    expect(handler).not.toHaveBeenCalled();
  });

  it('emit returns true when only wildcard listener matches', () => {
    const spark = new Spark<Events>();
    spark.on('user:*', () => {});

    expect(spark.emit('user:login', 'u-1')).toBe(true);
  });

  it('works with emitAsync', async () => {
    const spark = new Spark<Events>();
    const handler = vi.fn();

    spark.on('user:*', handler);
    const result = await spark.emitAsync('user:login', 'u-1');

    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledWith('u-1');
  });
});
