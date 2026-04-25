import { marked } from 'https://esm.sh/marked@14';

const CONCEPTS_FOR_CHAPTER = {
  '01-onboarding': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
  ],
  '02-pharaoh': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
  ],
  '03-speakeasy': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
    { slug: 'order-by', title: 'ORDER BY' },
    { slug: 'like',    title: 'LIKE' },
    { slug: 'is-null', title: 'IS NULL' },
    { slug: 'string-functions', title: 'String functions' },
  ],
  '04-census': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
    { slug: 'order-by', title: 'ORDER BY' },
    { slug: 'like',    title: 'LIKE' },
    { slug: 'is-null', title: 'IS NULL' },
    { slug: 'string-functions', title: 'String functions' },
    { slug: 'count', title: 'COUNT' },
    { slug: 'sum-avg', title: 'SUM / AVG' },
    { slug: 'min-max', title: 'MIN / MAX' },
    { slug: 'group-by', title: 'GROUP BY' },
  ],
  '05-tavern': [
    { slug: 'select', title: 'SELECT' },
    { slug: 'from',   title: 'FROM' },
    { slug: 'limit',  title: 'LIMIT' },
    { slug: 'where',  title: 'WHERE' },
    { slug: 'comparison-operators', title: 'Comparison ops' },
    { slug: 'order-by', title: 'ORDER BY' },
    { slug: 'count', title: 'COUNT' },
    { slug: 'group-by', title: 'GROUP BY' },
    { slug: 'distinct', title: 'DISTINCT' },
    { slug: 'having', title: 'HAVING' },
    { slug: 'date-functions', title: 'Date functions' },
  ],
};

let currentSlug = null;

export function initReference() {
  const toggle = document.getElementById('ref-toggle');
  const close = document.getElementById('ref-close');
  const drawer = document.getElementById('ref-drawer');
  toggle.addEventListener('click', () => openDrawer());
  close.addEventListener('click', () => closeDrawer());
  // Click outside drawer to close (mouse)
  document.addEventListener('click', (e) => {
    if (drawer.getAttribute('aria-hidden') === 'true') return;
    if (drawer.contains(e.target) || toggle.contains(e.target)) return;
    closeDrawer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
}

export function setChapterForReference(chapterId) {
  const nav = document.getElementById('ref-nav');
  nav.innerHTML = '';
  currentSlug = null;
  const concepts = CONCEPTS_FOR_CHAPTER[chapterId] || [];
  for (const c of concepts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.title;
    btn.addEventListener('click', () => showConcept(c.slug));
    nav.appendChild(btn);
  }
  if (concepts.length > 0 && !currentSlug) {
    showConcept(concepts[0].slug);
  }
}

async function showConcept(slug) {
  const content = document.getElementById('ref-content');
  content.innerHTML = '<p>Loading...</p>';
  const nav = document.getElementById('ref-nav');
  for (const b of nav.querySelectorAll('button')) {
    b.setAttribute('aria-current', b.textContent.toLowerCase() === slug ? 'true' : 'false');
  }
  try {
    const res = await fetch(`/content/reference/${slug}.md`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    // Strip frontmatter lines between --- ... ---
    const stripped = md.replace(/^---[\s\S]*?---\s*/, '');
    content.innerHTML = marked.parse(stripped);
    currentSlug = slug;
  } catch (err) {
    content.innerHTML = `<p>Could not load reference for "${slug}".</p>`;
  }
}

export function openDrawer() {
  document.getElementById('ref-drawer').setAttribute('aria-hidden', 'false');
}
export function closeDrawer() {
  document.getElementById('ref-drawer').setAttribute('aria-hidden', 'true');
}
