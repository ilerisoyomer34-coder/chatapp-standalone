import { describe, expect, it } from 'vitest';
import { displayNameError, normalizeUsername, passwordError, usernameError } from './username.js';

describe('normalizeUsername', () => {
  it('Türkçe harfleri ASCII karşılığına çevirir', () => {
    expect(normalizeUsername('Ömer İlerisoy')).toBe('omer_ilerisoy');
    expect(normalizeUsername('ÇAĞRI_Şükrü')).toBe('cagri_sukru');
    expect(normalizeUsername('IŞIK')).toBe('isik');
  });
  it('geçersiz karakterleri atar', () => {
    expect(normalizeUsername('  ali.veli-42! ')).toBe('aliveli42');
  });
});

describe('doğrulama', () => {
  it('kullanıcı adı 3-20 karakter', () => {
    expect(usernameError('ab')).toBeTruthy();
    expect(usernameError('abc')).toBeNull();
    expect(usernameError('a'.repeat(21))).toBeTruthy();
  });
  it('görünen ad en fazla 40 karakter', () => {
    expect(displayNameError('x'.repeat(41))).toBeTruthy();
    expect(displayNameError('Ömer İlerisoy')).toBeNull();
  });
  it('şifre en az 8 karakter', () => {
    expect(passwordError('1234567')).toBeTruthy();
    expect(passwordError('12345678')).toBeNull();
  });
});
