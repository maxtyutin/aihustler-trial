document.addEventListener('DOMContentLoaded', () => {
  // 1. Modal & Quiz Logic
  // НАСТРОЙКА: Ссылка для перенаправления в Telegram после заполнения формы
  const TELEGRAM_LINK = "https://t.me/ai_hustlers_bot?start=welcome";

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

  const modal = document.getElementById('app-modal');
  const appForm = document.getElementById('app-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn ? submitBtn.querySelector('span') : null;
  const btnSpinner = document.getElementById('btn-spinner');
  const formMsg = document.getElementById('form-msg');
  
  const prevBtn = document.getElementById('quiz-prev-btn');
  const nextBtn = document.getElementById('quiz-next-btn');
  const navRow = document.getElementById('quiz-nav-controls');
  const progressFill = document.getElementById('quiz-progress-fill');
  const stepIndicator = document.getElementById('quiz-step-indicator');
  const percentIndicator = document.getElementById('quiz-percent-indicator');

  let currentStep = 1;
  const totalSteps = 5;
  
  let redirectTimeout = null;
  let redirectInterval = null;
  let isNativelySubmitting = false;
  let hasOpenedOrSubmitted = false;

  function openModal() {
      hasOpenedOrSubmitted = true;
      if (modal) modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      resetQuiz();
  }

  window.closeModal = function() {
      if (modal) modal.classList.remove('active');
      document.body.style.overflow = '';
      
      isNativelySubmitting = false;
      if (redirectTimeout) clearTimeout(redirectTimeout);
      if (redirectInterval) clearInterval(redirectInterval);
      
      setTimeout(() => {
          if (formMsg) {
              formMsg.className = 'form-message';
              formMsg.style.display = 'none';
          }
          if (appForm) appForm.reset();
          if (iti) {
              iti.setCountry("ru");
          }
          if (phoneInput) {
              phoneInput.value = "+7";
          }
          resetQuiz();

          const modalTitle = document.querySelector('.modal-title');
          const modalDesc = document.querySelector('.modal-desc');
          const successState = document.getElementById('quiz-success-state');
          const redirectProgress = document.querySelector('.redirect-progress-fill');

          if (modalTitle) modalTitle.style.display = 'block';
          if (modalDesc) modalDesc.style.display = 'block';
          
          if (appForm) {
              appForm.style.display = '';
              appForm.style.position = '';
              appForm.style.opacity = '';
              appForm.style.pointerEvents = '';
              appForm.style.height = '';
              appForm.style.overflow = '';
          }
          
          if (successState) successState.style.display = 'none';
          if (redirectProgress) {
              redirectProgress.style.transition = 'none';
              redirectProgress.style.width = '0%';
          }
      }, 300);
  };

  if(modal) {
      modal.addEventListener('click', window.closeModal);
  }

  function showStep(stepNum) {
      currentStep = stepNum;
      
      document.querySelectorAll('.quiz-step').forEach(step => {
          step.classList.remove('active');
      });
      const activeStep = document.querySelector(`.quiz-step[data-step="${stepNum}"]`);
      if (activeStep) {
          activeStep.classList.add('active');
      }

      const percent = Math.round((stepNum / totalSteps) * 100);
      let stepLabel = `Шаг ${stepNum} из ${totalSteps}`;
      if (stepNum === 1) {
          stepLabel = `Шаг 1 из 5: Опыт с AI`;
      } else if (stepNum === 2) {
          stepLabel = `Шаг 2 из 5: Идея продукта`;
      } else if (stepNum === 3) {
          stepLabel = `Шаг 3 из 5: Цели`;
      } else if (stepNum === 4) {
          stepLabel = `Шаг 4 из 5: Готовность`;
      } else if (stepNum === 5) {
          stepLabel = `Шаг 5 из 5: Заполнение данных`;
      }
      if (progressFill) progressFill.style.width = `${percent}%`;
      if (stepIndicator) stepIndicator.textContent = stepLabel;
      if (percentIndicator) percentIndicator.textContent = `${percent}%`;

      if (stepNum === 1) {
          if (prevBtn) prevBtn.style.display = 'none';
      } else {
          if (prevBtn) prevBtn.style.display = 'block';
      }

      const submitControls = document.getElementById('quiz-submit-controls');
      if (stepNum === 5) {
          if (navRow) navRow.style.display = 'none';
          if (submitControls) submitControls.style.display = 'flex';
          if (phoneInput && (!phoneInput.value.trim() || phoneInput.value.trim() === "+")) {
              if (iti) {
                  const countryData = iti.getSelectedCountryData();
                  if (countryData && countryData.dialCode) {
                      phoneInput.value = "+" + countryData.dialCode + " ";
                  } else {
                      phoneInput.value = "+7 ";
                  }
              } else {
                  phoneInput.value = "+7 ";
              }
          }
      } else {
          if (navRow) navRow.style.display = 'flex';
          if (submitControls) submitControls.style.display = 'none';
      }

      validateStep(stepNum);
  }

  function validateStep(stepNum) {
      if (stepNum === 5) {
          if (nextBtn) nextBtn.disabled = false;
          return;
      }

      let isValid = false;

      if (stepNum === 1) {
          const val = document.getElementById('quiz-q1-value').value;
          isValid = (val !== '');
      } else if (stepNum === 2) {
          const textarea = document.getElementById('quiz-q2-textarea');
          isValid = (textarea && textarea.value.trim().length > 0);
      } else if (stepNum === 3) {
          const textarea = document.getElementById('quiz-q3-textarea');
          isValid = (textarea && textarea.value.trim().length > 0);
      } else if (stepNum === 4) {
          const val = document.getElementById('quiz-q4-value').value;
          isValid = (val !== '');
      }

      if (nextBtn) {
          nextBtn.disabled = !isValid;
      }
  }

  function resetQuiz() {
      currentStep = 1;
      document.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
      const q1 = document.getElementById('quiz-q1-value');
      const q4 = document.getElementById('quiz-q4-value');
      if (q1) q1.value = '';
      if (q4) q4.value = '';
      const q2 = document.getElementById('quiz-q2-textarea');
      const q3 = document.getElementById('quiz-q3-textarea');
      if (q2) q2.value = '';
      if (q3) q3.value = '';

      showStep(1);
  }

  document.querySelectorAll('.quiz-option').forEach(button => {
      button.addEventListener('click', function(e) {
          e.preventDefault();
          const parent = this.closest('.quiz-step');
          const stepNum = parseInt(parent.getAttribute('data-step'));
          const value = this.getAttribute('data-value');

          parent.querySelectorAll('.quiz-option').forEach(opt => opt.classList.remove('selected'));
          this.classList.add('selected');

          if (stepNum === 1) {
              document.getElementById('quiz-q1-value').value = value;
          } else if (stepNum === 4) {
              document.getElementById('quiz-q4-value').value = value;
          }

          validateStep(stepNum);
      });
  });

  const q2Textarea = document.getElementById('quiz-q2-textarea');
  if (q2Textarea) {
      q2Textarea.addEventListener('input', () => validateStep(2));
  }
  const q3Textarea = document.getElementById('quiz-q3-textarea');
  if (q3Textarea) {
      q3Textarea.addEventListener('input', () => validateStep(3));
  }

  if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (currentStep > 1) {
              showStep(currentStep - 1);
          }
      });
  }

  const step5PrevBtn = document.getElementById('quiz-step5-prev-btn');
  if (step5PrevBtn) {
      step5PrevBtn.addEventListener('click', (e) => {
          e.preventDefault();
          showStep(4);
      });
  }

  if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (currentStep < 5) {
              showStep(currentStep + 1);
          }
      });
  }

  document.querySelectorAll('.open-modal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
          // Natively redirect to the link's href (YooKassa link)
          window.location.href = YOOKASSA_PAYMENT_URL;
      });
  });

  if(appForm) {
      appForm.addEventListener('submit', function(e) {
          e.preventDefault();
          
          if (iti && phoneInput) {
              phoneInput.value = iti.getNumber();
          }
          
          const accessKeyField = document.getElementById('web3forms-access-key');
          if (accessKeyField) {
              accessKeyField.value = WEB3FORMS_ACCESS_KEY;
          }

          if (submitBtn) submitBtn.disabled = true;
          if (btnText) btnText.textContent = 'Отправка...';
          if (btnSpinner) btnSpinner.style.display = 'block';
          if (formMsg) {
              formMsg.style.display = 'none';
              formMsg.className = 'form-message';
              formMsg.textContent = '';
          }

          const formData = new FormData(appForm);
          const jsonObject = {};
          formData.forEach((value, key) => {
              jsonObject[key] = value;
          });
          
          fetch('https://api.web3forms.com/submit', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
              },
              body: JSON.stringify(jsonObject)
          })
          .then(response => {
              if (!response.ok) {
                  return response.text().then(text => {
                      throw new Error('HTTP ' + response.status + ': ' + text);
                  });
              }
              return response.json();
          })
          .then(data => {
              if (data.success) {
                  // SUCCESS STATE TRANSITION
                  const modalTitle = document.querySelector('.modal-title');
                  const modalDesc = document.querySelector('.modal-desc');
                  if (modalTitle) modalTitle.style.display = 'none';
                  if (modalDesc) modalDesc.style.display = 'none';
                  
                  appForm.style.position = 'absolute';
                  appForm.style.opacity = '0';
                  appForm.style.pointerEvents = 'none';
                  appForm.style.height = '0';
                  appForm.style.overflow = 'hidden';
                  
                  const successState = document.getElementById('quiz-success-state');
                  if (successState) {
                      successState.style.display = 'flex';
                  }
                  
                  const telegramBtn = document.getElementById('success-telegram-btn');
                  if (telegramBtn) {
                      telegramBtn.href = TELEGRAM_LINK;
                  }
                  
                  const redirectProgress = document.querySelector('.redirect-progress-fill');
                  if (redirectProgress) {
                      redirectProgress.style.transition = 'none';
                      redirectProgress.style.width = '0%';
                      setTimeout(() => {
                          redirectProgress.style.transition = 'width 3s linear';
                          redirectProgress.style.width = '100%';
                      }, 50);
                  }
                  
                  let countdown = 3;
                  const countdownEl = document.getElementById('redirect-countdown');
                  if (countdownEl) {
                      countdownEl.textContent = countdown;
                  }
                  
                  if (redirectInterval) clearInterval(redirectInterval);
                  redirectInterval = setInterval(() => {
                      countdown--;
                      if (countdownEl) {
                          countdownEl.textContent = countdown;
                      }
                      if (countdown <= 0) {
                          clearInterval(redirectInterval);
                      }
                  }, 1000);
                  
                  if (redirectTimeout) clearTimeout(redirectTimeout);
                  redirectTimeout = setTimeout(() => {
                      window.location.href = TELEGRAM_LINK;
                  }, 3000);
              } else {
                  console.error('Submission failed:', data.message);
                  
                  // Reset submit button state
                  if (submitBtn) submitBtn.disabled = false;
                  if (btnText) btnText.textContent = 'Оплатить тест-драйв за 990 ₽';
                  if (btnSpinner) btnSpinner.style.display = 'none';
                  
                  if (formMsg) {
                      formMsg.className = 'form-message error';
                      formMsg.textContent = 'Ошибка отправки: ' + (data.message || 'попробуйте позже');
                      formMsg.style.display = 'block';
                  }
                  alert('Ошибка Web3Forms: ' + (data.message || 'Неизвестная ошибка'));
              }
          })
          .catch(error => {
              console.error('Error submitting form:', error);
              
              // Reset submit button state
              if (submitBtn) submitBtn.disabled = false;
              if (btnText) btnText.textContent = 'Оплатить тест-драйв за 990 ₽';
              if (btnSpinner) btnSpinner.style.display = 'none';
              
              if (formMsg) {
                  formMsg.className = 'form-message error';
                  formMsg.textContent = 'Ошибка сети: ' + error.message;
                  formMsg.style.display = 'block';
              }
              alert('Ошибка соединения: ' + error.message);
          });
      });
  }
// 2. Video Autoplay Trigger
  const videoContainer = document.getElementById('videoContainer');
  const videoOverlay = document.getElementById('videoOverlay');
  const heroVideo = document.getElementById('heroVideo');

  if (videoOverlay && heroVideo) {
    videoOverlay.addEventListener('click', () => {
      videoContainer.classList.add('playing');
      heroVideo.play();
    });
  }

  // 3. Dynamic Image Autoloader Helper for user screenshots & dashboard
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
        // Hide the placeholder sibling
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

  // 4. PERSISTENT 45-MINUTE COUNTDOWN TIMER
  const TIMER_DURATION_MINUTES = 45;
  const timerElements = document.querySelectorAll('.timer-countdown');

  if (timerElements.length > 0) {
      let targetTime = localStorage.getItem('ai_hustler_timer_target');
      const now = new Date().getTime();

      if (!targetTime || parseInt(targetTime) < now) {
          // If no target time is set, or if the target time is in the past, set a new one
          targetTime = now + (TIMER_DURATION_MINUTES * 60 * 1000);
          localStorage.setItem('ai_hustler_timer_target', targetTime);
      } else {
          targetTime = parseInt(targetTime);
      }

      function updateCountdown() {
          const currentTime = new Date().getTime();
          let timeLeft = targetTime - currentTime;

          if (timeLeft <= 0) {
              // Reset the timer back to 45 minutes to keep it running
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
