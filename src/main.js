import { loadState, saveState, emptyState, setCurrent, markSolved, recordAttempt } from './state.js';
import { clearDialogue, pushBubble } from './dialogue.js';
import { clearResults } from './results.js';
import { playPuzzle } from './puzzle.js';
import { initReference, setChapterForReference } from './reference.js';

const BOOT_CHAPTER = '01-onboarding';

const CHAPTER_ORDER = ['01-onboarding', '02-pharaoh', '03-speakeasy', '04-census', '05-tavern', '06-reunion', '07-static', '08-when', '09-heat', '10-reach', '11-catalog'];

function nextChapterId(currentId) {
  const idx = CHAPTER_ORDER.indexOf(currentId);
  if (idx === -1) return null;
  return CHAPTER_ORDER[idx + 1] || null;
}

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not fetch ${path}: ${res.status}`);
  return res.json();
}

async function loadChapter(chapterId) {
  return fetchJson(`/content/chapters/${chapterId}/chapter.json`);
}
async function loadPuzzle(chapterId, puzzleId) {
  return fetchJson(`/content/chapters/${chapterId}/puzzles/${puzzleId}.json`);
}

function setProgress(chapter, puzzleId) {
  const idx = chapter.puzzle_ids.indexOf(puzzleId) + 1;
  document.getElementById('progress-indicator').textContent =
    `${chapter.title} · Puzzle ${idx} of ${chapter.puzzle_ids.length}`;
}

async function runCurrent(state) {
  const chapterId = state.currentChapterId;
  const puzzleId = state.currentPuzzleId;
  const chapter = await loadChapter(chapterId);
  const puzzle = await loadPuzzle(chapterId, puzzleId);

  clearDialogue();
  clearResults();
  setProgress(chapter, puzzleId);

  if (puzzleId === chapter.puzzle_ids[0]) {
    pushBubble({ speaker: 'carol', text: chapter.boss_intro });
  }

  await playPuzzle({
    chapterId,
    puzzle,
    mechanicMode: chapter.mechanic_mode,
    onAttempt: () => {
      state = recordAttempt(state, chapterId, puzzleId);
      saveState(state);
    },
    onSolved: () => {
      state = markSolved(state, chapterId, puzzleId, chapter.puzzle_ids);
      saveState(state);
      wireNextButton(state, chapter);
    },
  });
}

function wireNextButton(state, chapter) {
  const area = document.getElementById('puzzle-area');
  if (!area) return;
  area.addEventListener('click', async function handler(e) {
    if (!e.target.closest('.next-btn')) return;
    area.removeEventListener('click', handler);
    const curIdx = chapter.puzzle_ids.indexOf(state.currentPuzzleId);
    const next = chapter.puzzle_ids[curIdx + 1];
    if (next) {
      state = setCurrent(state, state.currentChapterId, next);
      saveState(state);
      await runCurrent(state);
    } else {
      pushBubble({ speaker: 'carol', text: chapter.outro });
      const nextCh = nextChapterId(state.currentChapterId);
      if (nextCh) {
        state = setCurrent(state, nextCh, '01');
        saveState(state);
        setChapterForReference(nextCh);
        await runCurrent(state);
      } else {
        pushBubble({ speaker: 'carol', text: 'That was the last chapter we have. More to come.' });
        document.getElementById('puzzle-area').innerHTML = '';
      }
    }
  });
}

async function boot() {
  initReference();
  let state = loadState();
  if (!state.currentChapterId) {
    state = setCurrent(state, BOOT_CHAPTER, '01');
    saveState(state);
  }
  setChapterForReference(state.currentChapterId);
  try {
    await runCurrent(state);
  } catch (err) {
    document.getElementById('main').innerHTML =
      '<p style="padding:24px">Chrono Consulting\'s archive is offline. Reload to retry.</p>';
    console.error(err);
  }
}

boot();
