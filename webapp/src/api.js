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
  ingresos: (desde, hasta) => get(`/ingresos${qs({ desde, hasta })}`),
  gastosMensual: (meses = 6) => get(`/gastos/mensual${qs({ meses })}`),
  personas: () => get('/personas'),
  recordatorios: (desde, hasta) => get(`/recordatorios${qs({ desde, hasta })}`),
  notas: (query) => get(`/notas${qs({ query })}`),
  movimientos: (desde, hasta) => get(`/movimientos${qs({ desde, hasta })}`)
};

// Descarga un archivo (Excel o PDF) mandando el initData como header.
export async function descargar(formato, desde, hasta) {
  const path = formato === 'pdf' ? '/export/pdf' : '/export/excel';
  const res = await fetch(`/api${path}${qs({ desde, hasta })}`, {
    headers: { 'X-Telegram-Init-Data': getInitData() }
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = formato === 'pdf' ? 'reporte.pdf' : 'reporte.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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
