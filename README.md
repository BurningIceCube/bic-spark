# bic-spark

> A typed [EventEmitter3](https://github.com/primus/eventemitter3) wrapper that adds **history**, **replay**, **middleware**, **namespacing**, and **logging** — with full TypeScript inference.

---

## Installation

```bash
pnpm add bic-spark
```

---

## Quick start

```ts
import { Spark } from 'bic-spark';

type Events = {
  'user:login':  [userId: string];
  'user:logout': [userId: string];
  'error':       [err: Error];
};

const spark = new Spark<Events>({ historySize: 100 });

spark.on('user:login', id => console.log('logged in', id));
spark.emit('user:login', 'u-42');
```

---

## API

### `new Spark<TEvents>(options?)`

Creates a new emitter.

| Option        | Type          | Default     | Description                                                                 |
|---------------|---------------|-------------|-----------------------------------------------------------------------------|
| `historySize` | `number`      | `50`        | Max events kept per event name (ring buffer — oldest overwritten when full) |
| `logger`      | `SparkLogger` | `undefined` | Any `console`-compatible logger. Calls `logger.debug('[spark] <method>: <event>')` on `on`, `once`, `off`, and `emit` / `emitAsync`. |

```ts
import { Spark } from 'bic-spark';
import type { SparkLogger } from 'bic-spark';

const spark = new Spark<Events>({
  historySize: 200,
  logger: console,   // or a LogLayer instance, pino, winston, etc.
});

// Every call produces a debug line such as:
// [spark] on: user:login
// [spark] emit: user:login
```

---

### Subscribing

#### `.on(event, listener) → this`

Register a persistent listener.

```ts
spark.on('user:login', id => console.log(id));
```

#### `.once(event, listener) → this`

Register a listener that fires **once** and then removes itself.

```ts
spark.once('user:login', id => console.log('first login:', id));
```

#### `.off(event, listener) → this`

Remove a previously registered listener.

```ts
const handler = (id: string) => {};
spark.on('user:login', handler);
spark.off('user:login', handler);
```

#### `.removeAllListeners(event?) → this`

Remove all listeners for one event, or every listener when called without an argument.

```ts
spark.removeAllListeners('user:login');
spark.removeAllListeners(); // all events
```

#### `.listenerCount(event) → number`

```ts
spark.listenerCount('user:login'); // 0
```

> **Note on prepend methods:** `prependListener` and `prependOnceListener` are not exposed by `Spark`. Listener ordering is append-only (first registered, first called). If you need a listener to run first, register it before all others.

---

### Emitting

#### `.emit(event, ...args) → boolean`

Emit an event. The call passes through the middleware chain first.

- Returns `true` if at least one listener was notified.  
- Returns `false` if middleware blocked the emission **or** there were no listeners.
- The event is recorded in history **only** when the middleware chain completes.

```ts
spark.emit('user:login', 'u-42');
```

---

### Async emitting

#### `.emitAsync(event, ...args) → Promise<boolean>`

Async variant of `emit`. Runs the middleware chain sequentially, **awaiting** any middleware that returns a `Promise`. Listeners are still called synchronously via EventEmitter3 after the chain resolves.

- Returns `true` if at least one listener was notified.
- Returns `false` if middleware blocked the emission **or** there were no listeners.
- The event is recorded in history **only** when the middleware chain completes.

```ts
spark.use('save', async (args, next) => {
  await db.validate(args[0]);
  next();
});

const notified = await spark.emitAsync('save', payload);
```

---

### Middleware

#### `.use(event, middleware) → this`

Register middleware for an event. Middleware functions run in registration order **before** listeners are notified.

```ts
// Signature
type Middleware<TArgs extends any[]> = (args: TArgs, next: () => void) => void | Promise<void>;
```

> **Sync middleware**: call `next()` and return `void`.  
> **Async middleware**: return a `Promise<void>` and call `next()` inside it — only honoured by `emitAsync`; sync `emit` ignores the returned Promise.

- Call `next()` to continue the chain.
- Omit `next()` to **cancel** the emission (listener is not called, event is not recorded in history).
- Mutate `args` in-place to transform the payload before it reaches listeners.

```ts
// Transform
spark.use('user:login', (args, next) => {
  args[0] = args[0].trim().toLowerCase();
  next();
});

// Guard / block
spark.use('user:login', (args, next) => {
  if (!args[0]) return; // swallowed — no next() call
  next();
});

// Chain order: mw1 → mw2 → listener
spark.use('user:login', (args, next) => { console.log('mw1'); next(); });
spark.use('user:login', (args, next) => { console.log('mw2'); next(); });
```

---

### History

Every successfully emitted event is stored in a per-event ring buffer.

#### `.getHistory(event) → EventRecord<TArgs>[]`

Returns all stored records for an event in insertion order (oldest first).

```ts
type EventRecord<TArgs> = {
  event:     string;   // event name
  args:      TArgs;    // emitted arguments
  timestamp: number;   // Date.now() at emission time
};

const records = spark.getHistory('user:login');
// [{ event: 'user:login', args: ['u-42'], timestamp: 1715... }, ...]
```

#### `.clearHistory(event?) → this`

Clear history for one event, or all history when called without an argument.

```ts
spark.clearHistory('user:login');
spark.clearHistory(); // all events
```

---

### Replay

#### `.replay(event, listener) → this`

Invoke a callback with every recorded emission for an event — in order, **without** re-running middleware or notifying live listeners.

```ts
// Catch up a late subscriber
spark.replay('user:login', id => console.log('past login:', id));
```

---

### Namespaces

#### `createNamespace<TEvents, TPrefix>(spark, prefix) → NamespacedSpark<TEvents>`

Creates a lightweight, prefixed view over an existing `Spark` instance. All event names are stored on the parent as `"<prefix>:<event>"`.

```ts
import { Spark, createNamespace } from 'bic-spark';

type AuthEvents = {
  login:  [userId: string];
  logout: [userId: string];
};

// Parent event map must include the prefixed keys
type AppEvents = {
  'auth:login':  [userId: string];
  'auth:logout': [userId: string];
};

const spark = new Spark<AppEvents>();
const auth  = createNamespace<AuthEvents, 'auth'>(spark, 'auth');

auth.on('login', id => console.log('login', id));
auth.emit('login', 'u-42');            // → parent emits 'auth:login'

auth.use('login', (args, next) => {    // middleware on 'auth:login'
  args[0] = args[0].toUpperCase();
  next();
});

auth.getHistory('login');              // history of 'auth:login'
auth.replay('login', handler);
auth.prefix; // 'auth'
```

`NamespacedSpark` exposes the same `on`, `once`, `off`, `emit`, `emitAsync`, `use`, `getHistory`, and `replay` methods — all scoped to the prefix.

---

### `RingBuffer<T>`

The underlying fixed-capacity circular buffer is also exported for standalone use.

```ts
import { RingBuffer } from 'bic-spark';

const buf = new RingBuffer<number>(3);
buf.push(1); buf.push(2); buf.push(3); buf.push(4);
buf.toArray(); // [2, 3, 4]
buf.size();    // 3
buf.clear();
```

---

## Error handling

Spark has no internal `try/catch`. All errors propagate to the caller. The table below shows the exact behaviour for each failure mode — all verified by the test suite.

| Scenario                                 | Method                   | Behaviour                                                                                                                                                                                                          |
|------------------------------------------|--------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Sync middleware throws                   | `emit()`                 | Exception propagates **synchronously** to the `emit()` caller. History is **not** recorded (chain never completed).                                                                                                |
| Async middleware rejects                 | `emitAsync()`            | The returned `Promise` **rejects** with the error. History is **not** recorded.                                                                                                                                    |
| Async middleware used with sync `emit()` | `emit()`                 | Does **not** throw synchronously. The returned `Promise` is silently ignored by `emit()`, producing an **unhandled Promise rejection** in Node.js. Always use `emitAsync()` with async middleware.                 |
| Listener throws                          | `emit()` / `emitAsync()` | Exception propagates **synchronously** to the caller. History **is** recorded (written before listeners are called). Subsequent listeners on the same event are **not** called (EventEmitter3 aborts immediately). |

### Recommended patterns

**Wrap `emit()` when a middleware or listener may throw:**

```ts
try {
  spark.emit('save', payload);
} catch (err) {
  console.error('emission failed', err);
}
```

**Always `await` and catch `emitAsync()`:**

```ts
try {
  await spark.emitAsync('save', payload);
} catch (err) {
  console.error('async emission failed', err);
}
```

**Never register an async middleware and call it with sync `emit()` — use `emitAsync()` instead:**

```ts
// ✗ silent unhandled rejection — the rejected Promise is discarded
spark.use('save', async (args, next) => { await validate(args[0]); next(); });
spark.emit('save', payload);

// ✓ correct
await spark.emitAsync('save', payload);
```

**Guard individual listeners to prevent one bad handler from stopping others:**

```ts
spark.on('notify', (payload) => {
  try {
    emailClient.send(payload);
  } catch (err) {
    logger.error('email failed', err);
  }
});
```

---

## Type exports

```ts
import type {
  EventMap,      // Record<string, any[]>
  EventRecord,   // { event, args, timestamp }
  Listener,      // (...args) => void
  Middleware,    // (args, next) => void
  SparkLogger,   // { debug, info, warn, error }
  SparkOptions,  // { historySize?, logger? }
  NamespacedSpark,
} from 'bic-spark';
```

---

## License

ISC
