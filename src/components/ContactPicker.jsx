import { useState } from 'react';
import { Avatar } from './ui.jsx';

// Bire bir sohbet ettiğin kişilerden seçim (grup kurma / üye ekleme).
export default function ContactPicker({ t, contacts, selected, onToggle, max, emptyText }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLocaleLowerCase('tr-TR');
  const list = contacts.filter((c) => !needle || `${c.name} ${c.username || ''}`.toLocaleLowerCase('tr-TR').includes(needle));
  return (
    <div>
      <div style={{ padding: '10px 14px 4px' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kişi ara…" aria-label="Kişi ara" style={{ width: '100%', height: 40, borderRadius: 10, border: `1.5px solid ${t.divider}`, background: t.surface, color: t.textPrimary, padding: '0 12px', fontSize: 15, outline: 'none' }} />
      </div>
      <div role="listbox" aria-multiselectable="true">
        {list.map((c) => {
          const on = selected.includes(c.uid);
          const full = !on && max && selected.length >= max;
          return (
            <button
              key={c.uid}
              type="button"
              role="option"
              aria-selected={on}
              disabled={full}
              onClick={() => onToggle(c.uid)}
              className="cx-row"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', border: 'none', background: on ? t.surface : 'transparent', color: t.textPrimary, textAlign: 'left', opacity: full ? 0.5 : 1 }}
            >
              <Avatar name={c.name} uid={c.uid} color={c.color} photoURL={c.photoURL} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                {c.username ? <span style={{ display: 'block', fontSize: 12.5, color: t.textSecondary }}>@{c.username}</span> : null}
              </span>
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${on ? t.accent : t.divider}`, background: on ? t.accent : 'transparent', color: '#fff', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on ? '✓' : ''}
              </span>
            </button>
          );
        })}
        {!list.length ? <div style={{ padding: 20, textAlign: 'center', color: t.textSecondary, fontSize: 13.5, lineHeight: 1.5 }}>{emptyText || 'Kişi bulunamadı.'}</div> : null}
      </div>
    </div>
  );
}
