import { useState, useEffect } from 'react';
import { api } from './api';

const EMPTY_FORM = {
  name: '', email: '', password: '', phone: '', birthDate: '', gender: '', role: 'athlete', joinedAt: '',
};

const EMPTY_WOD = { title: '', description: '', date: '' };

// Catálogo de movimientos de CrossFit (nombres del pizarrón, en inglés).
// pct: true → la app puede personalizar la dosis con el PR del atleta.
const CF_MOVEMENTS = [
  // Olympic lifting
  { name: 'Snatch', pct: true }, { name: 'Power Snatch', pct: true }, { name: 'Hang Snatch', pct: true },
  { name: 'Squat Snatch', pct: true }, { name: 'Clean', pct: true }, { name: 'Power Clean', pct: true },
  { name: 'Hang Power Clean', pct: true }, { name: 'Squat Clean', pct: true },
  { name: 'Clean & Jerk', pct: true }, { name: 'Jerk', pct: true }, { name: 'Push Jerk', pct: true },
  { name: 'Split Jerk', pct: true },
  // Strength
  { name: 'Back Squat', pct: true }, { name: 'Front Squat', pct: true }, { name: 'Overhead Squat', pct: true },
  { name: 'Deadlift', pct: true }, { name: 'Sumo Deadlift', pct: true }, { name: 'Bench Press', pct: true },
  { name: 'Strict Press', pct: true }, { name: 'Push Press', pct: true }, { name: 'Thruster', pct: true },
  // Gymnastics
  { name: 'Pull Ups', pct: true }, { name: 'Chest to Bar Pull Ups', pct: true }, { name: 'Strict Pull Ups', pct: true },
  { name: 'Muscle Ups', pct: true }, { name: 'Bar Muscle Ups', pct: true },
  { name: 'Handstand Push Ups', pct: true }, { name: 'Strict Handstand Push Ups', pct: true },
  { name: 'Toes to Bar', pct: true }, { name: 'Knees to Elbows', pct: true },
  { name: 'Push Ups', pct: true }, { name: 'Ring Dips', pct: true }, { name: 'Dips', pct: true },
  { name: 'Double Unders', pct: true }, { name: 'Single Unders', pct: false },
  { name: 'Wall Balls', pct: true }, { name: 'Pistols', pct: true }, { name: 'Sit Ups', pct: true },
  { name: 'GHD Sit Ups', pct: false }, { name: 'Air Squats', pct: false }, { name: 'Burpees', pct: true },
  { name: 'Burpee Box Jump Overs', pct: false }, { name: 'Box Jumps', pct: false },
  { name: 'Box Jump Overs', pct: false }, { name: 'Wall Walks', pct: false }, { name: 'Rope Climbs', pct: false },
  { name: 'Pistol Squats', pct: false }, { name: 'Handstand Walk (mts)', pct: false },
  // Weights / odd objects
  { name: 'Kettlebell Swings', pct: false }, { name: 'KB Snatch', pct: false }, { name: 'Goblet Squats', pct: false },
  { name: 'Dumbbell Snatch', pct: false }, { name: 'Dumbbell Thrusters', pct: false },
  { name: 'Devil Press', pct: false }, { name: 'Lunges', pct: false }, { name: 'Walking Lunges', pct: false },
  { name: 'Overhead Walking Lunges', pct: false }, { name: 'Farmer Carry (mts)', pct: false },
  { name: 'Sled Push (mts)', pct: false },
  // Monostructural
  { name: 'mts Run', pct: true }, { name: 'mts Row', pct: true }, { name: 'cal Row', pct: true },
  { name: 'cal Bike', pct: true }, { name: 'cal Ski', pct: true }, { name: 'mts Ski', pct: false },
  { name: 'min Rest', pct: false },
];

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

// Comentarios de un WOD (carga al expandir). El admin puede borrar cualquiera.
function WodCommentsAdmin({ wodId }) {
  const [comments, setComments] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getWodComments(wodId)
      .then(setComments)
      .catch(err => setError(err.message));
  }, [wodId]);

  function remove(c) {
    if (!window.confirm(`¿Borrar el comentario de ${c.member?.name || 'atleta'}?`)) return;
    api.deleteWodComment(wodId, c._id)
      .then(() => setComments(prev => prev.filter(x => x._id !== c._id)))
      .catch(err => alert('Error: ' + err.message));
  }

  if (error) return <p className="error">Error: {error}</p>;
  if (!comments) return <p className="muted" style={{ fontSize: 13 }}>Cargando comentarios…</p>;
  if (comments.length === 0) return <p className="muted" style={{ fontSize: 13 }}>Sin comentarios en este WOD.</p>;

  return (
    <div className="wod-comments">
      {comments.map(c => (
        <div key={c._id} className="wod-comment">
          {c.member?.avatar
            ? <img className="wc-avatar" src={c.member.avatar} alt="" />
            : <span className="wc-avatar wc-initials">{(c.member?.name || 'A')[0]}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="wc-meta">
              <strong>{c.member?.name || 'Atleta'}</strong>
              <span className="muted"> · {timeAgo(c.createdAt)}</span>
            </p>
            <p className="wc-text">{c.text}</p>
          </div>
          <button className="wc-delete" title="Borrar comentario" onClick={() => remove(c)}>✕</button>
        </div>
      ))}
    </div>
  );
}

// "hace 5 min" — relative time for logs and member cards.
function timeAgo(date) {
  // Math.max evita "hace -2 min" si el reloj del server va adelantado.
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60_000));
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function EmptyState({ icon, children }) {
  return (
    <div className="card empty-state">
      <span className="empty-icon">{icon}</span>
      <p className="muted">{children}</p>
    </div>
  );
}

// Minimal inline icon set (stroke style, lucide-like) for the sidebar nav.
const ICON_PATHS = {
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  chart: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" /></>,
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
};

function Icon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24" width="17" height="17" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const NAV_ITEMS = [
  { id: 'gym', label: 'En el gym', icon: 'activity' },
  { id: 'stats', label: 'Estadísticas', icon: 'chart' },
  { id: 'athletes', label: 'Atletas', icon: 'users' },
  { id: 'wod', label: 'WOD del día', icon: 'clipboard' },
  { id: 'info', label: 'Gimnasio', icon: 'home' },
  { id: 'logs', label: 'Accesos', icon: 'clock' },
];

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
  const [search, setSearch] = useState('');

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

  // Gym info (admin-editable content for the mobile app)
  const EMPTY_GYM = { name: '', announcement: '', scheduleText: '', address: '', phone: '', instagram: '' };
  const [gymForm, setGymForm] = useState(EMPTY_GYM);
  const [gymLoading, setGymLoading] = useState(false);
  const [gymSaving, setGymSaving] = useState(false);
  const [gymMsg, setGymMsg] = useState(null);

  // WOD
  const [openCommentsId, setOpenCommentsId] = useState(null);
  const [mvQty, setMvQty] = useState('');
  const [mvName, setMvName] = useState('');
  const [mvPct, setMvPct] = useState('');
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

  function fetchGymInfo() {
    setGymLoading(true);
    setGymMsg(null);
    api.getGymInfo()
      .then(data => {
        setGymForm({
          name: data.name || '',
          announcement: data.announcement || '',
          scheduleText: (data.schedule || []).map(s => `${s.day} | ${s.hours}`).join('\n'),
          address: data.address || '',
          phone: data.phone || '',
          instagram: data.instagram || '',
        });
        setGymLoading(false);
      })
      .catch(err => { setGymMsg('Error: ' + err.message); setGymLoading(false); });
  }

  function handleGymChange(e) {
    setGymForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleGymSave(e) {
    e.preventDefault();
    setGymSaving(true);
    setGymMsg(null);
    const schedule = gymForm.scheduleText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [day, hours] = line.split('|').map(s => (s || '').trim());
        return { day, hours: hours || '' };
      });
    api.saveGymInfo({
      name: gymForm.name,
      announcement: gymForm.announcement,
      address: gymForm.address,
      phone: gymForm.phone,
      instagram: gymForm.instagram,
      schedule,
    })
      .then(() => setGymMsg('Guardado ✓ — ya se ve en la app'))
      .catch(err => setGymMsg('Error: ' + err.message))
      .finally(() => setGymSaving(false));
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
    if (tab === 'info') fetchGymInfo();
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
      .then(() => { fetchMembers(); if (tab === 'logs') fetchLogs(); })
      .catch(err => alert('Error: ' + err.message));
  }

  // ── WOD helpers ─────────────────────────────────────────────────
  function handleWodChange(e) {
    setWodForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Whether the selected movement supports % personalization.
  const mvEntry = CF_MOVEMENTS.find(m => m.name.toLowerCase() === mvName.trim().toLowerCase());
  const mvPctAllowed = mvEntry ? mvEntry.pct : true;

  function addWodLine() {
    const qty = mvQty.trim();
    const name = mvName.trim();
    if (!qty || !name) return;
    const pct = mvPctAllowed ? mvPct.trim() : '';
    const line = `${qty} ${name}${pct ? ` (${pct}%)` : ''}`;
    setWodForm(prev => ({
      ...prev,
      description: prev.description ? `${prev.description}\n${line}` : line
    }));
    setMvQty('');
    setMvName('');
    setMvPct('');
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
  const pendingCount = members.filter(m => m.role !== 'admin' && m.status === 'pending').length;
  const q = search.trim().toLowerCase();
  const visibleMembers = q
    ? members.filter(m => [m.name, m.email, m.phone].some(v => (v || '').toLowerCase().includes(q)))
    : members;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-inline">
          <span className="brand-name sm">INRAGE</span>
          <span className="brand-tag sm">ADMIN PANEL</span>
        </div>
        <nav className="nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={tab === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} />
              <span className="nav-label">{item.label}</span>
              {item.id === 'gym' && active.length > 0 && <span className="tab-count">{active.length}</span>}
              {item.id === 'athletes' && pendingCount > 0 && (
                <span className="tab-count warn" title={`${pendingCount} por aprobar`}>{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>
        <button className="nav-item logout" onClick={handleLogout}>
          <Icon name="logout" />
          <span className="nav-label">Salir</span>
        </button>
      </aside>

      <main className="content" key={tab}>

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
            <EmptyState icon="🏋️">Nadie ha marcado entrada todavía hoy.</EmptyState>
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
                <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
                  ⏳ <strong>{pending.length}</strong> atleta(s) esperando aprobación para ver el WOD:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pending.map(m => (
                    <div key={m._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        <strong>{m.name}</strong>
                        <span style={{ color: 'rgba(237,237,237,0.55)', fontSize: 13, marginLeft: 8 }}>{m.email}</span>
                      </span>
                      <button className="btn-primary btn-sm" onClick={() => handleApprove(m)}>Dar de alta</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="searchbar">
            <span className="search-icon">🔍</span>
            <input
              placeholder="Buscar por nombre, correo o teléfono…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button type="button" className="search-clear" onClick={() => setSearch('')}>✕</button>}
          </div>

          <div className="legend">
            <span><i className="dot green" /> Activo (≤7d)</span>
            <span><i className="dot yellow" /> Inactivo (≤30d)</span>
            <span><i className="dot red" /> Ausente / sin acceso</span>
          </div>

          {membersLoading && <p className="muted">Cargando atletas…</p>}
          {membersError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <p className="error" style={{ margin: 0 }}>Error: {membersError}</p>
              <button className="btn-ghost" onClick={fetchMembers}>Reintentar</button>
            </div>
          )}

          {!membersLoading && members.length === 0 && !membersError && (
            <EmptyState icon="🏋️">Sin atletas registrados aún. Crea el primero con “+ Crear atleta”.</EmptyState>
          )}

          {!membersLoading && members.length > 0 && visibleMembers.length === 0 && (
            <EmptyState icon="🔍">Sin resultados para «{search}».</EmptyState>
          )}

          {!membersLoading && visibleMembers.map(member => {
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
                    {member.lastLogin && (
                      <> &nbsp;·&nbsp; <span title={new Date(member.lastLogin).toLocaleString()}>
                        Último acceso: {timeAgo(member.lastLogin)}
                      </span></>
                    )}
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

              <label className="lbl">Agregar movimiento (con % la app personaliza la dosis con los PRs de cada atleta)</label>
              <div className="wod-builder">
                <input
                  className="wb-qty" type="number" min="1" placeholder="#"
                  value={mvQty} onChange={e => setMvQty(e.target.value)}
                  title="Reps, metros o calorías"
                />
                <input
                  className="wb-name" list="cf-moves" placeholder="Movimiento — escribe para buscar (Power Clean, mts Run…)"
                  value={mvName} onChange={e => setMvName(e.target.value)}
                />
                <datalist id="cf-moves">
                  {CF_MOVEMENTS.map(m => <option key={m.name} value={m.name} />)}
                </datalist>
                <input
                  className="wb-pct" type="number" min="1" max="120" placeholder="%"
                  value={mvPct} onChange={e => setMvPct(e.target.value)}
                  disabled={!mvPctAllowed}
                  title={mvPctAllowed ? 'Opcional: % del PR del atleta' : 'Este movimiento no usa porcentaje'}
                />
                <button type="button" className="btn-ghost" onClick={addWodLine}>+ Añadir</button>
              </div>

              <textarea
                name="description"
                placeholder={'Descripción del entrenamiento…\n\nUsa el selector de arriba o escribe directo. Con porcentaje, cada atleta ve su dosis:\n  40 Pull Ups (50%)\n  30 Power Cleans (55%)\n  200 mts Run (75%)'}
                rows={8} value={wodForm.description} onChange={handleWodChange} required
              />
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
          {!wodsLoading && !wodsError && wods.length === 0 && (
            <EmptyState icon="📋">Sin WODs aún. Publica el primero arriba.</EmptyState>
          )}
          {!wodsLoading && wods.map(w => (
            <div key={w._id} className="card wod-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="wod-date">{new Date(w.date).toLocaleDateString()}</p>
                <h3>{w.title}</h3>
                <pre className="wod-desc">{w.description}</pre>
                <button
                  className="btn-ghost btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => setOpenCommentsId(openCommentsId === w._id ? null : w._id)}
                >
                  💬 {openCommentsId === w._id ? 'Ocultar comentarios' : 'Ver comentarios'}
                </button>
                {openCommentsId === w._id && <WodCommentsAdmin wodId={w._id} />}
              </div>
              <div className="actions">
                <button className="btn-ghost" onClick={() => editWod(w)}>Editar</button>
                <button className="btn-danger" onClick={() => handleWodDelete(w)}>Eliminar</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── GIMNASIO (INFO EDITABLE) TAB ── */}
      {tab === 'info' && (
        <section>
          <div className="section-head">
            <h2>Información del gimnasio</h2>
            <span className="muted" style={{ fontSize: 13 }}>Esto es lo que ven los atletas en la app 📱</span>
          </div>

          {gymLoading && <p className="muted">Cargando…</p>}

          {!gymLoading && (
            <form onSubmit={handleGymSave} className="card stack">
              <label className="lbl">Aviso / recomendación del día (se destaca en la app)</label>
              <textarea name="announcement" rows={3} placeholder="p. ej. Hoy enfócate en la técnica antes que en la carga 💪"
                value={gymForm.announcement} onChange={handleGymChange} />

              <label className="lbl">Nombre del gimnasio</label>
              <input name="name" value={gymForm.name} onChange={handleGymChange} />

              <label className="lbl">Horarios (una línea por fila — formato: Día | Horas)</label>
              <textarea name="scheduleText" rows={4}
                placeholder={'Lunes – Viernes | 06:00 – 22:00\nSábado | 08:00 – 14:00\nDomingo | Cerrado'}
                value={gymForm.scheduleText} onChange={handleGymChange} />

              <label className="lbl">Dirección</label>
              <input name="address" value={gymForm.address} onChange={handleGymChange} />
              <label className="lbl">Teléfono</label>
              <input name="phone" value={gymForm.phone} onChange={handleGymChange} />
              <label className="lbl">Instagram</label>
              <input name="instagram" value={gymForm.instagram} onChange={handleGymChange} />

              <div className="row">
                <button type="submit" className="btn-primary" disabled={gymSaving}>
                  {gymSaving ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
              {gymMsg && <p className={gymMsg.startsWith('Error') ? 'error' : 'ok'}>{gymMsg}</p>}
            </form>
          )}
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
          {!logsLoading && !logsError && logs.length === 0 && (
            <EmptyState icon="🕐">Sin registros aún. Aquí aparecerá cada login y registro de la app.</EmptyState>
          )}

          {!logsLoading && !logsError && logs.map(log => {
            const isPending = log.member?.status === 'pending' && log.member?.role !== 'admin';
            return (
              <div key={log._id} className="card log-card">
                <div>
                  <p className="log-name">{log.name} {eventBadge(log.event)}</p>
                  <p className="email">{log.email}</p>
                  <p className="meta">Rol: {log.role} &nbsp;·&nbsp; IP: {log.ip || '—'}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <p className="log-time" style={{ margin: 0 }} title={new Date(log.at).toLocaleString()}>
                    <strong className="ago">{timeAgo(log.at)}</strong><br />
                    <span>{new Date(log.at).toLocaleDateString()} · {new Date(log.at).toLocaleTimeString()}</span>
                  </p>
                  {isPending && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleApprove(log.member)}
                    >
                      Dar de alta
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
      </main>
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
