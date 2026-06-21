// Helpers de "día del gimnasio" (Tampico, UTC-6). Compartidos por asistencia y
// miembros para que la racha y su lectura usen el mismo calendario.
const GYM_OFFSET_MS = Number(process.env.GYM_UTC_OFFSET_HOURS ?? -6) * 3600 * 1000;

export function gymDayStr(date) {
  return new Date(new Date(date).getTime() + GYM_OFFSET_MS).toISOString().slice(0, 10);
}

export function gymTodayStr() {
  return gymDayStr(new Date());
}

export function prevDayStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

// Instante UTC en que empieza ese día del gym (medianoche local del box).
export function gymDayStartUTC(dayStr) {
  const [y, m, d] = dayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - GYM_OFFSET_MS);
}

// Racha "viva" según los campos guardados: solo cuenta si el último día contado
// es hoy o ayer. Si dejaron de ir (último día más viejo), la racha es 0.
export function effectiveStreak(member, today = gymTodayStr()) {
  if (!member || !member.streakDay) return 0;
  if (member.streakDay === today || member.streakDay === prevDayStr(today)) {
    return member.streak || 0;
  }
  return 0;
}

// Racha consecutiva a partir de un Set de días 'YYYY-MM-DD' (para inicializar
// desde el histórico la primera vez).
export function streakFromDays(daySet, today = gymTodayStr()) {
  let current = 0;
  const anchor = daySet.has(today) ? today : prevDayStr(today);
  if (daySet.has(anchor)) {
    let d = anchor;
    while (daySet.has(d)) {
      current++;
      d = prevDayStr(d);
    }
  }
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const d of [...daySet].sort()) {
    run = prev && prevDayStr(d) === prev ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest, anchor: current > 0 ? anchor : null };
}
