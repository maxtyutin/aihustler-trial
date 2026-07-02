document.addEventListener('DOMContentLoaded', () => {
  // НАСТРОЙКА: Ссылка на ваш бэкенд на Render для работы платежей на GitHub Pages
  const VERCEL_API_URL = "https://aihustler-trial.onrender.com";

  // РАЗОГРЕВ СЕРВЕРА RENDER (для мгновенного ответа при оплате)
  let pingUrl = '/api/create-payment';
  if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
      pingUrl = `${VERCEL_API_URL}/api/create-payment`;
  }
  // Отправляем OPTIONS запрос для пробуждения "спящего" сервера Render в фоновом режиме
  fetch(pingUrl, { method: 'OPTIONS' }).catch(() => {});

  // НАСТРОЙКА: Ключ доступа Web3Forms для отправки заявок на почту
  const WEB3FORMS_ACCESS_KEY = "41bc8576-ffd3-4a5d-bf2f-456a11df1864";

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
          if (btnText) btnText.textContent = 'Отправка данных...';
          if (btnSpinner) btnSpinner.style.display = 'block';
          if (formMsg) {
              formMsg.style.display = 'none';
          }

          const formData = new FormData(appForm);
          const jsonObject = {};
          formData.forEach((value, key) => {
              jsonObject[key] = value;
          });
          
          try {
              if (btnText) btnText.textContent = 'Переход к оплате...';

              let apiUrl = '/api/create-payment';
              if (window.location.hostname.includes('github.io') || window.location.protocol === 'file:') {
                  apiUrl = `${VERCEL_API_URL}/api/create-payment`;
              }

              // Запускаем отправку контактов и создание платежа параллельно
              const leadPromise = fetch('https://api.web3forms.com/submit', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                  },
                  body: JSON.stringify(jsonObject)
              });

              const paymentPromise = fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  }
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
              if (paymentResult.confirmation && paymentResult.confirmation.confirmation_url) {
                  // Мгновенный переход на оплату
                  window.location.href = paymentResult.confirmation.confirmation_url;
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
