document.addEventListener('DOMContentLoaded', () => {
  // НАСТРОЙКА: Ссылка на ваш бэкенд на Render для работы платежей на GitHub Pages
  const VERCEL_API_URL = "https://aihustler-trial-1.onrender.com";

  // НАСТРОЙКА: Ключ доступа Web3Forms для отправки заявок на почту
  const WEB3FORMS_ACCESS_KEY = "41bc8576-ffd3-4a5d-bf2f-456a11df1864";

  // ========================================================
  // 1. ИДЕНТИФИКАЦИЯ ПОЛЬЗОВАТЕЛЯ И ПРОВЕРКА ДОСТУПА (ВИДЕО)
  // ========================================================
  
  // Проверяем userId в параметрах URL
  const urlParams = new URLSearchParams(window.location.search);
  let userId = urlParams.get('userId');

  if (userId) {
      localStorage.setItem('ai_hustlers_user_id', userId);
  } else {
      userId = localStorage.getItem('ai_hustlers_user_id');
      if (!userId) {
          userId = 'user_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
          localStorage.setItem('ai_hustlers_user_id', userId);
      }
  }

  // Функция для разблокировки платного видео на странице
  function unlockPaidVideo(videoUrl) {
      const heroVideo = document.getElementById('heroVideo');
      const videoContainer = document.getElementById('videoContainer');
      const videoOverlay = document.getElementById('videoOverlay');

      if (heroVideo) {
          // Меняем источник на платное видео
          heroVideo.src = videoUrl;
          heroVideo.load();
      }

      // Меняем отображение кнопки/бейджей
      const heroPriceBlock = document.querySelector('.hero-price-block');
      if (heroPriceBlock) {
          heroPriceBlock.style.display = 'none';
      }

      // Меняем кнопки «Начать тест-драйв» на «Смотреть видео»
      document.querySelectorAll('.open-modal-btn').forEach(btn => {
          btn.innerHTML = 'Смотреть тест-драйв';
          btn.removeAttribute('onclick');
          btn.addEventListener('click', (e) => {
              e.preventDefault();
              if (videoOverlay && !videoContainer.classList.contains('playing')) {
                  videoOverlay.click();
              }
              document.getElementById('videoContainer').scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
      });

      // Меняем нижнюю плашку на сообщение об успешном доступе
      const claimSection = document.querySelector('.sec.claim');
      if (claimSection) {
          claimSection.innerHTML = `
              <div class="wrap" style="text-align: center; padding: 40px 20px;">
                  <h2 class="h2-48 center mb16" style="color: #10b981; font-weight: 800;">ДОСТУП УСПЕШНО ОПЛАЧЕН</h2>
                  <p class="body-l muted maxw600 mx mb24">Вам открыт полный доступ к трехдневному тест-драйву системы AI HUSTLERS. Смотрите презентацию вверху страницы!</p>
                  <a href="https://t.me/ai_hustlers_sale_bot" target="_blank" class="btn-primary" style="display: inline-block; max-width: 320px;">Перейти в Telegram-канал ➔</a>
              </div>
          `;
      }
  }

  // Проверяем доступ на сервере Render
  async function checkAccess() {
      let checkUrl = `/api/check-access?userId=${userId}`;
      if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
          checkUrl = `${VERCEL_API_URL}/api/check-access?userId=${userId}`;
      }

      try {
          const res = await fetch(checkUrl);
          if (res.ok) {
              const data = await res.json();
              if (data.hasAccess) {
                  unlockPaidVideo(data.videoUrl);
              }
          }
      } catch (err) {
          console.error('Ошибка проверки доступа:', err);
      }
  }

  // Запускаем проверку доступа при загрузке страницы
  checkAccess();

  // РАЗОГРЕВ СЕРВЕРА RENDER (для мгновенного ответа при оплате)
  let pingUrl = '/api/create-payment';
  if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
      pingUrl = `${VERCEL_API_URL}/api/create-payment`;
  }
  // Отправляем OPTIONS запрос для пробуждения спящего инстанса Render
  fetch(pingUrl, { method: 'OPTIONS' }).catch(() => {});

  // Инициализация библиотеки выбора кода страны (intl-tel-input)
  const phoneInput = document.querySelector("#phone");
  let iti;

  if (phoneInput) {
      phoneInput.value = "+7";

      iti = window.intlTelInput(phoneInput, {
          initialCountry: "ru",
          preferredCountries: ["ru", "by", "kz", "ua", "uz"],
          utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@23.0.12/build/js/utils.js",
          autoPlaceholder: "aggressive",
          nationalMode: false
      });

      const updateDialCode = () => {
          if (iti && phoneInput && (!phoneInput.value.trim() || phoneInput.value.trim() === "+")) {
              const countryData = iti.getSelectedCountryData();
              if (countryData && countryData.dialCode) {
                  phoneInput.value = "+" + countryData.dialCode + " ";
              }
          }
      };

      setTimeout(updateDialCode, 100);

      phoneInput.addEventListener("countrychange", () => {
          const countryData = iti.getSelectedCountryData();
          if (countryData && countryData.dialCode) {
              const dialCode = "+" + countryData.dialCode;
              const currentValue = phoneInput.value.trim();
              
              if (!currentValue || currentValue === "+" || /^\+\d+\s*$/.test(currentValue)) {
                  phoneInput.value = dialCode + " ";
              } else {
                  const cleanValue = phoneInput.value.replace(/^\+\d+\s*/, "");
                  phoneInput.value = dialCode + " " + cleanValue;
              }
          }
      });

      phoneInput.addEventListener("focus", updateDialCode);
  }

  // Настройка Modal
  const modal = document.getElementById('app-modal');
  const appForm = document.getElementById('app-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn ? submitBtn.querySelector('span') : null;
  const btnSpinner = document.getElementById('btn-spinner');
  const formMsg = document.getElementById('form-msg');

  function openModal() {
      if (modal) modal.classList.add('active');
      document.body.style.overflow = 'hidden';
  }

  window.closeModal = function() {
      if (modal) modal.classList.remove('active');
      document.body.style.overflow = '';
      if (appForm) appForm.reset();
      if (iti) {
          iti.setCountry("ru");
      }
      if (phoneInput) {
          phoneInput.value = "+7";
      }
      if (formMsg) {
          formMsg.style.display = 'none';
      }
      if (submitBtn) {
          submitBtn.disabled = false;
          if (btnText) btnText.textContent = 'ОПЛАТИТЬ ТЕСТ-ДРАЙВ ➔';
          if (btnSpinner) btnSpinner.style.display = 'none';
      }
  };

  if (modal) {
      modal.addEventListener('click', window.closeModal);
  }

  // Intercept click on conversion buttons to open modal
  document.querySelectorAll('.open-modal-btn').forEach(btn => {
      btn.removeAttribute('href'); // Remove direct link
      btn.addEventListener('click', (e) => {
          e.preventDefault();
          openModal();
      });
  });

  // Handle registration form submit
  if (appForm) {
      appForm.addEventListener('submit', async function(e) {
          e.preventDefault();
          
          if (iti && phoneInput) {
              phoneInput.value = iti.getNumber();
          }
          
          const accessKeyField = document.getElementById('web3forms-access-key');
          if (accessKeyField) {
              accessKeyField.value = WEB3FORMS_ACCESS_KEY;
          }

          if (submitBtn) submitBtn.disabled = true;
          if (btnText) btnText.textContent = 'Переход к оплате...';
          if (btnSpinner) btnSpinner.style.display = 'block';
          if (formMsg) {
              formMsg.style.display = 'none';
          }

          const formData = new FormData(appForm);
          const jsonObject = {};
          formData.forEach((value, key) => {
              jsonObject[key] = value;
          });
          
          // Добавляем userId в данные лида для Web3Forms
          jsonObject['userId'] = userId;

          try {
              // Запускаем отправку контактов и создание платежа параллельно
              const leadPromise = fetch('https://api.web3forms.com/submit', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                  },
                  body: JSON.stringify(jsonObject)
              });

              // Создание платежа на Render с передачей userId
              let apiUrl = '/api/create-payment';
              if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
                  apiUrl = `${VERCEL_API_URL}/api/create-payment`;
              }

              const paymentPromise = fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ userId: userId })
              });

              // Ждем выполнения обоих запросов одновременно
              const [leadResponse, paymentResponse] = await Promise.all([leadPromise, paymentPromise]);

              const leadResult = await leadResponse.json();
              if (!leadResult.success) {
                  throw new Error(leadResult.message || 'Ошибка сохранения контактных данных');
              }

              if (!paymentResponse.ok) {
                  const errData = await paymentResponse.json();
                  throw new Error(errData.error || 'Ошибка при создании платежа в YooKassa');
              }

              const paymentResult = await paymentResponse.json();
              if (paymentResult.paymentUrl) {
                  // Перенаправляем на оплату
                  window.location.href = paymentResult.paymentUrl;
              } else {
                  throw new Error('Не удалось получить платежную ссылку от YooKassa');
              }

          } catch (error) {
              console.error('Error submitting form/creating payment:', error);
              
              if (submitBtn) submitBtn.disabled = false;
              if (btnText) btnText.textContent = 'ОПЛАТИТЬ ТЕСТ-ДРАЙВ ➔';
              if (btnSpinner) btnSpinner.style.display = 'none';
              
              if (formMsg) {
                  formMsg.className = 'form-message error';
                  formMsg.textContent = error.message;
                  formMsg.style.display = 'block';
              }
              alert('Произошла ошибка: ' + error.message);
          }
      });
  }

  // Video Autoplay Trigger
  const videoContainer = document.getElementById('videoContainer');
  const videoOverlay = document.getElementById('videoOverlay');
  const heroVideo = document.getElementById('heroVideo');

  if (videoOverlay && heroVideo) {
    videoOverlay.addEventListener('click', () => {
      videoContainer.classList.add('playing');
      heroVideo.play();
    });
  }

  // Dynamic Image Autoloader Helper for user screenshots & dashboard
  function initAutoloader(selector) {
    const images = document.querySelectorAll(selector);
    images.forEach(img => {
      const baseName = img.getAttribute('data-base');
      if (!baseName) return;
      
      const paths = [
        `${baseName}.png`,
        `images/${baseName}.png`,
        `${baseName}.jpg`,
        `images/${baseName}.jpg`,
        `${baseName}.webp`,
        `images/${baseName}.webp`,
        `${baseName}.jpeg`,
        `images/${baseName}.jpeg`
      ];
      let attempt = 0;
      
      img.onload = () => {
        img.style.display = 'block';
        const placeholder = img.nextElementSibling;
        if (placeholder) {
          placeholder.style.display = 'none';
        }
      };
      
      function tryNext() {
        if (attempt < paths.length) {
          img.src = paths[attempt++];
        } else {
          img.style.display = 'none';
          const placeholder = img.nextElementSibling;
          if (placeholder) {
            placeholder.style.display = 'flex';
          }
        }
      }
      
      img.onerror = tryNext;
      tryNext();
    });
  }
  
  initAutoloader('.screenshot-img');
  initAutoloader('.dashboard-img');

  // PERSISTENT 45-MINUTE COUNTDOWN TIMER
  const TIMER_DURATION_MINUTES = 45;
  const timerElements = document.querySelectorAll('.timer-countdown');

  if (timerElements.length > 0) {
      let targetTime = localStorage.getItem('ai_hustler_timer_target');
      const now = new Date().getTime();

      if (!targetTime || parseInt(targetTime) < now) {
          targetTime = now + (TIMER_DURATION_MINUTES * 60 * 1000);
          localStorage.setItem('ai_hustler_timer_target', targetTime);
      } else {
          targetTime = parseInt(targetTime);
      }

      function updateCountdown() {
          const currentTime = new Date().getTime();
          let timeLeft = targetTime - currentTime;

          if (timeLeft <= 0) {
              timeLeft = TIMER_DURATION_MINUTES * 60 * 1000;
              targetTime = new Date().getTime() + timeLeft;
              localStorage.setItem('ai_hustler_timer_target', targetTime);
          }

          const totalSeconds = Math.floor(timeLeft / 1000);
          const minutes = Math.floor(totalSeconds / 60);
          const seconds = totalSeconds % 60;

          const formattedMinutes = String(minutes).padStart(2, '0');
          const formattedSeconds = String(seconds).padStart(2, '0');
          const timeString = `${formattedMinutes}:${formattedSeconds}`;

          timerElements.forEach(el => {
              el.textContent = timeString;
          });
      }

      updateCountdown();
      setInterval(updateCountdown, 1000);
  }
});
