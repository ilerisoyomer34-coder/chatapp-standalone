import { useState } from 'react';
import { ErrorLine, Field, PrimaryButton } from '../components/ui.jsx';
import { claimUsernameAndCreateProfile } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import { displayNameError, NAME_MAX, normalizeUsername, USERNAME_MAX, usernameError } from '../lib/username.js';

// Hesap var ama profil/kullanıcı adı yoksa (ör. seçilen ad kayıt sırasında alınmışsa) gösterilir.
export default function UsernameSetup({ t, uid, initial, onLogout }) {
  const [name, setName] = useState(initial?.name || '');
  const [username, setUsername] = useState(initial?.username || '');
  const [err, setErr] = useState(initial?.error || '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const v = displayNameError(name) || usernameError(username);
    if (v) return setErr(v);
    setBusy(true);
    setErr('');
    try {
      await claimUsernameAndCreateProfile(uid, { username, name });
    } catch (error) {
      setErr(error.code === 'username-taken' ? 'Bu kullanıcı adı alınmış. Başka bir ad dene.' : friendlyError(error, 'profil oluşturma'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="cx-scroll"
      style={{
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        overflowY: 'auto',
        background: t.canvas,
        padding: 'max(24px, env(safe-area-inset-top)) 20px 24px',
      }}
    >
      <form onSubmit={submit} noValidate style={{ width: '100%', maxWidth: 380, margin: 'auto', animation: 'fadeUp .4s ease' }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            background: t.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            margin: '0 auto 18px',
          }}
        >
          <Icon name="user" size={30} />
        </div>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.textPrimary, textAlign: 'center' }}>Profilini tamamla</h2>
        <div style={{ fontSize: 14, color: t.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
          Arkadaşların seni kullanıcı adınla bulacak.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
          <Field
            t={t}
            id="s-name"
            label="GÖRÜNEN AD"
            icon="user"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adın Soyadın"
            maxLength={NAME_MAX}
            autoComplete="name"
          />
          <Field
            t={t}
            id="s-username"
            label="KULLANICI ADI"
            prefix="@"
            value={username}
            onChange={(e) => setUsername(normalizeUsername(e.target.value).slice(0, USERNAME_MAX))}
            placeholder="kullanici_adi"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={USERNAME_MAX}
          />
          <div style={{ fontSize: 12, color: t.textSecondary, marginTop: -6 }}>3–20 karakter; yalnızca a–z, 0–9 ve _.</div>
        </div>
        <ErrorLine t={t}>{err}</ErrorLine>
        <PrimaryButton t={t} busy={busy} style={{ marginTop: 22 }}>
          {busy ? 'Lütfen bekle…' : 'Devam et'}
        </PrimaryButton>
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={onLogout}
            className="cx-tap"
            style={{ border: 'none', background: 'none', color: t.textSecondary, fontWeight: 600, fontSize: 13.5 }}
          >
            Çıkış yap
          </button>
        </div>
      </form>
    </div>
  );
}
