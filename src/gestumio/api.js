// Cliente de la API de Gestumio para el bot de Telegram.
// Cada usuario de Telegram guarda su token (obtenido al /vincular).
import db from '../db/index.js';

const BASE = (process.env.GESTUMIO_API_URL || 'https://app.gestumio.com').replace(/\/+$/, '');

// --- Persistencia del vínculo ---
export function getLink(userId) {
  return db.prepare('SELECT * FROM gestumio_link WHERE user_id = ?').get(userId) || null;
}
export function estaVinculado(userId) {
  return !!getLink(userId);
}
function guardarLink(userId, { token, businessName, userName, role }) {
  db.prepare(`INSERT INTO gestumio_link (user_id, token, business_name, user_name, role)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET token=excluded.token, business_name=excluded.business_name,
      user_name=excluded.user_name, role=excluded.role, vinculado_en=datetime('now')`)
    .run(userId, token, businessName || null, userName || null, role || null);
}
export function desvincular(userId) {
  return db.prepare('DELETE FROM gestumio_link WHERE user_id = ?').run(userId).changes > 0;
}

// --- Vinculación con un código de un solo uso ---
export async function vincular(userId, code, telegramName) {
  const res = await fetch(`${BASE}/api/bot/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: String(code).trim().toUpperCase(), telegramUserId: userId, telegramName: telegramName || null }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo vincular');
  guardarLink(userId, data);
  return data; // { businessName, userName, role }
}

// --- Llamada autenticada genérica ---
async function llamar(userId, method, path, body) {
  const link = getLink(userId);
  if (!link) return { ok: false, error: 'NO_VINCULADO' };
  const res = await fetch(`${BASE}/api/bot${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${link.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    desvincular(userId); // token revocado o vencido
    return { ok: false, error: data.error || 'La vinculación con Gestumio ya no es válida. Volvé a vincular con /vincular.' };
  }
  if (!res.ok) return { ok: false, error: data.error || 'Error en Gestumio' };
  return { ok: true, data };
}

// --- Acciones de alto nivel (las usan las tools) ---
export const gestumio = {
  cargarGasto: (userId, p) => llamar(userId, 'POST', '/expense', p),
  registrarCobro: (userId, p) => llamar(userId, 'POST', '/income', p),
  crearCliente: (userId, p) => llamar(userId, 'POST', '/client', p),
  consultar: (userId, params) => {
    const qs = new URLSearchParams(params).toString();
    return llamar(userId, 'GET', `/query?${qs}`, null);
  },
  me: (userId) => llamar(userId, 'GET', '/me', null),
};
