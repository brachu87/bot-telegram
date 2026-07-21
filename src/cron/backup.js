import cron from 'node-cron';
import fs from 'node:fs';
import { InputFile } from 'grammy';
import { DateTime } from 'luxon';
import { DB_FILE, checkpoint } from '../db/index.js';
import { ZONA } from '../util/dates.js';
import { idsAdmin } from '../util/access.js';

/**
 * Arranca el cron de backups: envia el archivo de la base a cada admin por Telegram.
 * Config: BACKUP_CRON (expresion cron). Default: domingo 3am. "off" lo desactiva.
 * Necesita ADMIN_IDS configurado (sino no hay a quien mandarle el backup).
 */
export function iniciarCronBackup(bot) {
  const expr = process.env.BACKUP_CRON || '0 3 * * 0'; // domingo 3:00
  if (expr.toLowerCase() === 'off') {
    console.log('💾 Backups automáticos desactivados (BACKUP_CRON=off).');
    return;
  }
  if (!cron.validate(expr)) {
    console.error(`BACKUP_CRON inválido: "${expr}". No se activan los backups.`);
    return;
  }

  cron.schedule(expr, async () => {
    const admins = [...idsAdmin()].map(Number).filter(Number.isFinite);
    if (admins.length === 0) return;
    try {
      checkpoint(); // volcar WAL al archivo principal
      if (!fs.existsSync(DB_FILE)) return;
      const buffer = fs.readFileSync(DB_FILE);
      const fecha = DateTime.now().setZone(ZONA).toFormat('yyyy-LL-dd');
      const nombre = `backup-${fecha}.db`;
      for (const uid of admins) {
        try {
          await bot.api.sendDocument(uid, new InputFile(buffer, nombre), { caption: `💾 Backup de la base (${fecha})` });
        } catch (err) {
          console.error(`Backup: no pude enviar a ${uid}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Backup: error generando/enviando:', err.message);
    }
  }, { timezone: ZONA });

  console.log(`💾 Backups automáticos activos (cron "${expr}", zona ${ZONA}).`);
}
