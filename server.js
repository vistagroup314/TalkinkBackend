const express = require('express');
const cors = require('cors');

const app = express();

// 🌐 CORS Allowed Origins (Testing aur Live dono ke liye)
const allowedOrigins = [
  'http://localhost:8158',
  'https://bhoiganesh218.github.io'
];

app.use(cors({
  origin: function(origin, callback){
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      return callback(new Error('CORS Policy: Access denied.'), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 🎯 FAKE ORDER ENDPOINT (Instamojo Bypass)
app.post('/create-order', (req, res) => {
  try {
    const { bookId } = req.body;
    console.log(`Bypassing payment gateway for Book ID: ${bookId}`);

    // Hum direct ek dummy longurl bhej rahe hain jo automatic redirect handle karega
    // Isse aapka frontend bina kisi external login ke seedha success mode me chala jayega
    res.status(200).json({
      success: true,
      longurl: `https://bhoiganesh218.github.io/talkink/?page=LibraryPage&bookId=${bookId}&status=success`,
      id: "FAKE_IM_ORDER_" + Math.random().toString(36).substr(2, 9)
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dummy Webhook Listener
app.post('/instamojo-webhook', (req, res) => {
   res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bypass Server running on port ${PORT}`));
