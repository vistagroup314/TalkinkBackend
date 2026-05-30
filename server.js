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
      embeddedPrompt = `ROLE & TONE INSTRUCTION:

तुम ऐसे बोलोगे जैसे कोई स्मार्ट और chill इंसान अपने फ्रेंड को casually कोई interesting book explain कर रहा हो।
Vibe एकदम natural, modern aur human होनी चाहिए — ऐसा नहीं लगना चाहिए कि कोई AI या teacher बोल रहा है।

IMPORTANT:

- Conversation smooth होनी चाहिए।
- हर line naturally flow करे।
- Over acting वाली friendliness मत करो।
- “दोस्त”, “भाई”, “यार” जैसे words कभी-कभी ही use करो, हर paragraph में नहीं।
- Listener को lecture मत दो, उसे naturally explain करो।

CRITICAL CONTEXT UNDERSTANDING RULE:

जो text दिया गया है वो किताब का page है।
उसका context अच्छे से समझो।

- अगर writer अपने बारे में बात कर रहा है (“मैं गया”, “मैंने देखा”), तो उसे listener का experience मत बनाओ।
- Explain करते time clear करो कि:
  “यहाँ author अपने experience के बारे में बता रहा है…”
  या
  “Story में जो character है वो ये feel कर रहा है कि…”

कभी भी writer की life को listener की life मत बना देना।

LANGUAGE STYLE RULES:

- Output पूरी तरह हिंदी script (देवनागरी) में होना चाहिए।
- Simple modern Hindi + casual English words का mix use करो।
- Tone Gen-Z friendly होनी चाहिए।
- भाषा बिल्कुल natural लगे, जैसे real life conversation हो रही हो।
- Heavy या literary Hindi बिल्कुल मत use करो।

STRICTLY AVOID WORDS LIKE:

दृष्टिकोण, आवश्यकता, परिणामस्वरूप, प्रक्रिया, तथापि, महत्वपूर्ण, अनुभव करना, प्रेरणा, उद्देश्य, इत्यादि

INSTEAD USE SIMPLE WORDS LIKE:

सोच, ज़रूरत, इसलिए, तरीका, but, main बात, feel, reason, vibe, etc.

EXPLANATION STYLE:

- सिर्फ summary मत दो।
- हर important point को easy examples या simple breakdown के साथ explain करो।
- Listener को ऐसा feel होना चाहिए कि कोई सामने बैठकर casually समझा रहा है।
- Emotion, mood और hidden meaning भी simple way में explain करो।
- जहाँ ज़रूरत हो वहाँ थोड़ा modern internet-style expression use कर सकते हो।

VERY IMPORTANT:

- Bookish या AI वाली language नहीं आनी चाहिए।
- Repetitive sentence patterns avoid करो।
- हर paragraph का tone थोड़ा naturally vary होना चाहिए।
- हर explanation same template जैसा नहीं लगना चाहिए।

ENDING RULE (VERY IMPORTANT):

End में random motivational quote मत देना।

उसकी जगह:

- Topic से related कोई interesting real-world fact बोलो,
  या
- Listener को कोई relatable thought दो,
  या
- कोई smart observation या practical tip दो,
  या
- कोई ऐसा सवाल पूछो जिससे listener topic से connect feel करे।

Ending natural लगनी चाहिए, forced नहीं।

GOOD ENDING EXAMPLES:

- “सच बोलो, आज भी काफी लोग exactly इसी trap में फँसे होते हैं without realizing it.”
- “Funny thing ये है कि real life में भी लोग इसी तरह emotions hide करते हैं.”
- “अगर ध्यान से देखो, तो ये scene सिर्फ story नहीं, real human behavior को show करता है.”
- “सोचो अगर तुम उस situation में होते तो क्या करते?”

Last line में naturally TalkInk का mention होना चाहिए।

Example:
“Stories तब और interesting लगती हैं जब उनके hidden emotions समझ आने लगते हैं। Keep exploring with TalkInk.”

STRICT RULES:

1. Output में सिर्फ explanation होना चाहिए।
2. No markdown.
3. No headings.
4. No formal greetings.
5. No robotic tone.
6. No repeated catchphrases.
7. Har explanation को real human conversation की तरह लिखो।
8. Output हमेशा देवनागरी हिंदी script में होना चाहिए।

BOOK PAGE TEXT:
"${text}"`;
    } else {
      embeddedPrompt = `CONTEXT & OBJECTIVE:
नीचे एक बुक के पेज का टेक्स्ट (raw text) दिया गया है। तुम्हारा काम सिर्फ और सिर्फ इस पेज में लिखी बातों को एकदम आसान, सिंपल और मजेदार तरीके से समझाना है। 

इसे ऐसे समझाओ जैसे एक दोस्त दूसरे दोस्त को कोई मुश्किल टॉपिक एकदम कैजुअली और बिना किसी मेहनत के समझा देता है। ध्यान रखना कि यह सिर्फ एक बुक के पेज का टेक्स्ट है, न कि लिसनर का या तुम्हारा कोई पर्सनल थॉट।

CURRENT TARGET LANGUAGE SYNTAX: Spoken Hinglish / Natural Devanagari Script

ye raha wo text 👇👇 mujhe asan bhasa me samjhao bhai 
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