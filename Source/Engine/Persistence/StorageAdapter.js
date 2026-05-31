/**
 * @interface StorageAdapter
 * The persistence seam. Implementations: MemoryStorageAdapter (tests),
 * LocalStorageAdapter (browser). No implementation lives here.
 *
 * get(key: string)            -> string | null
 * set(key: string, value: string) -> void | boolean   // may fail on quota; callers tolerate false
 * remove(key: string)         -> void
 */
export {};
