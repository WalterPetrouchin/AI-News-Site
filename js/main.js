// ─── Color palette ──────────────────────────────────────────────────────────
// Soft premium colors — a larger pool so randomization feels fresh each visit
const PALETTE = [
  '#7C83D4', // soft indigo
  '#E07A8F', // dusty rose
  '#E8A84C', // warm amber
  '#5CBD9A', // sage mint
  '#5AAFE0', // sky blue
  '#A87ED4', // soft lavender
  '#E07858', // muted coral
  '#5AB8B0', // teal
  '#C47AC8', // soft violet
  '#7EC87A', // soft green
  '#D4A44C', // golden
  '#6AACE0', // cornflower
];

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Assign random unique colors to all letter elements on the page
function randomizeLetterColors() {
  const letters = document.querySelectorAll('.l-a, .l-i, .l-n, .l-e, .l-w, .l-s');
  if (!letters.length) return;

  const colors = shuffled(PALETTE);
  letters.forEach((el, i) => {
    el.style.color = colors[i % colors.length];
  });
}

// ─── Homepage: load animation ────────────────────────────────────────────────
function initHomeAnimation() {
  const wordmarkWrap = document.getElementById('wordmarkWrap');
  const actions = document.getElementById('homeActions');
  if (!wordmarkWrap || !actions) return;

  setTimeout(() => {
    wordmarkWrap.classList.add('shrunk');
    actions.classList.add('visible');
  }, 600);
}

// ─── Mouse parallax on the wordmark ─────────────────────────────────────────
function initParallax() {
  const parallax = document.getElementById('homeParallax');
  if (!parallax) return;

  document.addEventListener('mousemove', (e) => {
    const { innerWidth: w, innerHeight: h } = window;
    const x = ((e.clientX - w / 2) / w) * 18;
    const y = ((e.clientY - h / 2) / h) * 10;
    parallax.style.transform = `translate(${x}px, ${y}px)`;
  });
}

// ─── Cursor glow ─────────────────────────────────────────────────────────────
function initCursorGlow() {
  const glow = document.getElementById('cursorGlow');
  if (!glow) return;

  let glowX = window.innerWidth / 2;
  let glowY = window.innerHeight / 2;
  let targetX = glowX;
  let targetY = glowY;
  let active = false;

  document.addEventListener('mousemove', (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (!active) {
      active = true;
      glow.classList.add('active');
    }
  });

  // Smooth lerp so the glow trails slightly behind the cursor
  function tick() {
    glowX += (targetX - glowX) * 0.08;
    glowY += (targetY - glowY) * 0.08;
    glow.style.left = glowX + 'px';
    glow.style.top  = glowY + 'px';
    requestAnimationFrame(tick);
  }
  tick();
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  randomizeLetterColors();
  initHomeAnimation();
  initParallax();
  initCursorGlow();
});
