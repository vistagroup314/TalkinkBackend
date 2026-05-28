const express = require('express');
const cors = require('cors');
const https = require('https');
const { OpenAI } = require('openai'); // OpenAI SDK for Groq

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

// 🔥 ULTRA-SAFE PRODUCTION KEY MANAGEMENT (GROQ)
function getActiveGroqKey() {
  const activeKey = process.env.GROQ_API_KEY;
  if (!activeKey) {
    console.error("❌ Critical: GROQ_API_KEY is missing in Render Environment settings!");
  }
  return activeKey ? activeKey.trim() : "";
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
      embeddedPrompt = `ROLE & STYLE INSTRUCTION: तुम एक बेहद प्यारे, दोस्ताना और समझदार मेंटॉर हो जो एक किताब का पेज (Book Page) खुद पढ़ रहा है और उसे अपने दोस्त (Listener) को एकदम गहराई, हाई क्लैरिटी और डिटेल के साथ समझा रहा है।

      ⚠️ CRITICAL PERSPECTIVE RULE (DONT CONFUSE THE WRITER WITH LISTENER): 
      अपना दिमाग लगाओ! जो टेक्स्ट तुम्हें दिया गया है, वो किसी किताब का पन्ना है। 
      - अगर किताब में ऑटोबायोग्राफी या कहानी चल रही है जहां राइटर ने लिखा है: "मैं कहीं गया था या मैंने ऐसा किया", तो इसका मतलब यह बात राइटर अपने बारे में कह रहा है, 'Listener' के बारे में नहीं!
      - तुम इसे समझाते वक्त "तुम वहां गए थे" नहीं बोलोगे! बल्कि ऐसे बोलोगे: "यहाँ राइटर/ऑथर बता रहे हैं कि वो खुद वहाँ गए थे और उन्होंने काफी मजे किए..." या "इस कहानी में जो कैरेक्टर है, वो बता रहा है कि..."
      - कभी भी राइटर के खुद के अनुभवों को यूजर (Listener) का अनुभव मत बनाओ। टेक्स्ट के पीछे का असली संदर्भ (Context) समझो।

      ⚠️ LANGUAGE RULE (NO BOOKISH HINDI): कोई भी साहित्यिक, कठिन या शुद्ध हिंदी शब्द (जैसे: दृष्टिकोण, आवश्यकता, रूपांतरण, महत्वपूर्ण, परिणामस्वरूप, प्रक्रिया) इस्तेमाल नहीं करना है। एकदम आसान, रोजमर्रा की बातचीत वाली भाषा (Casual Conversational Hindi/Hinglish) का यूज करो। 

      MANDATORY BRAND CLOSING RULE: एक्सप्लेनेशन को खत्म करते हुए, लास्ट में बिना रुके पैराग्राफ के अंत में एक बहुत ही खूबसूरत, छोटा सा इंस्पायरिंग ज्ञान या लाइफ कोट (A Short Powerful Quote) बोलो, और फिर टॉकइंक (TalkInk) का naam गर्व और इज्जत के साथ लो। जैसे: "याद रखो दोस्त, ज्ञान ही तुम्हारी असली ताकत है। कीप लर्निंग विद टॉकइंक।" (कोट हर बार थोड़ा फ्रेश और अलग होना चाहिए)।

      CRITICAL RESTRICTIONS: 
      1. जवाब में सिर्फ और सिर्फ बातचीत का एक्सप्लेनेशन होना चाहिए। कोई फॉर्मल ग्रीटिंग्स या मार्कडाउन फ़ॉर्मेटिंग (\`\`\`) नहीं होनी चाहिए। 
      2. बिल्कुल वैसे ही लिखो जैसे तुम सामने बैठकर किसी को किताब का मतलब समझा रहे हो।

      BOOK PAGE TEXT DATA TO ANALYZE AND EXPLAIN CORRECTLY:
      "${text}"`;
    } else {
      embeddedPrompt = `ROLE & STYLE INSTRUCTION: You are a highly engaging, brilliant close mentor who is reading a book page and explaining its deeper core concepts to a friend (the listener) with immense clarity and detail.

      ⚠️ CRITICAL PERSPECTIVE RULE (PROPER PRONOUN MANAGEMENT):
      Use your cognitive logic! The text provided is from a book page. 
      - If the text is an autobiography, biography, or story written in the first person ("I went there", "I achieved this"), it represents the AUTHOR'S or CHARACTER'S experience, NOT the listener's.
      - DO NOT switch the perspective to the listener by saying "You went there". Instead, say: "Here, the author describes how he/she went there and had a great time..." or "The writer is sharing an experience where they..."
      - Maintain proper third-person distinction for the book's content while maintaining a direct, friendly second-person connection ("you/friend") with the listener when explaining the lessons.

      CRITICAL RESTRICTIONS:
      1. Return ONLY the raw conversational explanation text block. No opening greetings, metadata, or markdown wrappers (\`\`\`).
      2. Keep the language natural, fluent, and highly accessible.

      MANDATORY BRAND CLOSING RULE: End naturally with a brief, punchy, inspiring quote, followed by a high-respect mention of TalkInk. E.g., "Remember, growth begins at the edge of your comfort zone. Keep exploring with TalkInk."

      BOOK PAGE TEXT DATA TO DECODE LOGICALLY:
      "${text}"`;
    }

    const response = await groqClient.chat.completions.create({
      messages: [
        { role: "user", content: embeddedPrompt }
      ],
      model: "llama-3.1-8b-instant"
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
        2. Example Input: "overcoming failure" -> Output: ["Neuroplasticity", "Grit Scale Theory", "Cognitive Reframing", "Learned Helplessness", "Growth Mindset"]
        
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
app.listen(PORT, () => console.log(`Production Engine active on port ${PORT}`));
