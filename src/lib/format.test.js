import { describe, expect, it } from 'vitest';
import { dayDiff, formatDaySeparator, formatListTime, initials, messagePreview } from './format.js';

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('tarih biçimleri', () => {
  it('"Dün" takvim gününe göre hesaplanır', () => {
    const now = at(2026, 10, 28, 0, 5);
    expect(dayDiff(at(2026, 10, 27, 23, 59), now)).toBe(1);
    expect(formatListTime(at(2026, 10, 27, 23, 59), now)).toBe('Dün');
  });
  it('bugün saat gösterir', () => {
    const now = at(2026, 10, 28, 18);
    expect(formatListTime(at(2026, 10, 28, 9, 7), now)).toBe('09:07');
  });
  it('eski yıllarda ayırıcıda yıl olur', () => {
    const now = at(2026, 10, 28);
    expect(formatDaySeparator(at(2025, 3, 1), now)).toContain('2025');
    expect(formatDaySeparator(at(2026, 3, 1), now)).not.toContain('2026');
    expect(formatDaySeparator(at(2026, 10, 28), now)).toBe('Bugün');
  });
});

describe('yardımcılar', () => {
  it('baş harfler Türkçe büyük harfle', () => {
    expect(initials('ömer ilerisoy')).toBe('Öİ');
  });
  it('ek önizlemesi', () => {
    expect(messagePreview({ attachment: { type: 'image/png', name: 'a.png' } })).toBe('📷 Fotoğraf');
    expect(messagePreview({ attachment: { type: 'application/pdf', name: 'rapor.pdf' } })).toBe('📎 rapor.pdf');
    expect(messagePreview({ text: '  merhaba\n dünya ' })).toBe('merhaba dünya');
  });
});
