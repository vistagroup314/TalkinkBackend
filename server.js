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

// 🔥 PREMIUM GEMINI MULTI-KEY ROTATION MATRIX POOL
const GEMINI_KEYS_POOL = [
  'AIzaSyAPiZ4RiF1ekeg8duWDUtgp9ydcZEZhTkQ',
  'AIzaSyDm7XNhYo6Bn4BqMHFwcLhoEPWy6gHdHrg',
  'AIzaSyBoJ4DeqDr_PQpw-ZrP2MwFR4Fiu7iJrM4',
  'AIzaSyAewDQ2Opx4NBuCWycGtfEHj1Q_HnyUPg4'
];
let currentKeyIndex = 0;

// Helper to get active rotated key from pool array
function getActiveGeminiKey() {
  const activeKey = GEMINI_KEYS_POOL[currentKeyIndex];
  // Round-robin shift for the next transaction block execution
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS_POOL.length;
  return activeKey;
}

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

// Helper to fetch binary data buffer internally from Google TTS engine node
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
        reject(new Error(`Google TTS network stream rejected chunk status: ${googleRes.statusCode}`));
      }
    }).on('error', (err) => reject(err));
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

    const sentences = text.match(/[^.!?।]+[.!?门]?/g) || [text];
    let subChunks = [];

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

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

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Transfer-Encoding', 'chunked');

    let currentStreamIndex = 0;

    function streamNextChunk() {
      if (currentStreamIndex >= subChunks.length) {
        return res.end(); 
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
          googleRes.on('data', (chunk) => res.write(chunk));
          googleRes.on('end', () => {
            currentStreamIndex++;
            streamNextChunk(); 
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

    streamNextChunk();

  } catch (err) {
    console.error("❌ High-Speed Vocal Engine Fault:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message || "Cloud vocal pipeline synchronization failed." });
    }
  }
});


// ==========================================================================
// ✨ NEW HOOK: PREMIUM AUTOMATED AI STORY EXPLANATION AUDIO GATEWAY
// ==========================================================================
app.post('/tts-ai-explain', async (req, res) => {
  try {
    const { text, lang } = req.body; // lang will be 'hi' or 'en'

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Raw page stream text context is missing." });
    }

    const selectedLanguage = lang === 'hi' ? 'hi' : 'en';
    const activeKey = getActiveGeminiKey();

    console.log(`🤖 [AI Explanation Deck] Processing core stream. Rotating active key index layer.`);

    // Strict contextual system profiling prompt matrices
    let systemInstruction = "";
    if (selectedLanguage === 'hi') {
      systemInstruction = `तुम एक बेहद प्यारे, दोस्ताना और समझदार मेंटॉर हो। तुम्हारी विशेषता यह है कि तुम किसी भी बोरिंग या जटिल विषय को एकदम मजेदार और सरल कहानी के रूप में आम बोलचाल की भाषा (Hinglish शब्दों के मिश्रण वाली हिंदी) में समझा देते हो, ताकि एक छोटा बच्चा भी उसे आसानी से और मजे से समझ जाए। दिए गए बुक के पेज के टेक्स्ट को समझो और उसे इसी कहानी सुनाने वाले अंदाज़ में एक्सप्लेन करो। 
      नियम: जवाब में सिर्फ और interception एक्सप्लेनेशन टेक्स्ट होना चाहिए। कोई फॉर्मल ग्रीटिंग, कोई इंट्रोडक्टरी लाइन या मार्कडाउन फ़ॉर्मेटिंग (\`\`\`) नहीं होनी चाहिए। बिल्कुल वैसे बोलो जैसे बातचीत कर रहे हो।`;
    } else {
      systemInstruction = `You are a highly engaging, friendly, and brilliant mentor. Your specialty is turning complex or dry academic book texts into extremely simple, captivating, and conversational stories so that even a child can grasp the concepts naturally with interest. Read the provided book page text and explain it in this friendly storytelling voice.
      Rules: Return ONLY the raw conversational explanation text block. Do not include any standard formal descriptions, markdown block tokens (\`\`\`), or metadata. Write exactly how you would speak directly to a friend.`;
    }

    // 🛠️ ABSOLUTE FIX: Switched matrix to stable v1 production path endpoint
    const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${activeKey}`;

    const promptPayload = {
      contents: [{
        parts: [{
          text: `${systemInstruction}\n\nBook Page Text Source Data:\n"${text}"`
        }]
      }]
    };

    // 1. Trigger Google Gemini AI Pipeline Layer
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptPayload)
    });

    if (!geminiResponse.ok) {
      throw new Error(`Gemini core processor pool rejected request with status: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const processedStoryText = geminiData.candidates[0].content.parts[0].text.trim();

    console.log(`🔊 [AI Voice Compilation] Converting story transcript into high-quality binary blocks.`);

    // 2. Fragment the generated story script into safe lengths (<150 chars) for standard Google TTS parameters
    const sentences = processedStoryText.match(/[^.!?।]+[.!?门]?/g) || [processedStoryText];
    let aiSubChunks = [];

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

      while (sentence.length > 150) {
        let part = sentence.substring(0, 150);
        let lastSpace = part.lastIndexOf(' ');
        if (lastSpace > 50) {
          part = sentence.substring(0, lastSpace);
        }
        aiSubChunks.push(part);
        sentence = sentence.substring(part.length).trim();
      }
      if (sentence) aiSubChunks.push(sentence);
    }

    // 3. Compile speech components synchronously sequentially into a single absolute audio binary block buffer
    const bufferArray = [];
    for (let chunk of aiSubChunks) {
      try {
        const chunkBuffer = await fetchTtsBuffer(chunk, selectedLanguage);
        bufferArray.push(chunkBuffer);
      } catch (streamError) {
        console.error("Partial frame dropout during compilation sequence, bypassing fragment safely:", streamError.message);
      }
    }

    const finalCombinedAudioBuffer = Buffer.concat(bufferArray);

    // Convert complete absolute binary array bundle to highly portable Base64 matrix structure
    const base64AudioData = finalCombinedAudioBuffer.toString('base64');

    // 4. Return unified combined payload parameters back to frontend frame pipeline
    return res.status(200).json({
      success: true,
      explanationText: processedStoryText,
      audioBlobBase64: base64AudioData
    });

  } catch (err) {
    console.error("❌ Critical breakdown in AI Explanation route pipeline execution:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Engine error inside AI channel." });
  }
});


// ==========================================================================
// 🧠 COGNITIVE INTENT & PSYCHOLOGY KEYWORD GENERATOR (GEMINI POOL DRIVEN)
// ==========================================================================
app.post('/smart-psychology-search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ success: false, error: "Query context matrix is missing." });
        }

        console.log(`🤖 [Cognitive Engine] Analyzing researcher psychology for: "${query}"`);

        const activeKey = getActiveGeminiKey();
        
        // 🛠️ ABSOLUTE FIX: Switched matrix to stable v1 production path endpoint
        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${activeKey}`;

        const promptPayload = {
            contents: [{
                parts: [{
                    text: `You are an expert academic research psychologist and librarian. Analyze the core intellectual, psychological, and theoretical intent behind this search query: "${query}".
                    Provide a clean JSON string array containing 5 lateral concepts, underlying psychological theories, mental models, or root-cause topics that a deep researcher is tracking, EVEN IF they don't use the exact words from the query.
                    
                    Strict Rules:
                    1. Return ONLY a valid JSON string array. No conversational text, no markdown block wrappers (do NOT use \`\`\`json).
                    2. Example Input: "overcoming failure" -> Output: ["Neuroplasticity", "Grit Scale Theory", "Cognitive Reframing", "Learned Helplessness", "Growth Mindset"]
                    3. Example Input: "money management" -> Output: ["Behavioral Economics", "Delayed Gratification", "Scarcity Mindset", "Risk Aversion Matrix", "Financial Sociology"]`
                }]
            }]
        };

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promptPayload)
        });

        if (!response.ok) {
            throw new Error(`API_RATE_LIMIT_OR_FAULT_STATUS_${response.status}`);
        }

        const data = await response.json();
        let rawJsonText = data.candidates[0].content.parts[0].text.trim();

        if (rawJsonText.startsWith("```")) {
            rawJsonText = rawJsonText.replace(/```json|```/g, "").trim();
        }

        const psychologicalKeywords = JSON.parse(rawJsonText);

        return res.status(200).json({ 
            success: true, 
            mode: "premium_ai", 
            suggestions: psychologicalKeywords 
        });

    } catch (err) {
        console.warn("⚠️ [Cognitive Engine] Fallback triggered due to API rate limit or error:", err.message);
        return res.status(429).json({ 
            success: false, 
            error: "Rate limit reached or server busy. Deploying custom fuzzy engine fallback." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production Engine active on port ${PORT}`));
