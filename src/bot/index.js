import { Bot, InputFile } from 'grammy';
import { procesarMensaje } from './claude.js';
import { transcribir } from './transcribe.js';
import { estaAutorizado } from '../util/access.js';
import { generarExcel } from '../export/excel.js';
import { generarPDF } from '../export/pdf.js';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('Falta TELEGRAM_BOT_TOKEN en el .env');
}

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// --- /id: cualquiera puede pedir su propio ID de Telegram (sirve para autorizarlo) ---
bot.command('id', async (ctx) => {
  await ctx.reply(`Tu ID de Telegram es: ${ctx.from.id}`);
});

// --- Control de acceso: si el bot es privado, bloquear a los no autorizados ---
bot.use(async (ctx, next) => {
  const uid = ctx.from?.id;
  if (uid && !estaAutorizado(uid)) {
    await ctx.reply(
      '🔒 Este bot es privado y no estás autorizado a usarlo.\n' +
      `Si sos el dueño, agregá este ID a ALLOWED_USER_IDS: ${uid}`
    );
    return; // corta acá: no ejecuta ningún otro handler
  }
  await next();
});

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
    'Tocá el botón 📊 para ver tu resumen con gráficos.\n' +
    'Escribí /excel o /pdf para descargar tus datos.'
  );
});

// --- /excel y /pdf: generan un reporte y lo mandan como archivo ---
bot.command('excel', async (ctx) => {
  try {
    await ctx.replyWithChatAction('upload_document').catch(() => {});
    const buf = await generarExcel(ctx.from.id);
    await ctx.replyWithDocument(new InputFile(buf, 'reporte.xlsx'), { caption: 'Tu reporte en Excel 📊' });
  } catch (err) {
    console.error('Error /excel:', err);
    await ctx.reply('Se me complicó generar el Excel 😕 Probá de nuevo en un ratito.');
  }
});

bot.command('pdf', async (ctx) => {
  try {
    await ctx.replyWithChatAction('upload_document').catch(() => {});
    const buf = await generarPDF(ctx.from.id);
    await ctx.replyWithDocument(new InputFile(buf, 'reporte.pdf'), { caption: 'Tu reporte en PDF 📄' });
  } catch (err) {
    console.error('Error /pdf:', err);
    await ctx.reply('Se me complicó generar el PDF 😕 Probá de nuevo en un ratito.');
  }
});

// --- Descarga de un archivo de Telegram como Buffer ---
async function descargarArchivo(ctx, fileId) {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No pude descargar el audio (${res.status})`);
  const arrayBuf = await res.arrayBuffer();
  let ext = (file.file_path.split('.').pop() || 'ogg').toLowerCase();
  // Telegram manda las notas de voz como .oga; Groq acepta ogg/opus, no oga.
  if (ext === 'oga') ext = 'ogg';
  return { buffer: Buffer.from(arrayBuf), filename: `audio.${ext}` };
}

// --- Genera y envia un reporte pedido por el usuario (via tool exportar_datos) ---
async function enviarReporte(ctx, pedido) {
  const { formato, desde, hasta, tipo, persona } = pedido;
  const opciones = { tipo: tipo || 'todo', persona: persona || null };
  await ctx.replyWithChatAction('upload_document').catch(() => {});
  if (formato === 'pdf') {
    const buf = await generarPDF(ctx.from.id, desde, hasta, opciones);
    await ctx.replyWithDocument(new InputFile(buf, 'reporte.pdf'));
  } else {
    const buf = await generarExcel(ctx.from.id, desde, hasta, opciones);
    await ctx.replyWithDocument(new InputFile(buf, 'reporte.xlsx'));
  }
}

// --- Handler comun: obtiene el texto (transcribiendo si hace falta) y responde ---
async function manejarMensaje(ctx, texto) {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;
  await ctx.replyWithChatAction('typing').catch(() => {});
  const { texto: respuesta, archivos } = await procesarMensaje(userId, chatId, texto);
  await ctx.reply(respuesta);
  // Enviar los reportes que Claude haya pedido con la tool exportar_datos
  for (const pedido of archivos || []) {
    try {
      await enviarReporte(ctx, pedido);
    } catch (err) {
      console.error('Error enviando reporte:', err);
      await ctx.reply('Generé la respuesta pero no pude armar el archivo 😕 Probá con /excel o /pdf.');
    }
  }
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
