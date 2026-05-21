const CHAPTER_RE = /^[a-z0-9-]+$/;
const PUZZLE_RE  = /^[a-z0-9-]+$/;
const REASONS    = new Set(['wrong_result', 'sql_error', 'security_rejected', 'timeout']);

function bad(reason) { return { ok: false, reason }; }

function clampAttempts(n) {
  const i = Math.floor(Number(n));
  if (!Number.isFinite(i)) return null;
  return Math.min(999, Math.max(1, i));
}

export function validateEvent(body) {
  if (!body || typeof body !== 'object') return bad('invalid_body');
  const { type, chapter, puzzle, attempts, reason } = body;

  if (typeof chapter !== 'string' || !CHAPTER_RE.test(chapter)) return bad('invalid_field');

  switch (type) {
    case 'puzzle.attempt':
    case 'hint.used': {
      if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) return bad('invalid_field');
      return { ok: true, type, chapter, puzzle };
    }
    case 'puzzle.solved': {
      if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) return bad('invalid_field');
      const a = clampAttempts(attempts);
      if (a === null) return bad('invalid_field');
      return { ok: true, type, chapter, puzzle, attempts: a };
    }
    case 'puzzle.failed': {
      if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) return bad('invalid_field');
      if (typeof reason !== 'string' || !REASONS.has(reason)) return bad('invalid_field');
      return { ok: true, type, chapter, puzzle, reason };
    }
    case 'chapter.started':
    case 'chapter.completed': {
      return { ok: true, type, chapter };
    }
    default:
      return bad('unknown_type');
  }
}

export function emitMetricFor(validated, metrics) {
  if (!validated || !validated.ok) return;
  const { type, chapter, puzzle, attempts, reason } = validated;
  switch (type) {
    case 'puzzle.attempt':
      metrics.increment('chrono.puzzle.attempt', { chapter, puzzle });
      return;
    case 'puzzle.solved':
      metrics.increment('chrono.puzzle.solved', { chapter, puzzle });
      metrics.timing('chrono.puzzle.attempts_to_solve', attempts, { chapter, puzzle });
      return;
    case 'puzzle.failed':
      metrics.increment('chrono.puzzle.failed', { chapter, puzzle, reason });
      return;
    case 'hint.used':
      metrics.increment('chrono.hint.used', { chapter, puzzle });
      return;
    case 'chapter.started':
      metrics.increment('chrono.chapter.started', { chapter });
      return;
    case 'chapter.completed':
      metrics.increment('chrono.chapter.completed', { chapter });
      return;
  }
}
