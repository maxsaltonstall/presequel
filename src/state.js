const LS_KEY = 'chronoConsultingState-v1';

export function emptyState() {
  return {
    currentChapterId: null,
    currentPuzzleId: null,
    chapters: {},
    referenceOpened: [],
    savedAt: null,
  };
}

function ensureChapter(state, chapterId) {
  if (!state.chapters[chapterId]) {
    state.chapters[chapterId] = { completed: false, solved: [], attempts: {} };
  }
}

export function setCurrent(state, chapterId, puzzleId) {
  const next = { ...state, currentChapterId: chapterId, currentPuzzleId: puzzleId };
  next.chapters = { ...state.chapters };
  ensureChapter(next, chapterId);
  return next;
}

export function recordAttempt(state, chapterId, puzzleId) {
  const next = { ...state, chapters: { ...state.chapters } };
  ensureChapter(next, chapterId);
  const ch = next.chapters[chapterId] = { ...next.chapters[chapterId] };
  ch.attempts = { ...ch.attempts, [puzzleId]: (ch.attempts[puzzleId] || 0) + 1 };
  return next;
}

export function markSolved(state, chapterId, puzzleId, allPuzzleIds) {
  const next = { ...state, chapters: { ...state.chapters } };
  ensureChapter(next, chapterId);
  const ch = next.chapters[chapterId] = { ...next.chapters[chapterId] };
  if (!ch.solved.includes(puzzleId)) {
    ch.solved = [...ch.solved, puzzleId];
  }
  ch.completed = allPuzzleIds.every((id) => ch.solved.includes(id));
  return next;
}

export function isSolved(state, chapterId, puzzleId) {
  return !!state.chapters[chapterId]?.solved.includes(puzzleId);
}

export function openReference(state, conceptSlug) {
  if (state.referenceOpened.includes(conceptSlug)) return state;
  return { ...state, referenceOpened: [...state.referenceOpened, conceptSlug] };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  try {
    const serialized = JSON.stringify({ ...state, savedAt: Date.now() });
    localStorage.setItem(LS_KEY, serialized);
  } catch (err) {
    console.warn('saveState failed:', err);
  }
}
