import cron from 'node-cron';
import db from '../db/index.js';

/**
 * Arranca el cron que revisa cada minuto los recordatorios vencidos,
 * los envia por Telegram y los marca como enviados.
 * @param {import('grammy').Bot} bot
 */
export function iniciarCronRecordatorios(bot) {
  const pendientes = db.prepare(
    `SELECT id, chat_id, texto FROM recordatorios
     WHERE enviado = 0 AND datetime(fecha_hora) <= datetime('now')
     ORDER BY fecha_hora ASC`
  );
  const marcarEnviado = db.prepare('UPDATE recordatorios SET enviado = 1 WHERE id = ?');

  cron.schedule('* * * * *', async () => {
    let vencidos;
    try {
      vencidos = pendientes.all();
    } catch (err) {
      console.error('Cron: error consultando recordatorios:', err);
      return;
    }

    for (const r of vencidos) {
      try {
        await bot.api.sendMessage(r.chat_id, `⏰ Recordatorio: ${r.texto}`);
        marcarEnviado.run(r.id);
      } catch (err) {
        console.error(`Cron: no pude enviar el recordatorio ${r.id}:`, err);
        // No lo marcamos como enviado: se reintenta el proximo minuto.
      }
    }
  });

  console.log('⏰ Cron de recordatorios activo (cada minuto).');
}
