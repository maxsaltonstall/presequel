function translateRun(run) {
  const tokenRe = /(-?)(\w+):('(?:[^']*)'|[^\s)]+)/g;
  const parts = [];
  let m;
  while ((m = tokenRe.exec(run)) !== null) {
    const [, neg, key, rawVal] = m;
    const op = neg === '-' ? '!=' : '=';
    const inner = rawVal.startsWith("'") ? rawVal.slice(1, -1) : rawVal;
    parts.push(`tags['${key}'] ${op} '${inner.replace(/'/g, "''")}'`);
  }
  return parts.join(' AND ');
}

export function translateTagFilter(sql) {
  return sql.replace(
    /(\bWHERE\b)([\s\S]*?)(?=\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING|UNION|EXCEPT|INTERSECT)\b|$)/gi,
    (_, kw, body) => {
      const runRe = /((?:-?\w+:(?:'[^']*'|[^\s)]+))(?:\s+(?:-?\w+:(?:'[^']*'|[^\s)]+)))*)/g;
      return kw + body.replace(runRe, translateRun);
    }
  );
}

function translateBound(b) {
  const lower = b.toLowerCase();
  if (lower === 'now') return "getvariable('ch8_anchor')";
  const m = lower.match(/^now-(\d+)(h|m|s)$/);
  if (!m) return null;
  const [, n, unit] = m;
  const units = { h: 'hours', m: 'minutes', s: 'seconds' };
  return `getvariable('ch8_anchor') - INTERVAL '${n} ${units[unit]}'`;
}

export function translateTimeWindow(sql) {
  return sql.replace(/@timestamp:\[([^\]]+)\]/gi, (match, inner) => {
    const parts = inner.split(/\s+to\s+/i);
    if (parts.length !== 2) return match;
    const lo = translateBound(parts[0].trim());
    const hi = translateBound(parts[1].trim());
    if (!lo || !hi) return match;
    return `timestamp >= ${lo} AND timestamp <= ${hi}`;
  });
}

const BUCKET_UNITS = { '1s': 'second', '1m': 'minute', '1h': 'hour' };

export function translateBucket(sql) {
  return sql.replace(/\bbucket\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/gi, (match, field, interval) => {
    const unit = BUCKET_UNITS[interval.toLowerCase()];
    if (!unit) return match;
    return `DATE_TRUNC('${unit}', ${field})`;
  });
}

export function translateRate(sql) {
  return sql.replace(/\brate\s*\(\s*(\w+)\s*,\s*1m\s*\)/gi, (_, field) =>
    `ROUND(${field} / 60.0, 2)`
  );
}

const PTF_NAMES = new Set(['logs', 'spans']);

export function translatePTF(sql) {
  const result = sql.replace(
    /\bFROM\s+(\w+)\s*\(([^)]*)\)/gi,
    (match, ptf, args) => {
      const name = ptf.toLowerCase();
      if (!PTF_NAMES.has(name)) {
        throw new Error(`Unknown PTF: ${ptf}(). Available sources: logs(), spans()`);
      }
      const trimmed = args.trim();
      if (!trimmed) return `FROM ${name}`;
      return `FROM ${name} WHERE ${translateRun(trimmed)}`;
    }
  );
  return result.replace(/\bWHERE\b\s*([\s\S]+?)\s*\bWHERE\b\s*/i, 'WHERE $1 AND ');
}

export function translateTagJoin(sql) {
  if (!/\btags\.\w+\b/i.test(sql)) return sql;
  const fromMatch = sql.match(/\bFROM\s+(\w+)\b/i);
  if (!fromMatch) {
    throw new Error('tags. syntax in JOIN requires a named FROM table. Example: FROM logs JOIN services ON tags.service = service_name');
  }
  const fromTable = fromMatch[1].toLowerCase();
  return sql.replace(/\btags\.(\w+)\b/gi, (_, key) => `${fromTable}.tags['${key.toLowerCase()}']`);
}
