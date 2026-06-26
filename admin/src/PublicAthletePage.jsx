import { useEffect, useState } from 'react';
import { api } from './api';

const LEVEL_LABELS = {
  inactive: 'Inactivo',
  starting: 'Empezando',
  consistent: 'Constante',
  strong: 'Fuerte',
  elite: 'Elite'
};

function initials(name) {
  return String(name || 'Atleta')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPr(pr) {
  if (!pr) return '';
  if (pr.unit === 'time') {
    const mins = Math.floor((pr.value || 0) / 60);
    const secs = Math.round((pr.value || 0) % 60);
    return `${mins}:${String(secs).padStart(2, '0')} min`;
  }
  return `${pr.value} ${pr.unit || ''}`.trim();
}

export default function PublicAthletePage({ slug }) {
  const [athlete, setAthlete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getPublicAthlete(slug)
      .then((data) => {
        if (active) setAthlete(data.athlete);
      })
      .catch((err) => {
        if (active) setError(err.status === 404 ? 'not_found' : err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return (
      <main className="public-athlete-page public-athlete-centered">
        <p className="muted">Cargando perfil...</p>
      </main>
    );
  }

  if (error || !athlete) {
    return (
      <main className="public-athlete-page public-athlete-centered">
        <span className="brand-name sm">INRAGE</span>
        <h1>{error === 'not_found' ? 'Perfil no disponible' : 'No se pudo cargar el perfil'}</h1>
        <p className="muted">El atleta puede haber desactivado su perfil publico.</p>
      </main>
    );
  }

  const consistency = athlete.consistency;
  const level = consistency?.level || 'inactive';

  return (
    <main className="public-athlete-page">
      <section className="public-athlete-hero">
        {athlete.coverUrl && <img className="public-athlete-cover" src={athlete.coverUrl} alt="" />}
        <div className="public-athlete-hero-inner">
          <div className="public-avatar">
            {athlete.avatarUrl
              ? <img src={athlete.avatarUrl} alt="" />
              : <span>{initials(athlete.name)}</span>}
          </div>
          <p className="modal-kicker">Perfil publico de atleta InRage</p>
          <h1>{athlete.name}</h1>
          <p className="public-athlete-bio">{athlete.bio || 'Atleta de la comunidad InRage.'}</p>
          <div className="public-badge-row">
            <span className="status-chip active">{LEVEL_LABELS[level] || level}</span>
            <span className="muted">Miembro desde {formatDate(athlete.joinedAt)}</span>
          </div>
        </div>
      </section>

      <section className="public-athlete-content">
        {consistency && (
          <div className="public-stats-grid">
            <div className="card public-stat">
              <span>Score</span>
              <strong>{consistency.score}</strong>
            </div>
            <div className="card public-stat">
              <span>Visitas 7d</span>
              <strong>{consistency.visitsLast7Days}</strong>
            </div>
            <div className="card public-stat">
              <span>Visitas 30d</span>
              <strong>{consistency.visitsLast30Days}</strong>
            </div>
            <div className="card public-stat">
              <span>Racha</span>
              <strong>{consistency.currentStreak}</strong>
            </div>
          </div>
        )}

        {athlete.badges?.length > 0 && (
          <section className="public-section">
            <h2>Badges</h2>
            <div className="public-badge-list">
              {athlete.badges.map((badge) => <span key={badge.id} className="public-badge">{badge.label}</span>)}
            </div>
          </section>
        )}

        <section className="public-section">
          <h2>PRs destacados</h2>
          {athlete.featuredPrs?.length > 0 ? (
            <div className="public-pr-grid">
              {athlete.featuredPrs.map((pr) => (
                <div key={pr.id || pr.movement} className="card public-pr">
                  <span>{pr.movement || pr.name}</span>
                  <strong>{formatPr(pr)}</strong>
                  <small>{formatDate(pr.date)}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Sin PRs publicos destacados todavia.</p>
          )}
        </section>
      </section>
    </main>
  );
}
