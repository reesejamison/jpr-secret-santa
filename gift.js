const app = document.querySelector('#app');
const token = new URLSearchParams(location.hash.slice(1)).get('gift');
const state = { gift: null, status: token ? 'loading' : 'welcome', error: '' };

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function renderWheel() {
  const names = state.gift.eligible;
  const colors = ['#d3e2cf', '#e7bf9c', '#f0d99c', '#aac9b5', '#e8b3a5', '#e9d8bd', '#b6d2c8', '#e7c787', '#d2c4ac', '#b4c9a0'];
  const segment = 360 / names.length;
  const background = names.map((name, index) => `${colors[index % colors.length]} ${index * segment}deg ${(index + 1) * segment}deg`).join(',');
  const labels = names.map((name, index) => `<span class="wheel-label" style="--label-angle:${(index + 0.5) * segment}deg">${escapeHTML(name)}</span>`).join('');
  const selected = names.indexOf(state.gift.recipient);
  const angle = selected < 0 ? 0 : (360 - (selected + 0.5) * segment) % 360;
  return `<div class="wheel-wrap"><div class="wheel-pointer"></div><div class="wheel ${state.status === 'spinning' ? 'spinning' : ''}" style="--wheel-background:conic-gradient(${background});--wheel-angle:${angle}deg;--spin-angle:${angle + 1440}deg" aria-label="Wheel of eligible recipients">${labels}<div class="wheel-center"><i data-lucide="gift"></i></div></div></div>`;
}

function render() {
  let content;
  if (state.status === 'loading') content = '<p class="loading">Just a moment...</p>';
  else if (state.status === 'welcome') content = '<div class="eyebrow"><span class="sparkle">✳</span> THE HOLIDAY EDITION</div><h1>A little surprise<br><em>awaits.</em></h1><p>Open your personal link to find your Secret Santa match.</p><div class="welcome-gift"><i data-lucide="gift"></i></div>';
  else if (state.status === 'error') content = `<div class="eyebrow"><span class="sparkle">✳</span> OOPS</div><h1>That link isn’t<br><em>quite right.</em></h1><p>${escapeHTML(state.error)}</p>`;
  else {
    const revealed = state.status === 'revealed';
    content = `<div class="eyebrow"><span class="sparkle">✳</span> A LITTLE SOMETHING FOR ${escapeHTML(state.gift.giver.toUpperCase())}</div><h1>${revealed ? 'The secret is' : 'A little spin.'}<br><em>${revealed ? 'out.' : 'A big surprise.'}</em></h1><p>${revealed ? 'You’re making the holidays brighter for...' : 'Your Secret Santa match is waiting.'}</p>${renderWheel()}${revealed ? `<div class="reveal"><span>YOU’RE GIFTING TO</span><strong>${escapeHTML(state.gift.recipient)}</strong><small>Shh... it’s our little secret.</small></div>` : `<button id="spin" class="primary-button spin-button" ${state.status === 'spinning' || state.status === 'fetching' ? 'disabled' : ''}>${state.status === 'spinning' || state.status === 'fetching' ? 'Finding your match...' : 'Spin for your match'} <i data-lucide="sparkles"></i></button>`}${state.error ? `<p class="error" role="alert">${escapeHTML(state.error)}</p>` : ''}`;
  }
  app.innerHTML = `<header class="topbar"><a class="brand" href="./" aria-label="JPR Secret Santa home"><span class="brand-mark"><i data-lucide="gift"></i></span><span>JPR SECRET SANTA<small>THE HOLIDAY EDITION</small></span></a><span class="topbar-note"><span class="status-dot"></span> MADE FOR YOUR PEOPLE</span></header><main class="gift-page"><div class="gift-content">${content}</div></main><footer><span>JPR <span class="footer-star">✳</span> SECRET SANTA</span><span>A LITTLE MAGIC, JUST FOR US.</span></footer>`;
  if (window.lucide) window.lucide.createIcons();
}

async function getGift(options) {
  if (document.querySelector('meta[name="static-draw"]')) return getStaticGift(options);
  const response = await fetch(`/api/gift/${encodeURIComponent(token)}`, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}

async function getStaticGift(options) {
  try {
    const encoder = new TextEncoder();
    const lookupBytes = await crypto.subtle.digest('SHA-256', encoder.encode(token));
    const lookup = Array.from(new Uint8Array(lookupBytes), byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await fetch('./draw.json', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const record = (await response.json())[lookup];
    if (!record) throw new Error();
    const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`secret-santa-key:${token}`));
    const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
    const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.ciphertext));
    const gift = JSON.parse(new TextDecoder().decode(plaintext));
    const storageKey = `santa-revealed:${lookup}`;
    let revealed = false;
    try {
      if (options?.method === 'POST') localStorage.setItem(storageKey, 'true');
      revealed = localStorage.getItem(storageKey) === 'true';
    } catch { revealed = options?.method === 'POST'; }
    return { giver: gift.giver, eligible: gift.eligible, revealed, ...(revealed ? { recipient: gift.recipient } : {}) };
  } catch {
    throw new Error('This gift link could not be found.');
  }
}

app.addEventListener('click', async event => {
  if (!event.target.closest('#spin')) return;
  state.status = 'fetching'; state.error = ''; render();
  try {
    state.gift = await getGift({ method: 'POST' });
    state.status = 'spinning'; render();
    await new Promise(resolve => setTimeout(resolve, 2200));
    state.status = 'revealed';
  } catch (error) { state.error = error.message; state.status = 'ready'; }
  render();
});

render();
if (token) {
  getGift().then(gift => {
    state.gift = gift; state.status = gift.revealed ? 'revealed' : 'ready'; render();
  }).catch(error => { state.error = error.message; state.status = 'error'; render(); });
}