// ─── SCROLL REVEAL ────────────────────────────────────
const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
reveals.forEach(el => revealObserver.observe(el));

// ─── NAV ACTIVE (scroll, same-page anchors only) ──────
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-links a');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => { if (window.scrollY >= s.offsetTop - 80) current = s.id; });
  navLinks.forEach(a => {
    const href = a.getAttribute('href');
    if (href && href.startsWith('#')) {
      a.style.color = href === '#' + current ? 'var(--gold)' : '';
    }
  });
});

// ─── MOBILE HAMBURGER ─────────────────────────────────
function toggleMenu() {
  const links = document.querySelector('.nav-links');
  const burger = document.querySelector('.nav-burger');
  if (!links || !burger) return;
  links.classList.toggle('open');
  burger.classList.toggle('open');
}
// Close menu on outside click
document.addEventListener('click', e => {
  const links = document.querySelector('.nav-links');
  const burger = document.querySelector('.nav-burger');
  if (links && burger && links.classList.contains('open') &&
      !links.contains(e.target) && !burger.contains(e.target)) {
    links.classList.remove('open');
    burger.classList.remove('open');
  }
});

// ─── LUCIDE ICONS ─────────────────────────────────────
if (typeof lucide !== 'undefined') lucide.createIcons();

// ─── SKILL BAR ANIMATION ──────────────────────────────
const bars = document.querySelectorAll('.skill-bar-fill');
if (bars.length) {
  const barObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        barObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  bars.forEach(b => barObserver.observe(b));
}

// ─── FEEDBACK FORM ────────────────────────────────────
let selectedProfile = 'entreprise';

function selectProfile(btn) {
  document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedProfile = btn.dataset.profile;
}

async function submitFeedback(btn) {
  const consent = document.getElementById('consent');
  const errorEl = document.querySelector('.consent-error');

  if (!consent || !consent.checked) {
    if (errorEl) { errorEl.classList.add('show'); }
    consent && consent.closest('.consent-label').classList.add('shake');
    setTimeout(() => consent && consent.closest('.consent-label').classList.remove('shake'), 400);
    return;
  }

  if (errorEl) errorEl.classList.remove('show');

  const nom     = document.getElementById('fb-nom')?.value.trim() || '';
  const contact = document.getElementById('fb-contact')?.value.trim() || '';
  const message = document.getElementById('fb-message')?.value.trim() || '';
  const profil  = selectedProfile === 'entreprise' ? 'En entreprise' : 'Étudiant(e)';

  btn.disabled = true;
  btn.textContent = 'Envoi en cours…';

  // ── FORMSPREE ──────────────────────────────────────────────
  const FORMSPREE_ID = 'xreyaeye';

  try {
    const response = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        profil,
        nom:        nom     || '(non renseigné)',
        contact:    contact || '(non renseigné)',
        message:    message || '(non renseigné)',
        consentement: 'Oui'
      })
    });

    if (response.ok) {
      const formContent = document.getElementById('feedback-form-content');
      const successEl   = document.getElementById('feedback-success');
      if (formContent) formContent.style.display = 'none';
      if (successEl)   successEl.classList.add('show');
    } else {
      throw new Error('Erreur réseau');
    }
  } catch (e) {
    // Fallback mailto si Formspree n'est pas encore configuré
    const body = [
      `Profil : ${profil}`,
      nom     ? `Nom : ${nom}`         : '',
      contact ? `Contact : ${contact}` : '',
      message ? `Message : ${message}` : '',
      'Consentement recontact : Oui'
    ].filter(Boolean).join('\n');
    window.location.href = `mailto:anatoleruault3@gmail.com?subject=Feedback%20site%20%E2%80%93%20${encodeURIComponent(profil)}&body=${encodeURIComponent(body)}`;
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = 'Envoyer mon feedback';
    }, 500);
  }
}
