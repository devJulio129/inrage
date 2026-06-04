import { useState, useEffect } from 'react';
import { api } from './api';

const EMPTY_FORM = {
  name: '', email: '', password: '', phone: '', birthDate: '', gender: '', role: 'athlete', joinedAt: '',
};

const EMPTY_WOD = { title: '', description: '', date: '' };

// Traffic-light status based on the member's most recent login.
function loginStatus(lastLogin) {
  if (!lastLogin) {
    return { color: 'red', label: 'Sin acceso', title: 'Nunca ha iniciado sesión' };
  }
  const days = (Date.now() - new Date(lastLogin).getTime()) / 86_400_000;
  if (days <= 7) return { color: 'green', label: 'Activo', title: `Último acceso hace ${Math.floor(days)}d` };
  if (days <= 30) return { color: 'yellow', label: 'Inactivo', title: `Último acceso hace ${Math.floor(days)}d` };
  return { color: 'red', label: 'Ausente', title: `Último acceso hace ${Math.floor(days)}d` };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Badge for an access-history event.
function eventBadge(event) {
  if (event === 'register') return <span className="pill pill-yellow">cuenta nueva ✦</span>;
  if (event === 'google') return <span className="pill pill-blue">google ✓</span>;
  return <span className="pill pill-green">login ✓</span>;
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [tab, setTab] = useState('athletes');

  // Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Athletes
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState(null);

  // Create / Edit
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // Login logs
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState(null);

  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(null);

  // Gym presence (live)
  const [active, setActive] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeError, setActiveError] = useState(null);

  // WOD
  const [wods, setWods] = useState([]);
  const [wodsLoading, setWodsLoading] = useState(false);
  const [wodsError, setWodsError] = useState(null);
  const [wodForm, setWodForm] = useState(EMPTY_WOD);
  const [wodSaving, setWodSaving] = useState(false);
  const [wodMsg, setWodMsg] = useState(null);

  // ── Fetchers ────────────────────────────────────────────────────
  function fetchMembers() {
    setMembersLoading(true);
    setMembersError(null);
    api.listMembers()
      .then(data => { setMembers(data); setMembersLoading(false); })
      .catch(err => {
        if (err.message.includes('401') || err.message.includes('403')) handleLogout();
        setMembersError(err.message);
        setMembersLoading(false);
      });
  }

  function fetchLogs() {
    setLogsLoading(true);
    setLogsError(null);
    api.listLoginLogs()
      .then(data => { setLogs(data); setLogsLoading(false); })
      .catch(err => { setLogsError(err.message); setLogsLoading(false); });
  }

  function fetchWods() {
    setWodsLoading(true);
    setWodsError(null);
    api.listWorkouts()
      .then(data => { setWods(data); setWodsLoading(false); })
      .catch(err => { setWodsError(err.message); setWodsLoading(false); });
  }

  function fetchStats() {
    setStatsLoading(true);
    setStatsError(null);
    api.getStats()
      .then(data => { setStats(data); setStatsLoading(false); })
      .catch(err => { setStatsError(err.message); setStatsLoading(false); });
  }

  function fetchActive() {
    setActiveLoading(true);
    setActiveError(null);
    api.getActiveAttendance()
      .then(data => { setActive(data); setActiveLoading(false); })
      .catch(err => { setActiveError(err.message); setActiveLoading(false); });
  }

  useEffect(() => {
    if (!token) return;
    fetchMembers();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab === 'logs') fetchLogs();
    if (tab === 'wod') fetchWods();
    if (tab === 'stats') fetchStats();
    if (tab === 'gym') fetchActive();
  }, [token, tab]);

  // Live-refresh the access history every 12s so mobile logins appear on their own.
  useEffect(() => {
    if (!token || tab !== 'logs') return;
    const id = setInterval(fetchLogs, 12_000);
    return () => clearInterval(id);
  }, [token, tab]);

  // Live-refresh who's in the gym every 8s.
  useEffect(() => {
    if (!token || tab !== 'gym') return;
    const id = setInterval(fetchActive, 8_000);
    return () => clearInterval(id);
  }, [token, tab]);

  // ── Auth ────────────────────────────────────────────────────────
  function handleLogin(e) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    api.login(email, password)
      .then(data => {
        if (data.user?.role !== 'admin') {
          setAuthError('Acceso denegado: se requiere rol de administrador');
          return;
        }
        localStorage.setItem('token', data.token);
        setToken(data.token);
      })
      .catch(err => setAuthError(err.message))
      .finally(() => setAuthLoading(false));
  }

  function handleLogout() {
    localStorage.removeItem('token');
    setToken(null);
    setMembers([]);
    setLogs([]);
    setWods([]);
    setStats(null);
    setActive([]);
  }

  // ── Member form helpers ─────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, joinedAt: todayStr() });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(member) {
    setEditingId(member._id);
    setForm({
      name: member.name || '',
      email: member.email || '',
      password: '',
      phone: member.phone || '',
      birthDate: member.birthDate ? member.birthDate.slice(0, 10) : '',
      gender: member.gender || '',
      role: member.role || 'athlete',
      joinedAt: (member.joinedAt || member.createdAt || '').slice(0, 10),
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function handleFormChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    setFormError(null);
    setFormLoading(true);

    const payload = { ...form };
    if (editingId && !payload.password) delete payload.password;

    const action = editingId
      ? api.updateMember(editingId, payload)
      : api.createMember(payload);

    action
      .then(() => { closeForm(); fetchMembers(); })
      .catch(err => setFormError(err.message))
      .finally(() => setFormLoading(false));
  }

  function handleDelete(member) {
    if (!window.confirm(`¿Eliminar a ${member.name}?`)) return;
    api.deleteMember(member._id)
      .then(fetchMembers)
      .catch(err => alert('Error: ' + err.message));
  }

  function handleApprove(member) {
    api.updateMember(member._id, { status: 'active' })
      .then(fetchMembers)
      .catch(err => alert('Error: ' + err.message));
  }

  // ── WOD helpers ─────────────────────────────────────────────────
  function handleWodChange(e) {
    setWodForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleWodSubmit(e) {
    e.preventDefault();
    setWodMsg(null);
    setWodSaving(true);
    const payload = { ...wodForm };
    if (!payload.date) delete payload.date;
    api.saveWorkout(payload)
      .then(() => {
        setWodMsg('WOD guardado ✓');
        setWodForm(EMPTY_WOD);
        fetchWods();
      })
      .catch(err => setWodMsg('Error: ' + err.message))
      .finally(() => setWodSaving(false));
  }

  function editWod(w) {
    setWodForm({
      title: w.title || '',
      description: w.description || '',
      date: (w.date || '').slice(0, 10),
    });
    setWodMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleWodDelete(w) {
    if (!window.confirm(`¿Eliminar el WOD "${w.title}"?`)) return;
    api.deleteWorkout(w._id)
      .then(fetchWods)
      .catch(err => alert('Error: ' + err.message));
  }

  // ── Login screen ────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand">
            <span className="brand-name">INRAGE</span>
            <span className="brand-sub">C R O S S F I T</span>
            <span className="brand-tag">ADMIN</span>
          </div>
          <form onSubmit={handleLogin} className="auth-form">
            <div className="field">
              <span className="field-icon">✉</span>
              <input
                type="email" placeholder="Correo electrónico" value={email}
                onChange={e => setEmail(e.target.value)} required autoFocus
              />
            </div>
            <div className="field">
              <span className="field-icon">🔒</span>
              <input
                type={showPass ? 'text' : 'password'} placeholder="Contraseña" value={password}
                onChange={e => setPassword(e.target.value)} required
              />
              <button type="button" className="eye" onClick={() => setShowPass(s => !s)} tabIndex={-1}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
            <button type="submit" className="btn-primary btn-block" disabled={authLoading}>
              {authLoading ? 'Entrando…' : 'INICIAR SESIÓN'}
            </button>
          </form>
          {authError && <p className="auth-error">{authError}</p>}
          <p className="auth-hint">Usa una cuenta con rol <strong>admin</strong>.</p>
        </div>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-inline">
          <span className="brand-name sm">INRAGE</span>
          <span className="brand-tag sm">ADMIN PANEL</span>
        </div>
        <nav className="tabs">
          <button className={tab === 'gym' ? 'tab active' : 'tab'} onClick={() => setTab('gym')}>
            En el gym{active.length > 0 && <span className="tab-count">{active.length}</span>}
          </button>
          <button className={tab === 'stats' ? 'tab active' : 'tab'} onClick={() => setTab('stats')}>Estadísticas</button>
          <button className={tab === 'athletes' ? 'tab active' : 'tab'} onClick={() => setTab('athletes')}>Atletas</button>
          <button className={tab === 'wod' ? 'tab active' : 'tab'} onClick={() => setTab('wod')}>WOD del día</button>
          <button className={tab === 'logs' ? 'tab active' : 'tab'} onClick={() => setTab('logs')}>Accesos</button>
        </nav>
        <button className="btn-ghost" onClick={handleLogout}>Salir</button>
      </header>

      {/* ── EN EL GYM (LIVE) TAB ── */}
      {tab === 'gym' && (
        <section>
          <div className="section-head">
            <h2>
              En el gimnasio ahora <span className="count">{active.length}</span>
              <span className="live"><i className="live-dot" /> en vivo</span>
            </h2>
            <button className="btn-ghost" onClick={fetchActive}>Actualizar</button>
          </div>

          {activeLoading && active.length === 0 && <p className="muted">Cargando…</p>}
          {activeError && <p className="error">Error: {activeError}</p>}
          {!activeError && active.length === 0 && !activeLoading && (
            <div className="card empty-gym">
              <p className="muted" style={{ margin: 0 }}>Nadie ha marcado entrada todavía hoy.</p>
            </div>
          )}

          <div className="gym-grid">
            {active.map(a => (
              <div key={a._id} className="card gym-card">
                <i className="dot green" />
                <div>
                  <h3>{a.member?.name || 'Atleta'}</h3>
                  <p className="meta">{a.member?.email}</p>
                  <p className="sub">Entrada: {new Date(a.checkIn).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── STATS TAB ── */}
      {tab === 'stats' && (
        <section>
          <div className="section-head">
            <h2>Estadísticas</h2>
            <button className="btn-ghost" onClick={fetchStats}>Actualizar</button>
          </div>
          {statsLoading && <p className="muted">Cargando estadísticas…</p>}
          {statsError && <p className="error">Error: {statsError}</p>}
          {stats && !statsLoading && <StatsView stats={stats} />}
        </section>
      )}

      {/* ── ATHLETES TAB ── */}
      {tab === 'athletes' && (
        <section>
          <div className="section-head">
            <h2>Atletas <span className="count">{members.length}</span></h2>
            <button className="btn-primary" onClick={openCreate}>+ Crear atleta</button>
          </div>

          {(() => {
            const pending = members.filter(m => m.role !== 'admin' && m.status === 'pending');
            if (pending.length === 0) return null;
            return (
              <div className="approve-banner">
                <span>⏳ <strong>{pending.length}</strong> atleta(s) esperando aprobación para ver el WOD.</span>
              </div>
            );
          })()}

          <div className="legend">
            <span><i className="dot green" /> Activo (≤7d)</span>
            <span><i className="dot yellow" /> Inactivo (≤30d)</span>
            <span><i className="dot red" /> Ausente / sin acceso</span>
          </div>

          {membersLoading && <p className="muted">Cargando atletas…</p>}
          {membersError && <p className="error">Error: {membersError}</p>}

          {!membersLoading && !membersError && members.map(member => {
            const st = loginStatus(member.lastLogin);
            return (
              <div key={member._id} className="card member-card">
                <i className={`dot ${st.color}`} title={st.title} />
                <div className="member-info">
                  <h3>
                    {member.name}
                    <span className={`pill pill-${st.color}`}>{st.label}</span>
                    {member.role !== 'admin' && member.status === 'pending' && (
                      <span className="pill pill-pending">pendiente</span>
                    )}
                    {member.role !== 'admin' && member.status === 'active' && (
                      <span className="pill pill-active">alta ✓</span>
                    )}
                  </h3>
                  <p className="email">{member.email}</p>
                  <p className="meta">
                    {member.phone} &nbsp;·&nbsp; {member.role} &nbsp;·&nbsp; {member.gender || '—'}
                  </p>
                  <p className="sub">
                    Inscrito: {new Date(member.joinedAt || member.createdAt).toLocaleDateString()}
                    {member.lastLogin && <> &nbsp;·&nbsp; Último acceso: {new Date(member.lastLogin).toLocaleString()}</>}
                  </p>
                </div>
                <div className="actions">
                  {member.role !== 'admin' && member.status === 'pending' && (
                    <button className="btn-primary btn-sm" onClick={() => handleApprove(member)}>Dar de alta</button>
                  )}
                  <button className="btn-ghost" onClick={() => openEdit(member)}>Editar</button>
                  <button className="btn-danger" onClick={() => handleDelete(member)}>Eliminar</button>
                </div>
              </div>
            );
          })}

          {showForm && (
            <div className="modal-overlay" onClick={closeForm}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <h3>{editingId ? 'Editar atleta' : 'Crear atleta'}</h3>
                <form onSubmit={handleFormSubmit} className="stack">
                  <input name="name" placeholder="Nombre" value={form.name} onChange={handleFormChange} required />
                  <input name="email" type="email" placeholder="Correo" value={form.email} onChange={handleFormChange} required />
                  <input
                    name="password" type="password"
                    placeholder={editingId ? 'Contraseña (vacío = sin cambio)' : 'Contraseña'}
                    value={form.password} onChange={handleFormChange}
                    required={!editingId}
                  />
                  <input name="phone" placeholder="Teléfono" value={form.phone} onChange={handleFormChange} required />
                  <label className="lbl">Fecha de nacimiento</label>
                  <input name="birthDate" type="date" value={form.birthDate} onChange={handleFormChange} required />
                  <label className="lbl">Fecha de inscripción</label>
                  <input name="joinedAt" type="date" value={form.joinedAt} onChange={handleFormChange} />
                  <select name="gender" value={form.gender} onChange={handleFormChange}>
                    <option value="">Género (opcional)</option>
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                    <option value="other">Otro</option>
                    <option value="prefer_not_to_say">Prefiero no decir</option>
                  </select>
                  <select name="role" value={form.role} onChange={handleFormChange}>
                    <option value="athlete">Atleta</option>
                    <option value="admin">Admin</option>
                  </select>

                  {formError && <p className="error">Error: {formError}</p>}

                  <div className="row">
                    <button type="submit" className="btn-primary" disabled={formLoading}>
                      {formLoading ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear'}
                    </button>
                    <button type="button" className="btn-ghost" onClick={closeForm}>Cancelar</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── WOD TAB ── */}
      {tab === 'wod' && (
        <section>
          <div className="section-head">
            <h2>WOD del día</h2>
          </div>

          <div className="card wod-editor">
            <h3>{wodForm.date && wodForm.date !== todayStr() ? 'Editar WOD' : 'Publicar WOD de hoy'}</h3>
            <form onSubmit={handleWodSubmit} className="stack">
              <input name="title" placeholder="Título (p. ej. FRAN)" value={wodForm.title} onChange={handleWodChange} required />
              <textarea name="description" placeholder="Descripción del entrenamiento…" rows={6} value={wodForm.description} onChange={handleWodChange} required />
              <label className="lbl">Fecha (vacío = hoy)</label>
              <input name="date" type="date" value={wodForm.date} onChange={handleWodChange} />
              <div className="row">
                <button type="submit" className="btn-primary" disabled={wodSaving}>
                  {wodSaving ? 'Guardando…' : 'Guardar WOD'}
                </button>
                {wodForm.title && <button type="button" className="btn-ghost" onClick={() => setWodForm(EMPTY_WOD)}>Limpiar</button>}
              </div>
              {wodMsg && <p className={wodMsg.startsWith('Error') ? 'error' : 'ok'}>{wodMsg}</p>}
            </form>
          </div>

          <h3 className="mt">Historial reciente</h3>
          {wodsLoading && <p className="muted">Cargando…</p>}
          {wodsError && <p className="error">Error: {wodsError}</p>}
          {!wodsLoading && !wodsError && wods.length === 0 && <p className="muted">Sin WODs aún.</p>}
          {!wodsLoading && wods.map(w => (
            <div key={w._id} className="card wod-card">
              <div>
                <p className="wod-date">{new Date(w.date).toLocaleDateString()}</p>
                <h3>{w.title}</h3>
                <pre className="wod-desc">{w.description}</pre>
              </div>
              <div className="actions">
                <button className="btn-ghost" onClick={() => editWod(w)}>Editar</button>
                <button className="btn-danger" onClick={() => handleWodDelete(w)}>Eliminar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── LOGIN HISTORY TAB ── */}
      {tab === 'logs' && (
        <section>
          <div className="section-head">
            <h2>Historial de accesos <span className="live"><i className="live-dot" /> en vivo</span></h2>
            <button className="btn-ghost" onClick={fetchLogs}>Actualizar</button>
          </div>

          {logsLoading && <p className="muted">Cargando…</p>}
          {logsError && <p className="error">Error: {logsError}</p>}
          {!logsLoading && !logsError && logs.length === 0 && <p className="muted">Sin registros aún.</p>}

          {!logsLoading && !logsError && logs.map(log => (
            <div key={log._id} className="card log-card">
              <div>
                <p className="log-name">{log.name} {eventBadge(log.event)}</p>
                <p className="email">{log.email}</p>
                <p className="meta">Rol: {log.role} &nbsp;·&nbsp; IP: {log.ip || '—'}</p>
              </div>
              <p className="log-time">
                {new Date(log.at).toLocaleDateString()}<br />
                <span>{new Date(log.at).toLocaleTimeString()}</span>
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ── Stats view ──────────────────────────────────────────────────────
function StatsView({ stats }) {
  const { totals, trafficLight, gender, loginsByDay, newByMonth } = stats;

  const genderLabels = {
    male: 'Masculino', female: 'Femenino', other: 'Otro',
    prefer_not_to_say: 'N/D', unset: 'Sin dato'
  };
  const genderColors = {
    male: '#46E22A', female: '#37C7F2', other: '#F2C037',
    prefer_not_to_say: '#A47864', unset: '#555'
  };

  return (
    <>
      {/* KPI cards */}
      <div className="kpi-grid">
        <StatCard label="En el gym ahora" value={totals.inGymNow ?? 0}
          hint={totals.inGymNow ? 'en vivo' : 'vacío'} accent={totals.inGymNow > 0} />
        <StatCard label="Por aprobar" value={totals.pendingApprovals ?? 0}
          hint={totals.pendingApprovals ? 'requieren alta' : 'al día'} warn={totals.pendingApprovals > 0} />
        <StatCard label="Atletas" value={totals.athletes} hint={`${totals.admins} admin`} />
        <StatCard label="Logins (7 días)" value={totals.loginsLast7} hint={`${totals.logins} totales`} />
        <StatCard label="Asistencias (30 días)" value={totals.attendanceLast30} />
        <StatCard label="WODs publicados" value={totals.workouts}
          hint={totals.wodToday ? 'Hoy ✓' : 'Hoy pendiente'} warn={!totals.wodToday} />
      </div>

      <div className="chart-grid">
        {/* Logins last 14 days */}
        <div className="card chart-card">
          <h3>Inicios de sesión · últimos 14 días</h3>
          <BarChart data={loginsByDay.map(d => ({ label: d.label, value: d.count }))} />
        </div>

        {/* New members last 6 months */}
        <div className="card chart-card">
          <h3>Altas de atletas · últimos 6 meses</h3>
          <BarChart data={newByMonth.map(d => ({ label: d.label, value: d.count }))} accent="#37C7F2" />
        </div>

        {/* Traffic light distribution */}
        <div className="card chart-card">
          <h3>Estado de actividad</h3>
          <SegmentBar segments={[
            { label: 'Activos', value: trafficLight.active, color: '#46E22A' },
            { label: 'Inactivos', value: trafficLight.idle, color: '#F2C037' },
            { label: 'Ausentes', value: trafficLight.absent, color: '#FF4B4B' }
          ]} />
        </div>

        {/* Gender breakdown */}
        <div className="card chart-card">
          <h3>Distribución por género</h3>
          <SegmentBar segments={Object.entries(gender)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => ({ label: genderLabels[k] || k, value: v, color: genderColors[k] || '#888' }))
          } />
        </div>
      </div>

      <p className="muted stats-foot">
        Generado: {new Date(stats.generatedAt).toLocaleString()}
      </p>
    </>
  );
}

function StatCard({ label, value, hint, accent, warn }) {
  return (
    <div className={`card kpi${accent ? ' kpi-accent' : ''}`}>
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{value}</p>
      {hint && <p className={`kpi-hint${warn ? ' warn' : ''}`}>{hint}</p>}
    </div>
  );
}

function BarChart({ data, accent = '#46E22A' }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="bars">
      {data.map((d, i) => (
        <div className="bar-col" key={i}>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ height: `${(d.value / max) * 100}%`, background: accent }}
              title={`${d.label}: ${d.value}`}
            >
              {d.value > 0 && <span className="bar-num">{d.value}</span>}
            </div>
          </div>
          <span className="bar-label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function SegmentBar({ segments }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="segwrap">
      <div className="segbar">
        {segments.map((s, i) => (
          <div
            key={i}
            className="seg"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="seg-legend">
        {segments.map((s, i) => (
          <span key={i}>
            <i className="seg-dot" style={{ background: s.color }} />
            {s.label} <strong>{s.value}</strong>
            <em>{Math.round((s.value / total) * 100)}%</em>
          </span>
        ))}
      </div>
    </div>
  );
}
