// Transcripcion de audios con Whisper via la API de Groq (whisper-large-v3).

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * Transcribe un archivo de audio.
 * @param {Buffer} buffer  contenido del audio
 * @param {string} filename  nombre con extension (ej: "voz.oga")
 * @returns {Promise<string>} texto transcripto
 */
export async function transcribir(buffer, filename = 'audio.oga') {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Falta GROQ_API_KEY');
  }

  const form = new FormData();
  const blob = new Blob([buffer]);
  form.append('file', blob, filename);
  form.append('model', 'whisper-large-v3');
  form.append('language', 'es');
  form.append('response_format', 'json');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form
  });

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Groq transcripcion fallo (${res.status}): ${detalle}`);
  }

  const data = await res.json();
  return (data.text || '').trim();
}
