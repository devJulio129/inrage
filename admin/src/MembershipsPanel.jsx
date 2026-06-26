import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Activos' },
  { id: 'expiring_soon', label: 'Por vencer' },
  { id: 'expired', label: 'Vencidos' },
  { id: 'frozen_inactive', label: 'Congelados / inactivos' }
];

const STATUS_OPTIONS = [
  ['active', 'Activa'],
  ['expiring_soon', 'Por vencer'],
  ['expired', 'Vencida'],
  ['frozen', 'Congelada'],
  ['inactive', 'Inactiva']
];

function inputDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function SummaryCard({ label, value, tone = '' }) {
  return (
    <div className={`card membership-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value || 0}</strong>
    </div>
  );
}

export default function MembershipsPanel() {
  const [overview, setOverview] = useState(null);
  const [members, setMembers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [sweeping, setSweeping] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, listData] = await Promise.all([
        api.getMembershipOverview(),
        api.listMemberships({ status: filter, search })
      ]);
      setOverview(overviewData);
      setMembers(listData.members || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const id = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(id);
  }, [load, search]);

  async function saveMembership(event) {
    event.preventDefault();
    setBusyId(editing.id);
    setMessage(null);
    setError(null);
    try {
      await api.updateMembership(editing.id, {
        status: editing.status,
        planName: editing.planName,
        startDate: editing.startDate,
        endDate: editing.endDate,
        notes: editing.notes
      });
      setEditing(null);
      setMessage('Membresia actualizada.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(event) {
    event.preventDefault();
    setBusyId(paying.id);
    setMessage(null);
    setError(null);
    try {
      await api.markMembershipPaid(paying.id, {
        months: Number(paying.months) || 1,
        planName: paying.planName
      });
      setPaying(null);
      setMessage('Pago registrado y membresia renovada.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function sendReminder(member) {
    if (!window.confirm(`Enviar recordatorio de membresia a ${member.name}?`)) return;
    setBusyId(member.id);
    setMessage(null);
    setError(null);
    try {
      await api.sendMembershipReminder(member.id);
      setMessage(`Recordatorio creado para ${member.name}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function runSweep() {
    setSweeping(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api.runMembershipReminders();
      setMessage(`Barrido terminado: ${result.created || 0} recordatorios creados.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSweeping(false);
    }
  }

  function openEdit(member) {
    setEditing({
      ...member,
      status: member.membershipStatus,
      startDate: inputDate(member.startDate),
      endDate: inputDate(member.membershipEndDate),
      notes: member.notes || ''
    });
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Membresias</h2>
          <p className="muted business-subtitle">Vencimientos, pagos y recordatorios de atletas.</p>
        </div>
        <button className="btn-ghost" onClick={runSweep} disabled={sweeping}>
          {sweeping ? 'Procesando...' : 'Ejecutar recordatorios'}
        </button>
      </div>

      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Error: {error}</p>}

      <div className="membership-kpi-grid">
        <SummaryCard label="Activos" value={overview?.totalActive} tone="positive" />
        <SummaryCard label="Vencen en 7 dias" value={overview?.expiring7Days} tone="warning" />
        <SummaryCard label="Vencen manana" value={overview?.expiringTomorrow} tone="warning" />
        <SummaryCard label="Vencidos" value={overview?.expired} tone="danger" />
        <SummaryCard label="Congelados / inactivos" value={(overview?.frozen || 0) + (overview?.inactive || 0)} />
      </div>

      <div className="membership-toolbar">
        <div className="membership-filters" role="tablist">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? 'membership-filter active' : 'membership-filter'}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          className="membership-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar atleta, correo o plan"
        />
      </div>

      <div className="card table-shell">
        {loading && members.length === 0 ? (
          <p className="muted table-empty">Cargando membresias...</p>
        ) : error && members.length === 0 ? (
          <p className="muted table-empty">No se pudo cargar la lista de membresias.</p>
        ) : members.length === 0 ? (
          <p className="muted table-empty">No hay atletas para este filtro.</p>
        ) : (
          <div className="business-table-scroll">
            <table className="business-table membership-table">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Plan</th>
                  <th>Inscripcion</th>
                  <th>Vence</th>
                  <th>Dias</th>
                  <th>Status</th>
                  <th>Ultimo pago</th>
                  <th>Prox. pago</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>{member.name || 'Atleta sin nombre'}</strong>
                      <small>{member.email || 'Sin email'}</small>
                      {member.phone && <small>{member.phone}</small>}
                      {member.notes && <small className="membership-note">Notas: {member.notes}</small>}
                    </td>
                    <td>{member.planName || '-'}</td>
                    <td>{formatDate(member.startDate)}</td>
                    <td>{formatDate(member.membershipEndDate)}</td>
                    <td className={member.daysLeft != null && member.daysLeft < 0 ? 'danger-text' : ''}>
                      {member.daysLeft == null ? '-' : member.daysLeft}
                    </td>
                    <td><span className={`status-chip ${member.membershipStatus || 'inactive'}`}>{member.membershipStatus || 'inactive'}</span></td>
                    <td>{formatDate(member.lastPaymentAt)}</td>
                    <td>{formatDate(member.nextPaymentDueAt)}</td>
                    <td>
                      <div className="membership-actions">
                        <button className="btn-ghost btn-sm" onClick={() => openEdit(member)}>Editar</button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => setPaying({ ...member, months: 1, planName: member.planName || 'Mensualidad' })}
                        >
                          Marcar pagado
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => sendReminder(member)}
                          disabled={busyId === member.id}
                        >
                          {busyId === member.id ? 'Enviando...' : 'Recordatorio'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="modal-overlay" onMouseDown={() => setEditing(null)}>
          <form className="modal membership-modal" onSubmit={saveMembership} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="modal-kicker">Editar membresia</p>
                <h3>{editing.name}</h3>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cerrar</button>
            </div>
            <div className="membership-form-grid">
              <label>Estado
                <select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}>
                  {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Plan
                <input value={editing.planName || ''} onChange={(event) => setEditing({ ...editing, planName: event.target.value })} />
              </label>
              <label>Inicio
                <input type="date" value={editing.startDate} onChange={(event) => setEditing({ ...editing, startDate: event.target.value })} />
              </label>
              <label>Vence
                <input type="date" value={editing.endDate} onChange={(event) => setEditing({ ...editing, endDate: event.target.value })} />
              </label>
            </div>
            <label className="membership-notes">Notas
              <textarea rows="4" value={editing.notes} onChange={(event) => setEditing({ ...editing, notes: event.target.value })} />
            </label>
            <button className="btn-primary btn-block" disabled={busyId === editing.id}>
              {busyId === editing.id ? 'Guardando...' : 'Guardar membresia'}
            </button>
          </form>
        </div>
      )}

      {paying && (
        <div className="modal-overlay" onMouseDown={() => setPaying(null)}>
          <form className="modal membership-modal compact" onSubmit={markPaid} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="modal-kicker">Confirmar pago</p>
                <h3>{paying.name}</h3>
              </div>
              <button type="button" className="btn-ghost" onClick={() => setPaying(null)}>Cerrar</button>
            </div>
            <p className="muted">La membresia se extendera desde su vencimiento actual, o desde hoy si ya vencio.</p>
            <div className="membership-form-grid">
              <label>Meses
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={paying.months}
                  onChange={(event) => setPaying({ ...paying, months: event.target.value })}
                />
              </label>
              <label>Plan
                <input value={paying.planName} onChange={(event) => setPaying({ ...paying, planName: event.target.value })} />
              </label>
            </div>
            <button className="btn-primary btn-block" disabled={busyId === paying.id}>
              {busyId === paying.id ? 'Registrando...' : 'Confirmar pago'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
