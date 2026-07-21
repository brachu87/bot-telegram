import Anthropic from '@anthropic-ai/sdk';
import db from '../db/index.js';
import { toolDefs, ejecutarTool } from './tools.js';
import { construirSystemPrompt } from './prompt.js';

// Modelo configurable por env. Por defecto Sonnet (mas confiable llamando tools;
// importante en una app de plata). Para ahorrar, se puede probar Haiku:
// CLAUDE_MODEL=claude-haiku-4-5-20251001 (mas barato pero a veces no ejecuta la tool).
const MODELO = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const MAX_HISTORIAL = 20;    // cuantos mensajes previos recordamos por chat
const MAX_ITERACIONES = 8;   // tope de vueltas del loop de tool use

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// --- Historial persistido por chat (texto plano user/assistant) ---
function cargarHistorial(userId, chatId) {
  const rows = db.prepare(
    `SELECT rol, contenido FROM historial_chat
     WHERE user_id = ? AND chat_id = ?
     ORDER BY id DESC LIMIT ?`
  ).all(userId, chatId, MAX_HISTORIAL);
  rows.reverse();
  return rows.map(r => ({ role: r.rol, content: r.contenido }));
}

function guardarMensaje(userId, chatId, rol, contenido) {
  db.prepare(
    'INSERT INTO historial_chat (user_id, chat_id, rol, contenido) VALUES (?, ?, ?, ?)'
  ).run(userId, chatId, rol, contenido);
  // Recorte: dejar solo los ultimos MAX_HISTORIAL * 2 registros por chat
  db.prepare(
    `DELETE FROM historial_chat
     WHERE user_id = ? AND chat_id = ? AND id NOT IN (
       SELECT id FROM historial_chat WHERE user_id = ? AND chat_id = ? ORDER BY id DESC LIMIT ?
     )`
  ).run(userId, chatId, userId, chatId, MAX_HISTORIAL * 2);
}

/**
 * Corre el loop de tool use sobre una lista de mensajes ya armada.
 * textoParaHistorial es lo que se guarda como turno del usuario (ej: "[foto de ticket]").
 */
async function correrLoop(userId, chatId, messages, textoParaHistorial) {
  const system = construirSystemPrompt(userId);
  const archivos = []; // archivos que las tools piden enviar (ej: exportar_datos)
  let respuestaFinal = '';

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system,
      tools: toolDefs,
      messages
    });

    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          let resultado;
          try {
            resultado = ejecutarTool(block.name, block.input || {}, { userId, chatId, archivos });
          } catch (err) {
            resultado = { ok: false, error: String(err.message || err) };
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(resultado) });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    respuestaFinal = resp.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    break;
  }

  if (!respuestaFinal) respuestaFinal = 'Listo.';

  guardarMensaje(userId, chatId, 'user', textoParaHistorial);
  guardarMensaje(userId, chatId, 'assistant', respuestaFinal);

  return { texto: respuestaFinal, archivos };
}

/**
 * Procesa un mensaje de texto del usuario. Ejecuta el loop completo de tool use.
 */
export async function procesarMensaje(userId, chatId, textoUsuario) {
  const messages = cargarHistorial(userId, chatId);
  messages.push({ role: 'user', content: textoUsuario });
  return correrLoop(userId, chatId, messages, textoUsuario);
}

/**
 * Procesa una foto (ticket/factura) con vision: extrae el total y lo registra como gasto.
 * @param {string} base64  imagen en base64 (sin el prefijo data:)
 * @param {string} mediaType  ej "image/jpeg"
 * @param {string} caption  texto que el usuario haya puesto junto a la foto (opcional)
 */
export async function procesarImagen(userId, chatId, base64, mediaType = 'image/jpeg', caption = '') {
  const messages = cargarHistorial(userId, chatId);
  const instruccion =
    'El usuario mando una foto de un ticket, factura o comprobante. Mira la imagen, identifica el TOTAL a pagar y registralo como gasto con registrar_gasto, ' +
    'eligiendo una categoria adecuada (comida, transporte, servicios, etc.) y una descripcion corta (ej: el nombre del comercio). ' +
    (caption ? `El usuario aclaro: "${caption}". ` : '') +
    'Si NO se ve el total con claridad, no inventes: pedile al usuario que te diga el monto.';
  messages.push({
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: instruccion }
    ]
  });
  return correrLoop(userId, chatId, messages, '[foto de ticket]');
}
