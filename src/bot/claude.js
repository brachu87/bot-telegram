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
 * Procesa un mensaje de texto del usuario y devuelve la respuesta final de Claude.
 * Ejecuta el loop completo de tool use.
 */
export async function procesarMensaje(userId, chatId, textoUsuario) {
  const system = construirSystemPrompt(userId);

  // Historial previo (texto) + mensaje nuevo
  const messages = cargarHistorial(userId, chatId);
  messages.push({ role: 'user', content: textoUsuario });

  // Archivos que las tools piden enviar (ej: exportar_datos). El bot los manda al final.
  const archivos = [];
  let respuestaFinal = '';

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const resp = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system,
      tools: toolDefs,
      messages
    });

    // Guardar el turno del assistant (con sus content blocks) en la conversacion en curso
    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'tool_use') {
      // Ejecutar todas las tools pedidas y devolver los resultados
      const toolResults = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          let resultado;
          try {
            resultado = ejecutarTool(block.name, block.input || {}, { userId, chatId, archivos });
          } catch (err) {
            resultado = { ok: false, error: String(err.message || err) };
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(resultado)
          });
        }
      }
      messages.push({ role: 'user', content: toolResults });
      continue; // otra vuelta para que Claude siga o redacte la respuesta final
    }

    // Sin mas tools: extraer el texto final
    respuestaFinal = resp.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    break;
  }

  if (!respuestaFinal) {
    respuestaFinal = 'Listo.';
  }

  // Persistir el turno (solo texto) para futuras preguntas de seguimiento
  guardarMensaje(userId, chatId, 'user', textoUsuario);
  guardarMensaje(userId, chatId, 'assistant', respuestaFinal);

  return { texto: respuestaFinal, archivos };
}
