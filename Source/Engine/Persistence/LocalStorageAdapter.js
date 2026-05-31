// Browser StorageAdapter over window.localStorage. Quota-safe.
export class LocalStorageAdapter {
  constructor(storage = (typeof window !== "undefined" ? window.localStorage : undefined)) {
    this._s = storage;
  }
  get(key) {
    try {
      return this._s.getItem(key);
    } catch {
      return null;
    }
  }
  set(key, value) {
    try {
      this._s.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  }
  remove(key) {
    try {
      this._s.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
