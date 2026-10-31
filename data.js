'use strict';
// ---------- catalog ----------
const SKINS = [
  { name: 'Classic', body: '#ffffff', cost: 0 },
  { name: 'Pumpkin', body: '#ff9a3d', cost: 120 },
  { name: 'Slime', body: '#a6e36b', cost: 180 },
  { name: 'Bubblegum', body: '#ff9fc8', cost: 220 },
  { name: 'Grape', body: '#b48ae0', cost: 280 },
  { name: 'Frost', body: '#9fe3f0', cost: 320 },
  { name: 'Gold', body: '#ffd34d', cost: 600 },
  { name: 'Rainbow', body: 'rainbow', cost: 1000 },
];
const HATS = [
  { id: 'none', name: 'Bare', cost: 0 },
  { id: 'pumpkin', name: 'Pumpkin', cost: 0 },
  { id: 'bow', name: 'Bow', cost: 100 },
  { id: 'witch', name: 'Witch Hat', cost: 150 },
  { id: 'tophat', name: 'Top Hat', cost: 200 },
  { id: 'horns', name: 'Devil Horns', cost: 250 },
  { id: 'headphones', name: 'Headphones', cost: 300 },
  { id: 'halo', name: 'Halo', cost: 400 },
  { id: 'crown', name: 'Crown', cost: 600 },
];
const EMOTES = [
  { id: 'happy', emoji: '😄', name: 'Happy', cost: 0 },
  { id: 'angry', emoji: '😠', name: 'Angry', cost: 0 },
  { id: 'scared', emoji: '😱', name: 'Scared', cost: 0 },
  { id: 'cheeky', emoji: '😜', name: 'Cheeky', cost: 100 },
  { id: 'love', emoji: '😍', name: 'Love', cost: 150 },
  { id: 'dizzy', emoji: '😵', name: 'Dizzy', cost: 200 },
  { id: 'cool', emoji: '😎', name: 'Cool', cost: 250 },
];
const UPG = [
  { key: 'speed', name: 'Zoom', desc: '+6% speed', icon: '💨' },
  { key: 'magnet', name: 'Magnet', desc: 'Pull candy', icon: '🧲' },
  { key: 'size', name: 'Big Start', desc: '+8 start mass', icon: '🍰' },
  { key: 'dash', name: 'Quick Dash', desc: '-12% dash cooldown', icon: '⚡' },
];
const MAXLV = 5;
const upgCost = lv => Math.round(40 * Math.pow(lv + 1, 1.5));

// ---------- XP, levels & rank tiers ----------
const TIERS = [
  { name: 'Bronze', from: 1, icon: '🥉', color: '#c7793b' },
  { name: 'Silver', from: 5, icon: '🥈', color: '#9aa4ad' },
  { name: 'Gold', from: 10, icon: '🥇', color: '#e0a800' },
  { name: 'Platinum', from: 20, icon: '💠', color: '#3fb8b0' },
  { name: 'Diamond', from: 30, icon: '💎', color: '#4a8cff' },
  { name: 'Master', from: 40, icon: '👑', color: '#8e44d6' },
  { name: 'Legend', from: 50, icon: '🔥', color: '#ff4f1f' },
];
const xpForNext = lvl => 100 + (lvl - 1) * 50; // XP to go from lvl to lvl+1
function levelInfo(xp) {
  let lvl = 1, left = Math.max(0, xp | 0);
  while (left >= xpForNext(lvl)) { left -= xpForNext(lvl); lvl++; }
  return { lvl, into: left, need: xpForNext(lvl), tier: tierOf(lvl) };
}
function tierOf(lvl) { let t = TIERS[0]; for (const x of TIERS) if (lvl >= x.from) t = x; return t; }
// bots get a believable spread of levels so the arena mixes ranks
const botLevel = () => Math.max(1, Math.round(Math.pow(Math.random(), 1.8) * 52) + 1);

// ---------- save ----------
const SAVE_KEY = 'boogobble_v1';
const save = {
  candy: 0, best: 0, lv: { speed: 0, magnet: 0, size: 0, dash: 0 }, skins: [0], skin: 0,
  hats: [0, 1], hat: 1, emotes: ['happy', 'angry', 'scared'], name: '', xp: 0,
  day: '', streak: 0, runs: 0, muted: false,
};
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
  Object.assign(save, s); save.lv = Object.assign({ speed: 0, magnet: 0, size: 0, dash: 0 }, s.lv || {});
} catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

// ---------- audio ----------
let ac = null;
function blip(f, d = 0.08, type = 'sine', vol = 0.06, slide = 1.6) {
  if (save.muted || (typeof adPlaying !== "undefined" && adPlaying)) return;
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * slide, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) {}
}
['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (ac && ac.state === 'suspended') ac.resume(); }));

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
