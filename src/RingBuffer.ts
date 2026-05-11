/** Fixed-size circular buffer. Oldest entry is overwritten when full. */
export class RingBuffer<T> {
    private buf: (T | undefined)[];
    private head = 0;
    private count = 0;

    constructor(private readonly capacity: number) {
        if (capacity < 1) throw new RangeError('capacity must be at least 1');
        this.buf = new Array(capacity);
    }

    /** Append a value. If the buffer is full the oldest value is overwritten. */
    push(value: T): void {
        this.buf[this.head] = value;
        this.head = (this.head + 1) % this.capacity;
        if (this.count < this.capacity) this.count++;
    }

    /** Return all values in insertion order (oldest first). */
    toArray(): T[] {
        const start = this.count < this.capacity ? 0 : this.head;
        const result: T[] = [];
        for (let i = 0; i < this.count; i++) {
            result.push(this.buf[(start + i) % this.capacity] as T);
        }
        return result;
    }

    /** Remove all values. */
    clear(): void {
        this.buf = new Array(this.capacity);
        this.head = 0;
        this.count = 0;
    }

    /** Number of values currently stored. */
    size(): number {
        return this.count;
    }
}