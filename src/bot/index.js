import { Bot } from 'grammy';
import { procesarMensaje } from './claude.js';
import { transcribir } from './transcribe.js';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('Falta TELEGRAM_BOT_TOKEN en el .env');
}

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// --- /start ---
bot.command('start', async (ctx) => {
  await ctx.reply(
    '¡Hola! Soy tu asistente 🤖\n\n' +
    'Mandame un audio o un texto y te llevo:\n' +
    '• Gastos e ingresos 💸\n' +
    '• Deudas y pagos a personas (ej: empleados) 🧾\n' +
    '• Recordatorios ⏰\n' +
    '• Notas 📝\n\n' +
    'Ejemplos: "gasté 15 lucas en el súper", "le debo 50 lucas a Juan por el sábado", ' +
    '"recordame mañana a las 9 llamar al contador".\n\n' +
    'Tocá el botón 📊 para ver tu resumen con gráficos.'
  );
});

// --- Descarga de un archivo de Telegram como Buffer ---
async function descargarArchivo(ctx, fileId) {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No pude descargar el audio (${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  const ext = (file.file_path.split('.').pop() || 'oga').toLowerCase();
  return { buffer: Buffer.from(arrayBuf), filename: `audio.${ext}` };
}

// --- Handler comun: obtiene el texto (transcribiendo si hace falta) y responde ---
async function manejarMensaje(ctx, texto) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  await ctx.replyWithChatAction('typing').catch(() => {});
  const respuesta = await procesarMensaje(userId, chatId, texto);
  await ctx.reply(respuesta);
}

// --- Audios / notas de voz ---
bot.on(['message:voice', 'message:audio'], async (ctx) => {
  try {
    const media = ctx.message.voice || ctx.message.audio;
    const { buffer, filename } = await descargarArchivo(ctx, media.file_id);

    let texto;
    try {
      texto = await transcribir(buffer, filename);
    } catch (err) {
      console.error('Error transcribiendo:', err);
      await ctx.reply('Uh, no te entendí el audio 🙈 ¿Me lo mandás de nuevo o me lo escribís?');
      return;
    }

    if (!texto) {
      await ctx.reply('No pude sacar nada del audio 🙈 Probá de nuevo, por favor.');
      return;
    }

    await manejarMensaje(ctx, texto);
  } catch (err) {
    console.error('Error manejando audio:', err);
    await ctx.reply('Se me complicó procesar eso 😕 Probá de nuevo en un ratito.');
  }
});

// --- Texto ---
bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return; // comandos ya manejados
  try {
    await manejarMensaje(ctx, ctx.message.text);
  } catch (err) {
    console.error('Error manejando texto:', err);
    await ctx.reply('Se me complicó procesar eso 😕 Probá de nuevo en un ratito.');
  }
});

// --- Errores no capturados del bot ---
bot.catch((err) => {
  console.error('Error en el bot:', err);
});
