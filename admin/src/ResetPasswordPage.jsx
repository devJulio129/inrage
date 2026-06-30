import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

export default function ResetPasswordPage() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const [email, setEmail] = useState(query.get('email') || '');
  const [token, setToken] = useState(query.get('token') || '');
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [supportWhatsapp, setSupportWhatsapp] = useState(null);
  const [supportMessage, setSupportMessage] = useState(null);

  useEffect(() => {
    api.getSupportWhatsappLink()
      .then((data) => setSupportWhatsapp(data?.configured ? data : null))
      .catch(() => setSupportWhatsapp(null));
  }, []);

  function openSupportWhatsapp() {
    if (!supportWhatsapp?.url) {
      setSupportMessage('Soporte por WhatsApp no configurado.');
      return;
    }
    window.open(supportWhatsapp.url, '_blank', 'noopener,noreferrer');
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ email, token, tempPassword, newPassword });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card reset-card">
        <div className="brand">
          <span className="brand-name">INRAGE</span>
          <span className="brand-sub">PASSWORD RESET</span>
        </div>

        {done ? (
          <div className="reset-success">
            <h2>Contrasena actualizada</h2>
            <p className="muted">Ya puedes iniciar sesion con tu nueva contrasena.</p>
            <a className="btn-primary btn-block reset-login-link" href="/">Ir a login</a>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <input
              className="reset-input"
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="reset-input"
              placeholder="Token del link"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
            <input
              className="reset-input"
              type="password"
              placeholder="Contrasena provisional"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              required
            />
            <input
              className="reset-input"
              type="password"
              placeholder="Nueva contrasena"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <input
              className="reset-input"
              type="password"
              placeholder="Confirmar nueva contrasena"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="submit" className="btn-primary btn-block" disabled={loading}>
              {loading ? 'Actualizando...' : 'Cambiar contrasena'}
            </button>
          </form>
        )}
        {error && <p className="auth-error">{error}</p>}
        {supportMessage && <p className="muted" style={{ fontSize: 13 }}>{supportMessage}</p>}
        {supportWhatsapp?.configured && (
          <button type="button" className="btn-ghost btn-block reset-login-link" onClick={openSupportWhatsapp}>
            {supportWhatsapp.label || 'Contactar soporte por WhatsApp'}
          </button>
        )}
      </div>
    </div>
  );
}
