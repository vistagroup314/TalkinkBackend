const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();

// 🔐 Secure Fully Opened CORS for testing & production
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔐 Instamojo LIVE Production Credentials
const CLIENT_ID = 'LHym2sPPH5chVDyxD1UDUZ1jcNtjng9BlWJN5hil';
const CLIENT_SECRET = 'YLWjfxmj2IT2DbDD0fMmCYkDqyWeChtOIUCpppNUSoh98X06upVVeXag6RDU11NARLX88QVn53XiJ5G8QGmLnftju33l30yU6zqeUuXHIMErELw7AAdwVkSwWbp3aW9Y';

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
          reject(new Error("Non-JSON response received from gateway"));
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (payloadData) req.write(payloadData);
    req.end();
  });
}

// ==========================================================================
// ⚡ SILENT BACKGROUND SERVER WAKEUP PING ENDPOINT
// ==========================================================================
app.get('/ping', (req, res) => {
   console.log("⚡ [Narrato Lifecycle] Silent wakeup handshake received. Server is awake!");
   res.status(200).send("WOKE_UP");
});

// ==========================================================================
// 💳 EXISTING INSTAMOJO ORDER CREATION ROUTE
// ==========================================================================
app.post('/create-order', async (req, res) => {
  try {
    const { amount, purpose, buyer_name, email, bookId } = req.body;

    const tokenPayload = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }).toString();

    const tokenOptions = {
      hostname: 'api.instamojo.com', 
      path: '/oauth2/token/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(tokenPayload)
      }
    };

    console.log("Generating Production OAuth2 Token...");
    const tokenResult = await makeHttpsRequest(tokenOptions, tokenPayload);

    if (tokenResult.statusCode !== 200 || !tokenResult.data.access_token) {
      return res.status(401).json({
        success: false,
        message: "Live Authentication failed. KYC might be pending.",
        details: tokenResult.data
      });
    }

    const accessToken = tokenResult.data.access_token;

    const requestOrigin = req.headers.origin || 'https://bhoiganesh218.github.io';
    const redirectUrl = `${requestOrigin}/talkink/?page=LibraryPage&bookId=${bookId}`;

    const paymentPayload = JSON.stringify({
      amount: String(amount),
      purpose: purpose || 'TalkInk Book Purchase',
      buyer_name: buyer_name || 'TalkInk User',
      email: email || 'user@talkink.com',
      phone: '9999999999',
      allow_repeated_payments: false,
      send_email: true,
      send_sms: false,
      redirect_url: redirectUrl,
      webhook: 'https://talkinkbackend.onrender.com/instamojo-webhook'
    });

    const paymentOptions = {
      hostname: 'api.instamojo.com', 
      path: '/v2/payment_requests/',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(paymentPayload)
      }
    };

    const paymentResult = await makeHttpsRequest(paymentOptions, paymentPayload);

    if (paymentResult.statusCode >= 200 && paymentResult.statusCode < 300 && paymentResult.data.id) {
      res.status(200).json({
        success: true,
        longurl: paymentResult.data.longurl,
        id: paymentResult.data.id
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Production gateway rejected request. Check account verification.",
        error: paymentResult.data
      });
    }

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/instamojo-webhook', (req, res) => {
   res.status(200).send("OK");
});


// ==========================================================================
// 🔊 OPTIMIZED: HIGH-SPEED TEXT CHUNKING GOOGLE SPEECH GATEWAY
// ==========================================================================
app.post('/tts-stream', async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Text chunk matrix is missing." });
    }

    let targetLocale = 'en';
    if (lang === 'hi') targetLocale = 'hi';
    else if (lang === 'or') targetLocale = 'or';
    else if (lang === 'bn') targetLocale = 'bn';
    else if (lang === 'es') targetLocale = 'es';
    else if (lang === 'fr') targetLocale = 'fr';

    console.log(`[Narrato Core Engine] Chunking text for language code: ${targetLocale}`);

    // 🔥 SMART FIX: Break paragraph into clean sentences safely
    const sentences = text.match(/[^.!?।]+[.!?门]?/g) || [text];
    let subChunks = [];

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

      // If any single sentence still breaks the 150 char limit, split it by spaces
      while (sentence.length > 150) {
        let part = sentence.substring(0, 150);
        let lastSpace = part.lastIndexOf(' ');
        if (lastSpace > 50) {
          part = sentence.substring(0, lastSpace);
        }
        subChunks.push(part);
        sentence = sentence.substring(part.length).trim();
      }
      if (sentence) subChunks.push(sentence);
    }

    // Set chunked streaming content-type headers for real-time play
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    let currentStreamIndex = 0;

    // Sequential recursion helper to keep piping audio fragments
    function streamNextChunk() {
      if (currentStreamIndex >= subChunks.length) {
        return res.end(); // Successfully finished transferring all blocks
      }

      const currentText = subChunks[currentStreamIndex];
      const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${targetLocale}&client=tw-ob&q=${encodeURIComponent(currentText)}`;

      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://translate.google.com/'
        }
      };

      https.get(googleTtsUrl, requestOptions, (googleRes) => {
        if (googleRes.statusCode === 200) {
          // Stream raw buffer chunks to response directly without closing 'res'
          googleRes.on('data', (chunk) => res.write(chunk));
          googleRes.on('end', () => {
            currentStreamIndex++;
            streamNextChunk(); // Chain to the next clean sentence chunk
          });
        } else {
          console.error(`Google rejected chunk stream. Status code: ${googleRes.statusCode}`);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: `Cloud sync break at index ${currentStreamIndex}` });
          }
        }
      }).on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: err.message });
        }
      });
    }

    // Fire the initial chunk stream sequence
    streamNextChunk();

  } catch (err) {
    console.error("❌ High-Speed Vocal Engine Fault:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || "Cloud vocal pipeline synchronization failed." });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production Engine active on port ${PORT}`));
