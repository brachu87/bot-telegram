import { getInitData } from './telegram.js';

// Cliente de la API. Manda el initData de Telegram en cada request para autenticar.
async function get(path) {
  const res = await fetch(`/api${path}`, {
    headers: {
      'X-Telegram-Init-Data': getInitData()
    }
  });
  if (!res.ok) {
    const detalle = await res.json().catch(() => ({}));
    throw new Error(detalle.detalle || detalle.error || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  resumen: (desde, hasta) => get(`/resumen${qs({ desde, hasta })}`),
  gastos: (desde, hasta) => get(`/gastos${qs({ desde, hasta })}`),
  gastosMensual: (meses = 6) => get(`/gastos/mensual${qs({ meses })}`),
  personas: () => get('/personas'),
  recordatorios: (desde, hasta) => get(`/recordatorios${qs({ desde, hasta })}`),
  notas: (query) => get(`/notas${qs({ query })}`)
};

function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') p.append(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// Formateo de pesos argentinos
export function fmtPesos(n) {
  const num = Math.round(Number(n) || 0);
  return '$' + num.toLocaleString('es-AR');
}
