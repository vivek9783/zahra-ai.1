const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
let history = store.get('z_chat', []);
let prefs = Object.assign({ lang: 'hi-IN', rate: 1, voice: '', auto: true }, store.get('z_prefs', {}));
let notes = store.get('z_notes', []);
const orb = $('#orb'), statusEl = $('#status'), caption = $('#caption');

function setState(s, text) { orb.className = 'orb ' + s; if (text) statusEl.textContent = text; }
function savePrefs() { store.set('z_prefs', prefs); }

/* ---------- Chat UI ---------- */
function renderLog() {
  $('#log').innerHTML = '';
  history.forEach(m => {
    const d = document.createElement('div');
    d.className = 'msg ' + m.role; d.textContent = m.content;
    $('#log').appendChild(d);
  });
  $('#log').scrollTop = 1e9;
}
function addMsg(role, content) {
  history.push({ role, content });
  history = history.slice(-60);
  store.set('z_chat', history);
  renderLog();
  if (role === 'assistant') caption.textContent = content;
}
function addAction(label, url) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => { location.href = url; };
  $('#actions').appendChild(b);
}

/* ---------- Voice output ---------- */
function loadVoices() {
  const sel = $('#voice'), vs = speechSynthesis.getVoices();
  sel.innerHTML = '<option value="">Auto (default)</option>';
  vs.filter(v => /hi|en-IN|en/i.test(v.lang)).forEach(v => {
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  });
  sel.value = prefs.voice;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = prefs.lang; u.rate = prefs.rate;
  const v = speechSynthesis.getVoices().find(x => x.name === prefs.voice)
    || speechSynthesis.getVoices().find(x => x.lang.startsWith(prefs.lang.slice(0, 2)) && /female|hindi|हिन्दी|google/i.test(x.name));
  if (v) u.voice = v;
  u.onstart = () => setState('speaking', 'Zahra bol rahi hai…');
  u.onend = u.onerror = () => setState('idle', 'Mic dabao aur bolo.');
  speechSynthesis.speak(u);
}

/* ---------- Voice input ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false;
function startListening() {
  if (!SR) { statusEl.textContent = 'Is browser me voice input nahi hai. Chrome use karo.'; return; }
  speechSynthesis.cancel();
  rec = new SR(); rec.lang = prefs.lang; rec.interimResults = true; rec.continuous = false;
  rec.onstart = () => { listening = true; $('#mic').classList.add('on'); setState('listening', 'Sun rahi hoon…'); };
  rec.onresult = e => {
    const r = e.results[e.results.length - 1];
    caption.textContent = r[0].transcript;
    if (r.isFinal) handle(r[0].transcript);
  };
  rec.onerror = e => {
    const msg = { 'not-allowed': 'Mic ki permission band hai. Chrome settings me Microphone allow karo.', 'no-speech': 'Kuch sunai nahi diya, phir try karo.', 'network': 'Voice ke liye internet chahiye.', 'audio-capture': 'Mic nahi mila.' };
    setState('idle', msg[e.error] || 'Voice error: ' + e.error);
  };
  rec.onend = () => { listening = false; $('#mic').classList.remove('on'); if (orb.classList.contains('listening')) setState('idle', 'Mic dabao aur bolo.'); };
  try { rec.start(); } catch {}
}
function stopListening() { if (rec) rec.stop(); }
$('#mic').onclick = () => listening ? stopListening() : startListening();

/* ---------- Local commands ---------- */
const enc = encodeURIComponent;
const intent = (host, pkg, fb) => `intent://${host}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${enc(fb)};end`;
const APPS = [
  { re: /youtube|यूट्यूब|यूट्यूब/, name: 'YouTube', url: intent('www.youtube.com/', 'com.google.android.youtube', 'https://www.youtube.com') },
  { re: /whatsapp|व्हाट्सएप|वॉट्सएप|व्हाट्सऐप/, name: 'WhatsApp', url: 'intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;S.browser_fallback_url=' + enc('https://wa.me/') + ';end' },
  { re: /chrome|क्रोम/, name: 'Chrome', url: intent('www.google.com/', 'com.android.chrome', 'https://www.google.com') },
  { re: /settings|सेटिंग/, name: 'Phone Settings', url: 'intent:#Intent;action=android.settings.SETTINGS;end' },
  { re: /google|गूगल/, name: 'Google', url: 'https://www.google.com' }
];
const OPEN = /open|kholo|khol|start|खोलो|खोल|चालू|ओपन/;
const CALC_WORDS = [[/plus|जोड़|जमा/g, '+'], [/minus|घटा/g, '-'], [/times|multiply|into|गुणा/g, '*'], [/divided by|divide|भाग/g, '/'], [/x/g, '*'], [/×/g, '*'], [/÷/g, '/']];

function calc(expr) {
  let e = expr.toLowerCase();
  CALC_WORDS.forEach(([r, v]) => e = e.replace(r, v));
  e = e.replace(/[^0-9+\-*/().%\s]/g, '').trim();
  if (!e || !/\d/.test(e) || e.length > 80) return null;
  try { const r = Function('"use strict";return (' + e + ')')(); return Number.isFinite(r) ? +r.toFixed(6) : null; } catch { return null; }
}
function setReminder(min, text) {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  setTimeout(() => {
    const body = text || 'Aapka reminder!';
    speak('Reminder. ' + body);
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(r => r.showNotification('Zahra Reminder', { body, icon: 'icon-192.png', vibrate: [200, 100, 200] }));
    }
  }, min * 60000);
  return `Theek hai, ${min} minute baad yaad dilaungi. (App khula rehna chahiye.)`;
}
function localCommand(t) {
  const s = t.toLowerCase().trim();
  const now = new Date();
  let m;
  if ((m = s.match(/(\d+)\s*(minute|min|मिनट|घंटा|घंटे|hour)/)) && /remind|yaad|याद|reminder|रिमाइंडर/.test(s)) {
    let mins = +m[1]; if (/घंटा|घंटे|hour/.test(m[2])) mins *= 60;
    return setReminder(mins, s.replace(m[0], '').replace(/baad|बाद|remind me|reminder|yaad dilao|याद दिलाओ|रिमाइंडर|to|मुझे/g, '').trim());
  }
  if ((m = s.match(/^(?:note|नोट)\s*(?:karo|करो|:)?\s*(.+)/))) { notes.push(m[1]); store.set('z_notes', notes); renderNotes(); return 'Note save kar liya.'; }
  if (/time|samay|kitne baje|समय|टाइम|कितने बजे/.test(s) && !/search/.test(s))
    return 'Abhi ' + now.toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }) + ' baje hain.';
  if (/date|tarikh|tareekh|तारीख|आज कौन सा दिन|today/.test(s) && !/search/.test(s))
    return 'Aaj ' + now.toLocaleDateString('hi-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' hai.';
  if ((m = s.match(/^(?:calculate|calculator|hisab|हिसाब|कैलकुलेट)\s*(.+)/))) { const r = calc(m[1]); return r === null ? 'Ye hisab samajh nahi aaya.' : `Jawab hai ${r}.`; }
  if ((m = s.match(/(?:search|google par|google pe|सर्च|खोजो|गूगल पर)\s*(?:for|karo|करो)?\s*(.+)/))) {
    const q = m[1].replace(/^(karo|करो)\s*/, '');
    addAction('🔍 Google par dekho', 'https://www.google.com/search?q=' + enc(q));
    return `"${q}" ke liye Google search taiyaar hai. Niche button dabao.`;
  }
  if ((m = s.match(/(https?:\/\/\S+|\b[\w-]+\.(?:com|in|org|net)\b\S*)/))) {
    const u = m[1].startsWith('http') ? m[1] : 'https://' + m[1];
    addAction('🌐 Link kholo', u);
    return 'Link taiyaar hai. Niche button dabao.';
  }
  if (OPEN.test(s)) {
    const app = APPS.find(a => a.re.test(s));
    if (app) {
      addAction('▶ ' + app.name + ' kholo', app.url);
      return app.name + ' kholne ke liye niche button dabao.' + (app.name === 'Phone Settings' ? ' (Kuch phones par ye block ho sakta hai.)' : '');
    }
  }
  return null;
}

/* ---------- Main handler ---------- */
let busy = false;
async function handle(text) {
  text = (text || '').trim();
  if (!text || busy) return;
  busy = true; $('#actions').innerHTML = '';
  addMsg('user', text); caption.textContent = '';
  let reply = localCommand(text);
  if (reply === null) {
    setState('thinking', 'Soch rahi hoon…');
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-12) })
      });
      const d = await r.json();
      reply = r.ok ? d.reply : '⚠️ ' + (d.error || 'Kuch galat ho gaya.');
    } catch { reply = '⚠️ Server se connect nahi ho paayi. Internet check karo.'; }
  }
  addMsg('assistant', reply);
  setState('idle', 'Mic dabao aur bolo.');
  if (prefs.auto && !reply.startsWith('⚠️')) speak(reply);
  busy = false;
}
$('#send').onclick = () => { const v = $('#txt').value; $('#txt').value = ''; handle(v); };
$('#txt').onkeydown = e => { if (e.key === 'Enter') $('#send').click(); };

/* ---------- Tools ---------- */
$('#calcBtn').onclick = () => { const r = calc($('#calcIn').value); $('#calcOut').textContent = r === null ? 'Galat expression' : '= ' + r; };
$('#remBtn').onclick = () => {
  const m = +$('#remMin').value; if (!m || m < 1) return;
  $('#remTxt').value && 0;
  alert(setReminder(m, $('#remTxt').value.trim().slice(0, 100)));
};
function renderNotes() {
  const ul = $('#notes'); ul.innerHTML = '';
  notes.forEach((n, i) => {
    const li = document.createElement('li');
    const sp = document.createElement('span'); sp.textContent = n;
    const b = document.createElement('button'); b.textContent = '🗑';
    b.onclick = () => { notes.splice(i, 1); store.set('z_notes', notes); renderNotes(); };
    li.append(sp, b); ul.appendChild(li);
  });
}
$('#noteBtn').onclick = () => { const v = $('#noteIn').value.trim().slice(0, 500); if (!v) return; notes.push(v); store.set('z_notes', notes); $('#noteIn').value = ''; renderNotes(); };

/* ---------- Settings & panels ---------- */
document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => $('#' + b.dataset.open).classList.add('open'));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => b.closest('.sheet').classList.remove('open'));
$('#lang').onchange = e => { prefs.lang = e.target.value; savePrefs(); };
$('#voice').onchange = e => { prefs.voice = e.target.value; savePrefs(); };
$('#rate').oninput = e => { prefs.rate = +e.target.value; $('#rateVal').textContent = prefs.rate; savePrefs(); };
$('#auto').onchange = e => { prefs.auto = e.target.checked; savePrefs(); };
$('#testVoice').onclick = () => speak('Namaste, main Zahra hoon. Aapki kya madad kar sakti hoon?');
$('#clearChat').onclick = () => { history = []; store.set('z_chat', []); renderLog(); caption.textContent = ''; };
$('#wipe').onclick = () => {
  if (!confirm('Chat, notes aur settings sab delete ho jayenge. Pakka?')) return;
  ['z_chat', 'z_prefs', 'z_notes'].forEach(k => localStorage.removeItem(k));
  location.reload();
};
$('#lang').value = prefs.lang; $('#rate').value = prefs.rate; $('#rateVal').textContent = prefs.rate; $('#auto').checked = prefs.auto;
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
renderLog(); renderNotes();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
