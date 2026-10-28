// Uygulama açıkken başka ekrandayken çalınan kısa bildirim sesi (dosya gerektirmez).
let ctx = null;

function audioContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra açar.
export function unlockAudio() {
  const c = audioContext();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function playNotificationSound() {
  const c = audioContext();
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.11;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
}
