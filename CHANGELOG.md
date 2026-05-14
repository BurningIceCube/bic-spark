# Changelog

All notable changes to this project will be documented in this file.

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
