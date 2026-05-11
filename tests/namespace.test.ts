import { describe, it, expect, vi } from 'vitest';
import { Spark } from '../src/TypedEmitter.js';
import { createNamespace } from '../src/namespace.js';

// ─── Shared types ─────────────────────────────────────────────────────────────

type AuthEvents  = { login: [userId: string]; logout: [userId: string]; };
type StoreEvents = { set: [key: string, value: number]; clear: []; };

type AppEvents = {
  'auth:login':   [userId: string];
  'auth:logout':  [userId: string];
  'store:set':    [key: string, value: number];
  'store:clear':  [];
};

// ─── Routing ──────────────────────────────────────────────────────────────────

describe('namespace – routing', () => {
  it('prefixes the event name on the parent spark', () => {
    const spark = new Spark<AppEvents>();
    const parentFn = vi.fn();
    spark.on('auth:login', parentFn);

    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.emit('login', 'u-1');

    expect(parentFn).toHaveBeenCalledWith('u-1');
  });

  it('exposes the prefix string', () => {
    const spark = new Spark<AppEvents>();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    expect(auth.prefix).toBe('auth');
  });

  it('on() attaches a listener that fires via emit()', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.on('login', fn);
    auth.emit('login', 'u-2');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('u-2');
  });

  it('off() removes the listener', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.on('login', fn);
    auth.off('login', fn);
    auth.emit('login', 'u-3');

    expect(fn).not.toHaveBeenCalled();
  });

  it('once() fires exactly once', () => {
    const spark = new Spark<AppEvents>();
    const fn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.once('login', fn);
    auth.emit('login', 'u-4');
    auth.emit('login', 'u-5');

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('u-4');
  });

  it('emit() returns true when listeners are present, false otherwise', () => {
    const spark = new Spark<AppEvents>();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    expect(auth.emit('login', 'x')).toBe(false);

    auth.on('login', vi.fn());
    expect(auth.emit('login', 'x')).toBe(true);
  });
});

// ─── Two namespaces on the same parent ────────────────────────────────────────

describe('namespace – multiple namespaces on one Spark', () => {
  it('two namespaces are fully isolated from each other', () => {
    const spark = new Spark<AppEvents>();
    const authFn  = vi.fn();
    const storeFn = vi.fn();

    const auth  = createNamespace<AuthEvents,  'auth'>(spark, 'auth');
    const store = createNamespace<StoreEvents, 'store'>(spark, 'store');

    auth.on('login', authFn);
    store.on('set', storeFn);

    auth.emit('login', 'u-10');
    store.emit('set', 'k', 99);

    expect(authFn).toHaveBeenCalledWith('u-10');
    expect(storeFn).toHaveBeenCalledWith('k', 99);

    // cross-fire check
    expect(authFn).toHaveBeenCalledTimes(1);
    expect(storeFn).toHaveBeenCalledTimes(1);
  });

  it('history is isolated per namespace', () => {
    const spark = new Spark<AppEvents>();
    const auth  = createNamespace<AuthEvents,  'auth'>(spark, 'auth');
    const store = createNamespace<StoreEvents, 'store'>(spark, 'store');

    auth.emit('login', 'u-a');
    store.emit('set', 'x', 1);

    expect(auth.getHistory('login')).toHaveLength(1);
    expect(store.getHistory('set')).toHaveLength(1);
    // make sure there's no cross-contamination via parent
    expect(auth.getHistory('login')[0].args[0]).toBe('u-a');
  });
});

// ─── History & Replay via namespace ───────────────────────────────────────────

describe('namespace – history', () => {
  it('getHistory returns records for the prefixed event', () => {
    const spark = new Spark<AppEvents>();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.emit('login', 'u-20');
    auth.emit('login', 'u-21');

    const history = auth.getHistory('login');
    expect(history).toHaveLength(2);
    expect(history[0].args[0]).toBe('u-20');
    expect(history[1].args[0]).toBe('u-21');
  });

  it('history event name uses the prefixed key', () => {
    const spark = new Spark<AppEvents>();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.emit('login', 'u-30');
    const [rec] = auth.getHistory('login');
    expect(rec.event).toBe('auth:login');
  });
});

describe('namespace – replay', () => {
  it('replays all past emissions to a callback in order', () => {
    const spark = new Spark<AppEvents>();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.emit('login', 'u-40');
    auth.emit('login', 'u-41');

    const ids: string[] = [];
    auth.replay('login', id => ids.push(id));
    expect(ids).toEqual(['u-40', 'u-41']);
  });

  it('replay does not invoke live listeners', () => {
    const spark = new Spark<AppEvents>();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    const live  = vi.fn();

    auth.emit('login', 'u-50');
    auth.on('login', live);
    auth.replay('login', vi.fn());

    expect(live).not.toHaveBeenCalled();
  });
});

// ─── Middleware via namespace ──────────────────────────────────────────────────

describe('namespace – middleware', () => {
  it('use() runs middleware before the listener', () => {
    const spark = new Spark<AppEvents>();
    const fn    = vi.fn();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.use('login', (args, next) => { args[0] = args[0].toUpperCase(); next(); });
    auth.on('login', fn);
    auth.emit('login', 'u-60');

    expect(fn).toHaveBeenCalledWith('U-60');
  });

  it('middleware can block emission', () => {
    const spark = new Spark<AppEvents>();
    const fn    = vi.fn();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.use('login', () => { /* blocked */ });
    auth.on('login', fn);
    const result = auth.emit('login', 'blocked');

    expect(fn).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('namespace middleware does not affect unrelated events on parent', () => {
    const spark = new Spark<AppEvents>();
    const logoutFn = vi.fn();
    const auth = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    // block login only
    auth.use('login', () => { /* blocked */ });
    auth.on('login',  vi.fn());
    auth.on('logout', logoutFn);

    auth.emit('login',  'u-70');
    auth.emit('logout', 'u-70');

    expect(logoutFn).toHaveBeenCalledWith('u-70');
  });
});

// ─── emitAsync via namespace ───────────────────────────────────────────────────

describe('namespace – emitAsync', () => {
  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  it('resolves after async middleware completes', async () => {
    const spark = new Spark<AppEvents>();
    const fn    = vi.fn();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

    auth.use('login', async (args, next) => {
      await delay(5);
      args[0] = 'async-' + args[0];
      next();
    });
    auth.on('login', fn);

    await auth.emitAsync('login', 'u-80');
    expect(fn).toHaveBeenCalledWith('async-u-80');
  });

  it('resolves to false when blocked by async middleware', async () => {
    const spark = new Spark<AppEvents>();
    const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');
    auth.use('login', async () => { await delay(1); /* no next */ });
    auth.on('login', vi.fn());

    const result = await auth.emitAsync('login', 'u-90');
    expect(result).toBe(false);
  });
});
