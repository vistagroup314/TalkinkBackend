const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Tumhari Test Keys yahan hain
const razorpay = new Razorpay({
  key_id: 'rzp_test_SoxJpIqg8PwTZW',
  key_secret: 'unFhfLs4ensCwmGTY8lJXq23'
});

// Order Create API
app.post('/create-order', async (req, res) => {
  try {
    const options = {
      amount: req.body.amount * 100, // ₹ to Paise
      currency: "INR",
      receipt: "talkink_rcpt_" + Date.now(),
    };
    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json(err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

