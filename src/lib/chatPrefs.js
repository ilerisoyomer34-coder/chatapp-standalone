// Sessize alma seçenekleri: 8 saat / 1 hafta / her zaman (userChats/{uid}/{chatId}/muted).
const HOUR = 3600 * 1000;

export function muteItems(onPick) {
  return [
    { label: '8 saat', icon: 'clock', onClick: () => onPick(Date.now() + 8 * HOUR) },
    { label: '1 hafta', icon: 'clock', onClick: () => onPick(Date.now() + 7 * 24 * HOUR) },
    { label: 'Her zaman', icon: 'bellOff', onClick: () => onPick(true) },
  ];
}

export const isMuted = (m) => m === true || (typeof m === 'number' && m > Date.now());

export const MAX_PINNED = 3;
