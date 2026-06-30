import { ClassTemplate } from '../models/ClassTemplate.js';
import { GymClass } from '../models/GymClass.js';
import { normalizeBranch } from './branches.js';

// El box vive en Tampico (UTC-6, sin horario de verano desde 2022). El server
// corre en UTC, así que para saber "qué día es hoy en el gym" y qué día de la
// semana le toca a cada clase, desplazamos a la hora local del gym.
const GYM_UTC_OFFSET_HOURS = Number(process.env.GYM_UTC_OFFSET_HOURS ?? -6);

// Cuántos días hacia adelante mantenemos materializados (la app muestra ~1 semana).
const DAYS_AHEAD = 7;

// Date a medianoche UTC que representa el día de calendario ACTUAL en el gym.
// Guardamos las clases a medianoche UTC y el cliente lee la parte UTC del ISO,
// así que el "día" es estable sin importar la zona del server.
function gymTodayUTC() {
  const shifted = new Date(Date.now() + GYM_UTC_OFFSET_HOURS * 3600 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function addDaysUTC(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Materializa clases concretas (reservables) a partir del horario semanal para
// la ventana [hoy … hoy + DAYS_AHEAD]. Idempotente: el upsert por {date,time,branch}
// no toca clases ya creadas (preserva reservas), y `generatedThrough` impide
// resucitar un día que el coach canceló a mano. Pensado para correr en cada
// lectura de /api/classes — barato porque casi siempre es no-op.
export async function ensureScheduledClasses() {
  const today = gymTodayUTC();
  const horizon = addDaysUTC(today, DAYS_AHEAD);

  const slots = await ClassTemplate.find({ active: true });

  for (const slot of slots) {
    const branch = normalizeBranch(slot.branch);
    // Empieza en hoy, salvo que ya hayamos generado más adelante.
    let cursor = today;
    if (slot.generatedThrough) {
      const next = addDaysUTC(slot.generatedThrough, 1);
      if (next > cursor) cursor = next;
    }

    for (let d = new Date(cursor); d <= horizon; d = addDaysUTC(d, 1)) {
      if (d.getUTCDay() !== slot.weekday) continue;
      await GymClass.updateOne(
        { date: d, time: slot.time, branch },
        {
          $setOnInsert: {
            date: d,
            time: slot.time,
            name: slot.name,
            branch,
            description: slot.description || '',
            capacity: slot.capacity,
            template: slot._id,
            reservations: []
          }
        },
        { upsert: true }
      );
    }

    if (!slot.generatedThrough || slot.generatedThrough < horizon) {
      slot.generatedThrough = horizon;
      await slot.save();
    }
  }
}

export { gymTodayUTC, addDaysUTC, DAYS_AHEAD, GYM_UTC_OFFSET_HOURS };
