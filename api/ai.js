// Optional Vercel proxy. Env: GEMINI_API_KEY, GEMINI_MODEL (optional)
const PROMPTS = {
  city: "You are DhakaLens, an assistant explaining Dhaka neighbourhood conditions in plain language.",
  policy: "You are DhakaLens, an assistant explaining Bangladesh urban rules and policies simply. Do not give legal advice.",
  report: "You are DhakaLens, helping citizens draft clear civic issue reports for the right authority."
};
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  try {
    const { mode = 'city', question = '', history = [], context = {} } = req.body || {};
    if (!question || String(question).length > 2000) return res.status(400).json({ error: 'Invalid question' });
    const contents = [
      ...(Array.isArray(history) ? history.slice(-8) : []).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text || '').slice(0, 2000) }] })),
      { role: 'user', parts: [{ text: String(question) }] }
    ];
    const models = [process.env.GEMINI_MODEL || 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    const hosts = ['https://aiplatform.googleapis.com/v1/publishers/google/models/', 'https://generativelanguage.googleapis.com/v1beta/models/'];
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: (PROMPTS[mode] || PROMPTS.city) + '\nContext: ' + JSON.stringify(context).slice(0, 4000) + '\nReply in the user\'s language (English or Bengali).' }] }, contents });
    let d = null, err = 'Upstream error';
    outer: for (const m of models) for (const h of hosts) {
      const r = await fetch(h + m + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { d = j; break outer; }
      err = m + ': ' + ((j.error && j.error.message) || err);
    }
    if (!d) return res.status(502).json({ error: err });
    const answer = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!answer) return res.status(502).json({ error: 'Empty response from model' });
    res.status(200).json({ answer });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
};
