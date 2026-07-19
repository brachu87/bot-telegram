import crypto from 'node:crypto';
import { estaAutorizado } from '../util/access.js';

/**
 * Valida el initData de una Telegram Mini App segun la doc oficial.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * @param {string} initData  querystring crudo enviado por el frontend
 * @param {string} botToken
 * @param {number} maxEdadSegundos  antiguedad maxima permitida (default 24h)
 * @returns {{ ok: boolean, user?: object, error?: string }}
 */
export function validarInitData(initData, botToken, maxEdadSegundos = 86400) {
  if (!initData || typeof initData !== 'string') {
    return { ok: false, error: 'initData ausente' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, error: 'hash ausente' };

  // Armar data_check_string: todos los campos menos hash, ordenados alfabeticamente
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Comparacion en tiempo constante
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'firma invalida' };
  }

  // Chequear antiguedad (auth_date en segundos unix)
  const authDate = Number(params.get('auth_date'));
  if (authDate) {
    const edad = Math.floor(Date.now() / 1000) - authDate;
    if (edad > maxEdadSegundos) return { ok: false, error: 'initData expirado' };
  }

  // Extraer el usuario
  let user;
  try {
    user = JSON.parse(params.get('user') || '{}');
  } catch {
    return { ok: false, error: 'user invalido' };
  }
  if (!user || !user.id) return { ok: false, error: 'user sin id' };

  return { ok: true, user };
}

/**
 * Middleware de Express: valida el header y agrega req.telegramUser.
 * El frontend manda el initData en el header "X-Telegram-Init-Data".
 */
export function authMiddleware(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data') || '';
  const resultado = validarInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!resultado.ok) {
    return res.status(401).json({ error: 'No autorizado', detalle: resultado.error });
  }
  // Si el bot es privado, solo los IDs autorizados pueden ver datos en la Mini App.
  if (!estaAutorizado(resultado.user.id)) {
    return res.status(403).json({ error: 'No autorizado', detalle: 'usuario no permitido' });
  }
  req.telegramUser = resultado.user;
  req.userId = resultado.user.id;
  next();
}
