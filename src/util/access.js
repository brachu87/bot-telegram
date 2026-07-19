// Control de acceso: lista blanca de IDs de Telegram autorizados.
// Se configura con la variable de entorno ALLOWED_USER_IDS (IDs separados por coma).
// Si la variable esta vacia, el bot es ABIERTO (lo usa cualquiera).
// Si tiene al menos un ID, el bot es PRIVADO: solo esos IDs pueden usarlo.

export function idsPermitidos() {
  const raw = process.env.ALLOWED_USER_IDS || '';
  return new Set(
    raw.split(',').map(s => s.trim()).filter(Boolean)
  );
}

export function esPrivado() {
  return idsPermitidos().size > 0;
}

export function estaAutorizado(userId) {
  const ids = idsPermitidos();
  if (ids.size === 0) return true;          // sin restriccion
  return ids.has(String(userId));
}
