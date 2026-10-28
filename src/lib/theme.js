import { useEffect, useState } from 'react';

// WhatsApp benzeri yeşil tema tokenları (eski sürümle aynı renkler).
const DARK = {
  primary: '#005C4B', accent: '#00A884', accentShadow: 'rgba(0,168,132,.4)',
  canvas: '#0B141A', bg: '#111B21', surface: '#202C33', appbarBg: '#202C33', appbarText: '#E9EDEF',
  chatBg: '#0B141A', emptyBg: '#0B141A', bubbleSent: '#005C4B', bubbleRecv: '#202C33', bubbleText: '#E9EDEF',
  systemPill: '#182229', infoPill: '#182634', infoPillText: '#8FD3C1', readTick: '#53BDEB', timeColor: '#8696A0',
  textPrimary: '#E9EDEF', textSecondary: '#8696A0', divider: '#2A3942', error: '#F76A6A', warn: '#F0B232',
  toastBg: '#E9EDEF', toastText: '#111B21', overlay: 'rgba(0,0,0,.55)',
};
const LIGHT = {
  primary: '#075E54', accent: '#25D366', accentShadow: 'rgba(37,211,102,.38)',
  canvas: '#F0F2F5', bg: '#FFFFFF', surface: '#F0F2F5', appbarBg: '#075E54', appbarText: '#FFFFFF',
  chatBg: '#EFE7DE', emptyBg: '#F7F9FA', bubbleSent: '#DCF8C6', bubbleRecv: '#FFFFFF', bubbleText: '#111B21',
  systemPill: '#FFFFFF', infoPill: '#E7F6EF', infoPillText: '#0B5E44', readTick: '#53BDEB', timeColor: '#667781',
  textPrimary: '#111B21', textSecondary: '#667781', divider: '#E9EDEF', error: '#D32F2F', warn: '#9A6700',
  toastBg: '#111B21', toastText: '#FFFFFF', overlay: 'rgba(0,0,0,.4)',
};

export const tokensFor = (mode) => (mode === 'dark' ? DARK : LIGHT);

const KEY = 'chatapp_theme';
const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function readPref() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

// Tema tercihi kaydedilir; tercih yoksa sistem teması izlenir.
export function useThemeMode() {
  const [pref, setPref] = useState(readPref);
  const [systemDark, setSystemDark] = useState(() => !!media()?.matches);

  useEffect(() => {
    const m = media();
    if (!m) return undefined;
    const onChange = (e) => setSystemDark(e.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  const mode = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tokensFor(mode).appbarBg);
    document.documentElement.style.colorScheme = mode;
    document.body.style.background = tokensFor(mode).canvas;
  }, [mode]);

  const choose = (next) => {
    setPref(next);
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* depolama kapalı olabilir */
    }
  };

  return { mode, pref, setPref: choose, toggle: () => choose(mode === 'dark' ? 'light' : 'dark') };
}
