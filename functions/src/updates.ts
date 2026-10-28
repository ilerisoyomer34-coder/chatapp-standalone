// Çok yollu update(): aynı güncellemede bir yol ile onun alt yolu birlikte olamaz.
// Üst yol zaten yazılıyorsa (ör. silme) alt yolları at.
export type Updates = Record<string, unknown>;

export function normalizeUpdates(updates: Updates): Updates {
  const keys = new Set(Object.keys(updates));
  const out: Updates = {};
  for (const key of keys) {
    const parts = key.split('/');
    let covered = false;
    for (let i = 1; i < parts.length && !covered; i++) covered = keys.has(parts.slice(0, i).join('/'));
    if (!covered) out[key] = updates[key];
  }
  return out;
}
