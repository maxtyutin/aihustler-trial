const crypto = require('crypto');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const shopId = "1399769";
  const secretKey = "test_UJCZKVoUNWzWbw8cDrhR6lMJm63JWIqfh-tE1WIk3z0";
  const authHeader = 'Basic ' + Buffer.from(shopId + ':' + secretKey).toString('base64');
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
};
