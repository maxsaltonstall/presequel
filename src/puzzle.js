import { runQuery } from './api.js';
import { pushHint, pushSuccess, pushBubble } from './dialogue.js';
import { renderResults, clearResults } from './results.js';

// ---------- Pure helpers (unit-tested) ----------

export function assembleSql(template, blanks) {
  const parts = [];
  for (const tok of template) {
    if (tok.type === 'keyword' || tok.type === 'text') {
      parts.push(tok.text);
    } else if (tok.type === 'blank') {
      const v = blanks[tok.id];
      if (v !== undefined && v !== '') parts.push(v);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function normalizeRow(row) {
  return row.map((c) => (c === null || c === undefined ? null : String(c)));
}

function rowsEqualUnordered(actual, expected) {
  if (actual.length !== expected.length) return false;
  const sortKey = (r) => JSON.stringify(r);
  const a = actual.map(normalizeRow).map(sortKey).sort();
  const b = expected.map(normalizeRow).map(sortKey).sort();
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function rowsEqualOrdered(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    const a = normalizeRow(actual[i]);
    const b = normalizeRow(expected[i]);
    if (a.length !== b.length) return false;
    for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) return false;
  }
  return true;
}

export function compareRows(actual, expected, orderSensitive) {
  if (actual.length < expected.length) return { status: 'wrong-count-low' };
  if (actual.length > expected.length) return { status: 'wrong-count-high' };
  const ok = orderSensitive
    ? rowsEqualOrdered(actual, expected)
    : rowsEqualUnordered(actual, expected);
  return { status: ok ? 'match' : 'different-values' };
}

const DEFAULT_HINT = { text: 'Not quite. Compare your result to what was asked and try again.' };

export function selectHint(hints, signal) {
  if (!Array.isArray(hints) || hints.length === 0) return DEFAULT_HINT;
  const key = signal.replace(/-/g, '_');
  return hints.find((h) => h.when === key) ||
         hints.find((h) => h.when === 'default') ||
         DEFAULT_HINT;
}

export function buildInitialBank(template) {
  const tokens = [];
  for (const tok of template) {
    if (tok.type === 'blank' && Array.isArray(tok.options)) {
      tokens.push(...tok.options);
    }
  }
  return tokens;
}

function firstEmptySlotId(template, blanks) {
  for (const tok of template) {
    if (tok.type === 'blank' && (blanks[tok.id] === undefined || blanks[tok.id] === '')) {
      return tok.id;
    }
  }
  return null;
}

export function fillFirstEmptySlot(template, blanks, bank, token) {
  const slotId = firstEmptySlotId(template, blanks);
  if (!slotId) return { blanks, bank };
  const idx = bank.indexOf(token);
  if (idx === -1) return { blanks, bank };
  const newBank = bank.slice(0, idx).concat(bank.slice(idx + 1));
  const newBlanks = { ...blanks, [slotId]: token };
  return { blanks: newBlanks, bank: newBank };
}

export function returnSlotToBank(template, blanks, bank, slotId) {
  const current = blanks[slotId];
  if (current === undefined || current === '') return { blanks, bank };
  const newBlanks = { ...blanks };
  delete newBlanks[slotId];
  const newBank = [...bank, current];
  return { blanks: newBlanks, bank: newBank };
}

// ---------- Rendering & controller ----------

function renderTemplateWordBank(template, state, onSlotClick, onBankClick) {
  const area = document.getElementById('puzzle-area');
  area.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'puzzle-header';
  header.textContent = area.dataset.header || '';
  area.appendChild(header);

  const query = document.createElement('div');
  query.className = 'query';
  for (const tok of template) {
    if (tok.type === 'keyword') {
      query.appendChild(spanToken('keyword', tok.text + ' '));
    } else if (tok.type === 'text') {
      query.appendChild(spanToken('text', tok.text + ' '));
    } else if (tok.type === 'blank') {
      const slot = document.createElement('span');
      const val = state.blanks[tok.id];
      slot.className = val ? 'slot filled' : 'slot empty';
      slot.dataset.slot = tok.id;
      slot.textContent = val || '—';
      slot.addEventListener('click', () => onSlotClick(tok.id));
      query.appendChild(slot);
      query.appendChild(document.createTextNode(' '));
    }
  }
  area.appendChild(query);

  const bankContainer = document.createElement('div');
  bankContainer.className = 'word-bank';
  const bankLabel = document.createElement('div');
  bankLabel.className = 'word-bank-label';
  bankLabel.textContent = 'Word bank';
  bankContainer.appendChild(bankLabel);
  const bankList = document.createElement('div');
  bankList.className = 'word-bank-list';
  for (let i = 0; i < state.bank.length; i++) {
    const token = state.bank[i];
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'word-bank-chip';
    chip.textContent = token;
    chip.addEventListener('click', () => onBankClick(i));
    bankList.appendChild(chip);
  }
  bankContainer.appendChild(bankList);
  area.appendChild(bankContainer);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'run-btn';
  runBtn.id = 'run-btn';
  runBtn.textContent = 'Run query';
  area.appendChild(runBtn);

  return runBtn;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function renderTemplateDropdown(template, blanks, onChange) {
  const area = document.getElementById('puzzle-area');
  area.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'puzzle-header';
  header.textContent = area.dataset.header || '';
  area.appendChild(header);

  const query = document.createElement('div');
  query.className = 'query';
  for (const tok of template) {
    if (tok.type === 'keyword') {
      query.appendChild(spanToken('keyword', tok.text + ' '));
    } else if (tok.type === 'text') {
      query.appendChild(spanToken('text', tok.text + ' '));
    } else if (tok.type === 'blank') {
      const span = document.createElement('span');
      span.className = 'blank';
      const sel = document.createElement('select');
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— pick —';
      sel.appendChild(placeholder);
      for (const opt of tok.options) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        if (blanks[tok.id] === opt) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => onChange(tok.id, sel.value));
      span.appendChild(sel);
      query.appendChild(span);
      query.appendChild(document.createTextNode(' '));
    }
  }
  area.appendChild(query);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'run-btn';
  runBtn.id = 'run-btn';
  runBtn.textContent = 'Run query';
  area.appendChild(runBtn);

  return runBtn;
}

function renderTemplateTyping(template, blanks, onInput) {
  const area = document.getElementById('puzzle-area');
  area.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'puzzle-header';
  header.textContent = area.dataset.header || '';
  area.appendChild(header);

  const query = document.createElement('div');
  query.className = 'query';
  for (const tok of template) {
    if (tok.type === 'keyword') {
      query.appendChild(spanToken('keyword', tok.text + ' '));
    } else if (tok.type === 'text') {
      query.appendChild(spanToken('text', tok.text + ' '));
    } else if (tok.type === 'blank') {
      const span = document.createElement('span');
      span.className = 'blank';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'typed-input';
      input.dataset.slot = tok.id;
      input.placeholder = tok.placeholder || 'type here';
      input.value = blanks[tok.id] || '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.addEventListener('input', () => onInput(tok.id, input.value));
      span.appendChild(input);
      query.appendChild(span);
      query.appendChild(document.createTextNode(' '));
    }
  }
  area.appendChild(query);

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'run-btn';
  runBtn.id = 'run-btn';
  runBtn.textContent = 'Run query';
  area.appendChild(runBtn);

  return runBtn;
}

function spanToken(kind, text) {
  const s = document.createElement('span');
  s.className = `token ${kind}`;
  s.textContent = text;
  return s;
}

function allFilled(template, blanks) {
  for (const tok of template) {
    if (tok.type === 'blank' && (blanks[tok.id] === undefined || blanks[tok.id] === '')) {
      return false;
    }
  }
  return true;
}

export async function playPuzzle({ chapterId, puzzle, mechanicMode, onSolved, onAttempt }) {
  clearResults();
  const puzzleArea = document.getElementById('puzzle-area');
  puzzleArea.dataset.header = `PUZZLE ${puzzle.id}`;

  pushBubble({ speaker: puzzle.brief.speaker, text: puzzle.brief.text });

  const expectedPromise = runQuery(chapterId, puzzle.expected.sql);

  let blanks = {};
  let bank = mechanicMode === 'word_bank'
    ? shuffleInPlace(buildInitialBank(puzzle.template))
    : [];
  let busy = false;
  let solved = false;
  let runBtn;

  async function handleSubmit() {
    if (busy || solved) return;
    busy = true;
    if (runBtn) runBtn.disabled = true;
    try {
      const sql = assembleSql(puzzle.template, blanks);
      const [actual, expected] = await Promise.all([
        runQuery(chapterId, sql),
        expectedPromise,
      ]);
      renderResults(actual);
      onAttempt?.();

      if (actual.error) {
        const h = selectHint(puzzle.hints, 'error');
        pushHint(h.text);
        return;
      }
      if (expected.error) {
        pushHint('Something went wrong with the reference solution. Please report this puzzle.');
        return;
      }
      const cmp = compareRows(actual.rows, expected.rows, !!puzzle.expected.order_sensitive);
      if (cmp.status === 'match') {
        pushSuccess({ speaker: puzzle.success.speaker, text: puzzle.success.text });
        solved = true;
        onSolved?.();
        renderNextButton();
      } else {
        const h = selectHint(puzzle.hints, cmp.status);
        pushHint(h.text);
      }
    } catch (err) {
      pushHint('Could not reach the archives. Try again.');
    } finally {
      busy = false;
      if (runBtn) runBtn.disabled = solved || !allFilled(puzzle.template, blanks);
    }
  }

  function rerender() {
    if (mechanicMode === 'word_bank') {
      runBtn = renderTemplateWordBank(puzzle.template, { blanks, bank },
        (slotId) => {
          if (busy || solved) return;
          const r = returnSlotToBank(puzzle.template, blanks, bank, slotId);
          blanks = r.blanks; bank = r.bank;
          rerender();
        },
        (bankIdx) => {
          if (busy || solved) return;
          const token = bank[bankIdx];
          const r = fillFirstEmptySlot(puzzle.template, blanks, bank, token);
          blanks = r.blanks; bank = r.bank;
          rerender();
        },
      );
    } else if (mechanicMode === 'typing') {
      runBtn = renderTemplateTyping(puzzle.template, blanks, (id, val) => {
        blanks[id] = val;
        runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
      });
    } else {
      runBtn = renderTemplateDropdown(puzzle.template, blanks, (id, val) => {
        blanks[id] = val;
        runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
      });
    }
    runBtn.disabled = busy || solved || !allFilled(puzzle.template, blanks);
    runBtn.addEventListener('click', handleSubmit);
  }

  rerender();
}

function renderNextButton() {
  const area = document.getElementById('puzzle-area');
  if (area.querySelector('.next-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'next-btn';
  btn.id = 'next-btn';
  btn.textContent = 'Next →';
  area.appendChild(btn);
}
