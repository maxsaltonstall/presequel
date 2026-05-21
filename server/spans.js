import tracerDefault from 'dd-trace';

let _tracer = tracerDefault;

export function __setTracerForTesting(t) { _tracer = t; }

const NOOP_SPAN = { setTag() {} };

export async function withChronoQuerySpan(fn) {
  if (!_tracer || typeof _tracer.trace !== 'function') {
    return fn(NOOP_SPAN);
  }
  return _tracer.trace('chrono.query', {}, async (span) => {
    const s = span || NOOP_SPAN;
    try {
      return await fn(s);
    } catch (err) {
      try { s.setTag('error', err); } catch {}
      throw err;
    }
  });
}
