import db from '../db/index.js';
import { hoyISO } from './dates.js';

// Tabla para contar mensajes por usuario por dia (control de costos).
db.exec(`CREATE TABLE IF NOT EXISTS uso_diario (
  user_id INTEGER NOT NULL,
  fecha   TEXT NOT NULL,
  cuenta  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, fecha)
);`);

// Limite de mensajes por dia por usuario. 0 o vacio = sin limite.
export function limiteDiario() {
  // Default 50 mensajes/día por usuario (tope del add-on). 0 = sin límite (poné MAX_MSGS_DIA=0).
  const raw = process.env.MAX_MSGS_DIA;
  if (raw === undefined || raw === '') return 50;
  return parseInt(raw, 10) || 0;
}

/**
 * Chequea el limite diario del usuario y, si esta permitido, registra el uso.
 * Devuelve { permitido, limite, cuenta }.
 * Si no hay limite configurado, siempre permite.
 */
export function chequearLimite(userId) {
  const limite = limiteDiario();
  if (limite <= 0) return { permitido: true, limite: 0 };

  const fecha = hoyISO();
  const row = db.prepare('SELECT cuenta FROM uso_diario WHERE user_id=? AND fecha=?').get(userId, fecha);
  const cuenta = row ? row.cuenta : 0;

  if (cuenta >= limite) return { permitido: false, limite, cuenta };

  db.prepare(`INSERT INTO uso_diario (user_id, fecha, cuenta) VALUES (?, ?, 1)
    ON CONFLICT(user_id, fecha) DO UPDATE SET cuenta = cuenta + 1`).run(userId, fecha);

  return { permitido: true, limite, cuenta: cuenta + 1 };
}

// --- Registro de consumo real de tokens (para calibrar costos) ---
db.exec(`CREATE TABLE IF NOT EXISTS uso_tokens (
  user_id     INTEGER NOT NULL,
  fecha       TEXT NOT NULL,
  in_tok      INTEGER NOT NULL DEFAULT 0,
  out_tok     INTEGER NOT NULL DEFAULT 0,
  cache_read  INTEGER NOT NULL DEFAULT 0,
  cache_write INTEGER NOT NULL DEFAULT 0,
  llamadas    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, fecha)
);`);

// Acumula el usage de una llamada a la API (objeto resp.usage de Anthropic).
export function registrarTokens(userId, usage) {
  if (!usage) return;
  const fecha = hoyISO();
  const i = usage.input_tokens || 0;
  const o = usage.output_tokens || 0;
  const cr = usage.cache_read_input_tokens || 0;
  const cw = usage.cache_creation_input_tokens || 0;
  db.prepare(`INSERT INTO uso_tokens (user_id, fecha, in_tok, out_tok, cache_read, cache_write, llamadas)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(user_id, fecha) DO UPDATE SET
      in_tok = in_tok + ?, out_tok = out_tok + ?, cache_read = cache_read + ?, cache_write = cache_write + ?, llamadas = llamadas + 1`)
    .run(userId, fecha, i, o, cr, cw, i, o, cr, cw);
}

// Devuelve el consumo de tokens de un usuario en un día (default hoy).
export function tokensDelDia(userId, fecha = hoyISO()) {
  return db.prepare('SELECT * FROM uso_tokens WHERE user_id=? AND fecha=?').get(userId, fecha)
    || { in_tok: 0, out_tok: 0, cache_read: 0, cache_write: 0, llamadas: 0 };
}
