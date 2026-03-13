// render.js — Data fetching and rendering for today.html and archive.html

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ['Brains', 'Bags', 'Shiny New Things', 'Uh Oh', "Everyone's Talking", 'Actually Useful', 'Try This'];

const CATEGORY_SUBTITLES = {
  'Brains':             'Models & Research',
  'Bags':               'Business & Funding',
  'Shiny New Things':   'Products & Tools',
  'Uh Oh':              'Policy, Safety & Legal',
  "Everyone's Talking": 'Community & Viral',
  'Actually Useful':    'Builder Workflows',
  'Try This':           'New AI Tools',
};

// ─── Shared helpers ──────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showError(container, message) {
  container.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
}

// ─── Story rendering ──────────────────────────────────────────────────────────

function storyRowHtml(story, isEssential) {
  const hasBody = !!(story.bodyParagraph1 || story.whatHappened || story.sourceQuip);

  const badge = isEssential
    ? `<span class="essential-badge" style="background:${escapeHtml(story.color)}20; color:${escapeHtml(story.color)}">Need to know</span>`
    : '';

  // Always show the More button — if body is absent, expand shows a placeholder.
  // NOTE: Future markdown enrichments must provide bodyParagraph1/2/3 and
  // sourceQuip for every story so this button always has content to reveal.
  const expandBtn = `<button class="expand-btn" aria-expanded="false">More ↓</button>`;

  let bodyInnerHtml = '';

  // Four-section body: What happened / Why it matters / What's next / Your move
  const sections = [
    { key: 'whatHappened',  label: 'What happened' },
    { key: 'whyItMatters',  label: 'Why it matters' },
    { key: 'whatsNext',     label: "What's next" },
    { key: 'yourMove',      label: 'Your move' },
  ];
  let hasSections = false;
  for (const { key, label } of sections) {
    const bullets = story[key];
    if (!bullets || !bullets.length) continue;
    hasSections = true;
    bodyInnerHtml += `
      <div class="body-section">
        <span class="body-section-label">${escapeHtml(label)}</span>
        <ul class="story-bullets">
          ${bullets.map(b => `<li>${escapeHtml(capFirst(b))}</li>`).join('')}
        </ul>
      </div>`;
  }

  // Fallback: old bodyParagraph1/2/3 format
  if (!hasSections) {
    const bodyPoints = [story.bodyParagraph1, story.bodyParagraph2, story.bodyParagraph3].filter(Boolean);
    if (bodyPoints.length) {
      bodyInnerHtml += `<ul class="story-bullets">${bodyPoints.map(p => `<li>${escapeHtml(capFirst(p))}</li>`).join('')}</ul>`;
    }
  }

  // Source quip text only — no source link (headline is already the link)
  if (story.sourceQuip) bodyInnerHtml += `<p class="source-quip">${escapeHtml(story.sourceQuip)}</p>`;

  const bodyHtml = `
    <div class="story-expand">
      <div class="story-expand-inner">
        <div class="story-body${bodyInnerHtml ? '' : ' story-body--empty'}">
          ${bodyInnerHtml}
        </div>
      </div>
    </div>
  `;

  return `
    <div class="story-row${isEssential ? ' story-row--essential' : ''}">
      <div class="story-row-main">
        <div class="story-row-text">
          <div class="story-headline-line">
            ${badge}<a href="${escapeHtml(story.url)}" target="_blank" rel="noopener" class="story-headline">${escapeHtml(story.headline)}</a>
          </div>
          <p class="story-summary">${escapeHtml(capFirst(story.summary))}</p>
        </div>
        ${expandBtn}
      </div>
      ${bodyHtml}
    </div>
  `;
}

function groupByCategory(stories) {
  const groups = {};
  for (const cat of CATEGORY_ORDER) {
    groups[cat] = [];
  }
  const uncategorized = [];

  for (const story of stories) {
    const cat = story.category;
    if (cat && groups[cat] !== undefined) {
      groups[cat].push(story);
    } else {
      uncategorized.push(story);
    }
  }

  return { groups, uncategorized };
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function initProgressBar() {
  const bar = document.createElement('div');
  bar.id = 'scroll-progress';
  document.body.appendChild(bar);

  function update() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;

    const rawPct = Math.min(scrollTop / docHeight, 1);

    // Psychological curve: exponent < 1 makes bar move faster at the start,
    // giving the illusion of more progress than has actually been made.
    const displayPct = Math.pow(rawPct, 0.55);

    bar.style.width = (displayPct * 100) + '%';
    bar.style.opacity = scrollTop > 40 ? '1' : '0';
  }

  window.addEventListener('scroll', update, { passive: true });
}

// ─── Today page ──────────────────────────────────────────────────────────────

async function initTodayPage() {
  const container = document.getElementById('todayContent');
  if (!container) return;

  initProgressBar();

  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');

  try {
    let reportFile;

    if (dateParam) {
      reportFile = `data/${dateParam}.json`;
    } else {
      const latestRes = await fetch('data/latest.json');
      if (!latestRes.ok) throw new Error('Could not load latest.json');
      const latest = await latestRes.json();
      if (!latest.file) {
        showError(container, 'No reports published yet. Check back soon.');
        return;
      }
      reportFile = `data/${latest.file}`;
    }

    const reportRes = await fetch(reportFile);
    if (!reportRes.ok) throw new Error(`Could not load report: ${reportFile}`);
    const report = await reportRes.json();

    renderToday(container, report);
  } catch (err) {
    showError(container, `Couldn't load today's report. (${err.message})`);
  }
}

function renderToday(container, report) {
  document.title = `${report.date} — Distillr`;

  const top4 = report.stories.filter(s => s.top4);
  const rest  = report.stories.filter(s => !s.top4);

  // ── Essentials zone ──────────────────────────────────────────────────────
  const essentialsHtml = top4.length ? `
    <div class="essentials-zone">
      <span class="essentials-label">The Essentials</span>
      ${top4.map(s => storyRowHtml(s, true)).join('')}
    </div>
  ` : '';

  // ── Transition divider ────────────────────────────────────────────────────
  const transitionText = report.transitionLine || 'And now, the rest';
  const transitionHtml = (top4.length && rest.length) ? `
    <div class="transition-divider">
      <span>${escapeHtml(transitionText)}</span>
    </div>
  ` : '';

  // ── Categorized full list ─────────────────────────────────────────────────
  const { groups, uncategorized } = groupByCategory(rest);

  let fullListHtml = '';
  for (const cat of CATEGORY_ORDER) {
    const stories = groups[cat];
    if (!stories || !stories.length) continue;
    const subtitle = CATEGORY_SUBTITLES[cat] || '';
    fullListHtml += `
      <section class="category-section" data-category="${escapeHtml(cat)}">
        <div class="category-header">
          <span class="category-title">${escapeHtml(cat)}</span>
          <span class="category-subtitle">${escapeHtml(subtitle)}</span>
        </div>
        ${stories.map(s => storyRowHtml(s, false)).join('')}
      </section>
    `;
  }

  if (uncategorized.length) {
    fullListHtml += `
      <section class="category-section" data-category="More">
        <div class="category-header">
          <span class="category-title">More</span>
        </div>
        ${uncategorized.map(s => storyRowHtml(s, false)).join('')}
      </section>
    `;
  }

  // ── Sources drawer ────────────────────────────────────────────────────────
  const sourcesHtml = report.stories
    .filter(s => s.url)
    .map(s => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.source)} — ${escapeHtml(s.url)}</a></li>`)
    .join('');

  container.innerHTML = `
    <div class="report-header">
      <p class="date-label">${escapeHtml(report.date)}</p>
      <h1>Today's Rundown</h1>
      ${report.welcomeLine ? `<p class="welcome-line">${escapeHtml(report.welcomeLine)}</p>` : ''}
    </div>
    ${essentialsHtml}
    ${transitionHtml}
    <div class="full-list">
      ${fullListHtml}
    </div>
    <details class="sources-drawer">
      <summary>Sources</summary>
      <ul>${sourcesHtml}</ul>
    </details>
  `;

  initExpandCollapse(container);
}

function initExpandCollapse(container) {
  container.addEventListener('click', e => {
    // Let link clicks through — headline should navigate, not expand
    if (e.target.closest('a')) return;

    const row = e.target.closest('.story-row');
    if (!row) return;
    const panel = row.querySelector('.story-expand');
    if (!panel) return;

    const btn = row.querySelector('.expand-btn');
    const isOpen = panel.classList.toggle('open');
    if (btn) {
      btn.textContent = isOpen ? 'Less ↑' : 'More ↓';
      btn.setAttribute('aria-expanded', String(isOpen));
    }
  });
}

// ─── Archive page ─────────────────────────────────────────────────────────────

async function initArchivePage() {
  const container = document.getElementById('archiveContent');
  if (!container) return;

  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error('Could not load index.json');
    const index = await res.json();

    if (!index.length) {
      showError(container, 'No reports published yet. Check back soon.');
      return;
    }

    renderArchive(container, index);
  } catch (err) {
    showError(container, `Couldn't load the archive. (${err.message})`);
  }
}

function renderArchive(container, index) {
  const colors = [
    '#7C83D4', '#E07A8F', '#E8A84C',
    '#5CBD9A', '#5AAFE0', '#A87ED4',
  ];

  const tilesHtml = index.map((entry, i) => {
    const color = colors[i % colors.length];
    const href = `today.html?date=${encodeURIComponent(entry.dateISO)}`;

    return `
      <a href="${href}" class="tile">
        <span class="tile-accent" style="background:${color}"></span>
        <span class="tile-date-big">${escapeHtml(entry.date)}</span>
        <span class="tile-tagline">${escapeHtml(entry.tagline || entry.storyCount + ' stories')}</span>
      </a>
    `;
  }).join('');

  container.innerHTML = `<div class="tile-grid">${tilesHtml}</div>`;
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTodayPage();
  initArchivePage();
});
