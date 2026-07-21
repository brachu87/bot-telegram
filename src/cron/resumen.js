import cron from 'node-cron';
import { DateTime } from 'luxon';
import db from '../db/index.js';
import { ZONA } from '../util/dates.js';
import { fmtPesos } from '../util/money.js';
import { usuariosAutorizados } from '../util/access.js';

// Arma el texto del resumen del mes en curso para un usuario.
function armarResumen(userId) {
  const now = DateTime.now().setZone(ZONA);
  const desde = now.startOf('month').toISODate();
  const hasta = now.endOf('month').toISODate();

  const ingresos = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM ingresos WHERE user_id=? AND fecha>=? AND fecha<=?').get(userId, desde, hasta).t;
  const gastos = db.prepare('SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=?').get(userId, desde, hasta).t;
  const balance = ingresos - gastos;

  // Deudas pendientes (lo que el usuario le debe a la gente)
  const deuda = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo='deuda' THEN monto ELSE -monto END),0) AS t
    FROM movimientos_persona WHERE user_id=?
  `).get(userId).t;

  const mes = now.setLocale('es').toFormat('LLLL');

  let txt = `📊 Tu resumen de ${mes}\n\n`;
  txt += `Ingresos: ${fmtPesos(ingresos)}\n`;
  txt += `Gastos: ${fmtPesos(gastos)}\n`;
  txt += `Balance: ${fmtPesos(balance)} ${balance >= 0 ? '🟢' : '🔴'}\n`;
  if (deuda > 0) txt += `\nDebés en total: ${fmtPesos(deuda)}`;
  txt += `\n\nTocá 📊 para ver el detalle.`;
  return { txt, ingresos, gastos };
}

/**
 * Arranca el cron que manda el resumen automatico a los usuarios autorizados.
 * Config: RESUMEN_CRON (expresion cron). Default: lunes 9hs. "off" lo desactiva.
 */
export function iniciarCronResumen(bot) {
  const expr = process.env.RESUMEN_CRON || '0 9 * * 1'; // lunes 9:00
  if (expr.toLowerCase() === 'off') {
    console.log('📊 Resumen automático desactivado (RESUMEN_CRON=off).');
    return;
  }
  if (!cron.validate(expr)) {
    console.error(`RESUMEN_CRON inválido: "${expr}". No se activa el resumen automático.`);
    return;
  }

  cron.schedule(expr, async () => {
    const usuarios = usuariosAutorizados();
    for (const uid of usuarios) {
      try {
        const { txt, ingresos, gastos } = armarResumen(uid);
        // No molestar si el usuario no tiene nada cargado este mes
        if (ingresos === 0 && gastos === 0) continue;
        await bot.api.sendMessage(uid, txt);
      } catch (err) {
        console.error(`Resumen automático: no pude enviar a ${uid}:`, err.message);
      }
    }
  }, { timezone: ZONA });

  console.log(`📊 Resumen automático activo (cron "${expr}", zona ${ZONA}).`);
}
