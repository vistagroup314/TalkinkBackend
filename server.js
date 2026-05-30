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
      embeddedPrompt = `CONTEXT & OBJECTIVE:
नीचे एक बुक के पेज का टेक्स्ट (raw text) दिया गया है। तुम्हारा काम सिर्फ और सिर्फ इस पेज में लिखी बातों को एकदम आसान, सिंपल और मजेदार तरीके से समझाना है। 

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
- Do NOT overuse words like “friend”, “buddy”, “my friend”, etc.
- Use them occasionally only when it feels natural.
- The explanation should feel effortless and immersive.

CRITICAL CONTEXT UNDERSTANDING RULE:
The provided text is from a book page.

Use proper context awareness before explaining.

- If the text is written in first person (“I did this”, “I went there”), understand that this is the AUTHOR'S or CHARACTER’S experience — not the listener’s.
- Never mistakenly shift the experience onto the listener.

BAD:
“You went there and learned this…”

GOOD:
“Here, the author is talking about a moment where they went through…”
or
“The character is describing how they felt during this situation…”

Always preserve the correct perspective of the original text.

LANGUAGE STYLE RULES:

- Use very simple modern English.
- Mix emotional clarity with casual conversational flow.
- Avoid textbook-like wording.
- Avoid sounding corporate, philosophical, or overly literary.

STRICTLY AVOID WORDS LIKE:
therefore, moreover, consequently, perspective, transformation, profound, significant, necessity, illustrates, demonstrates

INSTEAD USE NATURAL WORDS LIKE:
so, basically, kind of, honestly, the point is, what’s interesting is, this shows, this feels like, etc.

EXPLANATION STYLE:

- Don’t just summarize the page.
- Break down emotions, meaning, hidden ideas, and character behavior in a very easy and relatable way.
- Make complex ideas feel simple.
- Explain things the way real people naturally talk.

VERY IMPORTANT:

- Avoid repetitive sentence patterns.
- Avoid sounding like every paragraph was generated from the same template.
- Let the tone breathe naturally.
- Keep it immersive and emotionally intelligent without sounding fake-deep.

ENDING RULE (VERY IMPORTANT):
Do NOT end with generic motivational quotes every time.

Instead, naturally end with ONE of these:

- a relatable observation,
- a real-world truth,
- a thought-provoking line,
- a subtle life insight,
- a practical takeaway,
- or a question that makes the listener think deeper about the topic.

The ending must feel connected to the actual topic of the page.

GOOD ENDING EXAMPLES:

- “Honestly, people still hide emotions exactly like this in real life.”
- “It’s interesting how this scene says more about human behavior than it does about the actual event.”
- “If you think about it, most people don’t even notice when fear quietly controls their decisions.”
- “You can kind of see why the character reacted that way once you look past the surface.”

Then naturally mention TalkInk in a respectful and smooth way.

Example:
“Stories become way more powerful when you start noticing the emotions hidden underneath them. Keep exploring with TalkInk.”

STRICT RULES:

1. Return ONLY the conversational explanation text.
2. No markdown formatting.
3. No greetings.
4. No headers or labels.
5. No robotic AI tone.
6. No repetitive catchphrases.
7. Make it feel like a real human conversation.

BOOK PAGE TEXT:
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