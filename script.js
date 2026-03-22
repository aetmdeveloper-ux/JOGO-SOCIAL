/* =============================================
   MANDROID: O Guardião das Redes
   script.js — Lógica completa do jogo
   MANDROIDAPP DEVELOPER · Adão Everton Tavares Miranda
   =============================================
   Estrutura:
   1. Constantes e Configuração
   2. Gerenciamento de Assets
   3. Sistema de Áudio
   4. Sistema de Partículas
   5. Classes de Entidades
   6. Sistema de Fases
   7. Sistema de Diálogo
   8. Sistema de Missões
   9. Loop Principal
   10. Renderização
   11. HUD
   12. Input
   ============================================= */

"use strict";

// =============================================
// 1. CONSTANTES E CONFIGURAÇÃO
// =============================================

const CFG = {
  PLAYER_SPEED:       3.5,   // Velocidade base do jogador
  PLAYER_HP_MAX:      100,   // HP máximo do jogador
  PLAYER_EN_MAX:      100,   // Energia máxima
  EN_REGEN:           0.08,  // Regeneração de energia por frame
  ATTACK_COST:        8,     // Custo de energia por ataque
  ATTACK_RADIUS:      90,    // Raio do ataque
  ATTACK_DAMAGE:      20,    // Dano por ataque
  ATTACK_COOLDOWN:    400,   // Milissegundos entre ataques
  NPC_INTERACT_DIST:  80,    // Distância para interagir com NPC
  FRAGMENT_COLLECT:   55,    // Distância para coletar fragmento
  ENEMY_DAMAGE:       8,     // Dano dos inimigos ao colidir
  ENEMY_STUN:         800,   // Tempo de imunidade após dano (ms)
  CANVAS_W:           1280,
  CANVAS_H:           720,
};

// =============================================
// 2. GERENCIAMENTO DE ASSETS (IMAGENS)
// =============================================

const ASSETS = {};
const ASSET_LIST = {
  robo:   'assets/robo.png',
  face:   'assets/face.png',
  insta:  'assets/insta.png',
  whats:  'assets/whats.png',
  tiktok: 'assets/tiktok.png',
  cidade: 'assets/cidade.png',
};

/** Tenta carregar todas as imagens; falha silenciosa = usa fallback desenhado */
function loadAssets(callback) {
  let loaded = 0;
  const total = Object.keys(ASSET_LIST).length;
  for (const [key, src] of Object.entries(ASSET_LIST)) {
    const img = new Image();
    img.onload  = () => { ASSETS[key] = img; if (++loaded === total) callback(); };
    img.onerror = () => { ASSETS[key] = null;  if (++loaded === total) callback(); };
    img.src = src;
  }
}

// =============================================
// 3. SISTEMA DE ÁUDIO (Web Audio API)
// =============================================

let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

/** Toca um tom sintetizado simples */
function playTone(freq, type, duration, vol = 0.18, delay = 0) {
  try {
    ensureAudio();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + duration);
  } catch(e) {}
}

function sfxClick()    { playTone(800,'sine',0.08,0.15); playTone(1200,'sine',0.05,0.1,0.04); }
function sfxAttack()   { playTone(300,'sawtooth',0.12,0.2); playTone(150,'square',0.1,0.15,0.05); }
function sfxHit()      { playTone(180,'square',0.15,0.25); playTone(90,'sawtooth',0.1,0.2,0.05); }
function sfxCollect()  { [440,550,660].forEach((f,i)=>playTone(f,'sine',0.12,0.15,i*0.07)); }
function sfxLevelUp()  { [330,440,550,660,880].forEach((f,i)=>playTone(f,'sine',0.18,0.2,i*0.1)); }
function sfxDialogue() { playTone(660,'sine',0.07,0.1); }
function sfxEnemyDie() { playTone(200,'sawtooth',0.1,0.2); playTone(100,'square',0.1,0.15,0.06); }
function sfxBossHit()  { playTone(120,'sawtooth',0.3,0.25); playTone(60,'square',0.2,0.2,0.08); }
function sfxVictory()  { [523,659,784,1047].forEach((f,i)=>playTone(f,'sine',0.4,0.22,i*0.18)); }
function sfxGameOver() { [400,300,200,100].forEach((f,i)=>playTone(f,'sawtooth',0.3,0.2,i*0.15)); }

/** Música de fundo ambíente simples */
let bgMusicInterval = null;
function startBgMusic() {
  if (bgMusicInterval) return;
  let step = 0;
  const notes = [130,146,164,130,146,164,196,220,164,130];
  bgMusicInterval = setInterval(() => {
    playTone(notes[step % notes.length], 'sine', 0.5, 0.04);
    playTone(notes[step % notes.length] * 1.5, 'triangle', 0.5, 0.02);
    step++;
  }, 600);
}
function stopBgMusic() {
  clearInterval(bgMusicInterval);
  bgMusicInterval = null;
}

// =============================================
// 4. SISTEMA DE PARTÍCULAS
// =============================================

class Particle {
  constructor(x, y, opts = {}) {
    this.x  = x; this.y  = y;
    this.vx = (opts.vx !== undefined) ? opts.vx : (Math.random()-0.5)*4;
    this.vy = (opts.vy !== undefined) ? opts.vy : (Math.random()-0.5)*4;
    this.life    = opts.life    || 1.0;
    this.decay   = opts.decay   || 0.025;
    this.size    = opts.size    || Math.random()*4+2;
    this.color   = opts.color   || '#00f0ff';
    this.gravity = opts.gravity || 0;
    this.glow    = opts.glow    !== undefined ? opts.glow : true;
    this.shape   = opts.shape   || 'circle'; // 'circle', 'square', 'star'
  }
  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vy   += this.gravity;
    this.vx   *= 0.97;
    this.vy   *= 0.97;
    this.life -= this.decay;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life);
    if (this.glow) {
      ctx.shadowBlur  = this.size * 3;
      ctx.shadowColor = this.color;
    }
    ctx.fillStyle = this.color;
    if (this.shape === 'square') {
      ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size/2, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }
  get alive() { return this.life > 0; }
}

class ParticleSystem {
  constructor() { this.particles = []; }
  add(p) { this.particles.push(p); }

  burst(x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
      const speed = opts.speed || (Math.random() * 3 + 1);
      this.add(new Particle(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color:   opts.color  || '#00f0ff',
        size:    opts.size   || (Math.random()*5+2),
        decay:   opts.decay  || 0.03,
        gravity: opts.gravity || 0,
        glow:    true,
        shape:   opts.shape  || 'circle',
        ...opts
      }));
    }
  }

  attackBurst(x, y) {
    this.burst(x, y, 14, { color:'#00f0ff', speed:4, decay:0.04, size:4 });
    this.burst(x, y, 8,  { color:'#ffffff', speed:2, decay:0.06, size:2 });
  }

  collectBurst(x, y) {
    this.burst(x, y, 12, { color:'#00ff88', speed:3, decay:0.025, size:5, gravity:-0.05 });
    this.burst(x, y, 6,  { color:'#ffe000', speed:2, decay:0.02,  size:3, gravity:-0.1  });
  }

  hitBurst(x, y) {
    this.burst(x, y, 10, { color:'#ff4466', speed:5, decay:0.04, size:4, shape:'square' });
    this.burst(x, y, 5,  { color:'#ff8800', speed:3, decay:0.03, size:3 });
  }

  deathBurst(x, y, color='#ff4466') {
    this.burst(x, y, 20, { color, speed:6, decay:0.015, size:6, gravity:0.05 });
  }

  update() { this.particles = this.particles.filter(p => { p.update(); return p.alive; }); }
  draw(ctx) { this.particles.forEach(p => p.draw(ctx)); }
}

// =============================================
// 5. CLASSES DE ENTIDADES
// =============================================

/** Jogador: o MANDROID */
class Player {
  constructor(x, y) {
    this.x   = x;  this.y   = y;
    this.tx  = x;  this.ty  = y;   // Target (posição do mouse)
    this.w   = 120; this.h   = 140;
    this.scale = 1.0;
    this.hp  = CFG.PLAYER_HP_MAX;
    this.en  = CFG.PLAYER_EN_MAX;
    this.score         = 0;
    this.fragments     = 0;
    this.lastAttack    = 0;
    this.stunUntil     = 0;
    this.attackFlash   = 0;
    this.invincible    = false;
    this.facingLeft    = false;
    this.walkFrame     = 0;
    this.walkTimer     = 0;
    this.powerLevel    = 1;   // Aumenta com upgrades
    this.speed         = CFG.PLAYER_SPEED;
    this.attackRadius  = CFG.ATTACK_RADIUS;
    this.attackDamage  = CFG.ATTACK_DAMAGE;
    this.trail         = [];  // Posições para rastro visual
  }

  setTarget(x, y) { this.tx = x; this.ty = y; }

  get isStunned() { return Date.now() < this.stunUntil; }

  update(dt) {
    // Move em direção ao cursor
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    const DEAD_ZONE = 6;
    if (dist > DEAD_ZONE) {
      const spd = Math.min(this.speed * (dt / 16), dist);
      this.x += (dx / dist) * spd;
      this.y += (dy / dist) * spd;
      this.facingLeft = dx < 0;
      // Animação de caminhada
      this.walkTimer += dt;
      if (this.walkTimer > 150) { this.walkFrame = (this.walkFrame + 1) % 4; this.walkTimer = 0; }
      // Rastro
      this.trail.push({ x: this.x, y: this.y, t: 1.0 });
      if (this.trail.length > 12) this.trail.shift();
    }
    // Decay do rastro
    this.trail.forEach(p => p.t -= 0.06);
    this.trail = this.trail.filter(p => p.t > 0);

    // Limitar área do canvas
    this.x = Math.max(this.w/2, Math.min(CFG.CANVAS_W - this.w/2, this.x));
    this.y = Math.max(this.h/2, Math.min(CFG.CANVAS_H - this.h/2, this.y));

    // Regenerar energia
    this.en = Math.min(CFG.PLAYER_EN_MAX, this.en + CFG.EN_REGEN * (dt/16));
    this.attackFlash = Math.max(0, this.attackFlash - dt/100);
  }

  canAttack() {
    return Date.now() - this.lastAttack >= CFG.ATTACK_COOLDOWN && this.en >= CFG.ATTACK_COST;
  }

  attack() {
    if (!this.canAttack()) return false;
    this.lastAttack = Date.now();
    this.en -= CFG.ATTACK_COST;
    this.attackFlash = 1;
    return true;
  }

  takeDamage(amt) {
    if (Date.now() < this.stunUntil) return;
    this.hp = Math.max(0, this.hp - amt);
    this.stunUntil = Date.now() + CFG.ENEMY_STUN;
  }

  upgrade() {
    this.powerLevel++;
    this.attackDamage = CFG.ATTACK_DAMAGE + (this.powerLevel-1) * 8;
    this.attackRadius = CFG.ATTACK_RADIUS + (this.powerLevel-1) * 10;
    this.speed        = CFG.PLAYER_SPEED  + (this.powerLevel-1) * 0.3;
    this.hp = Math.min(CFG.PLAYER_HP_MAX, this.hp + 30);
    this.en = CFG.PLAYER_EN_MAX;
  }

  get alive() { return this.hp > 0; }

  draw(ctx) {
    ctx.save();

    // Rastro
    this.trail.forEach((p, i) => {
      ctx.globalAlpha = p.t * 0.3;
      ctx.shadowBlur  = 8;
      ctx.shadowColor = '#00f0ff';
      ctx.fillStyle   = '#00aaff';
      const s = this.w * 0.4 * (i / this.trail.length);
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Translucência quando stunado (piscando)
    if (this.isStunned) {
      ctx.globalAlpha = Math.sin(Date.now() * 0.02) * 0.3 + 0.7;
    }

    const x = this.x, y = this.y;
    const flip = this.facingLeft;
    ctx.translate(x, y);
    if (flip) ctx.scale(-1, 1);

    if (ASSETS.robo) {
      // Desenha imagem real
      ctx.shadowBlur  = 25;
      ctx.shadowColor = '#00f0ff';
      ctx.drawImage(ASSETS.robo, -this.w/2, -this.h/2, this.w * this.scale, this.h * this.scale);
      ctx.shadowBlur  = 0;
    } else {
      // Fallback: robô desenhado no canvas
      drawRobotFallback(ctx, 0, 0, this.w, this.h, this.walkFrame, this.attackFlash);
    }

    // Flash de ataque
    if (this.attackFlash > 0) {
      ctx.globalAlpha = this.attackFlash * 0.5;
      ctx.fillStyle   = '#00f0ff';
      ctx.shadowBlur  = 30;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.arc(0, 0, this.attackRadius, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }
}

/** Desenha robô de fallback quando não há imagem */
function drawRobotFallback(ctx, cx, cy, w, h, frame, flash) {
  const neon = flash > 0 ? '#ffffff' : '#00f0ff';
  const body = '#1a6fd4';

  ctx.save();
  // Corpo
  ctx.fillStyle = body;
  ctx.shadowBlur  = 15; ctx.shadowColor = neon;
  roundRect(ctx, cx - w*0.3, cy - h*0.2, w*0.6, h*0.45, 8);
  ctx.fill();
  // Cabeça
  ctx.fillStyle = '#2080e8';
  roundRect(ctx, cx - w*0.22, cy - h*0.6, w*0.44, h*0.4, 10);
  ctx.fill();
  // Olhos
  ctx.fillStyle = neon;
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cx - w*0.09, cy - h*0.38, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + w*0.09, cy - h*0.38, 4, 0, Math.PI*2); ctx.fill();
  // Logo F no peito
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${w*0.25}px Orbitron, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('M', cx, cy + h*0.03);
  // Pernas animadas
  const legSwing = Math.sin(frame / 4 * Math.PI * 2) * 4;
  ctx.fillStyle = '#1560b0';
  ctx.shadowBlur = 10;
  // Perna esq
  ctx.fillRect(cx - w*0.22, cy + h*0.25, w*0.16, h*0.3);
  // Perna dir
  ctx.fillRect(cx + w*0.06, cy + h*0.25 + legSwing, w*0.16, h*0.3);
  // Braços
  ctx.fillStyle = '#ff6600';
  ctx.fillRect(cx - w*0.5, cy - h*0.12, w*0.2, h*0.14);
  ctx.fillRect(cx + w*0.3,  cy - h*0.12, w*0.2, h*0.14);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** NPC base */
class NPC {
  constructor(x, y, opts) {
    this.x     = x; this.y    = y;
    this.w     = 100; this.h   = 100;
    this.id    = opts.id;
    this.name  = opts.name;
    this.color = opts.color;
    this.emoji = opts.emoji;
    this.assetKey = opts.assetKey;
    this.talked   = false;
    this.bobTimer = Math.random() * Math.PI * 2;
    this.glowColor = opts.glowColor || opts.color;
  }

  update(dt) {
    this.bobTimer += dt * 0.003;
  }

  isNear(player) {
    return Math.hypot(this.x - player.x, this.y - player.y) < CFG.NPC_INTERACT_DIST;
  }

  draw(ctx) {
    const bob = Math.sin(this.bobTimer) * 5;
    ctx.save();
    ctx.translate(this.x, this.y + bob);

    // Glow aura
    ctx.shadowBlur  = 25;
    ctx.shadowColor = this.glowColor;

    if (ASSETS[this.assetKey]) {
      ctx.drawImage(ASSETS[this.assetKey], -this.w/2, -this.h/2, this.w, this.h);
    } else {
      // Fallback
      ctx.fillStyle = this.color;
      roundRect(ctx, -this.w/2, -this.h/2, this.w, this.h, 14);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `${this.h * 0.4}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.emoji, 0, 0);
    }

    // Anel de interação (pulsa quando perto do jogador)
    if (this.showInteract) {
      ctx.globalAlpha = 0.6 + Math.sin(Date.now()*0.005)*0.4;
      ctx.strokeStyle = this.glowColor;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 15;
      ctx.beginPath();
      ctx.arc(0, 0, this.w * 0.8, 0, Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Balão de fala "!" se não conversou
    if (!this.talked) {
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#ffe000';
      ctx.shadowBlur  = 10; ctx.shadowColor = '#ffe000';
      ctx.font        = 'bold 14px Exo 2, sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillText('!', 0, -this.h/2 - 14);
    }

    ctx.restore();
  }
}

/** Inimigo base */
class Enemy {
  constructor(x, y, opts = {}) {
    this.x    = x; this.y    = y;
    this.w    = opts.w    || 100;
    this.h    = opts.h    || 100;
    this.hp   = opts.hp   || 40;
    this.maxHp= opts.hp   || 40;
    this.speed= opts.speed|| 1.2;
    this.dmg  = opts.dmg  || CFG.ENEMY_DAMAGE;
    this.type = opts.type || 'glitch';   // 'glitch','shadow','bot'
    this.score= opts.score|| 10;
    this.stunUntil = 0;
    this.glitchTimer = 0;
    this.glitchX = 0; this.glitchY = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.orbitMode = opts.orbitMode || false;
    this.dead = false;
  }

  update(dt, player) {
    if (this.dead) return;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.type === 'glitch') {
      // Movimento errático
      this.glitchTimer += dt;
      if (this.glitchTimer > 300) {
        this.glitchX = (Math.random()-0.5) * 12;
        this.glitchY = (Math.random()-0.5) * 12;
        this.glitchTimer = 0;
      }
    }

    if (dist > 20) {
      const spd = this.speed * (dt/16);
      this.x += (dx/dist) * spd + this.glitchX * 0.1;
      this.y += (dy/dist) * spd + this.glitchY * 0.1;
    }

    // Manter dentro dos bounds
    this.x = Math.max(20, Math.min(CFG.CANVAS_W-20, this.x));
    this.y = Math.max(70, Math.min(CFG.CANVAS_H-20, this.y));

    this.angle += dt * 0.003;
  }

  takeDamage(amt) {
    if (Date.now() < this.stunUntil) return false;
    this.hp -= amt;
    this.stunUntil = Date.now() + 200;
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  isColliding(player) {
    return Math.hypot(this.x - player.x, this.y - player.y) < (this.w/2 + player.w/2 - 10);
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    const stun = Date.now() < this.stunUntil;
    if (stun) { ctx.globalAlpha = 0.6; }

    const colors = { glitch:'#ff00ff', shadow:'#8800ff', bot:'#00ffcc' };
    const c = colors[this.type] || '#ff00ff';

    ctx.shadowBlur  = 15;
    ctx.shadowColor = c;

    if (this.type === 'glitch') {
      drawGlitchEnemy(ctx, 0, 0, this.w, this.h, c);
    } else if (this.type === 'shadow') {
      drawShadowEnemy(ctx, 0, 0, this.w, this.h);
    } else {
      drawBotEnemy(ctx, 0, 0, this.w, this.h, c);
    }

    // Barra de HP
    const bw = this.w + 8, bh = 4;
    const bx = -bw/2, by = -this.h/2 - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = c;
    ctx.shadowBlur = 6;
    ctx.fillRect(bx, by, bw * (this.hp/this.maxHp), bh);

    ctx.restore();
  }
}

function drawGlitchEnemy(ctx, cx, cy, w, h, c) {
  const t = Date.now() * 0.01;
  const off = Math.sin(t) * 3;
  // Corpo principal
  ctx.fillStyle = c;
  ctx.globalAlpha = 0.85;
  roundRect(ctx, cx-w/2, cy-h/2, w, h, 6);
  ctx.fill();
  // Glitch layers
  ctx.fillStyle = '#ff0088';
  ctx.globalAlpha = 0.4;
  ctx.fillRect(cx-w/2+off, cy-h*0.2, w, h*0.15);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(cx-w/2-off, cy+h*0.1, w, h*0.1);
  ctx.globalAlpha = 1;
  // Olhos
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
  ctx.beginPath(); ctx.arc(cx-w*0.15, cy-h*0.1, 5, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+w*0.15, cy-h*0.1, 5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx-w*0.15, cy-h*0.1, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+w*0.15, cy-h*0.1, 2, 0, Math.PI*2); ctx.fill();
}

function drawShadowEnemy(ctx, cx, cy, w, h) {
  const t = Date.now() * 0.005;
  ctx.fillStyle = '#220033';
  ctx.globalAlpha = 0.9;
  // Forma irregular de sombra
  ctx.beginPath();
  ctx.moveTo(cx, cy - h/2);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = (w/2) * (0.7 + 0.3 * Math.sin(a * 3 + t));
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  // Olhos brilhantes
  ctx.fillStyle = '#cc00ff';
  ctx.shadowBlur = 15; ctx.shadowColor = '#cc00ff';
  ctx.beginPath(); ctx.arc(cx-8, cy-4, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+8, cy-4, 4, 0, Math.PI*2); ctx.fill();
}

function drawBotEnemy(ctx, cx, cy, w, h, c) {
  // Corpo metálico
  ctx.fillStyle = '#223344';
  roundRect(ctx, cx-w/2, cy-h/2+8, w, h-8, 5);
  ctx.fill();
  // Cabeça quadrada
  ctx.fillStyle = '#334455';
  roundRect(ctx, cx-w/2+4, cy-h/2, w-8, h*0.4, 5);
  ctx.fill();
  // Detalhes
  ctx.fillStyle = c;
  ctx.shadowBlur = 8; ctx.shadowColor = c;
  ctx.fillRect(cx-w/2+6, cy-h/2+4, w-12, 4);
  ctx.beginPath(); ctx.arc(cx, cy-h*0.15, 5, 0, Math.PI*2); ctx.fill();
  // Antenas
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx-8, cy-h/2); ctx.lineTo(cx-8, cy-h/2-12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+8, cy-h/2); ctx.lineTo(cx+8, cy-h/2-12); ctx.stroke();
}

/** Boss (vírus central) */
class Boss {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 100; this.h = 100;
    this.hp   = 300; this.maxHp = 300;
    this.speed = 0.8;
    this.angle = 0;
    this.phase = 1;
    this.stunUntil  = 0;
    this.spawnTimer = 0;
    this.dead       = false;
    this.attackTimer = 0;
    this.projectiles = [];
  }

  update(dt, player, particles, enemies) {
    if (this.dead) return;
    const hpRatio = this.hp / this.maxHp;
    if (hpRatio < 0.5) this.phase = 2;
    if (hpRatio < 0.25) this.phase = 3;

    const spd = this.speed * (dt/16) * (this.phase * 0.6 + 0.5);
    const dx = player.x - this.x, dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 60) {
      this.x += (dx/dist) * spd;
      this.y += (dy/dist) * spd;
    }

    this.angle += dt * 0.004 * this.phase;

    // Spawn de minions
    this.spawnTimer += dt;
    const spawnInterval = 4000 - this.phase * 800;
    if (this.spawnTimer > spawnInterval) {
      this.spawnTimer = 0;
      for (let i = 0; i < this.phase; i++) {
        const a  = Math.random() * Math.PI * 2;
        const r  = 120;
        enemies.push(new Enemy(
          this.x + Math.cos(a)*r,
          this.y + Math.sin(a)*r,
          { type: ['glitch','shadow','bot'][Math.floor(Math.random()*3)], hp:25, speed:1.6, score:5 }
        ));
      }
    }

    // Projéteis (fase 2+)
    this.attackTimer += dt;
    if (this.phase >= 2 && this.attackTimer > 2000) {
      this.attackTimer = 0;
      const count = this.phase === 3 ? 8 : 4;
      for (let i = 0; i < count; i++) {
        const a = (Math.PI*2/count)*i + this.angle;
        this.projectiles.push({
          x: this.x, y: this.y,
          vx: Math.cos(a)*3, vy: Math.sin(a)*3,
          life: 1
        });
      }
    }

    // Mover projéteis
    for (const p of this.projectiles) {
      p.x += p.vx * (dt/16);
      p.y += p.vy * (dt/16);
      p.life -= dt * 0.001;
      // Verificar hit no jogador
      if (Math.hypot(p.x - player.x, p.y - player.y) < 22 && !player.isStunned) {
        player.takeDamage(10);
        particles.hitBurst(player.x, player.y);
        sfxHit();
        p.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter(p => p.life > 0);

    // Colisão com jogador
    if (Math.hypot(this.x - player.x, this.y - player.y) < (this.w/2 + 20) && !player.isStunned) {
      player.takeDamage(15);
      particles.hitBurst(player.x, player.y);
      sfxHit();
    }

    // Partículas ambientes
    if (Math.random() < 0.15) {
      const a = Math.random() * Math.PI * 2;
      const r = this.w/2 + Math.random()*20;
      particles.add(new Particle(
        this.x + Math.cos(a)*r,
        this.y + Math.sin(a)*r,
        { vx:Math.cos(a)*1.5, vy:Math.sin(a)*1.5,
          color: ['#ff0088','#8800ff','#ff4400'][Math.floor(Math.random()*3)],
          size: 3+Math.random()*4, decay:0.02 }
      ));
    }
  }

  takeDamage(amt) {
    if (Date.now() < this.stunUntil) return false;
    this.hp -= amt;
    this.stunUntil = Date.now() + 150;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return true;
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.translate(this.x, this.y);

    const t  = Date.now() * 0.005;
    const c1 = ['#ff0088','#aa00ff','#ff4400'][this.phase - 1];
    const stun = Date.now() < this.stunUntil;

    // Anéis orbitando
    for (let i = 0; i < 3; i++) {
      const a    = this.angle + (Math.PI*2/3)*i;
      const r    = this.w*0.7;
      ctx.globalAlpha = 0.6;
      ctx.fillStyle   = c1;
      ctx.shadowBlur  = 15; ctx.shadowColor = c1;
      ctx.beginPath();
      ctx.arc(Math.cos(a)*r, Math.sin(a)*r, 8, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Corpo principal do vírus
    const pulse = 1 + Math.sin(t)*0.06;
    ctx.scale(pulse, pulse);

    // Halo externo
    ctx.shadowBlur = 40; ctx.shadowColor = c1;
    const grad = ctx.createRadialGradient(0,0,10,0,0,this.w/2);
    grad.addColorStop(0, stun ? '#ffffff' : '#550022');
    grad.addColorStop(0.5, c1);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, this.w/2, 0, Math.PI*2);
    ctx.fill();

    // Padrão de glitch no centro
    for (let i = 0; i < 4; i++) {
      const a = this.angle * 2 + (Math.PI/2)*i;
      ctx.strokeStyle = i%2===0 ? '#ff00ff':'#00ffff';
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(Math.cos(a)*(this.w*0.4), Math.sin(a)*(this.h*0.4));
      ctx.stroke();
    }

    // Olho do vírus
    ctx.shadowBlur  = 20; ctx.shadowColor = '#ffffff';
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle   = '#ff0000';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle   = '#000';
    ctx.beginPath(); ctx.arc(2, 2, 5, 0, Math.PI*2); ctx.fill();

    ctx.restore();

    // Projéteis
    for (const p of this.projectiles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.shadowBlur  = 12; ctx.shadowColor = c1;
      ctx.fillStyle   = c1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

/** Fragmento de dados coletável */
class Fragment {
  constructor(x, y, value = 1) {
    this.x = x; this.y = y;
    this.value = value;
    this.collected = false;
    this.bobTimer  = Math.random() * Math.PI * 2;
    this.spinAngle = 0;
    this.glowPulse = 0;
  }
  update(dt) {
    this.bobTimer  += dt * 0.003;
    this.spinAngle += dt * 0.004;
    this.glowPulse += dt * 0.005;
  }
  draw(ctx) {
    if (this.collected) return;
    const bob = Math.sin(this.bobTimer) * 4;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.rotate(this.spinAngle);
    const glow = 15 + Math.sin(this.glowPulse) * 8;
    ctx.shadowBlur  = glow;
    ctx.shadowColor = '#00ff88';
    // Hexágono
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI/3)*i - Math.PI/6;
      const r = 12;
      if (i===0) ctx.moveTo(Math.cos(a)*r, Math.sin(a)*r);
      else ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
    }
    ctx.closePath();
    ctx.fillStyle   = '#00ff88';
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = 1;
    ctx.stroke();
    // Símbolo central
    ctx.shadowBlur  = 5; ctx.shadowColor = '#ffffff';
    ctx.fillStyle   = '#ffffff';
    ctx.font        = 'bold 9px Orbitron, monospace';
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⬡', 0, 0);
    ctx.restore();
  }
}

// =============================================
// 6. SISTEMA DE FASES
// =============================================

const PHASES = [
  // FASE 1 — Tutorial
  {
    id: 1, name: 'Tutorial', bgColor: '#0a1230',
    npcDialogue: {
      npc: 'face',
      lines: [
        { speaker: 'Facebook', text: 'Olá, Mandroid! Bem-vindo à Social City! 👋 Eu sou o Facebook Mascote.', emoji:'😊' },
        { speaker: 'Facebook', text: 'Nossa cidade está sendo atacada por um vírus misterioso que corrompe tudo ao redor!', emoji:'😰' },
        { speaker: 'Facebook', text: 'Para se mover, basta levar o mouse até onde quer ir. O Mandroid seguirá o cursor!', emoji:'🖱️' },
        { speaker: 'Facebook', text: 'Para atacar, clique com o botão esquerdo do mouse em qualquer lugar. Use sua energia!', emoji:'⚡' },
        { speaker: 'Facebook', text: 'Colete os FRAGMENTOS DE DADOS espalhados pela cidade para restaurar o sistema!', emoji:'🧩' },
        { speaker: 'Facebook', text: 'Você está pronto, guardião? Social City precisa de você! Vá lá!', emoji:'💪' },
      ]
    },
    enemies:     [],
    fragments:   5,
    targetFrags: 5,
    message:     'Colete 5 fragmentos de dados para completar o tutorial!'
  },
  // FASE 2 — Exploração
  {
    id: 2, name: 'Exploração', bgColor: '#081525',
    npcDialogue: null,
    enemies:     [
      { type:'glitch', count:2, hp:30, speed:1.0, score:8 }
    ],
    fragments:   8,
    targetFrags: 8,
    message:     'Explore a cidade e colete 8 fragmentos!'
  },
  // FASE 3 — Combate
  {
    id: 3, name: 'Combate', bgColor: '#150820',
    npcDialogue: {
      npc: 'whats',
      lines: [
        { speaker: 'WhatsApp', text: 'Atenção, Mandroid! 📱 Os inimigos estão ficando mais fortes!', emoji:'⚠️' },
        { speaker: 'WhatsApp', text: 'Dica: Clique perto dos inimigos para causar dano em área. Use sua energia sabiamente!', emoji:'💡' },
        { speaker: 'WhatsApp', text: 'Elimine todos os inimigos corrompidos e colete os fragmentos. Boa sorte!', emoji:'👊' },
      ]
    },
    enemies:     [
      { type:'glitch', count:3, hp:40, speed:1.2, score:10 },
      { type:'shadow', count:2, hp:50, speed:0.9, score:15 },
    ],
    fragments:   6,
    targetFrags: 6,
    message:     'Derrote todos os inimigos e colete 6 fragmentos!'
  },
  // FASE 4 — Upgrade
  {
    id: 4, name: 'Upgrade', bgColor: '#0a0f25',
    npcDialogue: {
      npc: 'insta',
      lines: [
        { speaker: 'Instagram', text: 'Mandroid! Que visão incrível! ✨ Sou o Instagram Mascote!', emoji:'📸' },
        { speaker: 'Instagram', text: 'Você tem lutado com tanta força! Deixa eu melhorar você um pouco...', emoji:'⬆️' },
        { speaker: 'Instagram', text: '🔥 UPGRADE CONCEDIDO! Seu ataque, velocidade e HP foram ampliados!', emoji:'💥' },
        { speaker: 'Instagram', text: 'Mas cuidado... os bots defeituosos são muito mais resistentes!', emoji:'🤖' },
      ]
    },
    enemies:     [
      { type:'bot', count:4, hp:60, speed:1.0, score:18 },
      { type:'glitch', count:3, hp:35, speed:1.4, score:10 },
    ],
    fragments:   7,
    targetFrags: 7,
    applyUpgrade: true,
    message:     'Upgrade aplicado! Colete 7 fragmentos e derrote os bots!'
  },
  // FASE 5 — Missões
  {
    id: 5, name: 'Missões', bgColor: '#021508',
    npcDialogue: {
      npc: 'whats',
      lines: [
        { speaker: 'WhatsApp', text: 'Mandroid! 📩 Recebi mensagens urgentes dos habitantes!', emoji:'📨' },
        { speaker: 'WhatsApp', text: 'Dezenas de sombras corrompidas estão avançando pelo centro da cidade!', emoji:'👾' },
        { speaker: 'WhatsApp', text: 'Você precisa eliminar TODAS as sombras para proteger os moradores digitais!', emoji:'🛡️' },
        { speaker: 'WhatsApp', text: 'Vá rápido! Cada segundo conta! O sistema está quase entrando em colapso!', emoji:'⏰' },
      ]
    },
    enemies:     [
      { type:'shadow', count:6, hp:55, speed:1.3, score:15 },
      { type:'bot',    count:3, hp:70, speed:1.1, score:20 },
    ],
    fragments:   10,
    targetFrags: 10,
    message:     'Elimine todas as sombras e colete 10 fragmentos!'
  },
  // FASE 6 — Desafio TikTok
  {
    id: 6, name: 'Desafio Rápido', bgColor: '#0d0010',
    npcDialogue: {
      npc: 'tiktok',
      lines: [
        { speaker: 'TikTok', text: 'OOOOH! Mandroid! 🎵 Bem-vindo ao TikTok Challenge!', emoji:'🕺' },
        { speaker: 'TikTok', text: 'Hora de provar que você é o mais rápido da Social City!', emoji:'⚡' },
        { speaker: 'TikTok', text: 'Os inimigos vão aparecer em ONDAS cada vez mais rápidas!', emoji:'🌊' },
        { speaker: 'TikTok', text: 'Sobreviva e derrote todos os inimigos para avançar pro BOSS FINAL!', emoji:'💀' },
      ]
    },
    enemies: [
      { type:'glitch', count:4, hp:45, speed:1.8, score:12 },
      { type:'shadow', count:4, hp:60, speed:1.5, score:18 },
      { type:'bot',    count:4, hp:75, speed:1.3, score:22 },
    ],
    fragments:   8,
    targetFrags: 8,
    message:     'Modo Desafio! Derrote todas as ondas e colete 8 fragmentos!'
  },
  // FASE FINAL — Boss
  {
    id: 7, name: 'VÍRUS CENTRAL', bgColor: '#0a0005',
    npcDialogue: {
      npc: 'face',
      lines: [
        { speaker: 'Facebook', text: 'Mandroid! Chegou a hora da verdade! 😤', emoji:'💀' },
        { speaker: 'Facebook', text: 'O VÍRUS CENTRAL está no coração da cidade! Ele é o responsável por tudo!', emoji:'🦠' },
        { speaker: 'Facebook', text: 'Todos os mascotes da Social City estão te apoiando nessa batalha final!', emoji:'❤️' },
        { speaker: 'Facebook', text: 'DESTRUA O VÍRUS e restaure o sistema! Social City acredita em você!', emoji:'🏆' },
      ]
    },
    isBoss:      true,
    enemies:     [],
    fragments:   5,
    targetFrags: 0,
    message:     'BATALHA FINAL! Destrua o Vírus Central!'
  }
];

// =============================================
// 7. ESTADO GLOBAL DO JOGO
// =============================================

const G = {
  canvas:   null,
  ctx:      null,
  player:   null,
  npcs:     [],
  enemies:  [],
  fragments:[],
  particles:null,
  boss:     null,
  phase:    0,        // índice atual em PHASES
  state:    'MENU',   // MENU | PLAYING | DIALOGUE | GAMEOVER | VICTORY
  dialogueQueue:  [],
  dialogueIndex:  0,
  dialogueActive: false,
  missionText:    '',
  missionComplete:false,
  totalFragments: 0,
  lastTime:       0,
  mouseX: 400, mouseY: 300,
  buildings:  [],     // Decoração de fundo
  stars:      [],
  neonLights: [],
  animFrame:  null,
};

// =============================================
// 8. INICIALIZAÇÃO
// =============================================

window.addEventListener('load', () => {
  loadAssets(() => {
    initCanvas();
    generateDecoration();
    setupInput();
    setupUI();
    startTrailEffect();
  });
});

function initCanvas() {
  G.canvas     = document.getElementById('gameCanvas');
  G.ctx        = G.canvas.getContext('2d');
  G.particles  = new ParticleSystem();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  G.canvas.width  = W;
  G.canvas.height = H;
  // Escalar o sistema de coordenadas
  G.scaleX = W / CFG.CANVAS_W;
  G.scaleY = H / CFG.CANVAS_H;
}

/** Gera decoração estática (prédios, estrelas, luzes) */
function generateDecoration() {
  G.buildings = [];
  G.stars     = [];
  G.neonLights= [];

  // Estrelas
  for (let i = 0; i < 80; i++) {
    G.stars.push({
      x: Math.random() * CFG.CANVAS_W,
      y: Math.random() * CFG.CANVAS_H * 0.6,
      r: Math.random() * 1.5 + 0.5,
      t: Math.random() * Math.PI * 2
    });
  }

  // Prédios baseados em redes sociais
  const buildingData = [
    { x:80,  y:580, w:120, h:200, color:'#1877F2', label:'f',  labelColor:'#fff', glow:'#1877F2' },
    { x:220, y:540, w:100, h:240, color:'#E1306C', label:'◎',  labelColor:'#fff', glow:'#E1306C' },
    { x:340, y:560, w:110, h:220, color:'#25D366', label:'✉',  labelColor:'#fff', glow:'#25D366' },
    { x:460, y:530, w:100, h:250, color:'#000',    label:'♫',  labelColor:'#ff3'  ,glow:'#ee1d52' },
    { x:580, y:570, w:120, h:210, color:'#FF0000', label:'▶',  labelColor:'#fff', glow:'#FF0000' },
    { x:720, y:545, w:100, h:235, color:'#0077B5', label:'in', labelColor:'#fff', glow:'#0077B5' },
    { x:840, y:555, w:130, h:225, color:'#1DA1F2', label:'🐦',  labelColor:'#fff', glow:'#1DA1F2' },
    { x:980, y:540, w:110, h:240, color:'#6001D2', label:'⬡',  labelColor:'#fff', glow:'#6001D2' },
    { x:1110,y:560, w:100, h:220, color:'#FF5700', label:'r',  labelColor:'#fff', glow:'#FF5700' },
  ];
  G.buildings = buildingData;

  // Luzes neon (pontos coloridos na cena)
  for (let i = 0; i < 20; i++) {
    const colors = ['#00f0ff','#ff00cc','#00ff88','#ffe000','#9b00ff'];
    G.neonLights.push({
      x:     Math.random() * CFG.CANVAS_W,
      y:     200 + Math.random() * 400,
      color: colors[Math.floor(Math.random() * colors.length)],
      r:     Math.random() * 3 + 1,
      t:     Math.random() * Math.PI * 2,
      speed: Math.random() * 0.04 + 0.01
    });
  }
}

// =============================================
// 9. SISTEMA DE INPUT
// =============================================

function setupInput() {
  // Rastrear mouse
  window.addEventListener('mousemove', e => {
    G.mouseX = e.clientX / G.scaleX;
    G.mouseY = e.clientY / G.scaleY;
    if (G.player) G.player.setTarget(G.mouseX, G.mouseY);
  });

  // Clique do mouse
  window.addEventListener('click', e => {
    ensureAudio();
    if (G.state === 'DIALOGUE') {
      advanceDialogue();
      return;
    }
    if (G.state !== 'PLAYING') return;
    handleGameClick(e);
  });
}

function handleGameClick(e) {
  const cx = e.clientX / G.scaleX;
  const cy = e.clientY / G.scaleY;

  // Verificar clique em NPC
  for (const npc of G.npcs) {
    if (!npc.talked && npc.isNear(G.player)) {
      startDialogue(npc);
      sfxDialogue();
      return;
    }
  }

  // Atacar
  if (G.player.canAttack()) {
    if (G.player.attack()) {
      sfxAttack();
      G.particles.attackBurst(G.player.x, G.player.y);
      checkAttackHits();
    }
  }
}

function checkAttackHits() {
  const p  = G.player;
  const r  = p.attackRadius;

  // Inimigos normais
  for (const en of G.enemies) {
    if (en.dead) continue;
    const dist = Math.hypot(en.x - p.x, en.y - p.y);
    if (dist < r + en.w/2) {
      if (en.takeDamage(p.attackDamage)) {
        G.particles.hitBurst(en.x, en.y);
        sfxHit();
        if (en.dead) {
          G.particles.deathBurst(en.x, en.y, '#ff00ff');
          sfxEnemyDie();
          p.score += en.score;
          updateHUD();
        }
      }
    }
  }
  G.enemies = G.enemies.filter(e => !e.dead);

  // Boss
  if (G.boss && !G.boss.dead) {
    const dist = Math.hypot(G.boss.x - p.x, G.boss.y - p.y);
    if (dist < r + G.boss.w/2) {
      if (G.boss.takeDamage(p.attackDamage)) {
        G.particles.hitBurst(G.boss.x, G.boss.y);
        sfxBossHit();
        updateBossBar();
        if (G.boss.dead) {
          G.particles.deathBurst(G.boss.x, G.boss.y, '#ff0088');
          G.particles.deathBurst(G.boss.x+30, G.boss.y-20, '#8800ff');
          G.particles.deathBurst(G.boss.x-30, G.boss.y+20, '#ff4400');
          sfxVictory();
          p.score += 500;
          setTimeout(triggerVictory, 2000);
        }
      }
    }
  }
}

// =============================================
// 10. SISTEMA DE DIÁLOGO
// =============================================

function startDialogue(npc) {
  const phaseData = PHASES[G.phase];
  if (!phaseData.npcDialogue) return;

  G.state = 'DIALOGUE';
  G.dialogueIndex = 0;

  const lines = phaseData.npcDialogue.lines;
  G.dialogueQueue = lines;

  showDialogueLine(lines[0], npc);
  npc.talked = true;

  document.getElementById('dialogue-box').classList.remove('hidden');
}

function showDialogueLine(line, npc) {
  const speakerEl = document.getElementById('dialogue-speaker');
  const textEl    = document.getElementById('dialogue-text');
  const avatarEl  = document.getElementById('dialogue-avatar');

  speakerEl.textContent = line.speaker;
  textEl.textContent    = '';
  avatarEl.innerHTML    = '';

  // Definir cor do speaker
  const colors = {
    Facebook:'#1877F2', Instagram:'#E1306C',
    WhatsApp:'#25D366', TikTok:'#ee1d52'
  };
  speakerEl.style.color       = colors[line.speaker] || '#00f0ff';
  speakerEl.style.textShadow  = `0 0 10px ${colors[line.speaker] || '#00f0ff'}`;

  // Avatar
  const assetMap = { Facebook:'face', Instagram:'insta', WhatsApp:'whats', TikTok:'tiktok' };
  const key = assetMap[line.speaker];
  if (key && ASSETS[key]) {
    const img = document.createElement('img');
    img.src   = ASSETS[key].src;
    img.style = 'width:100%;height:100%;object-fit:cover;';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = line.emoji || '😊';
  }

  // Borda do diálogo com cor do speaker
  const box = document.getElementById('dialogue-box');
  box.style.borderColor = colors[line.speaker] || '#00f0ff';
  box.style.boxShadow   = `0 0 30px ${colors[line.speaker] || '#00f0ff'}44, 0 10px 40px rgba(0,0,0,0.6)`;

  // Animação de digitação
  typeText(textEl, line.text, 28);
}

function typeText(el, text, speed) {
  let i = 0;
  if (el._typeInterval) clearInterval(el._typeInterval);
  el._typeInterval = setInterval(() => {
    el.textContent = text.slice(0, i);
    i++;
    if (i > text.length) clearInterval(el._typeInterval);
  }, speed);
}

function advanceDialogue() {
  G.dialogueIndex++;
  if (G.dialogueIndex >= G.dialogueQueue.length) {
    // Fechar diálogo
    document.getElementById('dialogue-box').classList.add('hidden');
    G.state = 'PLAYING';

    // Aplicar upgrade se for fase 4
    if (PHASES[G.phase].applyUpgrade && !G._upgradeApplied) {
      G._upgradeApplied = true;
      G.player.upgrade();
      showNotification('🔥 UPGRADE APLICADO! Poder aumentado!', 'green');
      sfxLevelUp();
      G.particles.burst(G.player.x, G.player.y, 30, { color:'#ffe000', speed:5, decay:0.015, size:6 });
    }
    return;
  }
  const npc = G.npcs.find(n => n.id === PHASES[G.phase].npcDialogue.npc);
  showDialogueLine(G.dialogueQueue[G.dialogueIndex], npc);
  sfxDialogue();
}

// =============================================
// 11. CARREGAMENTO DE FASE
// =============================================

function loadPhase(phaseIndex) {
  G.phase    = phaseIndex;
  G.enemies  = [];
  G.fragments= [];
  G.npcs     = [];
  G.boss     = null;
  G._upgradeApplied = false;
  G.missionComplete = false;

  const pData = PHASES[phaseIndex];

  // Criar inimigos
  for (const eConf of (pData.enemies || [])) {
    for (let i = 0; i < eConf.count; i++) {
      const margin = 80;
      let ex, ey;
      // Spawn nas bordas
      if (Math.random() < 0.5) {
        ex = Math.random() < 0.5 ? margin : CFG.CANVAS_W - margin;
        ey = margin + Math.random() * (CFG.CANVAS_H - 2*margin);
      } else {
        ex = margin + Math.random() * (CFG.CANVAS_W - 2*margin);
        ey = Math.random() < 0.5 ? margin + 30 : CFG.CANVAS_H - margin;
      }
      G.enemies.push(new Enemy(ex, ey, { type:eConf.type, hp:eConf.hp, speed:eConf.speed, score:eConf.score }));
    }
  }

  // Criar fragmentos
  for (let i = 0; i < pData.fragments; i++) {
    const fx = 100 + Math.random() * (CFG.CANVAS_W - 200);
    const fy = 120 + Math.random() * (CFG.CANVAS_H - 180);
    G.fragments.push(new Fragment(fx, fy, 1));
  }
  G.totalFragments = pData.fragments;

  // NPCs
  createNPCsForPhase(phaseIndex);

  // Boss
  if (pData.isBoss) {
    G.boss = new Boss(CFG.CANVAS_W/2, CFG.CANVAS_H/2 - 50);
    document.getElementById('boss-bar-wrapper').classList.remove('hidden');
    updateBossBar();
  } else {
    document.getElementById('boss-bar-wrapper').classList.add('hidden');
  }

  // Missão
  G.missionText = pData.message || '';
  updateMissionPanel();

  // HUD
  updateHUDPhase();
  updateHUD();
}

function createNPCsForPhase(phaseIndex) {
  const pData = PHASES[phaseIndex];
  if (!pData.npcDialogue) return;

  const npcMap = {
    face:   { name:'Facebook', color:'#1877F2', emoji:'😊', glowColor:'#1877F2' },
    insta:  { name:'Instagram', color:'#E1306C', emoji:'📸', glowColor:'#E1306C' },
    whats:  { name:'WhatsApp', color:'#25D366', emoji:'📱', glowColor:'#25D366' },
    tiktok: { name:'TikTok', color:'#ee1d52', emoji:'🎵', glowColor:'#ee1d52' },
  };
  const key  = pData.npcDialogue.npc;
  const info = npcMap[key];

  // Posicionar NPC em local fixo por fase
  const positions = [
    { x:250, y:350 }, { x:400, y:280 },
    { x:700, y:350 }, { x:900, y:300 },
    { x:550, y:420 }, { x:800, y:250 },
    { x:350, y:300 }
  ];
  const pos = positions[phaseIndex] || { x:300, y:350 };

  G.npcs.push(new NPC(pos.x, pos.y, { id:key, assetKey:key, ...info }));
}

// =============================================
// 12. LOOP PRINCIPAL
// =============================================

function startGame() {
  if (G.animFrame) cancelAnimationFrame(G.animFrame);

  G.player = new Player(CFG.CANVAS_W/2, CFG.CANVAS_H/2);
  G.player.setTarget(CFG.CANVAS_W/2, CFG.CANVAS_H/2);
  loadPhase(0);

  G.state   = 'PLAYING';
  G.lastTime = performance.now();
  startBgMusic();
  gameLoop(G.lastTime);
}

function gameLoop(ts) {
  const dt = Math.min(ts - G.lastTime, 50); // cap a 50ms
  G.lastTime = ts;

  update(dt);
  render();

  G.animFrame = requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (G.state !== 'PLAYING' && G.state !== 'DIALOGUE') return;

  const p = G.player;

  // Atualizar player
  if (G.state === 'PLAYING') p.update(dt);

  // Atualizar NPCs
  G.npcs.forEach(npc => {
    npc.update(dt);
    npc.showInteract = npc.isNear(p) && !npc.talked;
  });

  // Atualizar inimigos
  if (G.state === 'PLAYING') {
    G.enemies.forEach(en => en.update(dt, p));

    // Dano por colisão
    G.enemies.forEach(en => {
      if (!en.dead && en.isColliding(p) && !p.isStunned) {
        p.takeDamage(en.dmg * (dt/300));
        G.particles.hitBurst(p.x, p.y);
      }
    });
  }

  // Atualizar boss
  if (G.boss && !G.boss.dead && G.state === 'PLAYING') {
    G.boss.update(dt, p, G.particles, G.enemies);
  }

  // Fragmentos
  G.fragments.forEach(f => f.update(dt));
  G.fragments.forEach(f => {
    if (!f.collected && Math.hypot(f.x - p.x, f.y - p.y) < CFG.FRAGMENT_COLLECT) {
      f.collected = true;
      p.fragments++;
      p.score += 10 * f.value;
      G.particles.collectBurst(f.x, f.y);
      sfxCollect();
      showNotification(`🧩 Fragmento coletado! +10 pts`, 'green');
      updateHUD();
    }
  });

  // Atualizar partículas
  G.particles.update();

  // Neon lights
  G.neonLights.forEach(l => l.t += l.speed * (dt/16));

  // Checar morte do jogador
  if (!p.alive) {
    triggerGameOver();
    return;
  }

  // Checar condições de vitória da fase
  checkPhaseComplete();

  // Atualizar HUD
  updateHUD();
}

function checkPhaseComplete() {
  const pData = PHASES[G.phase];
  const p     = G.player;

  if (G.missionComplete) return;

  // Fase boss: vencida quando boss morto (tratado no ataque)
  if (pData.isBoss) return;

  const allEnemiesDead = G.enemies.length === 0 ||
    G.enemies.filter(e=>!e.dead).length === 0;
  const fragsCollected = p.fragments >= pData.targetFrags;

  // Determinar condição por fase
  let complete = false;
  if (pData.id === 1) complete = fragsCollected;
  else if (pData.id === 2) complete = fragsCollected;
  else complete = fragsCollected && allEnemiesDead;

  if (complete) {
    G.missionComplete = true;
    sfxLevelUp();
    G.particles.burst(p.x, p.y, 30, { color:'#ffe000', speed:5, decay:0.015, size:6 });
    showNotification('✅ FASE COMPLETA! Avançando...', 'yellow');
    setTimeout(() => nextPhase(), 2500);
  }
}

function nextPhase() {
  const nextIndex = G.phase + 1;
  if (nextIndex >= PHASES.length) {
    triggerVictory();
    return;
  }
  G.player.fragments = 0;
  loadPhase(nextIndex);
  showNotification(`⚡ FASE ${nextIndex+1}: ${PHASES[nextIndex].name}`, 'yellow');
}

// =============================================
// 13. RENDERIZAÇÃO
// =============================================

function render() {
  const ctx = G.ctx;
  const W   = G.canvas.width;
  const H   = G.canvas.height;
  const sx  = G.scaleX;
  const sy  = G.scaleY;

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.scale(sx, sy);

  const pData = PHASES[G.phase] || PHASES[0];

  // Fundo
  drawBackground(ctx, pData);

  // Fragmentos
  G.fragments.filter(f=>!f.collected).forEach(f => f.draw(ctx));

  // NPCs
  G.npcs.forEach(npc => npc.draw(ctx));

  // Inimigos
  G.enemies.forEach(en => en.draw(ctx));

  // Boss
  if (G.boss) G.boss.draw(ctx);

  // Player
  if (G.player) G.player.draw(ctx);

  // Partículas
  G.particles.draw(ctx);

  // Cursor personalizado
  drawCursor(ctx, G.mouseX, G.mouseY);

  ctx.restore();
}

function drawBackground(ctx, pData) {
  const W = CFG.CANVAS_W, H = CFG.CANVAS_H;
  const bgColor = pData.bgColor || '#0a1230';

  // Gradiente de céu
  const sky = ctx.createLinearGradient(0, 0, 0, H*0.65);
  sky.addColorStop(0, bgColor);
  sky.addColorStop(1, '#0d1525');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Imagem de cidade (se existir)
  if (ASSETS.cidade) {
    ctx.globalAlpha = 0.35;
    ctx.drawImage(ASSETS.cidade, 0, 0, W, H * 0.7);
    ctx.globalAlpha = 1;
  }

  // Estrelas
  G.stars.forEach(s => {
    s.t += 0.01;
    ctx.globalAlpha = 0.4 + Math.sin(s.t) * 0.3;
    ctx.shadowBlur  = 4; ctx.shadowColor = '#aaccff';
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  // Prédios (paralaxe)
  if (!ASSETS.cidade) drawBuildings(ctx);

  // Chão
  const ground = ctx.createLinearGradient(0, H*0.72, 0, H);
  ground.addColorStop(0, '#1a2540');
  ground.addColorStop(1, '#0d1530');
  ctx.fillStyle = ground;
  ctx.fillRect(0, H*0.72, W, H*0.28);

  // Linhas de grade no chão (efeito digital)
  ctx.strokeStyle = 'rgba(0,240,255,0.06)';
  ctx.lineWidth   = 1;
  for (let gx = 0; gx < W; gx += 60) {
    ctx.beginPath(); ctx.moveTo(gx, H*0.72); ctx.lineTo(gx, H); ctx.stroke();
  }
  for (let gy = H*0.72; gy < H; gy += 40) {
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  // Luzes neon flutuantes
  G.neonLights.forEach(l => {
    const glow = 12 + Math.sin(l.t)*5;
    ctx.globalAlpha = 0.35 + Math.sin(l.t)*0.2;
    ctx.shadowBlur  = glow; ctx.shadowColor = l.color;
    ctx.fillStyle   = l.color;
    ctx.beginPath(); ctx.arc(l.x, l.y, l.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawBuildings(ctx) {
  const H = CFG.CANVAS_H;
  G.buildings.forEach(b => {
    // Corpo do prédio
    ctx.shadowBlur  = 20; ctx.shadowColor = b.glow + '88';
    ctx.fillStyle   = b.color;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(b.x, H - b.h, b.w, b.h);

    // Janelas
    ctx.fillStyle   = '#ffe080';
    ctx.globalAlpha = 0.6;
    ctx.shadowBlur  = 6; ctx.shadowColor = '#ffe080';
    for (let wy = H - b.h + 20; wy < H - 10; wy += 30) {
      for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 22) {
        if (Math.random() > 0.35) {
          ctx.fillRect(wx, wy, 10, 14);
        }
      }
    }

    // Label/logo do prédio
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 15; ctx.shadowColor = b.labelColor;
    ctx.fillStyle   = b.labelColor;
    ctx.font        = `bold ${b.w * 0.35}px Orbitron, sans-serif`;
    ctx.textAlign   = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w/2, H - b.h * 0.65);
  });
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function drawCursor(ctx, mx, my) {
  const t  = Date.now() * 0.005;
  const r  = 12 + Math.sin(t)*2;
  const r2 = 5;

  ctx.save();
  ctx.shadowBlur  = 18; ctx.shadowColor = '#00f0ff';
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth   = 2;
  ctx.globalAlpha = 0.85;

  // Anel externo
  ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI*2); ctx.stroke();

  // Cruz
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx - r*1.4, my); ctx.lineTo(mx - r*0.6, my);
  ctx.moveTo(mx + r*0.6, my); ctx.lineTo(mx + r*1.4, my);
  ctx.moveTo(mx, my - r*1.4); ctx.lineTo(mx, my - r*0.6);
  ctx.moveTo(mx, my + r*0.6); ctx.lineTo(mx, my + r*1.4);
  ctx.stroke();

  // Ponto central
  ctx.fillStyle  = '#00f0ff';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(mx, my, r2/2, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// =============================================
// 14. HUD E UI
// =============================================

function updateHUD() {
  if (!G.player) return;
  const p = G.player;

  document.getElementById('hp-bar').style.width = (p.hp / CFG.PLAYER_HP_MAX * 100) + '%';
  document.getElementById('en-bar').style.width = (p.en / CFG.PLAYER_EN_MAX * 100) + '%';
  document.getElementById('hp-val').textContent  = `${Math.ceil(p.hp)}/${CFG.PLAYER_HP_MAX}`;
  document.getElementById('en-val').textContent  = `${Math.ceil(p.en)}/${CFG.PLAYER_EN_MAX}`;
  document.getElementById('score-display').textContent   = p.score;
  document.getElementById('fragment-count').textContent  =
    `${Math.min(p.fragments, PHASES[G.phase].targetFrags || PHASES[G.phase].fragments)} / ${PHASES[G.phase].targetFrags || PHASES[G.phase].fragments}`;
}

function updateHUDPhase() {
  const pData = PHASES[G.phase];
  document.getElementById('hud-phase').textContent      = `FASE ${pData.id}`;
  document.getElementById('hud-phase-name').textContent = pData.name;
}

function updateBossBar() {
  if (!G.boss) return;
  const pct = (G.boss.hp / G.boss.maxHp) * 100;
  document.getElementById('boss-hp-bar').style.width = pct + '%';
}

function updateMissionPanel() {
  const panel = document.getElementById('mission-panel');
  if (G.missionText) {
    panel.classList.remove('hidden');
    document.getElementById('mission-text').textContent = G.missionText;
  } else {
    panel.classList.add('hidden');
  }
}

let _notifTimeout = null;
function showNotification(msg, type = '') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className   = 'notification' + (type ? ' ' + type : '');
  el.classList.remove('hidden');
  if (_notifTimeout) clearTimeout(_notifTimeout);
  _notifTimeout = setTimeout(() => el.classList.add('hidden'), 3200);
}

// =============================================
// 15. ESTADOS DE JOGO
// =============================================

function triggerGameOver() {
  if (G.state === 'GAMEOVER') return;
  G.state = 'GAMEOVER';
  stopBgMusic();
  sfxGameOver();
  document.getElementById('go-score-val').textContent = G.player.score;
  showScreen('screen-gameover');
}

function triggerVictory() {
  if (G.state === 'VICTORY') return;
  G.state = 'VICTORY';
  stopBgMusic();
  sfxVictory();
  document.getElementById('vic-score-val').textContent = G.player.score;
  // Confetes
  for (let i = 0; i < 80; i++) {
    setTimeout(() => {
      if (!G.player) return;
      G.particles.burst(
        Math.random() * CFG.CANVAS_W,
        Math.random() * CFG.CANVAS_H * 0.5,
        6,
        { color: ['#ffe000','#00ff88','#00f0ff','#ff00cc','#ff4466'][Math.floor(Math.random()*5)],
          speed: 3, decay:0.012, size:5 }
      );
    }, i * 60);
  }
  setTimeout(() => showScreen('screen-victory'), 2000);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// =============================================
// 16. SETUP UI BUTTONS
// =============================================

function setupUI() {
  // Menu → Start
  document.getElementById('btn-start').addEventListener('click', () => {
    ensureAudio();
    sfxClick();
    showScreen('screen-game');
    startGame();
  });

  // Toggle controles
  document.getElementById('btn-controls').addEventListener('click', () => {
    sfxClick();
    document.getElementById('controls-panel').classList.toggle('hidden');
  });

  // Game Over → Restart
  document.getElementById('btn-restart').addEventListener('click', () => {
    ensureAudio(); sfxClick();
    showScreen('screen-game');
    startGame();
  });

  // Game Over → Menu
  document.getElementById('btn-menu-go').addEventListener('click', () => {
    ensureAudio(); sfxClick();
    stopBgMusic();
    showScreen('screen-menu');
  });

  // Victory → Play Again
  document.getElementById('btn-play-again').addEventListener('click', () => {
    ensureAudio(); sfxClick();
    showScreen('screen-game');
    startGame();
  });

  // Victory → Menu
  document.getElementById('btn-menu-vic').addEventListener('click', () => {
    ensureAudio(); sfxClick();
    stopBgMusic();
    showScreen('screen-menu');
  });
}

// =============================================
// 17. EFEITO DE RASTRO DO MOUSE (Trail Canvas)
// =============================================

function startTrailEffect() {
  const trailCanvas = document.getElementById('trailCanvas');
  const tc          = trailCanvas.getContext('2d');
  const trail       = [];

  function resizeTrail() {
    trailCanvas.width  = window.innerWidth;
    trailCanvas.height = window.innerHeight;
  }
  resizeTrail();
  window.addEventListener('resize', resizeTrail);

  window.addEventListener('mousemove', e => {
    trail.push({ x: e.clientX, y: e.clientY, a: 1.0, r: 5 });
    if (trail.length > 22) trail.shift();
  });

  function animTrail() {
    tc.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    trail.forEach((pt, i) => {
      pt.a  -= 0.045;
      pt.r  -= 0.15;
      if (pt.a <= 0 || pt.r <= 0) return;
      tc.save();
      tc.globalAlpha = Math.max(0, pt.a) * 0.55;
      tc.shadowBlur  = 10;
      tc.shadowColor = '#00f0ff';
      tc.fillStyle   = i % 3 === 0 ? '#00f0ff' : i % 3 === 1 ? '#9b00ff' : '#00ff88';
      tc.beginPath();
      tc.arc(pt.x, pt.y, Math.max(0.1, pt.r), 0, Math.PI*2);
      tc.fill();
      tc.restore();
    });
    requestAnimationFrame(animTrail);
  }
  animTrail();
}

// =============================================
// 18. ANIMAÇÃO DO MENU (partículas de fundo)
// =============================================

(function menuParticles() {
  const canvas = document.getElementById('trailCanvas');
  // As partículas serão desenhadas no trail canvas (já inicializado no startTrailEffect)
  // Esta função cria "estrelas digitais" flutuantes visíveis no menu
})();
