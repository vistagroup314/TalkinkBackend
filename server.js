const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();

// 🌐 CORS CONFIGURATION (Localhost aur GitHub Pages dono allowed hain)
const allowedOrigins = [
  'http://localhost:8158',
  'https://bhoiganesh218.github.io'
];

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      return callback(new Error('CORS Policy: Access denied from this origin.'), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🔐 Instamojo Sandbox (Test Mode) Credentials
const CLIENT_ID = 'LHym2sPPH5chVDyxD1UDUZ1jcNtjng9BlWJN5hil';
const CLIENT_SECRET = 'YLWjfxmj2IT2DbDD0fMmCYkDqyWeChtOIUCpppNUSoh98X06upVVeXag6RDU11NARLX88QVn53XiJ5G8QGmLnftju33l30yU6zqeUuXHIMErELw7AAdwVkSwWbp3aW9Y';

// Helper function to handle internal HTTPS requests cleanly
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

// 🎯 Main API Endpoint to create payment order in Test Mode
app.post('/create-order', async (req, res) => {
  try {
    const { amount, purpose, buyer_name, email, bookId } = req.body;

    // STEP 1: Generate Test Access Token using Client ID & Secret
    const tokenPayload = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }).toString();

    const tokenOptions = {
      hostname: 'test.instamojo.com', // 🎯 Standard Testing Domain
      path: '/oauth2/token/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(tokenPayload)
      }
    };

    console.log("Generating OAuth2 Token from Instamojo Test Server...");
    const tokenResult = await makeHttpsRequest(tokenOptions, tokenPayload);

    if (tokenResult.statusCode !== 200 || !tokenResult.data.access_token) {
      return res.status(401).json({
        success: false,
        message: "Failed to generate Test Access Token. Verify Sandbox Credentials.",
        details: tokenResult.data
      });
    }

    const accessToken = tokenResult.data.access_token;
    console.log("Test Token Generated successfully! Creating testing payment link...");

    // 🌐 REDIRECT URL FIX: Dono redirect URLs handle kiye hain (Localhost aur Live GitHub Pages)
    // Agar origin localhost hai toh localhost par bhejega, nahi toh live site par.
    const requestOrigin = req.headers.origin || 'https://bhoiganesh218.github.io';
    const redirectUrl = `${requestOrigin}/talkink/?page=LibraryPage&bookId=${bookId}`;

    // STEP 2: Create Payment Request
    const paymentPayload = JSON.stringify({
      amount: String(amount),
      purpose: purpose || 'Narrato/TalkInk Book Purchase Test',
      buyer_name: buyer_name || 'Ganesh Tester',
      email: email || 'talkinktest@gmail.com',
      phone: '9999999999',
      allow_repeated_payments: false,
      send_email: false,
      send_sms: false,
      redirect_url: redirectUrl,
      webhook: 'https://talkinkbackend.onrender.com/instamojo-webhook'
    });

    const paymentOptions = {
      hostname: 'test.instamojo.com', // 🎯 Standard Testing Domain
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
        message: paymentResult.data.message || "Test Gateway rejected payment parameters.",
        error: paymentResult.data
      });
    }

  } catch (err) {
    console.error("Core Engine Failure:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Webhook listener
app.post('/instamojo-webhook', (req, res) => {
   res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Test Engine running on port ${PORT}`));
