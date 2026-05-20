// Main class
export { Spark } from './TypedEmitter.js';

// Namespace helper
export { createNamespace } from './namespace.js';
export type { NamespacedSpark } from './namespace.js';

// Ring buffer (useful standalone)
export { RingBuffer } from './RingBuffer.js';

// Types
export type {
  AnyListener,
  EventMap,
  EventRecord,
  Listener,
  Middleware,
  SparkLogger,
  SparkOptions,
  ListenerOptions
} from './types.js';

