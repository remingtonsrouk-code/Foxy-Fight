/* Foxy Fight — generated placeholder art.
 * Every card and fighter gets a deterministic art-deco illustration built from its
 * id, style color and tag, so the game looks finished before real art exists.
 * When a card or style has an `art` value in the sheet, that image is shown on
 * top and this placeholder only appears if the image fails to load. */
(function (root) {
  'use strict';
  const CB = root.CB = root.CB || {};

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let s = seed || 1;
    return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const TAG_VAR = { opener: '--tag-opener', light: '--tag-light', heavy: '--tag-heavy', finisher: '--tag-finisher', guard: '--tag-guard', wild: '--tag-wild' };
  function tagVar(tagKey) { return `var(${TAG_VAR[tagKey] || '--tag-opener'})`; }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const CREAM = '#f3e2b8', GOLD = '#d6aa55';

  function glyph(tag, r, W, H) {
    const cx = W * 0.5, cy = H * 0.5;
    const ink = CREAM;
    switch (tag) {
      case 'opener': { // a blown kiss: concentric rings
        let s = '';
        for (let k = 3; k >= 1; k--) s += `<circle cx="${cx}" cy="${cy}" r="${k * 12}" fill="none" stroke="${ink}" stroke-width="${k === 1 ? 3.5 : 1.6}" opacity="${0.35 + 0.2 * (3 - k)}"/>`;
        return s + `<circle cx="${cx}" cy="${cy}" r="4" fill="${GOLD}"/>`;
      }
      case 'light': { // quick strikes: three speed bars
        let s = '';
        for (let k = 0; k < 3; k++) s += `<rect x="${cx - 34 + k * 14}" y="${cy - 14 + k * 11}" width="${46 - k * 8}" height="5" rx="2.5" fill="${ink}" opacity="${0.55 + k * 0.2}"/>`;
        return s;
      }
      case 'heavy': // a big square-on glove block
        return `<rect x="${cx - 24}" y="${cy - 24}" width="48" height="48" rx="6" fill="none" stroke="${GOLD}" stroke-width="2" transform="rotate(45 ${cx} ${cy})"/>
          <rect x="${cx - 15}" y="${cy - 15}" width="30" height="30" rx="4" fill="${ink}" opacity=".9" transform="rotate(45 ${cx} ${cy})"/>`;
      case 'finisher': { // a star burst
        const pts = [];
        for (let k = 0; k < 16; k++) {
          const a = (Math.PI * 2 * k) / 16 - Math.PI / 2, rr = k % 2 ? 11 : 30;
          pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(' ')}" fill="${GOLD}"/><circle cx="${cx}" cy="${cy}" r="6" fill="${CREAM}"/>`;
      }
      case 'guard': { // a deco shield
        return `<path d="M${cx} ${cy - 30} L${cx + 24} ${cy - 20} L${cx + 20} ${cy + 10} L${cx} ${cy + 28} L${cx - 20} ${cy + 10} L${cx - 24} ${cy - 20} Z" fill="none" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>
          <path d="M${cx} ${cy - 20} L${cx + 14} ${cy - 14} L${cx + 11} ${cy + 6} L${cx} ${cy + 17} L${cx - 11} ${cy + 6} L${cx - 14} ${cy - 14} Z" fill="${GOLD}" opacity=".85"/>`;
      }
      case 'wild': { // a fan of feathers
        let s = '';
        for (let k = 0; k < 5; k++) {
          const a = -50 + k * 25;
          s += `<ellipse cx="${cx}" cy="${cy - 6}" rx="6" ry="24" transform="rotate(${a} ${cx} ${cy + 18})" fill="${k % 2 ? GOLD : ink}" opacity=".85"/>`;
        }
        return s;
      }
    }
    return `<circle cx="${cx}" cy="${cy}" r="20" fill="${ink}" opacity=".7"/>`;
  }

  function rays(cx, cy, n, len, color, op, spread) {
    let s = '';
    for (let k = 0; k <= n; k++) {
      const a = Math.PI + (Math.PI * k) / n;
      const a2 = a + spread;
      s += `<path d="M${cx} ${cy} L${(cx + Math.cos(a) * len).toFixed(1)} ${(cy + Math.sin(a) * len).toFixed(1)} L${(cx + Math.cos(a2) * len).toFixed(1)} ${(cy + Math.sin(a2) * len).toFixed(1)} Z" fill="${color}" opacity="${op}"/>`;
    }
    return s;
  }

  /* Card illustration: 160 x 100, art deco poster style */
  CB.cardArtSVG = function (card, styleColor) {
    const W = 160, H = 100;
    const r = rng(hash(card.id));
    const tag = card.tagKeys[0] || '';
    const c1 = styleColor || '#8e2437';
    const c2 = tagVar(tag);
    const gid = 'g' + hash(card.id + 'x').toString(36);
    const sx = W * (0.3 + r() * 0.4);
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1012"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${gid})"/>
      ${rays(sx, H + 6, 14, 150, GOLD, 0.13, Math.PI / 30)}
      <path d="M${W / 2 - 46} ${H} V44 a46 46 0 0 1 92 0 V${H}" fill="none" stroke="${GOLD}" stroke-width="1.2" opacity=".55"/>
      <path d="M${W / 2 - 52} ${H} V44 a52 52 0 0 1 104 0 V${H}" fill="none" stroke="${GOLD}" stroke-width=".6" opacity=".4"/>
      <circle cx="${W / 2}" cy="${H / 2}" r="34" fill="#140d0e" opacity=".35"/>
      ${glyph(tag, r, W, H)}
    </svg>`;
  };

  /* Fighter emblem: deco medallion with initials */
  CB.emblemSVG = function (id, name, color, size) {
    const r = rng(hash(id));
    const S = 100;
    const gid = 'e' + hash(id + 'em').toString(36);
    const initials = String(name || '?').replace(/["“][^"”]*["”]/g, ' ').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    let spokes = '';
    const n = 24, rot = r() * 15;
    for (let k = 0; k < n; k++) {
      const a = rot + (360 * k) / n;
      spokes += `<rect x="49" y="6" width="2" height="${k % 2 ? 10 : 16}" fill="${GOLD}" opacity="${k % 2 ? 0.45 : 0.8}" transform="rotate(${a.toFixed(1)} 50 50)"/>`;
    }
    return `<svg class="emblem" viewBox="0 0 ${S} ${S}" width="${size || 64}" height="${size || 64}" role="img" aria-label="${esc(name)}">
      <defs><radialGradient id="${gid}" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="${color || '#8e2437'}"/><stop offset="1" stop-color="#140d0e"/></radialGradient></defs>
      <circle cx="50" cy="50" r="50" fill="url(#${gid})"/>
      <circle cx="50" cy="50" r="47" fill="none" stroke="${GOLD}" stroke-width="2"/>
      ${spokes}
      <circle cx="50" cy="50" r="27" fill="${CREAM}"/>
      <circle cx="50" cy="50" r="24" fill="none" stroke="${GOLD}" stroke-width="1.2"/>
      <text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-family="Limelight, 'Didot', Georgia, serif" font-size="${initials.length > 1 ? 20 : 26}" fill="#2a1416">${esc(initials)}</text>
    </svg>`;
  };

  /* End-of-fight placeholder (16:9): the winner's medallion under a spotlight, ring ropes behind */
  CB.resultArtSVG = function (id, name, color, won) {
    const W = 320, H = 180;
    const gid = 'r' + hash(id + (won ? 'w' : 'l')).toString(36);
    const medal = CB.emblemSVG(id, name, color, 92).replace('<svg class="emblem"', `<svg x="${W / 2 - 46}" y="${H / 2 - 50}"`);
    let ropes = '';
    for (let k = 0; k < 3; k++) ropes += `<rect x="0" y="${70 + k * 26}" width="${W}" height="3" fill="${k === 1 ? '#f3e2b8' : '#c8374f'}" opacity="${won ? 0.55 : 0.3}"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><radialGradient id="${gid}" cx=".5" cy="0" r="1.1"><stop offset="0" stop-color="${won ? '#f0d28c' : '#6c5a6e'}" stop-opacity="${won ? 0.55 : 0.35}"/><stop offset=".55" stop-color="#1f1416"/><stop offset="1" stop-color="#0e090a"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${gid})"/>
      ${rays(W / 2, H + 10, 18, 260, won ? GOLD : '#8a7a8c', won ? 0.14 : 0.07, Math.PI / 40)}
      ${ropes}
      <ellipse cx="${W / 2}" cy="${H - 18}" rx="90" ry="10" fill="#000" opacity=".45"/>
      ${medal}
    </svg>`;
  };

  CB.brandSVG = function () {
    return `<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      ${rays(20, 34, 8, 26, GOLD, 0.9, Math.PI / 22)}
      <circle cx="20" cy="34" r="7" fill="#c8374f"/><circle cx="20" cy="34" r="3" fill="${CREAM}"/></svg>`;
  };

  CB.artSrc = function (art) {
    if (!art) return '';
    if (/^(https?:|data:|\/|\.)/.test(art) || art.includes('/')) return art;
    return 'art/' + art;
  };
  CB.esc = esc;
})(typeof self !== 'undefined' ? self : this);
