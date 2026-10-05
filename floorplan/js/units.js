'use strict';
// All internal lengths are inches. units: 0 = feet & inches, 1 = metric.

function formatLength(inches, units = 0) {
  if (units === 1) {
    const m = inches * 0.0254;
    if (Math.abs(m) < 1) return Math.round(m * 1000) + ' mm';
    return m.toFixed(2) + ' m';
  }
  const neg = inches < 0;
  const q = Math.round(Math.abs(inches) * 4);
  const ft = Math.floor(q / 48), rem = q % 48, inch = Math.floor(rem / 4), frac = rem % 4;
  const fs = ['', ' 1/4', ' 1/2', ' 3/4'][frac];
  const s = neg ? '-' : '';
  return ft === 0 ? `${s}${inch}${fs}"` : `${s}${ft}'-${inch}${fs}"`;
}

function formatArea(sq, units = 0) {
  return units === 1 ? (sq * 0.00064516).toFixed(1) + ' m²' : Math.round(sq / 144) + ' sq ft';
}
function formatAreaShort(sq, units = 0) {
  return units === 1 ? (sq * 0.00064516).toFixed(1) + ' m²' : Math.round(sq / 144) + ' SF';
}

function parseNum(t) {
  t = t.trim();
  if (!t) return null;
  const i = t.indexOf('/');
  if (i > 0) {
    const a = parseFloat(t.slice(0, i)), b = parseFloat(t.slice(i + 1));
    if (!isFinite(a) || !isFinite(b) || b === 0) return null;
    return a / b;
  }
  if (!/^[0-9]*\.?[0-9]+$|^[0-9]+\.$/.test(t)) return null;
  return parseFloat(t);
}

function parseInchTokens(s) {
  const toks = s.trim().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const t of toks) {
    const v = parseNum(t);
    if (v === null) return null;
    total += v;
  }
  return total;
}

// Accepts 12'6"  12' 6 1/2"  12'-6"  12.5'  150"  150in  12 6  12-6  12  3.5m  350cm  3500mm
// A bare number is feet (or meters) unless bareInches (then inches / cm).
function parseLength(input, units = 0, bareInches = false) {
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  let neg = false;
  if (s[0] === '-') { neg = true; s = s.slice(1).trim(); }
  let r = null;
  if (s.endsWith('mm')) { const v = parseNum(s.slice(0, -2)); r = v === null ? null : v / 25.4; }
  else if (s.endsWith('cm')) { const v = parseNum(s.slice(0, -2)); r = v === null ? null : v / 2.54; }
  else if (s.endsWith('m')) { const v = parseNum(s.slice(0, -1)); r = v === null ? null : v * 39.37008; }
  else if (s.includes("'")) {
    const i = s.indexOf("'");
    const ft = parseNum(s.slice(0, i));
    let rest = s.slice(i + 1).replace(/"/g, ' ').replace(/in/g, ' ').trim();
    if (rest[0] === '-') rest = rest.slice(1);
    const inch = rest.trim() ? parseInchTokens(rest) : 0;
    r = ft === null || inch === null ? null : ft * 12 + inch;
  } else if (s.endsWith('"')) r = parseInchTokens(s.slice(0, -1));
  else if (s.endsWith('in')) r = parseInchTokens(s.slice(0, -2));
  else if (units === 1) {
    const v = parseNum(s);
    r = v === null ? null : (bareInches ? v / 2.54 : v * 39.37008);
  } else if (bareInches) r = parseInchTokens(s);
  else {
    const toks = s.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
    let ft = 0, inch = 0;
    for (let i = 0; i < toks.length; i++) {
      const v = parseNum(toks[i]);
      if (v === null) return null;
      if (i === 0) ft = v; else inch += v;
    }
    r = toks.length ? ft * 12 + inch : null;
  }
  if (r === null || !isFinite(r)) return null;
  return neg ? -r : r;
}
