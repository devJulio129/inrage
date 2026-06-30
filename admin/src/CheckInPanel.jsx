import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from './api';

function getClassId(item) {
  return item?.id || item?._id;
}

function getMemberId(item) {
  return item?.member?._id || item?.member || item?.id || item?._id;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function classMetrics(item) {
  const checkedIn = Number(item.checkedIn || 0);
  const pending = Number(item.pending ?? item.pendingCount ?? item.reserved ?? 0);
  const reservedTotal = Number(item.totalReserved ?? item.booked ?? item.activeReservations ?? pending + checkedIn);
  return {
    reservedTotal,
    checkedIn,
    pending,
    waitlist: Number(item.waitlist || 0),
    cancelled: Number(item.cancelled || 0),
    spotsLeft: Number(item.spotsLeft || 0),
    capacity: Number(item.capacity || 0),
    occupancyRate: Number(item.occupancyRate || 0),
    checkInRate: Number(item.checkInRate || 0)
  };
}

function Metric({ label, value }) {
  return (
    <div className="checkin-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AthleteRow({ athlete, action, busy }) {
  return (
    <div className="roster-athlete">
      <div className="roster-athlete-main">
        <strong>{athlete.name || 'Atleta'}</strong>
        {athlete.email && <span>{athlete.email}</span>}
      </div>
      <div className="roster-athlete-meta">
        <span className="pill pill-green">{athlete.autoReservedByQr ? 'Agregado por QR' : 'Reserva previa'}</span>
        <span className="pill pill-blue">{athlete.status || '-'}</span>
        <span>Reserva {formatDateTime(athlete.reservedAt)}</span>
        <span>Check-in {formatDateTime(athlete.checkedInAt)}</span>
        {athlete.checkInMethod && <span>Metodo {athlete.checkInMethod}</span>}
      </div>
      {action && (
        <button className="btn-primary btn-sm" onClick={action} disabled={busy}>
          {busy ? 'Marcando...' : 'Marcar presente'}
        </button>
      )}
    </div>
  );
}

function RosterGroup({ title, items, empty, onMark, markingId, canMark }) {
  return (
    <div className="roster-group">
      <h4>{title} <span className="count">{items.length}</span></h4>
      {items.length === 0 ? (
        <p className="muted roster-empty">{empty}</p>
      ) : (
        items.map((athlete) => {
          const memberId = getMemberId(athlete);
          return (
            <AthleteRow
              key={`${title}-${memberId}`}
              athlete={athlete}
              busy={markingId === memberId}
              action={canMark ? () => onMark(athlete) : null}
            />
          );
        })
      )}
    </div>
  );
}

export default function CheckInPanel() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const [rosterClass, setRosterClass] = useState(null);
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState(null);
  const [markingId, setMarkingId] = useState(null);

  const [qrBranch, setQrBranch] = useState('Torres');
  const [branchQr, setBranchQr] = useState(null);
  const [branchQrLoading, setBranchQrLoading] = useState(false);
  const [branchQrError, setBranchQrError] = useState(null);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const printQrRef = useRef(null);

  const [qrClass, setQrClass] = useState(null);
  const [qrToken, setQrToken] = useState(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [qrSeconds, setQrSeconds] = useState(0);

  const loadToday = useCallback(() => {
    setLoading(true);
    setError(null);
    return api.listTodayClasses()
      .then((data) => setClasses(data.classes || data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const loadRoster = useCallback((classId) => {
    setRosterLoading(true);
    setRosterError(null);
    return api.getClassRoster(classId)
      .then(setRoster)
      .catch((err) => setRosterError(err.message))
      .finally(() => setRosterLoading(false));
  }, []);

  const loadBranchQr = useCallback((branch = qrBranch, silent = false) => {
    if (!silent) {
      setBranchQrLoading(true);
      setBranchQrError(null);
    }
    return api.getBranchCheckInQr(branch)
      .then((data) => {
        setBranchQr(data);
        setBranchQrError(null);
      })
      .catch((err) => {
        setBranchQr(null);
        if (err.code === 'qr_not_generated' || err.status === 404) {
          setBranchQrError(null);
          return;
        }
        if (err.status === 503 || err.message === 'QR Check-in no está configurado.') {
          setBranchQrError('QR Check-in no está configurado.');
          return;
        }
        setBranchQrError(err.message);
      })
      .finally(() => {
        if (!silent) setBranchQrLoading(false);
      });
  }, [qrBranch]);

  const loadQrToken = useCallback((classItem, mode = 'current', silent = false) => {
    if (!classItem) return Promise.resolve();
    const classId = getClassId(classItem);
    if (!silent) {
      setQrLoading(true);
      setQrError(null);
    }
    const request = mode === 'new' ? api.createCheckInToken(classId) : api.getCurrentCheckInToken(classId);
    return request
      .then((data) => {
        setQrToken(data);
        setQrError(null);
      })
      .catch((err) => setQrError(err.message))
      .finally(() => {
        if (!silent) setQrLoading(false);
      });
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  useEffect(() => {
    loadBranchQr(qrBranch);
  }, [qrBranch, loadBranchQr]);

  useEffect(() => {
    if (!qrToken?.expiresAt) return;
    function tick() {
      const next = Math.max(0, Math.ceil((new Date(qrToken.expiresAt).getTime() - Date.now()) / 1000));
      setQrSeconds(next);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qrToken?.expiresAt]);

  useEffect(() => {
    if (!qrClass || !qrToken?.expiresAt) return;
    const delay = Math.max(0, new Date(qrToken.expiresAt).getTime() - Date.now()) + 250;
    const id = setTimeout(() => {
      loadQrToken(qrClass, 'current', true);
    }, delay);
    return () => clearTimeout(id);
  }, [qrClass, qrToken?.expiresAt, loadQrToken]);

  const qrValue = useMemo(() => {
    if (!qrToken) return '';
    const payload = qrToken.qrPayload || { type: 'inrage_check_in', token: qrToken.token };
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  }, [qrToken]);
  const branchQrValue = useMemo(() => branchQr?.qrValue || '', [branchQr?.qrValue]);

  function openRoster(item) {
    setRosterClass(item);
    setRoster(null);
    loadRoster(getClassId(item));
  }

  function openQr(item) {
    setQrClass(item);
    setQrToken(null);
    setQrSeconds(0);
    loadQrToken(item, 'current');
  }

  async function generateBranchQr() {
    const ok = window.confirm(
      `Generar un QR nuevo para ${qrBranch} invalidara cualquier QR impreso anteriormente de esa sede. ¿Continuar?`
    );
    if (!ok) return;
    setBranchQrLoading(true);
    setBranchQrError(null);
    try {
      const data = await api.generateBranchCheckInQr(qrBranch);
      setBranchQr(data);
    } catch (err) {
      setBranchQrError(err.message);
    } finally {
      setBranchQrLoading(false);
    }
  }

  function printableCanvas() {
    return printQrRef.current?.querySelector('canvas') || null;
  }

  function downloadBranchQr() {
    const canvas = printableCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `inrage-checkin-qr-${qrBranch.toLowerCase()}-v${branchQr?.generation || 1}.png`;
    link.click();
  }

  function printBranchQr() {
    const canvas = printableCanvas();
    if (!canvas) return;
    const image = canvas.toDataURL('image/png');
    const generated = branchQr?.generatedAt ? new Date(branchQr.generatedAt).toLocaleString('es-MX') : '';
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Inrage QR ${qrBranch}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 40px; text-align: center; color: #111; }
            h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: 1px; }
            p { margin: 6px 0; color: #444; font-size: 14px; }
            img { width: 70vw; max-width: 720px; height: auto; margin: 24px auto; display: block; }
            .badge { display: inline-block; padding: 8px 14px; border: 2px solid #111; border-radius: 999px; font-weight: 700; }
          </style>
        </head>
        <body>
          <p class="badge">CHECK-IN INRAGE</p>
          <h1>${qrBranch}</h1>
          <p>Escanea este codigo desde la app para confirmar asistencia.</p>
          <img src="${image}" alt="QR Check-in ${qrBranch}" />
          <p>Version ${branchQr?.generation || 1}${generated ? ` - Generado ${generated}` : ''}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  }

  function renderBranchQr(stage = 'inline') {
    const size = stage === 'fullscreen' ? 520 : 320;
    return (
      <div className={stage === 'fullscreen' ? 'branch-qr-stage fullscreen' : 'branch-qr-stage'}>
        <div className="branch-qr-code">
          {branchQrValue ? (
            <QRCodeCanvas value={branchQrValue} size={size} level="H" includeMargin />
          ) : (
            <div className="branch-qr-empty">
              <strong>Sin QR activo</strong>
              <span>Genera uno nuevo para imprimirlo en el gym.</span>
            </div>
          )}
        </div>
        {branchQrValue && (
          <div className="qr-meta">
            <strong>v{branchQr?.generation || 1}</strong>
            <span>vigente desde {branchQr?.generatedAt ? formatDateTime(branchQr.generatedAt) : '-'}</span>
          </div>
        )}
        <p className="muted branch-qr-help">
          Los atletas deben abrir la app, tocar Check-in y escanear este codigo impreso.
        </p>
      </div>
    );
  }

  async function markPresent(athlete) {
    if (!rosterClass) return;
    const classId = getClassId(rosterClass);
    const memberId = getMemberId(athlete);
    setMarkingId(memberId);
    setMessage(null);
    try {
      await api.manualClassCheckIn(classId, memberId);
      setMessage(`${athlete.name || 'Atleta'} marcado presente.`);
      await Promise.all([loadRoster(classId), loadToday()]);
    } catch (err) {
      setRosterError(err.message);
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <section>
      <div className="section-head">
        <h2>Check-in de hoy</h2>
        <button className="btn-ghost" onClick={loadToday} disabled={loading}>
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      <p className="muted checkin-intro">
        Operacion diaria: QR estatico vigente por sucursal, roster por clase y respaldo manual.
      </p>

      <div className="card branch-qr-card">
        <div className="branch-qr-layout">
          <div className="branch-qr-copy">
            <p className="modal-kicker">QR Check-in</p>
            <h3>{qrBranch}</h3>
            <p className="muted">
              Genera un QR por sede, imprimelo y pegalo en recepcion. Al generar uno nuevo, el anterior queda invalidado.
            </p>
            <div className="segmented branch-qr-segmented">
              {['Torres', 'Central'].map((branch) => (
                <button
                  key={branch}
                  type="button"
                  className={qrBranch === branch ? 'active' : ''}
                  onClick={() => setQrBranch(branch)}
                >
                  {branch}
                </button>
              ))}
            </div>
            <div className="row">
              <button className="btn-primary" onClick={generateBranchQr} disabled={branchQrLoading}>
                {branchQrLoading ? 'Generando...' : branchQrValue ? 'Generar nuevo QR' : 'Generar QR'}
              </button>
              <button className="btn-ghost" onClick={downloadBranchQr} disabled={!branchQrValue}>
                Descargar PNG
              </button>
              <button className="btn-ghost" onClick={printBranchQr} disabled={!branchQrValue}>
                Imprimir
              </button>
              <button className="btn-ghost" onClick={() => setQrFullscreen(true)} disabled={!branchQrValue}>
                Pantalla completa
              </button>
            </div>
            {branchQrError && <p className="error">Error: {branchQrError}</p>}
            {branchQrValue && (
              <p className="muted qr-static-note">
                QR vigente para {qrBranch}. Si generas otro, este archivo impreso deja de servir.
              </p>
            )}
          </div>
          {renderBranchQr()}
        </div>
        {branchQrValue && (
          <div className="print-qr-hidden" ref={printQrRef} aria-hidden="true">
            <QRCodeCanvas value={branchQrValue} size={1400} level="H" includeMargin />
          </div>
        )}
      </div>

      {message && <p className="ok">{message}</p>}
      {loading && classes.length === 0 && <p className="muted">Cargando clases de hoy...</p>}
      {error && <p className="error">Error: {error}</p>}

      {!loading && !error && classes.length === 0 && (
        <div className="card empty-state">
          <span className="empty-icon">QR</span>
          <p className="muted">No hay clases programadas para hoy.</p>
        </div>
      )}

      <div className="checkin-grid">
        {classes.map((item) => {
          const m = classMetrics(item);
          return (
            <div key={getClassId(item)} className="card checkin-class-card">
              <div className="checkin-class-head">
                <div>
                  <p className="checkin-time">{item.time}</p>
                  <h3>{item.name}</h3>
                </div>
                <span className={`spots-badge${m.spotsLeft === 0 ? ' full' : ''}`}>
                  {m.spotsLeft} libres
                </span>
              </div>

              <div className="checkin-metrics">
                <Metric label="Capacidad" value={m.capacity} />
                <Metric label="Reservados" value={m.reservedTotal} />
                <Metric label="Presentes" value={m.checkedIn} />
                <Metric label="Pendientes" value={m.pending} />
                <Metric label="Waitlist" value={m.waitlist} />
                <Metric label="Cancelados" value={m.cancelled} />
                <Metric label="Ocupacion" value={formatPercent(m.occupancyRate)} />
                <Metric label="Check-in" value={formatPercent(m.checkInRate)} />
              </div>

              <div className="checkin-actions">
                <button className="btn-ghost" onClick={() => openRoster(item)}>Ver roster</button>
              </div>
            </div>
          );
        })}
      </div>

      {rosterClass && (
        <div className="modal-overlay" onMouseDown={() => setRosterClass(null)}>
          <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="modal-kicker">Roster</p>
                <h3>{roster?.class?.name || rosterClass.name}</h3>
                <p className="muted">{roster?.class?.time || rosterClass.time} - Capacidad {roster?.class?.capacity || rosterClass.capacity}</p>
              </div>
              <button className="btn-ghost" onClick={() => setRosterClass(null)}>Cerrar</button>
            </div>

            {rosterLoading && <p className="muted">Cargando roster...</p>}
            {rosterError && <p className="error">Error: {rosterError}</p>}

            {roster && (
              <>
                <div className="checkin-metrics roster-counts">
                  <Metric label="Reservados" value={(roster.counts?.reserved || 0) + (roster.counts?.checkedIn || 0)} />
                  <Metric label="Presentes" value={roster.counts?.checkedIn || 0} />
                  <Metric label="Pendientes" value={roster.counts?.reserved || 0} />
                  <Metric label="Waitlist" value={roster.counts?.waitlist || 0} />
                  <Metric label="Cancelados" value={roster.counts?.cancelled || 0} />
                  <Metric label="Libres" value={roster.counts?.spotsLeft || 0} />
                </div>

                <RosterGroup
                  title="Presentes"
                  items={roster.checkedIn || []}
                  empty="Nadie ha hecho check-in todavia."
                  onMark={markPresent}
                  markingId={markingId}
                />
                <RosterGroup
                  title="Pendientes"
                  items={roster.pending || []}
                  empty="Sin atletas pendientes."
                  onMark={markPresent}
                  markingId={markingId}
                  canMark
                />
                <RosterGroup
                  title="Lista de espera"
                  items={roster.waitlist || []}
                  empty="Sin lista de espera."
                  onMark={markPresent}
                  markingId={markingId}
                  canMark
                />
                <RosterGroup
                  title="Cancelados"
                  items={roster.cancelled || []}
                  empty="Sin cancelaciones."
                  onMark={markPresent}
                  markingId={markingId}
                />
              </>
            )}
          </div>
        </div>
      )}

      {qrClass && (
        <div className="modal-overlay" onMouseDown={() => setQrClass(null)}>
          <div className="modal qr-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="modal-kicker">QR de check-in</p>
                <h3>{qrClass.name}</h3>
                <p className="muted">{qrClass.time}</p>
              </div>
              <button className="btn-ghost" onClick={() => setQrClass(null)}>Cerrar</button>
            </div>

            {qrLoading && !qrToken && <p className="muted">Generando QR...</p>}
            {qrError && <p className="error">Error: {qrError}</p>}

            {qrValue && (
              <div className="qr-stage">
                <div className="qr-box">
                  <QRCodeCanvas value={qrValue} size={320} level="M" includeMargin />
                </div>
                <div className="qr-meta">
                  <strong>{qrSeconds}s</strong>
                  <span>para expirar</span>
                </div>
                <p className="muted">Este codigo se renueva automaticamente.</p>
                <button
                  className="btn-primary"
                  onClick={() => loadQrToken(qrClass, 'new')}
                  disabled={qrLoading}
                >
                  {qrLoading ? 'Renovando...' : 'Renovar ahora'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {qrFullscreen && (
        <div className="qr-fullscreen" onMouseDown={() => setQrFullscreen(false)}>
          <div className="qr-fullscreen-inner" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="modal-kicker">QR Check-in</p>
                <h3>{qrBranch}</h3>
              </div>
              <button className="btn-ghost" onClick={() => setQrFullscreen(false)}>Cerrar</button>
            </div>
            {renderBranchQr('fullscreen')}
          </div>
        </div>
      )}
    </section>
  );
}
