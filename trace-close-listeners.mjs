// Optional diagnostic preload (`npm run start:trace`). It only observes: it does not add
// `close` listeners, change listener limits or suppress warnings. For each response it
// prints the peak number of simultaneous `close` listeners and where each one was registered.
import http from 'node:http';

const state = new WeakMap();

function frames(stack) {
  return stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => !line.includes('node:') && !line.includes('trace-close-listeners.mjs'))
    .slice(0, 3)
    .map((line) => line.replace(/\(.*node_modules\//, '(').replace(/^at .*node_modules\//, 'at '));
}

for (const method of ['on', 'addListener', 'prependListener']) {
  const original = http.ServerResponse.prototype[method];
  http.ServerResponse.prototype[method] = function (event, listener) {
    if (event === 'close') {
      const entry = state.get(this) ?? { peak: 0, registrations: [] };
      state.set(this, entry);
      entry.registrations.push(frames(new Error().stack));
    }
    const result = Reflect.apply(original, this, arguments);
    if (event === 'close') {
      const entry = state.get(this);
      entry.peak = Math.max(entry.peak, this.listenerCount('close'));
    }
    return result;
  };
}

const emit = http.ServerResponse.prototype.emit;
http.ServerResponse.prototype.emit = function (event, ...args) {
  if (event === 'close' && state.has(this)) {
    const { peak, registrations } = state.get(this);
    state.delete(this);
    const lines = registrations.map((f, i) => `  #${i + 1}\n    ${f.join('\n    ')}`);
    process.stderr.write(
      `[close-listeners] ${this.req?.method} ${this.req?.url} -> ${this.statusCode}, peak ${peak}, registrations ${registrations.length}\n${lines.join('\n')}\n`,
    );
  }
  return Reflect.apply(emit, this, [event, ...args]);
};
