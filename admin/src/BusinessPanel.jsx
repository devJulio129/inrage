import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const riskLabels = {
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
  unknown: 'Sin datos'
};

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
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

function MetricCard({ label, value, hint, tone = '' }) {
  return (
    <div className={`card business-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function PeriodBlock({ title, data }) {
  return (
    <div className="card business-period">
      <h3>{title}</h3>
      <div className="business-period-grid">
        <div><span>Visitas</span><strong>{data?.visits || 0}</strong></div>
        <div><span>Atletas</span><strong>{data?.uniqueAthletes || 0}</strong></div>
        <div><span>Check-ins</span><strong>{data?.checkIns || 0}</strong></div>
        <div><span>Cancelaciones</span><strong>{data?.cancellations || 0}</strong></div>
        <div><span>No shows</span><strong>{data?.noShows || 0}</strong></div>
      </div>
    </div>
  );
}

export default function BusinessPanel({ onOpenMemberships }) {
  const [overview, setOverview] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, riskData, performanceData] = await Promise.all([
        api.getBusinessOverview(),
        api.getAthletesRisk(),
        api.getClassPerformance()
      ]);
      setOverview(overviewData);
      setAthletes(riskData.athletes || []);
      setPerformance(performanceData.performance || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRisk = athletes.filter((item) => item.riskLevel !== 'low').slice(0, 12);

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Negocio</h2>
          <p className="muted business-subtitle">Operacion, retencion y horarios en una sola vista.</p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {error && <p className="error">Error: {error}</p>}
      {loading && !overview && <p className="muted">Cargando indicadores del negocio...</p>}

      {overview && (
        <>
          <h3 className="business-section-title">Hoy</h3>
          <div className="business-metric-grid">
            <MetricCard label="Clases" value={overview.today?.classesCount} />
            <MetricCard label="Reservados" value={overview.today?.reserved} />
            <MetricCard label="Presentes" value={overview.today?.checkedIn} tone="positive" />
            <MetricCard label="Waitlist" value={overview.today?.waitlist} tone="warning" />
            <MetricCard label="Cancelados" value={overview.today?.cancelled} tone="danger" />
          </div>

          <div className="business-periods">
            <PeriodBlock title="Ultimos 7 dias" data={overview.last7Days} />
            <PeriodBlock title="Ultimos 30 dias" data={overview.last30Days} />
          </div>

          <div className="business-heading-row">
            <h3 className="business-section-title">Membresias</h3>
            <button className="btn-ghost btn-sm" onClick={onOpenMemberships}>Administrar</button>
          </div>
          <div className="business-metric-grid membership-summary">
            <MetricCard label="Activas" value={overview.memberships?.active} tone="positive" />
            <MetricCard label="Vencen en 7 dias" value={overview.memberships?.expiring7Days} tone="warning" />
            <MetricCard label="Vencen manana" value={overview.memberships?.expiringTomorrow} tone="warning" />
            <MetricCard label="Vencidas" value={overview.memberships?.expired} tone="danger" />
            <MetricCard
              label="Congeladas / inactivas"
              value={(overview.memberships?.frozen || 0) + (overview.memberships?.inactive || 0)}
            />
          </div>

          <h3 className="business-section-title">Alertas accionables</h3>
          <div className="business-alerts">
            {(overview.alerts || []).length === 0 ? (
              <div className="card business-empty">No hay alertas operativas por ahora.</div>
            ) : (
              overview.alerts.map((alert, index) => (
                <div className="card business-alert" key={`${alert.type}-${index}`}>
                  <span className={`alert-dot ${alert.type}`} />
                  <strong>{alert.message || alert}</strong>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {(!error || athletes.length > 0) && (
        <>
          <h3 className="business-section-title">Atletas que necesitan seguimiento</h3>
          <div className="card table-shell">
            {loading && athletes.length === 0 ? (
              <p className="muted table-empty">Cargando atletas...</p>
            ) : visibleRisk.length === 0 ? (
              <p className="muted table-empty">No hay atletas en riesgo medio o alto.</p>
            ) : (
              <div className="business-table-scroll">
                <table className="business-table">
                  <thead>
                    <tr>
                      <th>Atleta</th>
                      <th>Ultima visita</th>
                      <th>Dias sin venir</th>
                      <th>Visitas 30d</th>
                      <th>Membresia</th>
                      <th>Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRisk.map((athlete) => (
                      <tr key={athlete.id}>
                        <td><strong>{athlete.name || 'Atleta sin nombre'}</strong><small>{athlete.email || 'Sin email'}</small></td>
                        <td>{formatDate(athlete.lastVisitAt)}</td>
                        <td>{athlete.daysSinceLastVisit ?? 'Sin datos'}</td>
                        <td>{athlete.visitsLast30Days}</td>
                        <td><span className={`status-chip ${athlete.membershipStatus || 'inactive'}`}>{athlete.membershipStatus || 'inactive'}</span></td>
                        <td><span className={`risk-chip ${athlete.riskLevel || 'unknown'}`}>{riskLabels[athlete.riskLevel] || 'Sin datos'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {(!error || performance.length > 0) && (
        <>
          <h3 className="business-section-title">Rendimiento por horario, ultimos 30 dias</h3>
          <div className="card table-shell">
            {loading && performance.length === 0 ? (
              <p className="muted table-empty">Cargando rendimiento...</p>
            ) : performance.length === 0 ? (
              <p className="muted table-empty">Todavia no hay sesiones suficientes para comparar.</p>
            ) : (
              <div className="business-table-scroll">
                <table className="business-table">
                  <thead>
                    <tr>
                      <th>Clase</th>
                      <th>Hora</th>
                      <th>Sesiones</th>
                      <th>Prom. reservados</th>
                      <th>Prom. presentes</th>
                      <th>Ocupacion</th>
                      <th>Cancelaciones</th>
                      <th>Waitlist</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.map((row) => (
                      <tr key={`${row.className}-${row.time}`}>
                        <td><strong>{row.className}</strong></td>
                        <td>{row.time}</td>
                        <td>{row.sessionsCount}</td>
                        <td>{row.avgReserved}</td>
                        <td>{row.avgCheckedIn}</td>
                        <td>{formatPercent(row.avgOccupancyRate)}</td>
                        <td>{row.cancellations}</td>
                        <td>{row.waitlistCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
