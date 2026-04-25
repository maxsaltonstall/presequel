// Strip SQL comments (line and block) to simplify keyword detection.
function stripComments(sql) {
  // block comments /* ... */
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // line comments -- ... \n
  s = s.replace(/--[^\n]*/g, ' ');
  return s;
}

const BLOCKED_FUNCTIONS = [
  'read_csv', 'read_csv_auto',
  'read_parquet',
  'read_json', 'read_json_auto', 'read_json_objects',
  'read_blob', 'read_text',
  'glob',
  'parquet_metadata', 'parquet_file_metadata', 'parquet_schema', 'parquet_kv_metadata',
  'sniff_csv',
];

// Word-boundary match on `name(` — only flags function calls, not
// identifiers or columns that happen to share a name fragment.
const BLOCKED_RE = new RegExp(
  '\\b(' + BLOCKED_FUNCTIONS.join('|') + ')\\s*\\(',
  'i'
);

function checkBlockedFunctions(stripped) {
  const m = stripped.match(BLOCKED_RE);
  if (m) return `Function "${m[1].toLowerCase()}" is not allowed (filesystem access blocked)`;
  return null;
}

// Returns { ok: true } or { ok: false, error: string }.
export function validateSql(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'sql must be a string' };
  const stripped = stripComments(raw).trim();
  if (!stripped) return { ok: false, error: 'empty query' };

  // Must start with SELECT or WITH (case-insensitive).
  if (!/^(select|with)\b/i.test(stripped)) {
    return { ok: false, error: 'Only SELECT queries are allowed' };
  }

  // No semicolons except optionally a single trailing one.
  // Remove a single trailing semicolon and surrounding whitespace, then check
  // that no semicolon remains (would indicate stacked statements).
  const noTrailing = stripped.replace(/;\s*$/, '');
  if (noTrailing.includes(';')) {
    return { ok: false, error: 'Only one statement allowed per request' };
  }

  const blocked = checkBlockedFunctions(noTrailing);
  if (blocked) return { ok: false, error: blocked };

  return { ok: true };
}
