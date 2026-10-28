import { useMemo, useState } from 'react';
import { useDbValue } from '../hooks/data.js';
import { adminSetUserDisabled } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Avatar, SectionTitle } from './ui.jsx';

// Yöneticilik admins/{uid} ile belirlenir (yalnızca Console'dan eklenir).
// Çıkarma/geri alma "adminSetUserDisabled" Cloud Function'ı ile yapılır.
export default function AdminPanel({ t, me, toast }) {
  const { value } = useDbValue('users');
  const [busyUid, setBusyUid] = useState(null);

  const [active, removed] = useMemo(() => {
    const all = Object.entries(value || {})
      .filter(([uid]) => uid !== me.uid)
      .map(([uid, u]) => ({ uid, ...u }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
    return [all.filter((u) => !u.disabled), all.filter((u) => u.disabled)];
  }, [value, me.uid]);

  const act = async (u, disabled) => {
    const question = disabled ? `${u.name} uygulamadan çıkarılsın mı? Açık oturumu hemen kapanır.` : `${u.name} tekrar içeri alınsın mı?`;
    if (!window.confirm(question)) return;
    setBusyUid(u.uid);
    try {
      await adminSetUserDisabled(u.uid, disabled);
      toast(disabled ? `${u.name} çıkarıldı.` : `${u.name} tekrar içeri alındı.`);
    } catch (err) {
      toast(friendlyError(err, 'yönetici işlemi'), 'no');
    } finally {
      setBusyUid(null);
    }
  };

  const row = (u, disabled) => (
    <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${t.divider}` }}>
      <Avatar name={u.name} uid={u.uid} color={u.color} size={36} dim={disabled} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
        <div style={{ fontSize: 12, color: t.textSecondary }}>@{u.username}</div>
      </div>
      <button
        type="button"
        onClick={() => act(u, !disabled)}
        disabled={busyUid === u.uid}
        className="cx-tap"
        style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 9, background: disabled ? t.accent : t.error, color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', opacity: busyUid === u.uid ? 0.6 : 1 }}
      >
        {disabled ? 'Geri Al' : 'Çıkar'}
      </button>
    </div>
  );

  return (
    <>
      <SectionTitle t={t} color={t.accent} icon="shield">
        YÖNETİCİ PANELİ ({active.length})
      </SectionTitle>
      <div style={{ margin: '8px 12px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, overflow: 'hidden' }}>
        {active.length === 0 ? <div style={{ padding: 14, color: t.textSecondary, fontSize: 13, textAlign: 'center' }}>Çıkarılacak kullanıcı yok.</div> : active.map((u) => row(u, false))}
      </div>
      {removed.length ? (
        <>
          <SectionTitle t={t} color={t.error}>
            ÇIKARILANLAR ({removed.length})
          </SectionTitle>
          <div style={{ margin: '8px 12px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, overflow: 'hidden' }}>{removed.map((u) => row(u, true))}</div>
        </>
      ) : null}
    </>
  );
}
