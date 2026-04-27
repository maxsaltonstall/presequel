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
