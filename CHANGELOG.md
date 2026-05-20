# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - May 20th 2026

### Added
- **TTL listeners via `.many()`**: Register a listener that automatically removes itself after firing exactly `n` times — a generalisation of `.once()` (which is now `many(event, 1, ...)`).
  - Works with plain listeners, priority listeners (`options.priority`), and wildcard patterns (`*`, `**`)
  - `.off()` with the original listener reference cancels a `many()` listener early
  - Throws `RangeError` when `n < 1`
  - Exposed on `NamespacedSpark` as `auth.many('login', 3, fn)`
  - Logger emits `[spark] many(n): <event>` on registration
- **Global catch-all via `.onAny()` / `.offAny()`**: Register a listener that fires on every successfully emitted event regardless of name.
  - Listener signature: `(event: string, ...args: any[]) => void`
  - Fires after normal listeners; does **not** fire when middleware blocks the emission
  - `.offAny(listener)` removes the listener using the original reference
  - `removeAllListeners()` (no args) also clears all `onAny` listeners
  - Works with `emitAsync`
  - Exposed on `NamespacedSpark` — scoped variant fires only for events under the prefix and delivers the **un-prefixed** event name
  - `AnyListener` type exported from the package
  - Logger emits `[spark] onAny` / `[spark] offAny` on registration/removal

### Fixed
- Wildcard overload signatures added to `on`, `once`, `many`, and `off` — TypeScript no longer raises `TS2345` when passing a pattern string (e.g. `'user:*'`) that is not a key of `TEvents`

## [0.1.2] - May 19th 2026

### Added
- **Wildcard Subscriptions**: Register a listener matching a wildcard pattern via `.on()`, `.once()`, and `.off()`.
  - `*` matches a **single colon-delimited segment** — e.g. `user:*` matches `user:login` but not `user:profile:updated`
  - `**` (globstar) matches **multiple segments** — e.g. `user:**` matches both `user:login` and `user:profile:updated`
  - Mid-level wildcards are supported — e.g. `user:*:deleted`, `**:error`, `*:error`

## [0.1.1] - May 14th 2026

### Added
- **Priority listeners**: `.on()` and `.once()` now accept an optional `options`
  argument of type `ListenerOptions`. Setting `options.priority` (a `number`) controls
  invocation order: higher values fire first. Listeners sharing the same priority retain
  registration order. Listeners registered without a priority are appended after all
  priority listeners. `ListenerOptions` is exported from the package.

## [0.1.0] - May 11th 2026

### Added
- **`Spark` Wrapper**: typed EventEmitter3 wrapper
- **History & Replay**: History and replay support via `RingBuffer`
- **Middleware**: Middleware support (sync and async)
- **Namespace**: Namespace support via `createNamespace`
- **Log Layer**: Logger integration via `SparkOptions.logger`
- **Async**: `emitAsync` for async middleware chains
- **TS Events**: Full TypeScript inference for event maps
