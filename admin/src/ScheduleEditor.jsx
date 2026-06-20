import { useEffect, useState } from 'react';
import { api } from './api';

// Orden de display: lunes primero, domingo al final. value = Date.getUTCDay().
const WEEKDAYS = [
  { value: 1, short: 'Lun', long: 'Lunes' },
  { value: 2, short: 'Mar', long: 'Martes' },
  { value: 3, short: 'Mié', long: 'Miércoles' },
  { value: 4, short: 'Jue', long: 'Jueves' },
  { value: 5, short: 'Vie', long: 'Viernes' },
  { value: 6, short: 'Sáb', long: 'Sábado' },
  { value: 0, short: 'Dom', long: 'Domingo' }
];

const EMPTY = { time: '18:00', name: 'CrossFit', capacity: 12 };

// Editor del horario semanal recurrente. El coach define qué días y a qué horas
// hay clase; el backend materializa esas franjas en clases reservables para los
// próximos días, y la app las muestra solas.
export default function ScheduleEditor({ onChanged }) {
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const [days, setDays] = useState(() => new Set([1, 2, 3, 4, 5])); // L–V por defecto
  const [form, setForm] = useState(EMPTY);

  function fetchSlots() {
    setLoading(true);
    setError(null);
    api.listClassTemplates()
      .then(data => { setSlots(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }

  useEffect(() => { fetchSlots(); }, []);

  function toggleDay(value) {
    setDays(prev => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }

  async function handleAdd(e) {
    e.preventDefault();
    setMsg(null);
    if (days.size === 0) { setMsg('Error: elige al menos un día'); return; }
    if (!/^\d{1,2}:\d{2}$/.test(form.time)) { setMsg('Error: hora inválida (HH:MM)'); return; }
    const capacity = Number(form.capacity);
    if (!capacity || capacity < 1) { setMsg('Error: el cupo debe ser al menos 1'); return; }

    setSaving(true);
    try {
      // Una franja por cada día seleccionado (así "L–V a las 18:00" es un clic).
      for (const weekday of days) {
        await api.createClassTemplate({
          weekday,
          time: form.time,
          name: form.name || 'CrossFit',
          capacity
        });
      }
      setMsg('Agregado al horario ✓ — ya aparece en la app');
      setForm(EMPTY);
      fetchSlots();
      onChanged?.();
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(slot) {
    const label = WEEKDAYS.find(d => d.value === slot.weekday)?.long || '';
    if (!window.confirm(`¿Quitar ${label} a las ${slot.time} del horario? Se borran las clases futuras de esa franja que nadie haya reservado.`)) return;
    api.deleteClassTemplate(slot._id)
      .then(() => { fetchSlots(); onChanged?.(); })
      .catch(err => alert('Error: ' + err.message));
  }

  // Agrupa las franjas por día para pintar la rejilla.
  const byDay = WEEKDAYS.map(d => ({
    ...d,
    items: slots
      .filter(s => s.weekday === d.value)
      .sort((a, b) => a.time.localeCompare(b.time))
  }));

  return (
    <div className="card schedule-editor">
      <div className="class-form-head">
        <div>
          <h3>Horario semanal</h3>
          <p className="muted">
            Define qué días y a qué horas hay clase. Se repite cada semana y la app
            abre la reserva sola para los próximos días — no tienes que crear clase por clase.
          </p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="schedule-add">
        <div className="weekday-pills">
          {WEEKDAYS.map(d => (
            <button
              type="button"
              key={d.value}
              className={`weekday-pill${days.has(d.value) ? ' on' : ''}`}
              onClick={() => toggleDay(d.value)}
            >
              {d.short}
            </button>
          ))}
        </div>

        <div className="schedule-add-grid">
          <label className="field-col">
            <span>Hora</span>
            <input type="time" value={form.time}
              onChange={e => setForm(p => ({ ...p, time: e.target.value }))} required />
          </label>
          <label className="field-col">
            <span>Nombre</span>
            <input value={form.name} placeholder="CrossFit"
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="field-col">
            <span>Lugares</span>
            <input type="number" min="1" max="100" value={form.capacity}
              onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} required />
          </label>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Agregando…' : '+ Agregar al horario'}
          </button>
        </div>
        {msg && <p className={msg.startsWith('Error') ? 'error' : 'ok'}>{msg}</p>}
      </form>

      {loading && <p className="muted">Cargando horario…</p>}
      {error && <p className="error">Error: {error}</p>}

      <div className="week-grid">
        {byDay.map(d => (
          <div key={d.value} className="week-col">
            <h4 className="week-day">{d.long}</h4>
            {d.items.length === 0 ? (
              <p className="week-empty">Sin clases</p>
            ) : (
              d.items.map(s => (
                <div key={s._id} className="week-slot">
                  <div className="week-slot-main">
                    <span className="week-slot-time">{s.time}</span>
                    <span className="week-slot-name">{s.name}</span>
                  </div>
                  <span className="week-slot-cap">{s.capacity} lug.</span>
                  <button className="week-slot-del" title="Quitar del horario"
                    onClick={() => handleDelete(s)}>✕</button>
                </div>
              ))
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
