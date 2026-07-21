import { Bot, InputFile } from 'grammy';
import db from '../db/index.js';
import { procesarMensaje } from './claude.js';
import { transcribir } from './transcribe.js';
import { estaAutorizado, esAdmin, agregarCliente, quitarCliente, listarClientes } from '../util/access.js';
import { chequearLimite } from '../util/usage.js';
import { generarExcel } from '../export/excel.js';
import { generarPDF } from '../export/pdf.js';
import { fmtPesos } from '../util/money.js';

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
      '🔒 Este bot es privado. Para usarlo necesitás que te den de alta.\n' +
      `Pasale este número a quien te ofreció el servicio: ${uid}`
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

// --- /debug: diagnostico. Muestra lo que hay realmente en la base para este usuario ---
bot.command('debug', async (ctx) => {
  try {
    const uid = ctx.from.id;
    const ing = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(monto),0) AS s FROM ingresos WHERE user_id=?').get(uid);
    const gas = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(monto),0) AS s FROM gastos WHERE user_id=?').get(uid);
    const ultIng = db.prepare('SELECT monto, descripcion, fecha, creado_en FROM ingresos WHERE user_id=? ORDER BY id DESC LIMIT 3').all(uid);
    const totalIngTodos = db.prepare('SELECT COUNT(*) AS n FROM ingresos').get().n;

    let txt = `🔎 Diagnóstico\n`;
    txt += `Tu user_id: ${uid}\n`;
    txt += `Base: ${process.env.DB_PATH || './data/asistente.db'}\n\n`;
    txt += `Ingresos tuyos: ${ing.n} (total ${fmtPesos(ing.s)})\n`;
    txt += `Gastos tuyos: ${gas.n} (total ${fmtPesos(gas.s)})\n`;
    txt += `Ingresos de TODOS los usuarios: ${totalIngTodos}\n\n`;
    if (ultIng.length) {
      txt += `Últimos ingresos:\n`;
      ultIng.forEach(i => { txt += `• ${fmtPesos(i.monto)} — ${i.descripcion || 's/desc'} — fecha ${i.fecha} (guardado ${i.creado_en})\n`; });
    } else {
      txt += `No hay ingresos guardados para tu usuario en ESTA base.`;
    }
    await ctx.reply(txt);
  } catch (err) {
    console.error('Error /debug:', err);
    await ctx.reply('No pude leer el diagnóstico: ' + err.message);
  }
});

// --- Comandos de administrador (solo para los ADMIN_IDS): gestionar clientes ---
bot.command('autorizar', async (ctx) => {
  if (!esAdmin(ctx.from.id)) return;
  const partes = (ctx.match || '').trim().split(/\s+/);
  const id = parseInt(partes[0], 10);
  if (!id) {
    await ctx.reply('Uso: /autorizar <id_de_telegram> [alias]\nEj: /autorizar 12345678 Kiosco Juan');
    return;
  }
  const alias = partes.slice(1).join(' ') || null;
  agregarCliente(id, alias);
  await ctx.reply(`✅ Cliente autorizado: ${id}${alias ? ' (' + alias + ')' : ''}`);
});

bot.command('baja', async (ctx) => {
  if (!esAdmin(ctx.from.id)) return;
  const id = parseInt((ctx.match || '').trim(), 10);
  if (!id) {
    await ctx.reply('Uso: /baja <id_de_telegram>\nEj: /baja 12345678');
    return;
  }
  const ok = quitarCliente(id);
  await ctx.reply(ok ? `✅ Cliente dado de baja: ${id}` : `No encontré ningún cliente con id ${id}.`);
});

bot.command('clientes', async (ctx) => {
  if (!esAdmin(ctx.from.id)) return;
  const lista = listarClientes();
  if (lista.length === 0) {
    await ctx.reply('Todavía no tenés clientes cargados. Usá /autorizar <id> [alias].');
    return;
  }
  const texto = lista
    .map(c => `• ${c.user_id}${c.alias ? ' — ' + c.alias : ''}  (alta: ${(c.alta_en || '').slice(0, 10)})`)
    .join('\n');
  await ctx.reply(`👥 Clientes activos (${lista.length}):\n${texto}`);
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

  // Control de costos: tope de mensajes por dia por usuario (si esta configurado)
  const limite = chequearLimite(userId);
  if (!limite.permitido) {
    await ctx.reply(`Llegaste al máximo de mensajes por hoy (${limite.limite}). Seguimos mañana 🙂`);
    return;
  }

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
