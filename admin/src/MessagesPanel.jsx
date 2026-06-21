import { useEffect, useRef, useState } from 'react';
import { api } from './api';

const MAX_FILE_BYTES = 2_000_000; // ~2 MB por archivo

function timeShort(date) {
  return new Date(date).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Imágenes → se comprimen a 1200px JPEG; otros archivos → data-URI tal cual.
function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES && !file.type.startsWith('image/')) {
      reject(new Error(`${file.name} pesa más de 2 MB`));
      return;
    }
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(img.src);
        resolve({ name: file.name, mime: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8) });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, mime: file.type || 'application/octet-stream', data: reader.result });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }
  });
}

function Attachment({ a }) {
  const isImg = (a.mime || '').startsWith('image/');
  if (isImg) {
    return <a href={a.data} target="_blank" rel="noreferrer"><img className="msg-img" src={a.data} alt={a.name} /></a>;
  }
  return (
    <a className="msg-file" href={a.data} download={a.name}>
      📎 {a.name}
    </a>
  );
}

export default function MessagesPanel({ initialMemberId, members }) {
  const [inbox, setInbox] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(initialMemberId || null);
  const [thread, setThread] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState('');
  const [pending, setPending] = useState([]); // adjuntos por enviar
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const endRef = useRef(null);

  function fetchInbox() {
    setLoading(true);
    setError(null);
    api.inbox()
      .then((data) => { setInbox(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }

  function fetchThread(id) {
    setThreadLoading(true);
    api.thread(id)
      .then((data) => { setThread(data); setThreadLoading(false); setTimeout(() => endRef.current?.scrollIntoView(), 50); })
      .catch((e) => { setMsg('Error: ' + e.message); setThreadLoading(false); });
  }

  useEffect(() => { fetchInbox(); }, []);
  useEffect(() => { if (openId) fetchThread(openId); }, [openId]);
  // Si entramos desde el botón "Mensaje" de un atleta.
  useEffect(() => { if (initialMemberId) setOpenId(initialMemberId); }, [initialMemberId]);

  const openMember =
    members?.find((m) => m._id === openId) ||
    inbox.find((r) => r.member._id === openId)?.member ||
    (openId ? { _id: openId, name: 'Atleta' } : null);

  async function pickFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setMsg(null);
    try {
      const atts = await Promise.all(files.map(fileToAttachment));
      setPending((prev) => [...prev, ...atts].slice(0, 5));
    } catch (err) {
      setMsg('Error: ' + err.message);
    }
  }

  function deleteMsg(m) {
    if (!window.confirm('¿Borrar este mensaje? No se puede deshacer.')) return;
    api.deleteMessage(m._id)
      .then(() => { setThread((prev) => prev.filter((x) => x._id !== m._id)); fetchInbox(); })
      .catch((err) => setMsg('Error: ' + err.message));
  }

  async function send(e) {
    e.preventDefault();
    if ((!text.trim() && pending.length === 0) || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const created = await api.sendMessage(openId, { body: text.trim(), attachments: pending });
      setThread((prev) => [...prev, created]);
      setText('');
      setPending([]);
      setTimeout(() => endRef.current?.scrollIntoView(), 50);
    } catch (err) {
      setMsg('Error: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  // ── Vista de conversación ──
  if (openId) {
    return (
      <section>
        <div className="section-head">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn-ghost" onClick={() => setOpenId(null)}>← Inbox</button>
            {openMember?.name}
          </h2>
        </div>

        <div className="chat">
          {threadLoading && <p className="muted">Cargando…</p>}
          {!threadLoading && thread.length === 0 && (
            <p className="muted" style={{ textAlign: 'center', padding: 20 }}>
              Aún no hay mensajes. Escribe el primero — el atleta lo verá en su app.
            </p>
          )}
          {thread.map((m) => (
            <div key={m._id} className={`bubble ${m.fromAdmin ? 'mine' : 'theirs'}`}>
              <button className="bubble-del" title="Borrar mensaje" onClick={() => deleteMsg(m)}>✕</button>
              {m.body && <p className="bubble-text">{m.body}</p>}
              {m.attachments?.map((a, i) => <Attachment key={i} a={a} />)}
              <span className="bubble-time">{timeShort(m.createdAt)}</span>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {pending.length > 0 && (
          <div className="attach-tray">
            {pending.map((a, i) => (
              <span key={i} className="attach-chip">
                {a.mime.startsWith('image/') ? '🖼️' : '📎'} {a.name}
                <button onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>✕</button>
              </span>
            ))}
          </div>
        )}

        <form className="chat-composer" onSubmit={send}>
          <input ref={fileRef} type="file" multiple hidden onChange={pickFiles}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" />
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()}>📎</button>
          <input
            className="chat-input"
            placeholder="Escribe un mensaje…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={sending || (!text.trim() && pending.length === 0)}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
        {msg && <p className="error" style={{ marginTop: 8 }}>{msg}</p>}
      </section>
    );
  }

  // ── Inbox ──
  return (
    <section>
      <div className="section-head">
        <h2>Mensajes</h2>
        <button className="btn-ghost" onClick={fetchInbox}>Actualizar</button>
      </div>

      {loading && <p className="muted">Cargando…</p>}
      {error && <p className="error">Error: {error}</p>}
      {!loading && !error && inbox.length === 0 && (
        <div className="card empty-state">
          <span className="empty-icon">✉️</span>
          <p className="muted">Sin conversaciones aún. Abre el chat de un atleta desde la pestaña “Atletas”.</p>
        </div>
      )}

      {inbox.map((r) => (
        <div key={r.member._id} className="card inbox-row" onClick={() => setOpenId(r.member._id)}>
          {r.member.avatar
            ? <img className="wc-avatar" src={r.member.avatar} alt="" />
            : <span className="wc-avatar wc-initials">{(r.member.name || 'A')[0]}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="inbox-name">{r.member.name}</p>
            <p className="inbox-preview">
              {r.lastFromAdmin ? 'Tú: ' : ''}{r.lastHasFiles && !r.lastBody ? '📎 Archivo' : r.lastBody || '📎 Archivo'}
            </p>
          </div>
          <div className="inbox-right">
            <span className="muted" style={{ fontSize: 11 }}>{timeShort(r.lastAt)}</span>
            {r.unread > 0 && <span className="inbox-unread">{r.unread}</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
