import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';
import { DialogHost } from './components/dialogs.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import { useDbValue } from './hooks/data.js';
import { claimUsernameAndCreateProfile, logout } from './lib/api.js';
import { cacheClear } from './lib/cache.js';
import { friendlyError } from './lib/errors.js';
import { Icon } from './lib/icons.jsx';
import { removePushToken, setAppBadge } from './lib/push.js';
import { tokensFor, useThemeMode } from './lib/theme.js';
import AuthScreen from './screens/AuthScreen.jsx';
import Main from './screens/Main.jsx';
import UsernameSetup from './screens/UsernameSetup.jsx';

function useWindowWidth() {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

function Splash({ t, text }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: t.primary,
        color: '#fff',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 21,
          background: 'rgba(255,255,255,.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'popIn .5s ease',
        }}
      >
        <Icon name="messageCircle" size={38} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.3 }}>ChatApp</div>
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
        <span className="cx-spinner" aria-hidden="true" style={{ width: 14, height: 14, borderWidth: 2 }} />
        {text}
      </div>
    </div>
  );
}

export default function App() {
  const theme = useThemeMode();
  const t = tokensFor(theme.mode);
  const desktop = useWindowWidth() >= 860;

  const [user, setUser] = useState(undefined); // undefined: bilinmiyor, null: çıkış yapılmış
  const [registering, setRegistering] = useState(null); // { name, username, error? }
  const [notice, setNotice] = useState('');
  const cleanupRef = useRef(null); // Main oturum temizliği (presence vb.)

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u || null)), []);

  const uid = user ? user.uid : null;
  // Önbellekli: uygulama internetsiz açıldığında da son profil ile sohbet listesi görünür.
  const profile = useDbValue(uid ? `users/${uid}` : null, { cache: true });
  const admin = useDbValue(uid ? `admins/${uid}` : null, { cache: true });

  const signOutEverywhere = useCallback(async (message) => {
    const current = auth.currentUser;
    try {
      if (current) await removePushToken(current.uid);
      if (cleanupRef.current) await cleanupRef.current();
    } catch (err) {
      console.warn('[ChatApp] çıkış temizliği', err);
    }
    cleanupRef.current = null;
    await setAppBadge(0);
    // Çevrimdışı önbellek (sohbetler, mesajlar) bu cihazda bırakılmaz.
    await cacheClear();
    await logout().catch((err) => console.error('[ChatApp] çıkış', err));
    setRegistering(null);
    setNotice(message || '');
  }, []);

  // Yönetici hesabı devre dışı bıraktığında açık oturum anında kapanır.
  const disabled = profile.value && profile.value.disabled === true;
  useEffect(() => {
    if (disabled) signOutEverywhere('Hesabın yönetici tarafından devre dışı bırakıldı.');
  }, [disabled, signOutEverywhere]);

  const registerCleanup = useCallback((fn) => {
    cleanupRef.current = fn;
  }, []);

  // Kayıt: hesap açıldıktan sonra kullanıcı adı transaction ile alınır ve profil yazılır.
  // Ad alınmışsa hesap kalır ve "Profilini tamamla" ekranı açılır.
  const handleRegistered = useCallback(async (newUid, pending) => {
    try {
      await claimUsernameAndCreateProfile(newUid, pending);
      setRegistering(null);
    } catch (error) {
      const msg =
        error.code === 'username-taken' ? 'Bu kullanıcı adı alınmış. Başka bir ad dene.' : friendlyError(error, 'profil oluşturma');
      setRegistering({ ...pending, error: msg, failed: true });
    }
  }, []);

  let body;
  if (user === undefined) {
    body = <Splash t={t} text="Bağlanıyor…" />;
  } else if (!user) {
    body = (
      <AuthScreen
        t={t}
        desktop={desktop}
        notice={notice}
        onRegistering={(data) => {
          setNotice('');
          setRegistering(data);
        }}
        onRegistered={handleRegistered}
      />
    );
  } else if (profile.loading && profile.value === undefined) {
    body = <Splash t={t} text="Hesabın yükleniyor…" />;
  } else if (registering && !registering.failed && !(profile.value && profile.value.username)) {
    body = <Splash t={t} text="Hesabın oluşturuluyor…" />;
  } else if (disabled) {
    body = <Splash t={t} text="Çıkış yapılıyor…" />;
  } else if (!profile.value || !profile.value.username) {
    body = <UsernameSetup t={t} uid={user.uid} initial={registering} onLogout={() => signOutEverywhere()} />;
  } else {
    body = (
      <Main
        t={t}
        theme={theme}
        desktop={desktop}
        user={user}
        me={{ uid: user.uid, ...profile.value }}
        isAdmin={admin.value === true}
        onLogout={() => signOutEverywhere()}
        onAccountDeleted={() => signOutEverywhere('Hesabın ve verilerin silindi.')}
        registerCleanup={registerCleanup}
      />
    );
  }

  return (
    <main className="app-root" style={{ background: t.canvas, color: t.textPrimary }}>
      {body}
      <UpdateBanner t={t} />
      <DialogHost t={t} />
    </main>
  );
}
