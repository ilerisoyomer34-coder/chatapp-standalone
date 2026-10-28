import { useState } from 'react';
import { ErrorLine, Field, PrimaryButton } from '../components/ui.jsx';
import { login, register, resetPassword } from '../lib/api.js';
import { friendlyError } from '../lib/errors.js';
import { Icon } from '../lib/icons.jsx';
import {
  displayNameError,
  emailError,
  NAME_MAX,
  normalizeUsername,
  passwordError,
  USERNAME_MAX,
  usernameError,
} from '../lib/username.js';

const NOTICE_KEY = 'chatapp_v2_notice_closed';

function MigrationNotice({ t }) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(NOTICE_KEY) !== '1';
    } catch {
      return true;
    }
  });
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(NOTICE_KEY, '1');
    } catch {
      /* yok say */
    }
  };
  return (
    <div style={{ marginBottom: 22, background: t.infoPill, color: t.infoPillText, borderRadius: 13, padding: '12px 14px', fontSize: 13, lineHeight: 1.5, display: 'flex', gap: 10 }}>
      <Icon name="info" size={18} style={{ marginTop: 1 }} />
      <div style={{ flex: 1 }}>
        <b>Yeni sürüme geçtik.</b> Güvenliğin için hesap sistemi yenilendi; eski hesaplar artık kullanılamıyor. Lütfen e-posta adresinle <b>yeniden kayıt ol</b>.
      </div>
      <button type="button" onClick={close} aria-label="Duyuruyu kapat" className="cx-tap" style={{ border: 'none', background: 'none', color: 'inherit', padding: 0, alignSelf: 'flex-start' }}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

export default function AuthScreen({ t, desktop, onRegistering, onRegistered, notice }) {
  const [mode, setMode] = useState('login'); // login | register | forgot
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const set = (k) => (e) => {
    const v = k === 'username' ? normalizeUsername(e.target.value).slice(0, USERNAME_MAX) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const switchMode = (m) => {
    setMode(m);
    setErr('');
    setInfo('');
  };

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setInfo('');
    const email = form.email.trim();
    const v =
      emailError(email) ||
      (isForgot ? null : passwordError(form.password)) ||
      (isRegister ? displayNameError(form.name) || usernameError(form.username) : null);
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    try {
      if (isForgot) {
        await resetPassword(email);
        setInfo('Bu e-posta adresiyle bir hesap varsa şifre sıfırlama bağlantısı gönderildi. Gelen kutunu (ve gereksiz klasörünü) kontrol et.');
      } else if (isRegister) {
        const pending = { name: form.name.trim(), username: form.username };
        onRegistering(pending);
        const cred = await register({ email, password: form.password });
        await onRegistered(cred.user.uid, pending);
      } else {
        await login({ email, password: form.password });
      }
    } catch (error) {
      if (isRegister) onRegistering(null);
      setErr(friendlyError(error, isForgot ? 'şifre sıfırlama' : isRegister ? 'kayıt' : 'giriş'));
    } finally {
      setBusy(false);
    }
  }

  const title = isForgot ? 'Şifreni sıfırla' : isRegister ? 'Hesap oluştur' : 'Tekrar hoş geldin';
  const subtitle = isForgot
    ? 'E-posta adresini yaz, sana sıfırlama bağlantısı gönderelim.'
    : isRegister
      ? 'Bir kullanıcı adı seç ve hemen başla.'
      : 'E-posta adresin ve şifrenle giriş yap.';
  const cta = busy ? 'Lütfen bekle…' : isForgot ? 'Bağlantıyı gönder' : isRegister ? 'Üye Ol ve Başla' : 'Giriş Yap';
  const tab = (active) => ({
    flex: 1,
    height: 40,
    border: 'none',
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 700,
    background: active ? t.bg : 'transparent',
    color: active ? t.accent : t.textSecondary,
    boxShadow: active ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
  });

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {desktop ? (
        <div style={{ width: '46%', background: t.primary, color: '#fff', padding: '64px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.05)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="messageCircle" size={26} />
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.3 }}>ChatApp</span>
          </div>
          <div style={{ position: 'relative' }}>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}>
              Tanıdığın herkesle
              <br />
              rahatça konuş.
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: 'rgba(255,255,255,.82)', marginTop: 20, maxWidth: 380 }}>
              E-posta adresinle giriş yap, bir kullanıcı adı ara ve istek gönder. Karşı taraf onaylarsa sohbetiniz başlar; yeni mesajlar telefonuna bildirim olarak gelir.
            </p>
            <div style={{ display: 'flex', gap: 24, marginTop: 34, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600 }}>
                <Icon name="lock" size={20} />
                Bağlantın şifreli (HTTPS)
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 600 }}>
                <Icon name="devices" size={20} />
                Tüm cihazlarda
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', fontSize: 13, color: 'rgba(255,255,255,.6)' }}>© 2026 ChatApp · Ömer İlerisoy</div>
        </div>
      ) : null}

      <div
        className="cx-scroll"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: desktop ? 'center' : 'flex-start',
          justifyContent: 'center',
          padding: desktop ? 32 : 'max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
          background: t.canvas,
          overflowY: 'auto',
          minWidth: 0,
        }}
      >
        <form onSubmit={submit} noValidate style={{ width: '100%', maxWidth: 380, animation: 'fadeUp .4s ease', margin: desktop ? 0 : 'auto' }}>
          {!desktop ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ width: 60, height: 60, borderRadius: 18, background: t.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Icon name="messageCircle" size={32} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary }}>ChatApp</div>
            </div>
          ) : null}

          <MigrationNotice t={t} />

          {notice ? (
            <div role="alert" style={{ marginBottom: 18, background: t.surface, color: t.error, borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontWeight: 600 }}>
              {notice}
            </div>
          ) : null}

          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: t.textPrimary, letterSpacing: -0.3 }}>{title}</h2>
          <div style={{ fontSize: 14.5, color: t.textSecondary, marginTop: 8 }}>{subtitle}</div>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12.5, fontWeight: 700, color: t.accent }}>Geliştiren: Ömer İlerisoy</div>

          {!isForgot ? (
            <div role="tablist" style={{ display: 'flex', gap: 4, background: t.surface, borderRadius: 13, padding: 4, marginTop: 10 }}>
              <button type="button" role="tab" aria-selected={!isRegister} onClick={() => switchMode('login')} className="cx-tap" style={tab(!isRegister)}>
                Giriş Yap
              </button>
              <button type="button" role="tab" aria-selected={isRegister} onClick={() => switchMode('register')} className="cx-tap" style={tab(isRegister)}>
                Üye Ol
              </button>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 22 }}>
            {isRegister ? (
              <>
                <Field t={t} id="f-name" label="GÖRÜNEN AD" icon="user" value={form.name} onChange={set('name')} placeholder="Adın Soyadın" maxLength={NAME_MAX} autoComplete="name" />
                <Field
                  t={t}
                  id="f-username"
                  label="KULLANICI ADI"
                  prefix="@"
                  value={form.username}
                  onChange={set('username')}
                  placeholder="kullanici_adi"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  maxLength={USERNAME_MAX}
                />
                <div style={{ fontSize: 12, color: t.textSecondary, marginTop: -6, lineHeight: 1.45 }}>
                  3–20 karakter; yalnızca a–z, 0–9 ve _. Türkçe harfler otomatik dönüştürülür (ş → s).
                </div>
              </>
            ) : null}
            <Field t={t} id="f-email" label="E-POSTA" icon="mail" type="email" inputMode="email" value={form.email} onChange={set('email')} placeholder="ornek@eposta.com" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="email" />
            {!isForgot ? (
              <Field
                t={t}
                id="f-pass"
                label="ŞİFRE"
                icon="lock"
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder={isRegister ? 'En az 8 karakter' : '••••••••'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            ) : null}
          </div>

          {mode === 'login' ? (
            <div style={{ textAlign: 'right', marginTop: 10 }}>
              <button type="button" onClick={() => switchMode('forgot')} className="cx-tap" style={{ border: 'none', background: 'none', color: t.accent, fontWeight: 700, fontSize: 13.5, padding: 4 }}>
                Şifremi unuttum
              </button>
            </div>
          ) : null}

          <ErrorLine t={t}>{err}</ErrorLine>
          {info ? (
            <div role="status" style={{ marginTop: 14, color: t.accent, fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
              {info}
            </div>
          ) : null}

          <PrimaryButton t={t} busy={busy} style={{ marginTop: 22 }}>
            {cta}
          </PrimaryButton>

          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13.5, color: t.textSecondary }}>
            {isForgot ? (
              <button type="button" onClick={() => switchMode('login')} className="cx-tap" style={{ border: 'none', background: 'none', color: t.accent, fontWeight: 700, fontSize: 13.5 }}>
                ← Girişe dön
              </button>
            ) : (
              <>
                {isRegister ? 'Zaten hesabın var mı?' : 'Hesabın yok mu?'}{' '}
                <button type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')} className="cx-tap" style={{ border: 'none', background: 'none', color: t.accent, fontWeight: 700, fontSize: 13.5, padding: 0 }}>
                  {isRegister ? 'Giriş yap' : 'Üye ol'}
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 24, fontSize: 12, color: t.textSecondary }}>
            <Icon name="lock" size={14} />
            Bağlantın şifreli (HTTPS)
          </div>
        </form>
      </div>
    </div>
  );
}
