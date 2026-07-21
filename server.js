const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Временное хранилище оплативших пользователей в памяти
// (при перезапуске сервера список сбрасывается, для продакшена лучше подключить Supabase/MongoDB)
// Хранилище оплативших пользователей: userId -> { devices: Set }
const paidUsers = new Map();

const SHOP_ID = process.env.SHOP_ID || "1399769";
const SECRET_KEY = process.env.SECRET_KEY || "test_UJCZKVoUNWzWbw8cDrhR6lMJm63JWIqfh-tE1WIk3z0";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
      if (!paidUsers.has(userId)) {
        paidUsers.set(userId, { devices: new Set() });
      }
      console.log(`[УСПЕХ] Оплата 2990 руб. получена! Доступ выдан для: ${userId}`);
    }
  }

  res.status(200).send('OK');
});

// ==========================================
// 3. ПРОВЕРКА ДОСТУПА НА САЙТЕ
// ==========================================
app.get('/api/check-access', (req, res) => {
  const { userId, deviceToken, day } = req.query;
  const targetDay = day || '1';

  if (userId && paidUsers.has(userId)) {
    const userData = paidUsers.get(userId);

    if (deviceToken) {
      // Если устройство уже авторизовано
      if (userData.devices.has(deviceToken)) {
        let videoUrl = 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F'; // День 1 (реальное видео)
        if (targetDay === '2') {
          videoUrl = 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F'; // День 2 (замените на свое видео)
        } else if (targetDay === '3') {
          videoUrl = 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F'; // День 3 (замените на свое видео)
        }
        return res.json({ hasAccess: true, videoUrl });
      }

      // Если лимит устройств (2 устройства) не превышен, привязываем новое
      if (userData.devices.size < 2) {
        userData.devices.add(deviceToken);
        console.log(`[УСТРОЙСТВО] Привязано новое устройство ${deviceToken} к пользователю ${userId}`);
        let videoUrl = 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F'; // День 1
        if (targetDay === '2') {
          videoUrl = 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F'; // День 2
        } else if (targetDay === '3') {
          videoUrl = 'https://kinescope.io/embed/33gfSgW8PWuABKPR5eJM9F'; // День 3
        }
        return res.json({ hasAccess: true, videoUrl });
      }

      // Превышен лимит устройств (защита от пересылки)
      console.log(`[БЛОКИРОВКА] Попытка входа с 3-го устройства для ${userId}`);
      return res.json({ hasAccess: false, reason: 'device_limit_exceeded' });
    }
  }

  return res.json({ hasAccess: false });
});

// ==========================================
// 4. ИНТЕГРАЦИЯ СЕКЬЮРНОГО TELEGRAM-БОТА
// ==========================================

// Вспомогательная функция отправки сообщений в Telegram через Bot API
async function sendTelegramMessage(chatId, text, keyboard) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
        protect_content: true // Запрещает пересылку сообщений бота и копирование контента!
      })
    });
  } catch (err) {
    console.error('Ошибка отправки сообщения в Telegram:', err);
  }
}

// Единый эндпоинт для вебхуков Telegram (сообщения и инлайн-клики)
app.post('/api/telegram-webhook', async (req, res) => {
  const { message, callback_query } = req.body;

  // Обработка нажатий на инлайн-кнопки (Callback Query)
  if (callback_query) {
    const chatId = callback_query.message.chat.id;
    const data = callback_query.data;
    const callbackId = callback_query.id;

    if (data.startsWith('check_')) {
      const userId = data.replace('check_', '');
      if (paidUsers.has(userId)) {
        await sendTelegramMessage(chatId,
          `<b>Доступ подтвержден!</b> 🎉\n\nОтлично, оплата поступила! Нажмите кнопку ниже для перехода к просмотру тест-драйва:`,
          [[
            { text: '🎬 Получить материал', url: `https://maxtyutin.github.io/aihustler-trial/video.html?userId=${userId}` }
          ]]
        );
      } else {
        if (TELEGRAM_BOT_TOKEN) {
          try {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: 'Оплата еще не поступила. Попробуйте через 1-2 минуты.',
                show_alert: true
              })
            });
          } catch (e) {}
        }
      }
    }
    return res.status(200).send('OK');
  }

  // Обработка текстовых сообщений
  if (!message || !message.text) {
    return res.status(200).send('OK');
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text.startsWith('/start')) {
    const parts = text.split(' ');
    const userId = parts[1]; // Считываем параметр после /start (например: user_XXXX)

    if (!userId) {
      // Сценарий: пользователь пришел без ID (не оплатил)
      await sendTelegramMessage(chatId, 
        `<b>Доступ ограничен</b>\n\nПривет! К сожалению, я не нашёл активной оплаты тест-драйва для вашего аккаунта.\n\nЧтобы активировать тест-драйв ИИ-системы AI HUSTLERS, оформите заказ на нашем сайте:`,
        [[
          { text: '💳 Оплатить доступ за 2 990 ₽', url: 'https://maxtyutin.github.io/aihustler-trial/' }
        ]]
      );
    } else {
      // Сценарий: пользователь перешел с ID
      if (paidUsers.has(userId)) {
        // Оплачено! Отправляем пост с кнопкой получения материалов
        await sendTelegramMessage(chatId,
          `<b>Доступ подтвержден!</b> 🎉\n\nПоздравляем! Оплата тест-драйва ИИ-системы успешно получена.\n\nНажмите кнопку ниже, чтобы открыть первый видеоурок и запустить тест-драйв:`,
          [[
            { text: '🎬 Получить материал', url: `https://maxtyutin.github.io/aihustler-trial/video.html?userId=${userId}` }
          ]]
        );
      } else {
        // ID есть, но оплата не найдена в памяти
        await sendTelegramMessage(chatId,
          `<b>Оплата не найдена</b>\n\nПривет! К сожалению, платёж для аккаунта <code>${userId}</code> ещё не подтверждён.\n\nЕсли вы только что оплатили доступ, подождите 1 минуту и нажмите кнопку «Проверить оплату» ниже.`,
          [
            [
              { text: '💳 Оплатить доступ за 2 990 ₽', url: 'https://maxtyutin.github.io/aihustler-trial/' }
            ],
            [
              { text: '🔄 Проверить оплату заново', callback_data: `check_${userId}` }
            ]
          ]
        );
      }
    }
  }

  res.status(200).send('OK');
});

// Автоматическая конфигурация вебхука в Telegram Bot API при старте сервера
if (TELEGRAM_BOT_TOKEN) {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || "https://aihustler-trial-1.onrender.com";
  fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${RENDER_URL}/api/telegram-webhook`)
    .then(res => res.json())
    .then(data => {
      console.log('Результат регистрации вебхука в Telegram:', data);
    })
    .catch(err => {
      console.error('Ошибка регистрации вебхука в Telegram:', err);
    });
} else {
  console.log('TELEGRAM_BOT_TOKEN не задан. Бот не инициализирован.');
}

// Serve static files
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
