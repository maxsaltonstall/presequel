// server/tracer.js
// Initialize dd-trace BEFORE any other require/import that we want instrumented.
// The tracer no-ops if DD_TRACE_ENABLED is not set to "true".

import tracer from 'dd-trace';

if (process.env.DD_TRACE_ENABLED === 'true') {
  tracer.init({
    service: process.env.DD_SERVICE || 'chrono-consulting',
    env:     process.env.DD_ENV || 'dev',
    version: process.env.DD_VERSION || 'unknown',
    logInjection: true,
  });
}

export default tracer;
