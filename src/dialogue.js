const SPEAKERS = {
  carol:   { label: 'Carol', role: 'boss' },
  client:  { label: 'Client', role: 'client' },
  pharaoh: { label: 'Pharaoh Menkaure', role: 'client' },
  gladys:  { label: 'Gladys Vance', role: 'client' },
  grayson: { label: 'Cornelius Grayson', role: 'client' },
  oldrich: { label: 'Oldrich', role: 'client' },
  // Later chapters add more; unknown speakers fall through to "Client"
};

function speakerLabel(speakerKey) {
  return SPEAKERS[speakerKey]?.label || 'Client';
}

function bubbleRole(speakerKey) {
  return SPEAKERS[speakerKey]?.role || 'client';
}

export function clearDialogue() {
  const el = document.getElementById('dialogue-stream');
  el.innerHTML = '';
}

export function pushBubble({ speaker, text, kind }) {
  const stream = document.getElementById('dialogue-stream');
  const bubble = document.createElement('div');
  const role = kind || bubbleRole(speaker);
  bubble.className = `bubble ${role}`;
  bubble.innerHTML = `
    <div>
      <div class="speaker">${escapeHtml(speakerLabel(speaker))}</div>
      <div class="text">${escapeHtml(text)}</div>
    </div>
  `;
  stream.appendChild(bubble);
  bubble.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return bubble;
}

export function pushHint(text) {
  return pushBubble({ speaker: 'carol', text, kind: 'hint' });
}

export function pushSuccess({ speaker, text }) {
  return pushBubble({ speaker, text, kind: 'success' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
