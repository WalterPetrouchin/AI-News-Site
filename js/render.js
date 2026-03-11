// render.js — Data fetching and rendering for today.html and archive.html

// ─── Shared helpers ──────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(container, message) {
  container.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
}

// ─── Today page ──────────────────────────────────────────────────────────────

async function initTodayPage() {
  const container = document.getElementById('todayContent');
  if (!container) return;

  // Check for ?date=YYYY-MM-DD query param (used by archive links)
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
  // Update page title
  document.title = `${report.date} — AI News`;

  const storiesHtml = report.stories.map(story => `
    <article class="story">
      <div class="story-meta">
        <span class="story-rank" style="color:${escapeHtml(story.color)}">#${story.rank}</span>
        <span class="story-source">${escapeHtml(story.source)}</span>
        <span class="story-score" style="background:${escapeHtml(story.color)}20; color:${escapeHtml(story.color)}">${story.score}/25</span>
      </div>
      <h2><a href="${escapeHtml(story.url)}" target="_blank" rel="noopener">${escapeHtml(story.headline)}</a></h2>
      <p>${escapeHtml(story.summary)}</p>
    </article>
  `).join('');

  const themeHtml = report.theme
    ? `<p class="theme-label">Today's theme: ${escapeHtml(report.theme)}</p>`
    : '';

  container.innerHTML = `
    <p class="date-label">${escapeHtml(report.date)}</p>
    <h1>Today's AI Rundown</h1>
    ${themeHtml}
    ${storiesHtml}
  `;
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
  const tilesHtml = index.map((entry, i) => {
    const color = [
      '#7C83D4', '#E07A8F', '#E8A84C',
      '#5CBD9A', '#5AAFE0', '#A87ED4',
    ][i % 6];

    const href = `today.html?date=${encodeURIComponent(entry.dateISO)}`;

    return `
      <a href="${href}" class="tile">
        <span class="tile-accent" style="background:${color}"></span>
        <span class="tile-headline">${escapeHtml(entry.lead)}</span>
        <span class="tile-date">${escapeHtml(entry.date)}</span>
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
