const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Предотвращение падения сервера при неперехваченных фоновых ошибках
process.on('unhandledRejection', (reason) => {
  console.log('[СЕРВЕР] Перехвачено фоновое событие:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  console.log('[СЕРВЕР] Перехвачено необработанное исключение:', err?.message || err);
});

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('nodemailer не установлен, будет использован Web3Forms API');
}

const app = express();
app.use(cors());
app.use(express.json());

const DATABASE_URL = process.env.DATABASE_URL;
let pgPool = null;

// Фолбек: локальная база данных в JSON файле на случай перезапусков контейнера
const JSON_DB_PATH = path.join(__dirname, 'paid_users.json');

// Загрузка данных из локального файла
function loadLocalPaidUsers() {
  try {
    if (fs.existsSync(JSON_DB_PATH)) {
      const data = fs.readFileSync(JSON_DB_PATH, 'utf8');
      const parsed = JSON.parse(data);
      const map = new Map();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, { devices: new Set(v.devices || []) });
      }
      console.log(`[БД] Успешно загружено ${map.size} пользователей из локального файла.`);
      return map;
    }
  } catch (err) {
    console.error('Ошибка чтения локальной БД:', err);
  }
  return new Map();
}

// Запись данных в локальный файл
function saveLocalPaidUsers(map) {
  try {
    const obj = {};
    for (const [k, v] of map.entries()) {
      obj[k] = { devices: Array.from(v.devices) };
    }
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    // Безопасный перехват ошибок локальной файловой системы
  }
}

// Загружаем сохраненных пользователей
const paidUsers = loadLocalPaidUsers();

// Безопасный хелпер выполнения SQL-запросов к PostgreSQL
async function queryPg(sql, params) {
  if (!pgPool) return null;
  try {
    return await pgPool.query(sql, params);
  } catch (err) {
    console.error('[БД] Ошибка выполнения запроса:', err.message);
    return null;
  }
}

// Хелпер добавления оплатившего пользователя
async function addPaidUser(userId) {
  if (!paidUsers.has(userId)) {
    paidUsers.set(userId, { devices: new Set() });
    saveLocalPaidUsers(paidUsers);
    
    await queryPg(
      'INSERT INTO paid_users (user_id, devices) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
      [userId, '{}']
    );
  }
}

// Хелпер проверки оплаты пользователя (память + Postgres)
async function isUserPaid(userId) {
  if (!userId) return false;
  if (paidUsers.has(userId)) return true;
  
  const res = await queryPg('SELECT * FROM paid_users WHERE user_id = $1', [userId]);
  if (res && res.rows && res.rows.length > 0) {
    paidUsers.set(userId, { devices: new Set(res.rows[0].devices || []) });
    return true;
  }
  return false;
}

// Хелпер регистрации нового устройства
async function registerDevice(userId, deviceToken) {
  const userData = paidUsers.get(userId);
  if (userData && !userData.devices.has(deviceToken)) {
    userData.devices.add(deviceToken);
    saveLocalPaidUsers(paidUsers);
    
    await queryPg(
      'UPDATE paid_users SET devices = array_append(devices, $1) WHERE user_id = $2 AND NOT ($1 = ANY(devices))',
      [deviceToken, userId]
    );
  }
}

// Пул подключений к PostgreSQL (автоматическое восстановление соединения)
if (DATABASE_URL) {
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  // Отлавливаем незапланированное закрытие фоновых соединений
  pgPool.on('error', (err) => {
    console.log('[БД] Автоматическая очистка фонового соединения пула:', err.message);
  });

  // Инициализация таблицы при старте
  queryPg(`
    CREATE TABLE IF NOT EXISTS paid_users (
      user_id VARCHAR(255) PRIMARY KEY,
      devices TEXT[] DEFAULT '{}'
    )
  `).then(async () => {
    console.log('[БД] Таблица paid_users подтверждена в PostgreSQL');
    const res = await queryPg('SELECT * FROM paid_users');
    if (res && res.rows) {
      res.rows.forEach(row => {
        paidUsers.set(row.user_id, { devices: new Set(row.devices || []) });
      });
      console.log(`[БД] Успешно синхронизировано пользователей из PostgreSQL: ${res.rowCount}`);
    }
  });
}

// Вспомогательная функция отправки уведомлений на почту maxtyutin@gmail.com через Web3Forms
async function sendNotificationEmail(subject, details) {
  const WEB3FORMS_KEY = process.env.WEB3FORMS_ACCESS_KEY || "41bc8576-ffd3-4a5d-bf2f-456a11df1864";
  try {
    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: subject,
        from_name: 'AI HUSTLERS Payments',
        to_email: 'maxtyutin@gmail.com',
        ...details
      })
    });
    console.log(`[ПОЧТА ВЛАДЕЛЬЦА] Уведомление отправлено на maxtyutin@gmail.com: ${subject}`);
  } catch (err) {
    console.error('[ПОЧТА ВЛАДЕЛЬЦА] Ошибка отправки уведомления на почту:', err);
  }
}

// Генерация стильного HTML-письма для покупателя с 3 днями программы и ботами
function generateBuyerEmailHTML(userName, userId) {
  const tgLink = `https://t.me/ai_hustlers_sale_bot?start=${userId}`;
  const vkLink = process.env.VK_GROUP_URL 
    ? `${process.env.VK_GROUP_URL}?ref=${userId}` 
    : `https://vk.me/YOUR_VK_GROUP_ID?ref=${userId}`;
  const day1Link = `https://maxtyutin.github.io/aihustler-trial/day1.html?userId=${userId}`;
  const day2Link = `https://maxtyutin.github.io/aihustler-trial/day2.html?userId=${userId}`;
  const day3Link = `https://maxtyutin.github.io/aihustler-trial/day3.html?userId=${userId}`;
  const displayName = userName && userName !== 'Не указано' ? userName : 'друг';

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Персональный доступ к тест-драйву AI HUSTLERS</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0c10; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0b0c10; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #13141c; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
          
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 36px 30px 20px 30px; border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
              <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; background: linear-gradient(180deg, #adc6ff 0%, #4d8eff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; color: #4d8eff;">AI HUSTLERS</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 30px;">
              
              <!-- Badge -->
              <div style="display: inline-block; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 30px; padding: 6px 16px; font-size: 12px; font-weight: 700; color: #10b981; text-transform: uppercase; margin-bottom: 24px;">
                ✓ Оплата подтверждена — 2 990 ₽
              </div>

              <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 800; color: #ffffff; line-height: 1.3;">
                Здравствуйте, ${displayName}! 🎉
              </h2>

              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #a0a5b5;">
                Поздравляем! Ваш индивидуальный доступ к <b>трёхдневному тест-драйву ИИ-системы AI HUSTLERS</b> успешно активирован.
              </p>

              <!-- Unique User Token Card -->
              <div style="background: rgba(77, 142, 255, 0.05); border: 1px dashed rgba(77, 142, 255, 0.3); border-radius: 12px; padding: 16px; margin-bottom: 28px; text-align: center;">
                <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8c909f; display: block; margin-bottom: 6px;">🔒 Ваш персональный ID покупателя:</span>
                <code style="font-family: monospace; font-size: 15px; font-weight: 700; color: #4d8eff; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 6px; display: inline-block;">${userId}</code>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #616473; line-height: 1.4;">
                  Все ссылки содержат ваш защищенный токен. Доступ предоставляется только для вашей учетной записи.
                </p>
              </div>

              <!-- Option 1: Bots -->
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 14px; padding: 24px; margin-bottom: 28px;">
                <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 700; color: #ffffff; text-align: center;">
                  1. Запустить пошагового бота в мессенджере:
                </p>

                <!-- Buttons Table -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center" style="padding-bottom: 12px;">
                      <!-- Telegram Button with Unique Tag -->
                      <a href="${tgLink}" target="_blank" style="display: block; width: 100%; max-width: 340px; background: linear-gradient(135deg, #2AABEE 0%, #229ED9 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 20px; border-radius: 10px; text-align: center; box-shadow: 0 4px 15px rgba(34, 158, 217, 0.3); box-sizing: border-box;">
                        💬 В Telegram (персональный доступ) ➔
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center">
                      <!-- VK Button with Unique Tag -->
                      <a href="${vkLink}" target="_blank" style="display: block; width: 100%; max-width: 340px; background: linear-gradient(135deg, #0077FF 0%, #0055BB 100%); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 20px; border-radius: 10px; text-align: center; box-shadow: 0 4px 15px rgba(0, 119, 255, 0.3); box-sizing: border-box;">
                        🔷 Во ВКонтакте (персональный доступ) ➔
                      </a>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Option 2: 3 Days Direct Web Links -->
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 16px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 800; color: #ffffff; text-align: center; text-transform: uppercase; letter-spacing: 0.5px;">
                  2. Или открывайте уроки по дням прямо на сайте:
                </p>

                <!-- Day 1 Card -->
                <div style="background: rgba(77, 142, 255, 0.05); border: 1px solid rgba(77, 142, 255, 0.15); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                  <div style="font-size: 14px; font-weight: 800; color: #4d8eff; margin-bottom: 4px;">📌 ДЕНЬ 1: Установка AI агентов, настройка скиллов и MCP</div>
                  <div style="font-size: 12px; color: #8c909f; margin-bottom: 12px;">Пошаговый запуск и кастомизация ИИ-ассистентов на вашем компьютере.</div>
                  <a href="${day1Link}" target="_blank" style="display: inline-block; background: #4d8eff; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 8px;">
                    ▶ Смотреть 1 День ➔
                  </a>
                </div>

                <!-- Day 2 Card -->
                <div style="background: rgba(77, 142, 255, 0.05); border: 1px solid rgba(77, 142, 255, 0.15); border-radius: 12px; padding: 16px; margin-bottom: 12px;">
                  <div style="font-size: 14px; font-weight: 800; color: #4d8eff; margin-bottom: 4px;">📌 ДЕНЬ 2: Создание онлайн-продукта, автоворонка и автоплатежи</div>
                  <div style="font-size: 12px; color: #8c909f; margin-bottom: 12px;">Сборка воронки, интеграция ЮKassa и подключение автодоставки.</div>
                  <a href="${day2Link}" target="_blank" style="display: inline-block; background: #4d8eff; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 8px;">
                    ▶ Смотреть 2 День ➔
                  </a>
                </div>

                <!-- Day 3 Card -->
                <div style="background: rgba(77, 142, 255, 0.05); border: 1px solid rgba(77, 142, 255, 0.15); border-radius: 12px; padding: 16px;">
                  <div style="font-size: 14px; font-weight: 800; color: #4d8eff; margin-bottom: 4px;">📌 ДЕНЬ 3: Контент-маркетинг, реклама и монетизация</div>
                  <div style="font-size: 12px; color: #8c909f; margin-bottom: 12px;">Автогенерация трафика, контент-машина и масштабирование.</div>
                  <a href="${day3Link}" target="_blank" style="display: inline-block; background: #4d8eff; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 18px; border-radius: 8px;">
                    ▶ Смотреть 3 День ➔
                  </a>
                </div>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 30px; background-color: #0e0f16; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #616473; line-height: 1.6;">
                Защищенный персональный доступ AI HUSTLERS.<br>
                Telegram поддержки: <a href="https://t.me/tyutinmax" style="color: #4d8eff; text-decoration: none;">@tyutinmax</a> | Email: <a href="mailto:maxtyutin@gmail.com" style="color: #4d8eff; text-decoration: none;">maxtyutin@gmail.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Отправка красивого письма с кнопками выбора для покупателя
async function sendBuyerWelcomeEmail(userEmail, userName, userId) {
  if (!userEmail || userEmail === 'Не указано' || !userEmail.includes('@')) {
    console.log('[ПОЧТА КЛИЕНТА] Пропуск отправки: email покупателя не указан или некорректен');
    return;
  }

  const subject = "Ваш доступ к трёхдневному тест-драйву AI HUSTLERS 🎉";
  const htmlContent = generateBuyerEmailHTML(userName, userId);

  // 1. Отправка через Nodemailer/SMTP (если настроены переменные окружения SMTP_USER и SMTP_PASS)
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');

  if (nodemailer && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: `"AI HUSTLERS" <${SMTP_USER}>`,
        to: userEmail,
        subject: subject,
        html: htmlContent
      });

      console.log(`[ПОЧТА КЛИЕНТА] Красивое HTML-письмо с кнопками TG/VK отправлено клиенту ${userEmail} через SMTP!`);
      return;
    } catch (err) {
      console.error('[ПОЧТА КЛИЕНТА] Ошибка отправки через SMTP, проработка резервного маршрута Web3Forms:', err);
    }
  }

  // 2. Резервный маршрут Web3Forms (отправка прямых кнопок и ссылок доступа на почту покупателя)
  const WEB3FORMS_KEY = process.env.WEB3FORMS_ACCESS_KEY || "41bc8576-ffd3-4a5d-bf2f-456a11df1864";
  try {
    const tgLink = `https://t.me/ai_hustlers_sale_bot?start=${userId}`;
    const vkLink = process.env.VK_GROUP_URL || `https://vk.com/im?sel=-YOUR_VK_GROUP_ID`;
    const webLink = `https://maxtyutin.github.io/aihustler-trial/day1.html?userId=${userId}`;

    await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        subject: `[ИНСТРУКЦИЯ КЛИЕНТУ] ${subject}`,
        from_name: 'AI HUSTLERS Delivery',
        to_email: userEmail,
        "Имя покупателя": userName || 'Не указано',
        "Email покупателя": userEmail,
        "Кнопка 1 (В Telegram)": tgLink,
        "Кнопка 2 (Во ВКонтакте)": vkLink,
        "Прямой доступ на сайте": webLink,
        "Сообщение": `Поздравляем с успешной оплатой! Выберите, где забрать материалы: Telegram: ${tgLink} или VK: ${vkLink}`
      })
    });
    console.log(`[ПОЧТА КЛИЕНТА] Инструкция с кнопками для покупателя ${userEmail} отправлена через Web3Forms!`);
  } catch (err) {
    console.error('[ПОЧТА КЛИЕНТА] Ошибка отправки письма покупателю через Web3Forms:', err);
  }
}

const SHOP_ID = process.env.SHOP_ID || "1399769";
const SECRET_KEY = process.env.SECRET_KEY || "test_UJCZKVoUNWzWbw8cDrhR6lMJm63JWIqfh-tE1WIk3z0";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// ==========================================
// 1. ЭНДПОИНТ СОЗДАНИЯ ПЛАТЕЖА (2990 руб.)
// ==========================================
app.post('/api/create-payment', async (req, res) => {
  const { userId, name, email, phone } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Не передан userId' });
  }

  const authHeader = 'Basic ' + Buffer.from(SHOP_ID + ':' + SECRET_KEY).toString('base64');
  const idempotencyKey = crypto.randomBytes(16).toString('hex');

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
          user_id: userId,
          user_name: name || 'Не указано',
          user_email: email || 'Не указано',
          user_phone: phone || 'Не указано'
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
// 2. ВЕБХУК ОТ ЮКАССЫ (подтверждение оплаты и отправка писем)
// ==========================================
app.post('/api/yookassa-webhook', async (req, res) => {
  const event = req.body;

  if (event.type === 'notification' && event.object) {
    const obj = event.object;
    const userId = obj.metadata?.user_id;
    const name = obj.metadata?.user_name || 'Не указано';
    const userEmail = obj.metadata?.user_email || 'Не указано';
    const phone = obj.metadata?.user_phone || 'Не указано';
    const amountStr = obj.amount ? `${obj.amount.value} ${obj.amount.currency}` : '2990.00 RUB';
    const timeStr = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

    if (event.event === 'payment.succeeded') {
      if (userId) {
        await addPaidUser(userId);
        console.log(`[УСПЕХ] Оплата 2990 руб. получена! Доступ выдан для: ${userId}`);
      }
      // 1. Отправляем уведомление владельцу (maxtyutin@gmail.com)
      await sendNotificationEmail(`🎉 УСПЕШНАЯ ОПЛАТА: ${amountStr} — AI HUSTLERS`, {
        "Результат": "✅ УСПЕШНО ОПЛАЧЕНО",
        "Имя покупателя": name,
        "Email покупателя": userEmail,
        "Телефон покупателя": phone,
        "ID пользователя": userId || 'Не указан',
        "Сумма платежа": amountStr,
        "Дата и время (МСК)": timeStr
      });

      // 2. Отправляем красивое HTML-письмо с кнопками Telegram и ВКонтакте самому ПОКУПАТЕЛЮ!
      await sendBuyerWelcomeEmail(userEmail, name, userId);

    } else if (event.event === 'payment.canceled') {
      const reason = obj.cancellation_details?.reason || 'Оплата отменена или отклонена банком/пользователем';
      console.log(`[ОТМЕНА] Оплата отменена для ${userId}. Причина: ${reason}`);

      // Отправляем письмо на maxtyutin@gmail.com о НЕУСПЕШНОЙ оплате
      await sendNotificationEmail(`❌ НЕУСПЕШНАЯ ОПЛАТА / ОТМЕНА: ${amountStr} — AI HUSTLERS`, {
        "Результат": "❌ ОТМЕНЕНО / ОШИБКА ОПЛАТЫ",
        "Причина отмены": reason,
        "Имя покупателя": name,
        "Email покупателя": userEmail,
        "Телефон покупателя": phone,
        "ID пользователя": userId || 'Не указан',
        "Сумма": amountStr,
        "Дата и время (МСК)": timeStr
      });
    }
  }

  res.status(200).send('OK');
});

// ==========================================
// 3. ПРОВЕРКА ДОСТУПА НА САЙТЕ
// ==========================================
app.get('/api/check-access', async (req, res) => {
  const { userId, deviceToken, day } = req.query;
  const targetDay = day || '1';

  if (userId && (await isUserPaid(userId))) {
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
        await registerDevice(userId, deviceToken);
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
      if (await isUserPaid(userId)) {
        await sendTelegramMessage(chatId,
          `<b>Доступ подтвержден!</b> 🎉\n\nОтлично, оплата поступила! Нажмите кнопку ниже для перехода к просмотру тест-драйва:`,
          [
            [
              { text: '🎬 Смотреть программу 1 дня', url: `https://maxtyutin.github.io/aihustler-trial/day1.html?userId=${userId}` }
            ],
            [
              { text: '✅ Я посмотрел(а)', callback_data: `watched_1_${userId}` }
            ]
          ]
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
    } else if (data.startsWith('watched_1_')) {
      const userId = data.replace('watched_1_', '');
      // Отправляем пост 2-го дня программы
      await sendTelegramMessage(chatId,
        `<b>Переходим к 2-му дню программы!</b> 🚀\n\nОтличная работа! В первом дне мы разобрали настройку агентов Claude Code, Antigravity и MCP.\n\nСегодня мы перейдем к созданию вашего первого онлайн-продукта, автоворонки и приему платежей 24/7 без вашего участия. Нажмите кнопку ниже:`,
        [
          [
            { text: '🎬 Смотреть программу 2 дня', url: `https://maxtyutin.github.io/aihustler-trial/day2.html?userId=${userId}` }
          ],
          [
            { text: '✅ Я посмотрел(а)', callback_data: `watched_2_${userId}` }
          ]
        ]
      );
      // Гасим часики ожидания кнопки
      if (TELEGRAM_BOT_TOKEN) {
        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackId })
          });
        } catch (e) {}
      }
    } else if (data.startsWith('watched_2_')) {
      const userId = data.replace('watched_2_', '');
      // Отправляем пост 3-го дня программы
      await sendTelegramMessage(chatId,
        `<b>Финальный 3-й день программы!</b> 🔥\n\nВы собрали продукт и настроили платежи. Теперь переходим к запуску контент-маркетинга, автогенерации трафика и монетизации с помощью ИИ-агентов. Нажмите кнопку ниже:`,
        [
          [
            { text: '🎬 Смотреть программу 3 дня', url: `https://maxtyutin.github.io/aihustler-trial/day3.html?userId=${userId}` }
          ],
          [
            { text: '✅ Я посмотрел(а)', callback_data: `watched_3_${userId}` }
          ]
        ]
      );
      if (TELEGRAM_BOT_TOKEN) {
        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackId })
          });
        } catch (e) {}
      }
    } else if (data.startsWith('watched_3_')) {
      const userId = data.replace('watched_3_', '');
      // Отправляем финальный пост о наставничестве
      await sendTelegramMessage(chatId,
        `<b>Личное наставничество со мной (Максим Тютин)</b> 💎\n\nПоздравляю вас с успешным завершением трёхдневного тест-драйва ИИ-системы! 🎉\n\nЕсли вы хотите под моим личным руководством запустить ИИ-систему на полную мощность, настроить автопилот маркетинга и продаж и выйти на стабильные <b>5000$ в месяц</b>, приглашаю вас в программу индивидуального наставничества.\n\nСтоимость наставничества: <b>100 000 рублей</b>.\n\nКоличество мест сильно ограничено. Пожалуйста, заполните анкету предзаписи ниже, и я свяжусь с вами лично для собеседования:`,
        [[
          { text: '📝 Заполнить анкету предзаписи', url: 'https://forms.gle/49ZtS9Xg8aF8Q5Y88' }
        ]]
      );
      if (TELEGRAM_BOT_TOKEN) {
        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackId })
          });
        } catch (e) {}
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
      if (await isUserPaid(userId)) {
        // Оплачено! Отправляем пост 1-го дня программы
        await sendTelegramMessage(chatId,
          `<b>Доступ подтвержден!</b> 🎉\n\nПоздравляем! Оплата тест-драйва ИИ-системы успешно получена.\n\nНажмите кнопку ниже, чтобы начать первый день тест-драйва:`,
          [
            [
              { text: '🎬 Смотреть программу 1 дня', url: `https://maxtyutin.github.io/aihustler-trial/day1.html?userId=${userId}` }
            ],
            [
              { text: '✅ Я посмотрел(а)', callback_data: `watched_1_${userId}` }
            ]
          ]
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
