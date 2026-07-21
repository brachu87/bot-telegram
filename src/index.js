import 'dotenv/config';
import { bot } from './bot/index.js';
import { crearApp } from './api/index.js';
import { iniciarCronRecordatorios } from './cron/reminders.js';
import { iniciarCronResumen } from './cron/resumen.js';
import { iniciarCronBackup } from './cron/backup.js';

const PORT = process.env.PORT || 3000;

// Chequeo de variables de entorno criticas
const faltantes = ['TELEGRAM_BOT_TOKEN', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY']
  .filter(k => !process.env[k]);
if (faltantes.length) {
  console.error(`❌ Faltan variables de entorno: ${faltantes.join(', ')}`);
  console.error('   Copiá .env.example a .env y completá las keys.');
  process.exit(1);
}

async function main() {
  // 1) Servidor web (API + Mini App)
  const app = crearApp();
  app.listen(PORT, () => console.log(`🌐 API + Mini App en http://localhost:${PORT}`));

  // 2) Crons: recordatorios, resumen automático y backups
  iniciarCronRecordatorios(bot);
  iniciarCronResumen(bot);
  iniciarCronBackup(bot);

  // 3) Configurar el boton de menu de la Mini App (si hay URL publica)
  if (process.env.WEBAPP_URL) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '📊 Ver resumen',
          web_app: { url: process.env.WEBAPP_URL }
        }
      });
      console.log(`📊 Boton de menu configurado -> ${process.env.WEBAPP_URL}`);
    } catch (err) {
      console.error('No pude configurar el boton de menu:', err.message);
    }
  } else {
    console.log('ℹ️  WEBAPP_URL vacio: el boton de la Mini App no se configuro (normal en desarrollo).');
  }

  // 4) Bot (long polling)
  bot.start({
    onStart: (info) => console.log(`🤖 Bot @${info.username} escuchando.`)
  });
}

main().catch((err) => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});

// Apagado ordenado
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
