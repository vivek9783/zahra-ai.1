require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const PORT = process.env.PORT || 3000;
const SYSTEM = `Tum Zahra ho, ek friendly aur respectful female personal AI assistant.
User ki bhasha me jawab do (Hindi, Hinglish ya English). Jawab chhota aur saaf rakho (1-3 vaakya) jab tak user detail na maange.
Tum phone ke apps khud control nahi kar sakti; agar user app kholne ko kahe to bolo ki "Open" button dabaye. Kabhi jhooth mat bolo ki tumne koi kaam kar diya agar tum nahi kar sakti.
Password ya sensitive personal jaankari maangna mat.`;

app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use('/api/', rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { error: 'Bahut zyada requests. Thodi der baad try karo.' }
}));

function validate(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return null;
    const c = m.content.trim().slice(0, 2000);
    if (!c) return null;
    clean.push({ role: m.role, content: c });
  }
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== 'user') return null;
  return clean;
}

app.post('/api/chat', async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server par ANTHROPIC_API_KEY set nahi hai (.env check karo).' });
  const messages = validate(req.body && req.body.messages);
  if (!messages) return res.status(400).json({ error: 'Invalid message.' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Claude API error:', r.status, data);
      const msg = r.status === 401 ? 'API key galat hai.' : r.status === 429 ? 'Claude limit poori ho gayi, thodi der baad try karo.' : 'Claude se jawab nahi mila.';
      return res.status(502).json({ error: msg });
    }
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    res.json({ reply: reply || '...' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error. Internet ya timeout check karo.' });
  }
});

app.use(express.static(path.join(__dirname, '')));
app.listen(process.env.PORT || 10000, () => console.log(`Zahra AI chal rahi hai: http://localhost:${PORT}`));
