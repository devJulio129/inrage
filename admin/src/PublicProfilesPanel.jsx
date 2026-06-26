import { useEffect, useState } from 'react';
import { api } from './api';

function linkFor(profile) {
  if (profile.publicUrl) return profile.publicUrl;
  if (!profile.slug) return '';
  return `${window.location.origin}/athlete/${profile.slug}`;
}

async function copyText(value) {
  if (!value) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  window.prompt('Copiar link', value);
}

export default function PublicProfilesPanel() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPublicProfiles();
      setProfiles(data.profiles || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(profile) {
    setBusyId(profile.id);
    setMessage(null);
    setError(null);
    try {
      await api.updatePublicProfileAdmin(profile.id, { enabled: !profile.enabled });
      setMessage(profile.enabled ? 'Perfil desactivado.' : 'Perfil activado.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function copy(profile) {
    const link = linkFor(profile);
    if (!link) return;
    await copyText(link);
    setMessage('Link copiado.');
  }

  function openProfile(profile) {
    const link = linkFor(profile);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>Perfiles</h2>
          <p className="muted business-subtitle">Landing publica de atletas y control basico de privacidad.</p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {message && <p className="ok">{message}</p>}
      {error && <p className="error">Error: {error}</p>}

      <div className="card table-shell">
        {loading && profiles.length === 0 ? (
          <p className="muted table-empty">Cargando perfiles...</p>
        ) : error && profiles.length === 0 ? (
          <p className="muted table-empty">No se pudo cargar la lista de perfiles.</p>
        ) : profiles.length === 0 ? (
          <p className="muted table-empty">Todavia no hay atletas para mostrar.</p>
        ) : (
          <div className="business-table-scroll">
            <table className="business-table public-profiles-table">
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Slug</th>
                  <th>Estado</th>
                  <th>Visitas 30d</th>
                  <th>Nivel</th>
                  <th>Link publico</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const publicLink = linkFor(profile);
                  return (
                    <tr key={profile.id}>
                      <td><strong>{profile.name || 'Atleta'}</strong></td>
                      <td>{profile.slug || '-'}</td>
                      <td>
                        <span className={`status-chip ${profile.enabled ? 'active' : 'inactive'}`}>
                          {profile.enabled ? 'activo' : 'inactivo'}
                        </span>
                      </td>
                      <td>{profile.visitsLast30Days ?? 0}</td>
                      <td>{profile.consistencyLevel || 'inactive'}</td>
                      <td className="public-profile-link">{publicLink || '-'}</td>
                      <td>
                        <div className="membership-actions public-profile-actions">
                          <button className="btn-ghost btn-sm" onClick={() => copy(profile)} disabled={!publicLink}>
                            Copiar
                          </button>
                          <button className="btn-ghost btn-sm" onClick={() => openProfile(profile)} disabled={!publicLink}>
                            Ver
                          </button>
                          <button className="btn-primary btn-sm" onClick={() => toggle(profile)} disabled={busyId === profile.id}>
                            {busyId === profile.id ? 'Guardando...' : profile.enabled ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
