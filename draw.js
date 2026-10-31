'use strict';
const INK = '#2b1d14';

function bodyColor(g, t) {
  const b = g.body;
  return b === 'rainbow' ? `hsl(${(t / 12) % 360} 85% 78%)` : b;
}
function heart(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 1.1, y - s * 0.45, x - s * 0.45, y - s * 1.05, x, y - s * 0.4);
  c.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.45, x, y + s * 0.35);
  c.fill();
}

// face is drawn in the ghost's local space; (lx, ly) is where the eyes look
function drawFace(c, r, mood, lx, ly, t) {
  const ex = r * 0.33, ey = -r * 0.2 + ly, my = r * 0.2 + ly;
  c.fillStyle = INK; c.strokeStyle = INK; c.lineCap = 'round'; c.lineWidth = Math.max(2, r * 0.07);
  const ovalEyes = (sx = 0.12, sy = 0.17) => { for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * ex + lx, ey, r * sx, r * sy, 0, 0, 6.28); c.fill(); } };
  const shine = () => { c.fillStyle = '#fff'; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * ex + lx - r * 0.04, ey - r * 0.06, r * 0.04, 0, 6.28); c.fill(); } c.fillStyle = INK; };
  const blush = () => { c.fillStyle = 'rgba(255,110,140,.45)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * r * 0.55 + lx, r * 0.05 + ly, r * 0.12, r * 0.07, 0, 0, 6.28); c.fill(); } c.fillStyle = INK; };
  const smile = (w = 0.22) => {
    c.beginPath(); c.arc(lx, my - r * 0.06, r * w, 0.1, Math.PI - 0.1); c.closePath(); c.fill();
    c.fillStyle = '#ff7d9a'; c.beginPath(); c.ellipse(lx, my + r * 0.1, r * w * 0.5, r * 0.06, 0, 0, 6.28); c.fill(); c.fillStyle = INK;
  };
  switch (mood) {
    case 'happy':
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * ex + lx, ey + r * 0.06, r * 0.12, Math.PI + 0.2, -0.2); c.stroke(); }
      smile(); blush(); break;
    case 'angry':
      ovalEyes(0.11, 0.13);
      c.lineWidth = Math.max(2.5, r * 0.09);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.52 + lx, ey - r * 0.27); c.lineTo(s * r * 0.15 + lx, ey - r * 0.13); c.stroke(); }
      c.beginPath(); c.arc(lx, my + r * 0.14, r * 0.16, Math.PI * 1.15, Math.PI * 1.85); c.stroke(); break;
    case 'scared': {
      for (const s of [-1, 1]) {
        c.fillStyle = '#fff'; c.beginPath(); c.arc(s * ex + lx, ey, r * 0.15, 0, 6.28); c.fill(); c.stroke();
        c.fillStyle = INK; c.beginPath(); c.arc(s * ex + lx * 1.6 + Math.sin(t / 40) * r * 0.02, ey + ly * 0.5, r * 0.05, 0, 6.28); c.fill();
      }
      c.beginPath(); c.ellipse(lx, my + r * 0.04, r * 0.09, r * 0.13, 0, 0, 6.28); c.fill();
      c.fillStyle = '#6fc7ff'; c.beginPath(); c.ellipse(r * 0.62, -r * 0.48, r * 0.07, r * 0.11, 0, 0, 6.28); c.fill(); c.fillStyle = INK;
      break;
    }
    case 'cheeky':
      c.beginPath(); c.arc(-ex + lx, ey + r * 0.02, r * 0.11, 0.2, Math.PI - 0.2); c.stroke();
      c.beginPath(); c.ellipse(ex + lx, ey, r * 0.12, r * 0.17, 0, 0, 6.28); c.fill();
      c.beginPath(); c.arc(lx, my - r * 0.04, r * 0.18, 0.15, Math.PI - 0.15); c.stroke();
      c.fillStyle = '#ff7d9a'; c.beginPath(); c.ellipse(lx + r * 0.05, my + r * 0.16, r * 0.09, r * 0.12, 0, 0, 6.28); c.fill(); c.stroke(); c.fillStyle = INK;
      blush(); break;
    case 'love': {
      const p = 1 + Math.sin(t / 120) * 0.12;
      c.fillStyle = '#ff3d6e'; for (const s of [-1, 1]) heart(c, s * ex + lx, ey + r * 0.04, r * 0.17 * p);
      c.fillStyle = INK; smile(0.18); blush(); break;
    }
    case 'dizzy':
      for (const s of [-1, 1]) {
        c.beginPath();
        for (let a = 0; a < 12; a += 0.4) { const rr = r * 0.012 * a, px = s * ex + lx + Math.cos(a + t / 150) * rr, py = ey + Math.sin(a + t / 150) * rr; a ? c.lineTo(px, py) : c.moveTo(px, py); }
        c.lineWidth = Math.max(1.5, r * 0.045); c.stroke();
      }
      c.lineWidth = Math.max(2, r * 0.06); c.beginPath();
      for (let i = 0; i <= 8; i++) { const px = lx - r * 0.2 + i * r * 0.05, py = my + Math.sin(i * 1.6 + t / 90) * r * 0.04; i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke(); break;
    case 'cool':
      c.beginPath(); c.roundRect(-r * 0.58 + lx, ey - r * 0.13, r * 0.5, r * 0.26, r * 0.1); c.roundRect(r * 0.08 + lx, ey - r * 0.13, r * 0.5, r * 0.26, r * 0.1); c.fill();
      c.fillRect(-r * 0.1 + lx, ey - r * 0.08, r * 0.2, r * 0.06);
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = Math.max(1.5, r * 0.04);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * r * 0.45 + lx, ey - r * 0.06); c.lineTo(s * r * 0.36 + lx, ey + r * 0.04); c.stroke(); }
      c.strokeStyle = INK; c.lineWidth = Math.max(2, r * 0.07);
      c.beginPath(); c.moveTo(lx - r * 0.12, my + r * 0.02); c.quadraticCurveTo(lx + r * 0.05, my + r * 0.08, lx + r * 0.18, my - r * 0.04); c.stroke(); break;
    default: // neutral, mouth opens while dashing
      ovalEyes(); shine();
      c.beginPath(); c.ellipse(lx, my - r * 0.02, r * 0.12, r * (mood === 'chomp' ? 0.17 : 0.07), 0, 0, 6.28); c.fill();
  }
}

function drawHat(c, r, id, t) {
  c.strokeStyle = INK; c.lineWidth = Math.max(2, r * 0.07); c.lineJoin = 'round';
  const top = -r * 1.08;
  switch (id) {
    case 'pumpkin':
      c.fillStyle = '#ff6a1f'; c.beginPath(); c.ellipse(0, top - r * 0.06, r * 0.32, r * 0.22, 0, 0, 6.28); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(0, top - r * 0.26); c.lineTo(0, top + r * 0.14); c.stroke();
      c.fillStyle = '#3f8f2a'; c.fillRect(-r * 0.04, top - r * 0.4, r * 0.08, r * 0.14); break;
    case 'bow':
      c.fillStyle = '#ff4f8b';
      c.save(); c.translate(r * 0.45, top + r * 0.2); c.rotate(0.35);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-r * 0.3, -r * 0.18); c.lineTo(-r * 0.3, r * 0.18); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.3, -r * 0.18); c.lineTo(r * 0.3, r * 0.18); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.08, 0, 6.28); c.fill(); c.stroke(); c.restore(); break;
    case 'witch':
      c.fillStyle = '#5b2a86';
      c.beginPath(); c.moveTo(-r * 0.5, top + r * 0.12); c.quadraticCurveTo(-r * 0.05, top - r * 0.5, r * 0.32, top - r * 0.95);
      c.quadraticCurveTo(r * 0.2, top - r * 0.4, r * 0.5, top + r * 0.12); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, top + r * 0.14, r * 0.8, r * 0.13, 0, 0, 6.28); c.fill(); c.stroke();
      c.fillStyle = '#ff6a1f'; c.fillRect(-r * 0.4, top - r * 0.06, r * 0.8, r * 0.1); break;
    case 'tophat':
      c.fillStyle = '#3a2a20';
      c.beginPath(); c.roundRect(-r * 0.34, top - r * 0.6, r * 0.68, r * 0.7, r * 0.05); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, top + r * 0.1, r * 0.6, r * 0.1, 0, 0, 6.28); c.fill(); c.stroke();
      c.fillStyle = '#ff6a1f'; c.fillRect(-r * 0.32, top - r * 0.08, r * 0.64, r * 0.12); break;
    case 'horns':
      c.fillStyle = '#e8352f';
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * r * 0.25, top + r * 0.22); c.quadraticCurveTo(s * r * 0.5, top - r * 0.1, s * r * 0.62, top - r * 0.38);
        c.quadraticCurveTo(s * r * 0.62, top + r * 0.05, s * r * 0.55, top + r * 0.36); c.closePath(); c.fill(); c.stroke();
      }
      break;
    case 'headphones':
      c.lineWidth = Math.max(3, r * 0.13); c.beginPath(); c.arc(0, -r * 0.15, r * 1.04, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.lineWidth = Math.max(2, r * 0.07); c.fillStyle = '#ff6a1f';
      for (const s of [-1, 1]) { c.beginPath(); c.roundRect(s * r * 1.02 - r * 0.15, -r * 0.42, r * 0.3, r * 0.45, r * 0.12); c.fill(); c.stroke(); }
      break;
    case 'halo': {
      const b = Math.sin(t / 300) * r * 0.06;
      c.strokeStyle = '#ffc23d'; c.lineWidth = Math.max(3, r * 0.11);
      c.beginPath(); c.ellipse(0, top - r * 0.22 + b, r * 0.45, r * 0.12, 0, 0, 6.28); c.stroke();
      c.strokeStyle = 'rgba(43,29,20,.5)'; c.lineWidth = 1.5; c.stroke(); break;
    }
    case 'crown':
      c.fillStyle = '#ffc23d'; c.beginPath();
      c.moveTo(-r * 0.42, top + r * 0.16); c.lineTo(-r * 0.46, top - r * 0.3); c.lineTo(-r * 0.22, top - r * 0.08); c.lineTo(0, top - r * 0.4);
      c.lineTo(r * 0.22, top - r * 0.08); c.lineTo(r * 0.46, top - r * 0.3); c.lineTo(r * 0.42, top + r * 0.16); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff3d6e'; c.beginPath(); c.arc(0, top - r * 0.02, r * 0.07, 0, 6.28); c.fill();
      c.fillStyle = '#2bb3c0'; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * r * 0.26, top + r * 0.04, r * 0.05, 0, 6.28); c.fill(); }
      break;
  }
}

// g: { r, body, hat, mood, wob, vx, vy }; drawn at the current origin
function drawGhostShape(c, g, t) {
  const r = g.r;
  c.save();
  c.rotate(Math.max(-0.25, Math.min(0.25, (g.vx || 0) / 1400)));
  c.beginPath(); c.arc(0, -r * 0.1, r, Math.PI, 0);
  const waves = 4, bottom = r * 0.95; c.lineTo(r, bottom);
  for (let i = waves; i > 0; i--) {
    const w = Math.sin(g.wob * 2 + i) * r * 0.08;
    c.quadraticCurveTo(r - (2 * r / waves) * (waves - i + 0.5), bottom - r * 0.28 + w, r - (2 * r / waves) * (waves - i + 1), bottom);
  }
  c.closePath();
  c.fillStyle = bodyColor(g, t); c.fill();
  c.lineWidth = Math.max(3, r * 0.09); c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
  const sp = Math.hypot(g.vx || 0, g.vy || 0) || 1;
  const lx = (g.vx || 0) / sp * r * 0.08, ly = (g.vy || 0) / sp * r * 0.08;
  drawFace(c, r, g.mood || 'neutral', lx, ly, t);
  if (g.hat) drawHat(c, r, HATS[g.hat].id, t);
  c.restore();
}

// static thumbnail for shop cards and the home preview
function paintThumb(cnv, opts, t = 0) {
  const c = cnv.getContext('2d'), s = cnv.width;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, s, s);
  c.translate(s / 2, s * 0.58);
  drawGhostShape(c, Object.assign({ r: s * 0.28, wob: t / 300, vx: 0, vy: 0 }, opts), t);
}
