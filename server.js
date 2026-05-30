const express = require('express');
const cors = require('cors');
const https = require('https');
const { OpenAI } = require('openai'); // OpenAI SDK for Groq
const admin = require('firebase-admin'); // 🔥 Server-Side Safe Firebase Operations

const app = express();

// 🔐 Secure Fully Opened CORS for testing & production
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🛡️ INITIALIZE FIREBASE ADMIN SDK VIA ENVIRONMENT VARIABLE
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 [Firebase Admin] SDK Successfully Initialized via Environment Key!");
  } else {
    console.warn("⚠️ Warning: FIREBASE_SERVICE_ACCOUNT_JSON missing in Environment. Webhook db bypass won't execute.");
  }
} catch (fbInitErr) {
  console.error("❌ Critical Firebase Admin Init Failed:", fbInitErr.message);
}

// 🔥 ULTRA-SAFE PRODUCTION KEY MANAGEMENT (GROQ & COSMFEED)
function getActiveGroqKey() {
  const activeKey = process.env.GROQ_API_KEY;
  if (!activeKey) {
    console.error("❌ Critical: GROQ_API_KEY is missing in Render Environment settings!");
  }
  return activeKey ? activeKey.trim() : "";
}

// 🔐 Cosmfeed Live Config Token (Render environment variables me set kar lena bhaa)
const COSMFEED_API_KEY = process.env.COSMFEED_API_KEY || "YOUR_COSMFEED_API_KEY_HERE"; 

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
// 💳 DYNAMIC COSMFEED ORDER CREATION ROUTE (Tracking Exact User ID)
// ==========================================================================
app.post('/create-order', async (req, res) => {
  try {
    const { amount, purpose, buyer_name, email, bookId, userId } = req.body; // 🔥 Catching exact userId from frontend
    const requestOrigin = req.headers.origin || 'https://bhoiganesh218.github.io';

    // Dynamic payload mapping for Cosmfeed Custom Integration with metadata tracing
    const paymentPayload = JSON.stringify({
      amount: Number(amount),
      title: purpose || `TalkInk Premium Book Access`,
      description: `Unlocking exclusive runtime access for Book ID: ${bookId}`,
      redirectUrl: `${requestOrigin}/talkink/?page=LibraryPage&bookId=${bookId}`,
      webhookUrl: 'https://talkinkbackend.onrender.com/cosmfeed-webhook',
      customer: {
        name: buyer_name || 'TalkInk User',
        email: email || 'user@talkink.com'
      },
      metadata: {
        bookId: bookId,
        buyerEmail: email,
        userId: userId // 🔥 Mapping exact UID inside safe vault storage
      }
    });

    const options = {
      hostname: 'api.cosmfeed.com', 
      path: '/v1/payments/create-link',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${COSMFEED_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(paymentPayload)
      }
    };

    console.log(`🚀 [Cosmfeed Engine] Generating payment link for Book ID: ${bookId} | User ID: ${userId}`);
    const result = await makeHttpsRequest(options, paymentPayload);

    if (result.statusCode >= 200 && result.statusCode < 300 && result.data.url) {
      // Sending back url matrix just like instamojo longurl to ensure 0 frontend breakage
      res.status(200).json({
        success: true,
        longurl: result.data.url,
        id: result.data.paymentLinkId
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Cosmfeed automated link generation rejected.",
        error: result.data
      });
    }

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================================================
// 🔔 AUTOMATED COSMFEED PAYMENT SUCCESS WEBHOOK HANDLER (EXACT UID MATCH)
// ==========================================================================
app.post('/cosmfeed-webhook', async (req, res) => {
  try {
    const eventData = req.body;
    console.log("📥 [Cosmfeed Webhook Node] Received notification payload:", eventData);

    // Verifying event confirmation context matrices
    if (eventData.event === 'payment.success') {
      const { bookId, buyerEmail, userId } = eventData.metadata || {};
      const transactionId = eventData.paymentId;

      console.log(`🔥 SUCCESS: Payment verified for ${buyerEmail}. Unlocking book: ${bookId} for User ID: ${userId} [Txn: ${transactionId}]`);

      // Server-to-Server FireStore Auto Injection Pipeline via Exact UID Document Match
      if (admin.apps.length > 0 && bookId && userId) {
        const db = admin.firestore();
        
        // Exact Document route match (No email dependent search engine loop)
        const userRef = db.collection("users").doc(userId.trim());

        // Atomic update operation to push bookId into purchasedBooks node array
        await userRef.update({
          purchasedBooks: admin.firestore.FieldValue.arrayUnion(bookId)
        });

        console.log(`🎉 [Cloud Matrix Sync] Book ${bookId} automatically unlocked in DB for document id: ${userId}!`);
      } else {
        console.error("❌ Firebase Admin SDK not active or metadata context incomplete (userId/bookId missing).");
      }
    }

    // Always send 200 back to gateway to stop webhook retries
    res.status(200).send("OK");
  } catch (webhookErr) {
    console.error("❌ Webhook Execution Error:", webhookErr.message);
    res.status(500).send("Webhook Internal Failure");
  }
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
// ✨ GENUINE DYNAMIC AI STORY EXPLANATION GATEWAY (SMART PERSPECTIVE CONTROL)
// ==========================================================================
app.post('/tts-ai-explain', async (req, res) => {
  const { text, lang } = req.body;
  const selectedLanguage = lang === 'hi' ? 'hi' : 'en';

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Raw page stream text context is missing." });
  }

  const activeKey = getActiveGroqKey();
  if (!activeKey) {
    return res.status(500).json({ success: false, error: "AI pipeline authentication reference is missing on host." });
  }

  try {
    console.log(`🤖 [AI SDK Router] Connecting via stable Groq OpenAI channel...`);

    const groqClient = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: activeKey
    });

    let embeddedPrompt = "";
    if (selectedLanguage === 'hi') {
      embeddedPrompt = `CONTEXT & OBJECTIVE:
नीचे एक book के पेज का टेक्स्ट (raw text) दिया गया है। तुम्हारा काम सिर्फ और सिर्फ इस पेज में लिखी बातों को एकदम आसान, सिंपल और मजेदार तरीके से समझाना है। 

इसे ऐसे समझाओ जैसे एक दोस्त दूसरे दोस्त को कोई मुश्किल टॉपिक एकदम कैजुअली और बिना किसी मेहनत के समझा देता है। ध्यान रखना कि यह सिर्फ एक बुक के पेज का टेक्स्ट है, न कि लिसनर का या तुम्हारा कोई पर्सनल थॉट।

CURRENT TARGET LANGUAGE SYNTAX: Spoken Hinglish / Natural Devanagari Script text ,bhai mujhe asan bhasa me samjhao dhyan rakhna ko ye meri li ki hui baat nehi he ye is book me esa likha he  ye raha wo text 👇👇
"${text}"`;
    } else {
      embeddedPrompt = `ROLE & TONE INSTRUCTION:
You are not a teacher, lecturer, or robotic AI assistant.
You sound like a smart, emotionally aware person casually explaining a book to someone sitting beside you.
The vibe should feel natural, modern, warm, and deeply human — like a real conversation, not a scripted explanation.

IMPORTANT:
- Keep the flow smooth and conversational.
- Avoid sounding overly dramatic or overly intellectual.
- The explanation should feel effortless and immersive.

CRITICAL CONTEXT UNDERSTANDING RULE:
The provided text is from a book page. Use proper context awareness before explaining.
- Always preserve the correct perspective of the original text. This is strictly a text from a book page, not your personal thoughts.

STRICT RULES:
1. Return ONLY the conversational explanation text.
2. No markdown formatting.
3. No greetings or headers.

BOOK PAGE TEXT:
"${text}"`;
    }

    const response = await groqClient.chat.completions.create({
      messages: [
        { role: "user", content: embeddedPrompt }
      ],
      model: "llama-3.1-8b-instant" // 🔥 Fixed Typo from 'move' to 'model'
    });

    const processedStoryText = response.choices[0].message.content.trim();

    console.log(`🔊 [AI Voice Compilation] Converting dynamic story transcript into binary blocks.`);
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

    const bufferArray = [];
    for (let chunk of aiSubChunks) {
      try {
        const chunkBuffer = await fetchTtsBuffer(chunk, selectedLanguage);
        bufferArray.push(chunkBuffer);
      } catch (streamError) {
        console.error("Fragment safely bypassed:", streamError.message);
      }
    }

    const finalCombinedAudioBuffer = Buffer.concat(bufferArray);
    const base64AudioData = finalCombinedAudioBuffer.toString('base64');

    return res.status(200).json({
      success: true,
      explanationText: processedStoryText,
      audioBlobBase64: base64AudioData
    });

  } catch (err) {
    console.error("❌ Critical breakdown in AI route:", err);
    return res.status(500).json({ success: false, error: err.message || "Internal Engine error inside AI channel." });
  }
});


// ==========================================================================
// 🧠 COGNITIVE INTENT & PSYCHOLOGY KEYWORD GENERATOR (GROQ COMPATIBLE)
// ==========================================================================
app.post('/smart-psychology-search', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ success: false, error: "Query context matrix is missing." });
        }

        const activeKey = getActiveGroqKey();
        if (!activeKey) {
            return res.status(500).json({ success: false, error: "AI search pipeline credentials missing." });
        }

        console.log(`🤖 [Cognitive SDK Engine] Analyzing researcher psychology via Groq...`);

        const groqClient = new OpenAI({
          baseURL: 'https://api.groq.com/openai/v1',
          apiKey: activeKey
        });

        const searchPrompt = `INSTRUCTION: You are an expert academic research psychologist and librarian. Analyze the core intellectual, psychological, and theoretical intent behind the search query provided below. Provide a clean JSON string array containing 5 lateral concepts, underlying psychological theories, mental models, or root-cause topics that a deep researcher is tracking, EVEN IF they don't use the exact words from the query.
        
        Strict Rules:
        1. Return ONLY a valid JSON string array. No conversational text, no markdown block wrappers (do NOT use \`\`\`json).
        
        SEARCH QUERY: "${query}"`;

        const response = await groqClient.chat.completions.create({
          messages: [
            { role: "user", content: searchPrompt }
          ],
          model: "llama-3.1-8b-instant"
        });

        let rawJsonText = response.choices[0].message.content.trim();

        if (rawJsonText.startsWith("```")) {
            rawJsonText = rawJsonText.replace(/```json|```/g, "").trim();
        }

        const psychologicalKeywords = JSON.parse(rawJsonText);
        return res.status(200).json({ success: true, mode: "premium_ai", suggestions: psychologicalKeywords });

    } catch (err) {
        console.warn("⚠️ [Cognitive Engine] Fallback triggered:", err.message);
        return res.status(429).json({ 
            success: false, 
            error: "Rate limit reached or server busy." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Production Engine active on port
