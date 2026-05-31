// Injectable time source. The engine NEVER calls Date.now() directly.

export class Clock {
  now() {
    return Date.now();
  }
}

export class FakeClock {
  constructor(startMs = 0) {
    this._now = startMs;
  }
  now() {
    return this._now;
  }
  setNow(ms) {
    this._now = ms;
  }
  advance(ms) {
    this._now += ms;
    return this._now;
  }
}
