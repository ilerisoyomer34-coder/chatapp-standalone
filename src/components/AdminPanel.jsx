import { useMemo, useState } from 'react';
import { EMPTY, useDbValue } from '../hooks/data.js';
import { adminSetUserDisabled, dismissReport } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { formatListTime } from '../lib/format.js';
import { confirmDialog } from './dialogs.jsx';
import { Avatar, SectionTitle } from './ui.jsx';

// Yöneticilik admins/{uid} ile belirlenir (yalnızca Console'dan eklenir).
// Çıkarma/geri alma "adminSetUserDisabled" Cloud Function'ı ile yapılır.
export default function AdminPanel({ t, me, toast }) {
  const { value } = useDbValue('users');
  const reportsNode = useDbValue('reports').value || EMPTY;
  const [busyUid, setBusyUid] = useState(null);
  const users = value || EMPTY;

  const [active, removed] = useMemo(() => {
    const all = Object.entries(users)
      .filter(([uid]) => uid !== me.uid)
      .map(([uid, u]) => ({ uid, ...u }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'tr'));
    return [all.filter((u) => !u.disabled), all.filter((u) => u.disabled)];
  }, [users, me.uid]);

  const reports = Object.entries(reportsNode)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const act = async (u, disabled) => {
    const ok = await confirmDialog({
      title: disabled ? 'Kullanıcı çıkarılsın mı?' : 'Kullanıcı geri alınsın mı?',
      text: disabled ? `${u.name} uygulamadan çıkarılacak ve açık oturumu hemen kapanacak.` : `${u.name} tekrar giriş yapabilecek.`,
      okText: disabled ? 'Çıkar' : 'Geri al',
      danger: disabled,
    });
    if (!ok) return;
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
    <div
      key={u.uid}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${t.divider}` }}
    >
      <Avatar name={u.name} uid={u.uid} color={u.color} photoURL={u.photoURL} size={36} dim={disabled} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: t.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {u.name}
        </div>
        <div style={{ fontSize: 12, color: t.textSecondary }}>@{u.username}</div>
      </div>
      <button
        type="button"
        onClick={() => act(u, !disabled)}
        disabled={busyUid === u.uid}
        className="cx-tap"
        style={{
          height: 32,
          padding: '0 12px',
          border: 'none',
          borderRadius: 9,
          background: disabled ? t.accent : t.error,
          color: '#fff',
          fontSize: 12,
          fontWeight: 800,
          whiteSpace: 'nowrap',
          opacity: busyUid === u.uid ? 0.6 : 1,
        }}
      >
        {disabled ? 'Geri Al' : 'Çıkar'}
      </button>
    </div>
  );

  const nameOf = (uid) => users[uid]?.name || 'Silinmiş hesap';

  return (
    <>
      {reports.length ? (
        <>
          <SectionTitle t={t} color={t.error} icon="flag">
            ŞİKÂYETLER ({reports.length})
          </SectionTitle>
          <div
            style={{ margin: '8px 12px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, overflow: 'hidden' }}
          >
            {reports.map((r) => (
              <div key={r.id} style={{ padding: '10px 12px', borderBottom: `1px solid ${t.divider}` }}>
                <div style={{ fontSize: 13.5, color: t.textPrimary }}>
                  <b>{nameOf(r.from)}</b> → <b>{nameOf(r.target)}</b>
                  <span style={{ color: t.textSecondary, fontSize: 12, marginLeft: 6 }}>{formatListTime(r.ts)}</span>
                </div>
                <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 3, overflowWrap: 'anywhere' }}>{r.reason}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {users[r.target] && !users[r.target].disabled ? (
                    <button
                      type="button"
                      onClick={() => act({ uid: r.target, ...users[r.target] }, true)}
                      className="cx-tap"
                      style={{
                        height: 30,
                        padding: '0 10px',
                        border: 'none',
                        borderRadius: 8,
                        background: t.error,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      Kullanıcıyı çıkar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => dismissReport(r.id).catch((err) => toast(friendlyError(err, 'şikâyet'), 'no'))}
                    className="cx-tap"
                    style={{
                      height: 30,
                      padding: '0 10px',
                      border: `1px solid ${t.divider}`,
                      borderRadius: 8,
                      background: 'transparent',
                      color: t.textSecondary,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Kapat
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <SectionTitle t={t} color={t.accent} icon="shield">
        YÖNETİCİ PANELİ ({active.length})
      </SectionTitle>
      <div style={{ margin: '8px 12px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, overflow: 'hidden' }}>
        {active.length === 0 ? (
          <div style={{ padding: 14, color: t.textSecondary, fontSize: 13, textAlign: 'center' }}>Çıkarılacak kullanıcı yok.</div>
        ) : (
          active.map((u) => row(u, false))
        )}
      </div>
      {removed.length ? (
        <>
          <SectionTitle t={t} color={t.error}>
            ÇIKARILANLAR ({removed.length})
          </SectionTitle>
          <div
            style={{ margin: '8px 12px 12px', background: t.bg, border: `1px solid ${t.divider}`, borderRadius: 15, overflow: 'hidden' }}
          >
            {removed.map((u) => row(u, true))}
          </div>
        </>
      ) : null}
    </>
  );
}
