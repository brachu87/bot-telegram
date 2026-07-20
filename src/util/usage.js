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
  return parseInt(process.env.MAX_MSGS_DIA || '0', 10) || 0;
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
