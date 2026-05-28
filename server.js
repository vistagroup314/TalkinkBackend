const express = require('express');
const cors = require('cors');
const https = require('https');
const { OpenAI } = require('openai');

const app = express();

// 1. MIDDLEWARE SETUP
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. INSTAMOJO CONFIGURATION
const CLIENT_ID = 'LHym2sPPH5chVDyxD1UDUZ1jcNtjng9BlWJN5hil';
const CLIENT_SECRET = 'YLWjfxmj2IT2DbDD0fMmCYkDqyWeChtOIUCpppNUSoh98X06upVVeXag6RDU11NARLX88QVn53XiJ5G8QGmLnftju33l30yU6zqeUuXHIMErELw7AAdwVkSwWbp3aW9Y';

// 3. AI CLIENT SETUP (DeepSeek via OpenAI SDK)
// API Key automatically Render environment variable se uthegi
const client = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 4. HELPER: HTTPS REQUEST WRAPPER (For Instamojo)
function makeHttpsRequest(options, payloadData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (payloadData) req.write(payloadData);
    req.end();
  });
}

// 5. HELPER: TTS BUFFER GATEWAY
function fetchTtsBuffer(textChunk, targetLocale) {
  return new Promise((resolve, reject) => {
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLocale}&client=tw-ob&q=${encodeURIComponent(textChunk)}`;
    const requestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/'
      }
    };
    https.get(googleTtsUrl, requestOptions, (googleRes) => {
      if (googleRes.statusCode === 200) {
        const dataBlocks = [];
        googleRes.on('data', (chunk) => dataBlocks.push(chunk));
        googleRes.on('end', () => resolve(Buffer.concat(dataBlocks)));
      } else {
        reject(new Error(`TTS Fault: ${googleRes.statusCode}`));
      }
    }).on('error', (err) => reject(err));
  });
}

// 6. ROUTES: SYSTEM LIFE CYCLE
app.get('/ping', (req, res) => res.status(200).send("WOKE_UP"));

// 7. ROUTES: INSTAMOJO PAYMENT INTEGRATION
app.post('/create-order', async (req, res) => {
  try {
    const { amount, purpose, buyer_name, email, bookId } = req.body;
    const tokenPayload = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }).toString();
    const tokenOptions = { hostname: 'api.instamojo.com', path: '/oauth2/token/', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(tokenPayload) } };

    const tokenResult = await makeHttpsRequest(tokenOptions, tokenPayload);
    if (tokenResult.statusCode !== 200 || !tokenResult.data.access_token) {
      return res.status(401).json({ success: false, message: "Auth failed", details: tokenResult.data });
    }

    const accessToken = tokenResult.data.access_token;
    const requestOrigin = req.headers.origin || 'https://bhoiganesh218.github.io';
    const redirectUrl = `${requestOrigin}/talkink/?page=LibraryPage&bookId=${bookId}`;

    const paymentPayload = JSON.stringify({
      amount: String(amount), purpose: purpose || 'TalkInk Purchase', buyer_name: buyer_name || 'User', email: email || 'user@talkink.com',
      phone: '9999999999', allow_repeated_payments: false, send_email: true, send_sms: false, redirect_url: redirectUrl,
      webhook: 'https://talkinkbackend.onrender.com/instamojo-webhook'
    });

    const paymentOptions = { hostname: 'api.instamojo.com', path: '/v2/payment_requests/', method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(paymentPayload) } };
    const paymentResult = await makeHttpsRequest(paymentOptions, paymentPayload);

    if (paymentResult.statusCode >= 200 && paymentResult.statusCode < 300 && paymentResult.data.id) {
      res.status(200).json({ success: true, longurl: paymentResult.data.longurl, id: paymentResult.data.id });
    } else {
      res.status(400).json({ success: false, error: paymentResult.data });
    }
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/instamojo-webhook', (req, res) => res.status(200).send("OK"));

// 8. ROUTES: TTS STREAMING GATEWAY
app.post('/tts-stream', async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text) return res.status(400).json({ success: false });
    let targetLocale = lang || 'en';

    const sentences = text.match(/[^.!?।]+[.!?门]?/g) || [text];
    let subChunks = [];
    for (let sentence of sentences) {
      sentence = sentence.trim(); if (!sentence) continue;
      while (sentence.length > 150) {
        let part = sentence.substring(0, 150);
        let lastSpace = part.lastIndexOf(' ');
        if (lastSpace > 50) part = sentence.substring(0, lastSpace);
        subChunks.push(part); sentence = sentence.substring(part.length).trim();
      }
      if (sentence) subChunks.push(sentence);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    let idx = 0;
    function stream() {
      if (idx >= subChunks.length) return res.end();
      https.get(`https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLocale}&client=tw-ob&q=${encodeURIComponent(subChunks[idx])}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (googleRes) => {
        if (googleRes.statusCode === 200) {
          googleRes.on('data', (chunk) => res.write(chunk));
          googleRes.on('end', () => { idx++; stream(); });
        } else { res.status(500).end(); }
      });
    }
    stream();
  } catch (err) { res.status(500).end(); }
});

// 9. ROUTES: PRODUCTION AI EXPLAINER
app.post('/tts-ai-explain', async (req, res) => {
  const { text, lang } = req.body;
  try {
    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: `Read this and explain it simply like a close mentor in a friendly voice: "${text}"` }],
      model: "deepseek-chat",
    });

    const processedStoryText = completion.choices[0].message.content.trim();
    const chunkBuffer = await fetchTtsBuffer(processedStoryText.substring(0, 150), lang === 'hi' ? 'hi' : 'en');
    
    return res.status(200).json({
      success: true,
      explanationText: processedStoryText,
      audioBlobBase64: chunkBuffer.toString('base64')
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/smart-psychology-search', async (req, res) => {
   return res.status(200).json({ success: true, suggestions: ["Neuroplasticity", "Growth Mindset"] });
});

// 10. SERVER START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production engine running on ${PORT}`));
