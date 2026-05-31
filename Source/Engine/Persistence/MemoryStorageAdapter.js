// In-memory StorageAdapter for tests — no browser needed.
export class MemoryStorageAdapter {
  constructor() {
    this._map = new Map();
  }
  get(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }
  set(key, value) {
    this._map.set(key, String(value));
  }
  remove(key) {
    this._map.delete(key);
  }
}
