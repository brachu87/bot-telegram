import { DateTime } from 'luxon';

export const ZONA = process.env.TZ || 'America/Argentina/Buenos_Aires';

// Fecha/hora actual en la zona del usuario
export function ahora() {
  return DateTime.now().setZone(ZONA);
}

// String legible para inyectar en el system prompt (ej: "domingo 19/07/2026 14:30")
export function ahoraLegible() {
  return ahora().setLocale('es').toFormat("cccc dd/LL/yyyy HH:mm");
}

// Fecha de hoy en formato YYYY-MM-DD (zona local)
export function hoyISO() {
  return ahora().toISODate();
}

// Convierte una fecha_hora local ("2026-07-20 09:00" o ISO) a ISO UTC para guardar recordatorios.
export function localAUTC(fechaHoraLocal) {
  let dt = DateTime.fromISO(fechaHoraLocal, { zone: ZONA });
  if (!dt.isValid) {
    dt = DateTime.fromSQL(fechaHoraLocal, { zone: ZONA });
  }
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}

// Convierte un ISO UTC a texto legible en zona local
export function utcALegible(isoUtc) {
  return DateTime.fromISO(isoUtc, { zone: 'utc' })
    .setZone(ZONA)
    .setLocale('es')
    .toFormat("cccc dd/LL HH:mm");
}

// Normaliza una fecha (YYYY-MM-DD). Si viene vacia, devuelve hoy.
export function normalizarFecha(fecha) {
  if (!fecha) return hoyISO();
  const dt = DateTime.fromISO(fecha, { zone: ZONA });
  return dt.isValid ? dt.toISODate() : hoyISO();
}
