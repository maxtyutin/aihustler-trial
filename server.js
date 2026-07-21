const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Временное хранилище оплативших пользователей в памяти
// (при перезапуске сервера список сбрасывается, для продакшена лучше подключить Supabase/MongoDB)
const paidUsers = new Set();

const SHOP_ID = process.env.SHOP_ID || "1399769";
const SECRET_KEY = process.env.SECRET_KEY || "test_UJCZKVoUNWzWbw8cDrhR6lMJm63JWIqfh-tE1WIk3z0";

// ==========================================
// 1. ЭНДПОИНТ СОЗДАНИЯ ПЛАТЕЖА (2990 руб.)
// ==========================================
app.post('/api/create-payment', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Не передан userId' });
  }

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
          return_url: `https://maxtyutin.github.io/aihustler-trial/confirmed.html?userId=${userId}`
        },
        description: 'Оплата трёхдневного тест-драйва системы',
        metadata: {
          user_id: userId
        }
      })
    });

    const data = await response.json();
    if (data.confirmation && data.confirmation.confirmation_url) {
      res.json({ paymentUrl: data.confirmation.confirmation_url });
    } else {
      console.error('Ошибка ЮKassa:', data);
      res.status(500).json({ error: 'Не удалось получить ссылку на оплату' });
    }
  } catch (error) {
    console.error('Ошибка при создании платежа:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// ==========================================
// 2. ВЕБХУК ОТ ЮКАССЫ (подтверждение оплаты)
// ==========================================
app.post('/api/yookassa-webhook', (req, res) => {
  const event = req.body;

  if (event.type === 'notification' && event.event === 'payment.succeeded') {
    const userId = event.object.metadata?.user_id;
    if (userId) {
      paidUsers.add(userId);
      console.log(`[УСПЕХ] Оплата 2990 руб. получена! Доступ выдан для: ${userId}`);
    }
  }

  res.status(200).send('OK');
});

// ==========================================
// 3. ПРОВЕРКА ДОСТУПА НА САЙТЕ
// ==========================================
app.get('/api/check-access', (req, res) => {
  const userId = req.query.userId;

  if (userId && paidUsers.has(userId)) {
    return res.json({
      hasAccess: true,
      videoUrl: 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F' // 👈 Замените на реальную ссылку платного видео (Kinescope, Bunny, etc.)
    });
  }

  return res.json({ hasAccess: false });
});

// Serve static files
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
