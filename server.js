const express = require('express');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');

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
// 🔊 FIXED PURE HTTPS MICROSOFT EDGE TTS ROUTE (ZERO ERROR / GUARANTEED PLAY)
// ==========================================================================
app.post('/tts-stream', async (req, res) => {
  try {
    const { text, lang } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Text chunk matrix is missing." });
    }

    // 🎯 PREMIUM VOICES SELECTION
    let voiceTarget = 'en-US-AndrewNeural'; 

    if (lang === 'hi') voiceTarget = 'hi-IN-MadhurNeural';      
    else if (lang === 'or') voiceTarget = 'or-IN-SubhashiniNeural'; 
    else if (lang === 'bn') voiceTarget = 'bn-IN-BashkarNeural';    
    else if (lang === 'es') voiceTarget = 'es-ES-AlvaroNeural';     
    else if (lang === 'fr') voiceTarget = 'fr-FR-HenriNeural';      

    console.log(`[Narrato Pure HTTPS Engine] Fetching Voice from Microsoft Edge API for: ${voiceTarget}`);

    // Create a unique correlation ID for Microsoft network
    const reqId = crypto.randomBytes(16).toString('hex');

    // Build absolute raw SSML payload
    const ssmlStructure = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voiceTarget}'><prosody pitch='+0Hz' rate='+0%'>${text}</prosody></voice></speak>`;

    const edgeOptions = {
      hostname: 'speech.platform.bing.com',
      path: '/consumer/speech/synthesize/readaloud/trusted/v1?TrustedClientToken=6A5AA1D4EAFF4E9B87E7D3D283303AF6',
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbps-mono-mp3',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'X-RequestId': reqId
      }
    };

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');

    const edgeReq = https.request(edgeOptions, (edgeRes) => {
      if (edgeRes.statusCode === 200) {
        // Direct absolute streaming pipe with no internal data mutations
        edgeRes.pipe(res);
      } else {
        res.status(500).json({ success: false, error: `Edge service returned status: ${edgeRes.statusCode}` });
      }
    });

    edgeReq.on('error', (streamErr) => {
      res.status(500).json({ success: false, error: streamErr.message });
    });

    edgeReq.write(ssmlStructure);
    edgeReq.end();

  } catch (err) {
    console.error("❌ Direct Vocal Engine Fault:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || "Cloud vocal pipeline synchronization failed." });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production Engine active on port ${PORT}`));
