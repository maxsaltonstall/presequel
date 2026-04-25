function emit(level, event, fields = {}) {
  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    service: process.env.DD_SERVICE || 'chrono-consulting',
    env: process.env.DD_ENV || 'dev',
    ...fields,
  };
  process.stdout.write(JSON.stringify(record) + '\n');
}

export const log = {
  info:  (event, fields) => emit('info',  event, fields),
  warn:  (event, fields) => emit('warn',  event, fields),
  error: (event, fields) => emit('error', event, fields),
};
