// Exclusive FIFO, ifAvailable and queued cancellation semantics from Web Locks.
exports.lockFixture = function () {
  const lanes = new Map();
  return {
    request(name, options, callback) {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      if (!lanes.has(name)) lanes.set(name, { held: false, queue: [] });
      const lane = lanes.get(name);
      if (options.ifAvailable && (lane.held || lane.queue.length))
        return Promise.resolve(callback(null));
      return new Promise((resolve, reject) => {
        const abort = () => {
          const i = lane.queue.indexOf(start);
          if (i >= 0) lane.queue.splice(i, 1);
          reject(options.signal.reason);
        };
        const start = () => {
          options.signal?.removeEventListener('abort', abort);
          lane.held = true;
          Promise.resolve()
            .then(() => callback({ name }))
            .then(resolve, reject)
            .finally(() => {
              lane.held = false;
              lane.queue.shift()?.();
            });
        };
        if (options.signal?.aborted) return reject(options.signal.reason);
        options.signal?.addEventListener('abort', abort, { once: true });
        if (lane.held) lane.queue.push(start);
        else start();
      });
    },
  };
};
