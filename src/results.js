export function clearResults() {
  document.getElementById('results-area').innerHTML = '';
}

export function renderResults({ columns, rows, truncated, error }) {
  const area = document.getElementById('results-area');
  area.innerHTML = '';
  if (error) {
    const p = document.createElement('p');
    p.style.color = 'var(--error)';
    p.textContent = `Error: ${error}`;
    area.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'results-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const c of columns) {
    const th = document.createElement('th');
    th.textContent = String(c);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = cell === null || cell === undefined ? 'NULL' : String(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  area.appendChild(table);

  if (truncated) {
    const note = document.createElement('p');
    note.style.color = 'var(--fg-muted)';
    note.style.fontSize = '12px';
    note.textContent = `(Results truncated at ${rows.length} rows.)`;
    area.appendChild(note);
  }
}
