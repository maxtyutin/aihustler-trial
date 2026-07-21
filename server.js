const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Временное хранилище оплативших пользователей в памяти
// (при перезапуске сервера список сбрасывается, для продакшена лучше подключить Supabase/MongoDB)
const paidUsers = new Set();

// ==========================================
// 1. ЭНДПОИНТ СОЗДАНИЯ ПЛАТЕЖА (2990 руб.)
// ==========================================
app.post('/api/create-payment', async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Не передан userId' });
  }

  const auth = Buffer.from(`${process.env.SHOP_ID}:${process.env.SECRET_KEY}`).toString('base64');

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Idempotence-Key': Date.now().toString(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: { 
          value: '2990.00', // 👈 Итоговая цена курса
          currency: 'RUB' 
        },
        confirmation: {
          type: 'redirect',
          return_url: `https://maxtyutin.github.io/aihustler-trial/?userId=${userId}`
        },
        capture: true,
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
    console.error('Ошибка при запросе к ЮKassa:', error);
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

  // Мгновенный ответ 200 OK обязателен для ЮKassa
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
      videoUrl: 'https://kinescope.io/embed/YOUR_VIDEO_ID' // 👈 Замените на вашу ссылку плеера Kinescope или Bunny
    });
  }

  return res.json({ hasAccess: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер вайб-кодинга запущен на порту ${PORT}`));
