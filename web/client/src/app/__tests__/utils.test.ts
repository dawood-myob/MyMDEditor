import { describe, expect, it } from 'vitest';
import { destinationFor, safeNext } from '../nav';
import { generatePassword, initials, passwordStrength, slugify } from '../utils';

describe('safeNext', () => {
  it('accepts same-origin paths only', () => {
    expect(safeNext('/d/abc?x=1')).toBe('/d/abc?x=1');
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
    expect(safeNext('/login')).toBeNull();
    expect(safeNext('/change-password?next=/')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe('destinationFor', () => {
  it('routes by role and honours ?next when allowed', () => {
    expect(destinationFor({ role: 'editor', mustChangePassword: false }, '/d/1')).toBe('/d/1');
    expect(destinationFor({ role: 'editor', mustChangePassword: false }, '/platform')).toBe('/');
    expect(destinationFor({ role: 'superadmin', mustChangePassword: false }, '/d/1')).toBe('/platform');
    expect(destinationFor({ role: 'superadmin', mustChangePassword: false }, '/platform/companies/x')).toBe('/platform/companies/x');
    expect(destinationFor({ role: 'admin', mustChangePassword: false }, null)).toBe('/');
    expect(destinationFor({ role: 'superadmin', mustChangePassword: false }, null)).toBe('/platform');
    expect(destinationFor({ role: 'admin', mustChangePassword: true }, '/d/1')).toBe('/change-password?next=%2Fd%2F1');
  });
});

describe('password helpers', () => {
  it('generates distinct passwords that satisfy the policy', () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(a).toMatch(/[a-z]/);
    expect(a).toMatch(/[A-Z]/);
    expect(a).toMatch(/\d/);
    expect(passwordStrength(a).score).toBeGreaterThanOrEqual(3);
  });

  it('rates short passwords as too short', () => {
    expect(passwordStrength('abc').label).toBe('Too short');
    expect(passwordStrength('').score).toBe(0);
  });
});

describe('formatting helpers', () => {
  it('derives initials', () => {
    expect(initials('Jane Doe')).toBe('JD');
    expect(initials('madonna')).toBe('MA');
    expect(initials('acme-admin')).toBe('AA');
    expect(initials('')).toBe('?');
  });

  it('suggests slugs from company names', () => {
    expect(slugify('Acme Corp.')).toBe('acme-corp');
    expect(slugify('  Zürich & Söhne GmbH ')).toBe('zurich-sohne-gmbh');
    expect(slugify('!!!')).toBe('');
  });
});
