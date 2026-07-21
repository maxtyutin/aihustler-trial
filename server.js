const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Временное хранилище оплативших пользователей в памяти
const paidUsers = new Set();

// ==========================================
// 1. ЭНДПОИНТ СОЗДАНИЯ ПЛАТЕЖА (для кнопки на сайте)
// ==========================================
app.post('/api/create-payment', async (req, res) => {
  const { userId } = req.body;

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
        amount: { value: '990.00', currency: 'RUB' }, // Цена курса
        confirmation: {
          type: 'redirect',
          return_url: `https://maxtyutin.github.io/aihustler-trial/?userId=${userId}` // Куда вернуть пользователя
        },
        capture: true,
        description: 'Оплата курса по Вайб-кодингу',
        metadata: { user_id: userId }
      })
    });

    const data = await response.json();
    res.json({ paymentUrl: data.confirmation?.confirmation_url });
  } catch (error) {
    console.error('Ошибка при создании платежа:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ==========================================
// 2. ВЕБХУК ОТ ЮКАССЫ (принимает факт оплаты)
// ==========================================
app.post('/api/yookassa-webhook', (req, res) => {
  const event = req.body;

  if (event.type === 'notification' && event.event === 'payment.succeeded') {
    const userId = event.object.metadata?.user_id;
    
    if (userId) {
      paidUsers.add(userId);
      console.log(`[УСПЕХ] Доступ выдан пользователю: ${userId}`);
    }
  }

  // Мгновенно отвечать 200 OK — обязательно для ЮKassa
  res.status(200).send('OK');
});

// ==========================================
// 3. ПРОВЕРКА ДОСТУПА (для показа видео на сайте)
// ==========================================
app.get('/api/check-access', (req, res) => {
  const userId = req.query.userId;

  if (paidUsers.has(userId)) {
    return res.json({ 
      hasAccess: true, 
      videoUrl: 'https://kinescope.io/embed/YOUR_VIDEO_ID' // Замените на вашу ссылку на видео
    });
  }

  return res.json({ hasAccess: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
