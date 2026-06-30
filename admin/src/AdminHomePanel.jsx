import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isTodayWod(wod) {
  return String(wod?.date || '').slice(0, 10) === todayStr();
}

function formatTime(value) {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--';
  }
}

function percent(value) {
  const next = Number(value || 0);
  return `${Math.round(next * 100)}%`;
}

function Stat({ label, value, hint, tone = '' }) {
  return (
    <div className={`card home-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Panel({ title, action, children, empty, error, note }) {
  return (
    <div className="card home-panel">
      <div className="home-panel-head">
        <h3>{title}</h3>
        {action}
      </div>
      {error ? (
        <div className="home-panel-state panel-error">
          <strong>No se pudo cargar esta seccion</strong>
          <span>{error}</span>
        </div>
      ) : empty ? (
        <p className="muted table-empty">{empty}</p>
      ) : children}
      {!error && note ? <p className="muted home-panel-note">{note}</p> : null}
    </div>
  );
}

function classId(item) {
  return item.id || item._id;
}

function ClassRow({ item }) {
  const reserved = Number(item.reserved || 0);
  const checkedIn = Number(item.checkedIn || 0);
  const pending = Math.max(0, reserved - checkedIn);
  const capacity = Number(item.capacity || 0);
  const occupancy = capacity ? (reserved + checkedIn) / capacity : 0;

  return (
    <div className="home-row home-class-row">
      <div>
        <strong>{item.time || '--'} · {item.name || 'Clase'}</strong>
        <span>{item.branch || 'Torres'} · {checkedIn} presentes · {pending} pendientes · {Number(item.waitlist || 0)} waitlist</span>
      </div>
      <div className="home-row-meta">
        {item.isSpecial ? <b>Especial</b> : null}
        <em>{Number(item.spotsLeft || 0)} libres</em>
        <small>{percent(occupancy)} lleno</small>
      </div>
    </div>
  );
}

function ActiveCheckInRow({ item }) {
  return (
    <div className="home-row">
      <div>
        <strong>{item.member?.name || 'Atleta'}</strong>
        <span>{item.member?.email || 'Sin email'} · entro {formatTime(item.checkIn)}</span>
      </div>
      <em>Activo</em>
    </div>
  );
}

function AlertRow({ item }) {
  return (
    <div className="home-row">
      <div>
        <strong>{item.message || item.type || 'Alerta'}</strong>
        <span>{item.type || 'business'}</span>
      </div>
      <em>{Number(item.count || 0)}</em>
    </div>
  );
}

function NoticeRow({ item }) {
  if (item.type === 'special_class') {
    return (
      <div className="home-row">
        <div>
          <strong>{item.title || 'Clase especial'}</strong>
          <span>{item.branch ? `${item.branch} · ` : ''}{item.subtitle || item.description || 'Destacada en Home'}</span>
        </div>
        <em>{Number(item.spotsLeft || 0)} libres</em>
      </div>
    );
  }

  return (
    <div className="home-row">
      <div>
        <strong>{item.title || 'Aviso'}</strong>
        <span>{item.body || item.description || 'Visible en Home'}</span>
      </div>
      <em>Aviso</em>
    </div>
  );
}

export default function AdminHomePanel({ onNavigate }) {
  const [today, setToday] = useState([]);
  const [business, setBusiness] = useState(null);
  const [wods, setWods] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [activeCheckIns, setActiveCheckIns] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sectionErrors, setSectionErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSectionErrors({});
    try {
      const nextErrors = {};
      const read = async (key, label, promise, fallback) => {
        try {
          return await promise;
        } catch (err) {
          nextErrors[key] = err.message || `No se pudo cargar ${label}`;
          return fallback;
        }
      };
      const [
        todayData,
        businessData,
        wodData,
        inboxData,
        highlightData,
        activeData,
        postData
      ] = await Promise.all([
        read('today', 'clases de hoy', api.listTodayClasses(), { classes: [] }),
        read('business', 'membresias y riesgo', api.getBusinessOverview(), null),
        read('wods', 'WOD', api.listWorkouts(), []),
        read('inbox', 'mensajes', api.inbox(), []),
        read('highlights', 'avisos destacados', api.getHomeHighlights(), { highlights: [] }),
        read('activeCheckIns', 'check-ins activos', api.getActiveAttendance(), []),
        read('posts', 'publicaciones', api.listPosts(), [])
      ]);
      setToday(todayData.classes || todayData || []);
      setBusiness(businessData);
      setWods(wodData || []);
      setInbox(inboxData || []);
      setHighlights(highlightData.highlights || []);
      setActiveCheckIns(activeData || []);
      setPosts(postData || []);
      setSectionErrors(nextErrors);
      if (Object.keys(nextErrors).length) {
        setError('Algunas secciones no se pudieron actualizar. Revisa los estados abajo.');
      }
    } catch (err) {
      setError(err.message || 'No se pudo cargar Inicio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const wodToday = useMemo(() => wods.find(isTodayWod), [wods]);
  const pendingMessages = inbox.reduce((sum, row) => sum + Number(row.unread || 0), 0);
  const specialHighlights = highlights.filter((item) => item.type === 'special_class');
  const announcementHighlights = highlights.filter((item) => item.type !== 'special_class');
  const latestPosts = posts.slice(0, 3).map((post) => ({
    ...post,
    type: 'post',
    body: post.body || post.title || ''
  }));
  const visibleNotices = [...specialHighlights.slice(0, 3), ...announcementHighlights.slice(0, 1), ...latestPosts].slice(0, 6);
  const riskAlert = (business?.alerts || []).find((item) => item.type === 'athletes_risk');
  const noticeError = [sectionErrors.highlights, sectionErrors.posts].filter(Boolean).join(' ');

  const totals = today.reduce((acc, item) => {
    const reserved = Number(item.reserved || 0);
    const checkedIn = Number(item.checkedIn || 0);
    acc.reserved += reserved;
    acc.checkedIn += checkedIn;
    acc.pending += Math.max(0, reserved - checkedIn);
    acc.waitlist += Number(item.waitlist || 0);
    return acc;
  }, { reserved: 0, checkedIn: 0, pending: 0, waitlist: 0 });

  const dayStatus = sectionErrors.today
    ? 'Agenda no disponible'
    : today.length
      ? `${today.length} clases · ${totals.checkedIn} presentes · ${totals.pending} pendientes`
      : 'Sin clases programadas';

  return (
    <section className="admin-home">
      <div className="section-head">
        <div>
          <h2>Inicio</h2>
          <p className="muted business-subtitle">Operacion del dia, membresias y avisos visibles.</p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {error && (
        <div className="card home-error">
          <strong>{Object.keys(sectionErrors).length ? 'Inicio cargado parcialmente' : 'No se pudo cargar Inicio'}</strong>
          <span>{error}</span>
          <button className="btn-ghost btn-sm" onClick={load}>Reintentar</button>
        </div>
      )}

      <div className="card home-hero">
        <div>
          <span className="home-eyebrow">INRAGE ADMIN</span>
          <h3>Centro operativo</h3>
          <p>{dayStatus}</p>
        </div>
        <div className="home-hero-actions">
          <button className="btn-primary" onClick={() => onNavigate('checkin')}>Abrir Check-in</button>
          <button className="btn-ghost" onClick={() => onNavigate('posts')}>Publicar aviso</button>
        </div>
      </div>

      <div className="home-actions card">
        <button className="btn-primary" onClick={() => onNavigate('checkin')}>Mostrar QR</button>
        <button className="btn-ghost" onClick={() => onNavigate('wod')}>Publicar WOD</button>
        <button className="btn-ghost" onClick={() => onNavigate('classes')}>Crear clase especial</button>
        <button className="btn-ghost" onClick={() => onNavigate('memberships')}>Membresias por vencer</button>
        <button className="btn-ghost" onClick={() => onNavigate('messages')}>Ver mensajes</button>
      </div>

      {loading && !business ? <p className="muted">Cargando inicio operativo...</p> : null}

      <div className="home-stat-grid">
        <Stat label="Clases hoy" value={sectionErrors.today ? '--' : today.length} hint="agenda del dia" />
        <Stat label="Check-ins activos" value={sectionErrors.activeCheckIns ? '--' : activeCheckIns.length} tone={!sectionErrors.activeCheckIns ? 'positive' : ''} hint="en el box" />
        <Stat label="Presentes" value={sectionErrors.today ? '--' : totals.checkedIn} tone={!sectionErrors.today ? 'positive' : ''} hint="en clases" />
        <Stat label="Pendientes" value={sectionErrors.today ? '--' : totals.pending} tone={!sectionErrors.today && totals.pending ? 'warning' : ''} hint="reservados sin check-in" />
        <Stat label="Waitlist" value={sectionErrors.today ? '--' : totals.waitlist} hint="lista de espera" />
        <Stat label="Vencen pronto" value={sectionErrors.business ? '--' : business?.memberships?.expiring7Days || 0} tone={!sectionErrors.business ? 'warning' : ''} hint="7 dias" />
        <Stat label="Vencidas" value={sectionErrors.business ? '--' : business?.memberships?.expired || 0} tone={!sectionErrors.business ? 'danger' : ''} hint="requieren accion" />
        <Stat label="Mensajes pendientes" value={sectionErrors.inbox ? '--' : pendingMessages} tone={!sectionErrors.inbox && pendingMessages ? 'warning' : ''} hint="inbox" />
      </div>

      <div className="home-dashboard-grid">
        <Panel
          title="Clases de hoy"
          action={<button className="btn-ghost btn-sm" onClick={() => onNavigate('checkin')}>Roster</button>}
          error={sectionErrors.today}
          empty={!today.length ? 'No hay clases programadas para hoy.' : ''}
        >
          {today.slice(0, 6).map((item) => <ClassRow key={classId(item)} item={item} />)}
        </Panel>

        <Panel
          title="Check-ins activos"
          action={<button className="btn-ghost btn-sm" onClick={() => onNavigate('checkin')}>Ver</button>}
          error={sectionErrors.activeCheckIns}
          empty={!activeCheckIns.length ? 'Nadie aparece con check-in abierto ahora.' : ''}
        >
          {activeCheckIns.slice(0, 6).map((item) => <ActiveCheckInRow key={item._id || item.id} item={item} />)}
        </Panel>

        <Panel
          title="Membresias y riesgo"
          action={<button className="btn-ghost btn-sm" onClick={() => onNavigate('memberships')}>Gestionar</button>}
          error={sectionErrors.business}
          empty={!business ? 'Sin datos de negocio disponibles.' : ''}
        >
          {(business?.alerts || []).length ? (
            business.alerts.slice(0, 5).map((item) => <AlertRow key={item.type} item={item} />)
          ) : (
            <div className="home-row">
              <div>
                <strong>Sin alertas criticas</strong>
                <span>{business?.memberships?.active || 0} membresias activas · {riskAlert?.count || 0} atletas en riesgo</span>
              </div>
              <em>OK</em>
            </div>
          )}
        </Panel>

        <Panel
          title="WOD actual"
          action={<button className="btn-ghost btn-sm" onClick={() => onNavigate('wod')}>{wodToday ? 'Editar' : 'Publicar'}</button>}
          error={sectionErrors.wods}
        >
          <div className="home-row home-wod-row">
            <div>
              <strong>{wodToday?.title || 'WOD pendiente'}</strong>
              <span>{wodToday?.description || wodToday?.summary || 'Publica el entrenamiento del dia para que mobile lo muestre.'}</span>
            </div>
            <em>{wodToday ? 'Publicado' : 'Pendiente'}</em>
          </div>
        </Panel>

        <Panel
          title="Avisos visibles"
          action={<button className="btn-ghost btn-sm" onClick={() => onNavigate('posts')}>Avisos</button>}
          error={noticeError && !visibleNotices.length ? noticeError : ''}
          note={noticeError && visibleNotices.length ? noticeError : ''}
          empty={!visibleNotices.length ? 'No hay avisos ni clases especiales visibles en Home.' : ''}
        >
          {visibleNotices.map((item) => <NoticeRow key={item.id || item._id} item={item} />)}
        </Panel>

        <Panel title="Acciones rapidas">
          <div className="home-quick-grid">
            <button className="btn-ghost" onClick={() => onNavigate('checkin')}>Operar check-in</button>
            <button className="btn-ghost" onClick={() => onNavigate('classes')}>Editar clases</button>
            <button className="btn-ghost" onClick={() => onNavigate('memberships')}>Cobros manuales</button>
            <button className="btn-ghost" onClick={() => onNavigate('messages')}>Responder mensajes</button>
          </div>
        </Panel>
      </div>
    </section>
  );
}
