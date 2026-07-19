// Helpers para integrarse con Telegram Web Apps.
// Usa el objeto global window.Telegram.WebApp (cargado desde telegram-web-app.js).

export const tg = window.Telegram?.WebApp;

// initData crudo (querystring firmado) que mandamos al backend para autenticar.
export function getInitData() {
  return tg?.initData || '';
}

// Aplica los colores del tema de Telegram como variables CSS.
export function aplicarTema() {
  if (!tg) return;
  const p = tg.themeParams || {};
  const root = document.documentElement.style;
  const set = (varName, value, fallback) => root.setProperty(varName, value || fallback);

  set('--tg-bg', p.bg_color, '#ffffff');
  set('--tg-text', p.text_color, '#000000');
  set('--tg-hint', p.hint_color, '#999999');
  set('--tg-link', p.link_color, '#2481cc');
  set('--tg-button', p.button_color, '#2481cc');
  set('--tg-button-text', p.button_text_color, '#ffffff');
  set('--tg-secondary-bg', p.secondary_bg_color, '#f4f4f5');

  document.body.style.backgroundColor = p.bg_color || '#ffffff';
}

// Inicializa la Mini App (expandir, listo, tema).
export function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    aplicarTema();
    tg.onEvent('themeChanged', aplicarTema);
  } catch (e) {
    console.warn('Telegram WebApp init:', e);
  }
}
