// server/metrics.js
// Custom metrics via dd-trace's built-in metrics API (DogStatsD).
// No-op if dd-trace isn't initialized.

import tracer from 'dd-trace';

function dogstatsd() {
  try {
    return tracer.dogstatsd;
  } catch {
    return null;
  }
}

export const metrics = {
  increment(name, tags = {}) {
    const ds = dogstatsd();
    if (!ds) return;
    ds.increment(name, 1, tagList(tags));
  },
  timing(name, ms, tags = {}) {
    const ds = dogstatsd();
    if (!ds) return;
    ds.distribution(name, ms, tagList(tags));
  },
};

function tagList(tags) {
  return Object.entries(tags).map(([k, v]) => `${k}:${String(v).replace(/\s+/g, '_')}`);
}
