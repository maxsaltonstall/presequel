export async function runQuery(chapter, sql) {
  const res = await fetch('/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chapter, sql }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.error || `HTTP ${res.status}` };
  }
  return res.json();
}
