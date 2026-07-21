const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const SHOP_ID = "1399769";
const SECRET_KEY = "test_UJCZKVoUNWzWbw8cDrhR6lMJm63JWIqfh-tE1WIk3z0";

app.post('/api/create-payment', async (req, res) => {
  const authHeader = 'Basic ' + Buffer.from(SHOP_ID + ':' + SECRET_KEY).toString('base64');
  const idempotencyKey = crypto.randomUUID();

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Idempotence-Key': idempotencyKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: {
          value: '2990.00',
          currency: 'RUB'
        },
        capture: true,
        confirmation: {
          type: 'redirect',
          return_url: 'https://t.me/ai_hustlers_bot?start=welcome'
        },
        description: 'Тест-драйв системы AI HUSTLERS'
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Serve static files if running as a monolithic app
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
