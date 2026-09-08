'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const GRID = 20;
const CELL = canvas.width / GRID;
const COMBO_MS = 4000;
const levels = {
  1: { name: '第一关 · 水果冲刺', timeMs: 45000, target: 8, rocks: [], portals: [] },
  2: {
    name: '第二关 · 石头迷宫', timeMs: 60000, target: 12,
    rocks: [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 14, y: 4 }, { x: 15, y: 4 }, { x: 4, y: 15 }, { x: 5, y: 15 }, { x: 14, y: 15 }, { x: 15, y: 15 }],
    portals: [{ x: 2, y: 10 }, { x: 17, y: 10 }]
  }
};
const directions = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const itemTypes = [{ icon: '🍒', name: '甜甜樱桃' }, { icon: '❄️', name: '慢慢雪花' }, { icon: '🛡️', name: '保护盾牌' }];

let snake, dir, queue, food, score, state = 'ready', timer = null, best = 0;
let item, itemIndex, slowMs, shield, elapsed, nextItemAt, stepMs;
let applesEaten, combo, lastAppleAt, goldApple, nextGoldAt;
let currentLevel = 1, level = levels[1], obstacles = [], portals = [], nextLevel = null;
try { best = Number(localStorage.getItem('garden-snake-best')) || 0; } catch {}
$('best').textContent = best;

function randomEmpty(exclude = null) {
  const empty = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const occupied = snake.some(s => s.x === x && s.y === y)
      || (food && food.x === x && food.y === y)
      || (item && item.x === x && item.y === y)
      || (goldApple && goldApple.x === x && goldApple.y === y)
      || obstacles.some(o => o.x === x && o.y === y)
      || portals.some(p => p.x === x && p.y === y)
      || (exclude && exclude.x === x && exclude.y === y);
    if (!occupied) empty.push({ x, y });
  }
  return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null;
}

function reset(levelNumber = currentLevel) {
  currentLevel = levelNumber; level = levels[currentLevel];
  obstacles = level.rocks.map(rock => ({ ...rock }));
  portals = level.portals.map(portal => ({ ...portal }));
  snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
  dir = directions.right; queue = []; score = 0; applesEaten = 0;
  item = null; itemIndex = 0; slowMs = 0; shield = false;
  elapsed = 0; nextItemAt = 0; stepMs = 180;
  combo = 0; lastAppleAt = -COMBO_MS; goldApple = null; nextGoldAt = 7000;
  food = { x: 13, y: 10 };
  nextLevel = null;
  spawnItem(); updateHUD(); draw();
}

function spawnFood() { food = null; food = randomEmpty(); }
function spawnItem() {
  item = null;
  const cell = randomEmpty();
  if (cell) item = { ...cell, type: itemIndex++ % 3, expires: elapsed + 12000 };
  nextItemAt = elapsed + 16000;
}
function spawnGold() {
  goldApple = null;
  const cell = randomEmpty();
  if (cell) goldApple = { ...cell, expires: elapsed + 8000, movesAt: elapsed + 1500 };
  nextGoldAt = elapsed + 18000;
}
function moveGold() {
  if (!goldApple) return;
  const oldCell = goldApple;
  const expires = goldApple.expires;
  goldApple = null;
  const cell = randomEmpty(oldCell);
  if (cell) goldApple = { ...cell, expires, movesAt: elapsed + 1500 };
}

function updateHUD() {
  $('score').textContent = score;
  $('levelName').textContent = level.name;
  $('target').textContent = level.target;
  $('taskNow').textContent = applesEaten;
  $('time').textContent = Math.max(0, Math.ceil((level.timeMs - elapsed) / 1000));
  $('progressFill').style.width = `${Math.min(100, applesEaten / level.target * 100)}%`;
  const comboLeft = Math.max(0, Math.ceil((COMBO_MS - (elapsed - lastAppleAt)) / 1000));
  $('combo').textContent = combo > 1 && comboLeft > 0 ? `🔥 ${combo} 连吃 · ${comboLeft} 秒` : '连续吃苹果，会有加分奖励';
  const effects = [];
  if (shield) effects.push('🛡️ 护盾：可挡一次碰撞');
  if (slowMs > 0) effects.push(`❄️ 慢速：还剩 ${Math.ceil(slowMs / 1000)} 秒`);
  $('effects').textContent = effects.join(' · ') || '寻找道具，给小蛇一点小惊喜！';
  const hints = [];
  if (goldApple) hints.push(`🌟 金苹果在逃跑 · 还剩 ${Math.ceil((goldApple.expires - elapsed) / 1000)} 秒`);
  if (item) hints.push(`${itemTypes[item.type].icon} ${itemTypes[item.type].name} · 还剩 ${Math.ceil((item.expires - elapsed) / 1000)} 秒`);
  $('itemHint').textContent = hints.join('　') || `下个惊喜还有 ${Math.max(0, Math.ceil((Math.min(nextItemAt, nextGoldAt) - elapsed) / 1000))} 秒`;
}

function schedule() {
  clearInterval(timer);
  stepMs = slowMs > 0 ? 300 : 180;
  timer = setInterval(tick, stepMs);
}
function focusBoardOnPhone() {
  if (typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches) return;
  requestAnimationFrame(() => document.querySelector('.board').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
function addScore(points) {
  score += points;
  if (score > best) {
    best = score; $('best').textContent = best;
    try { localStorage.setItem('garden-snake-best', String(best)); } catch {}
  }
}
function round(x, y, w, h, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); }
function drawEmoji(emoji, cell, size = 21) {
  ctx.font = `${size}px Segoe UI Emoji`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(emoji, (cell.x + .5) * CELL, (cell.y + .5) * CELL + 1);
}
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#e7eed6' : '#edf2df'; ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }
  obstacles.forEach(rock => {
    ctx.fillStyle = '#899384'; ctx.beginPath();
    ctx.arc((rock.x + .5) * CELL, (rock.y + .58) * CELL, 11, Math.PI, 0);
    ctx.lineTo((rock.x + .88) * CELL, (rock.y + .82) * CELL);
    ctx.lineTo((rock.x + .12) * CELL, (rock.y + .82) * CELL); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b8c0ae'; ctx.beginPath(); ctx.arc((rock.x + .38) * CELL, (rock.y + .5) * CELL, 3, 0, Math.PI * 2); ctx.fill();
  });
  portals.forEach((portal, index) => {
    ctx.strokeStyle = index ? '#b36bca' : '#4e93ce'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.arc((portal.x + .5) * CELL, (portal.y + .5) * CELL, 10, 0, Math.PI * 1.7); ctx.stroke();
    ctx.fillStyle = index ? '#b36bca' : '#4e93ce'; ctx.beginPath();
    ctx.arc((portal.x + .5) * CELL, (portal.y + .5) * CELL, 3, 0, Math.PI * 2); ctx.fill();
  });
  if (food) drawEmoji('🍎', food, 22);
  if (item) {
    round(item.x * CELL + 1, item.y * CELL + 1, CELL - 2, CELL - 2, 8, ['#ffe4bd', '#d4edf4', '#e3ddff'][item.type]);
    drawEmoji(itemTypes[item.type].icon, item);
  }
  if (goldApple) {
    ctx.fillStyle = '#fff2a8'; ctx.beginPath();
    ctx.arc((goldApple.x + .5) * CELL, (goldApple.y + .5) * CELL, 16, 0, Math.PI * 2); ctx.fill();
    drawEmoji('🌟', goldApple, 23);
  }
  if (shield) { const h = snake[0]; round(h.x * CELL - 2, h.y * CELL - 2, CELL + 4, CELL + 4, 12, '#b5a0ed'); }
  snake.slice().reverse().forEach((s, i) => round(s.x * CELL + 1.5, s.y * CELL + 1.5, CELL - 3, CELL - 3, 9, i === snake.length - 1 ? '#377449' : '#78a75b'));
  const h = snake[0], cx = (h.x + .5) * CELL, cy = (h.y + .5) * CELL;
  for (const side of [-1, 1]) {
    const ex = cx + dir.x * 5 - dir.y * side * 5, ey = cy + dir.y * 5 + dir.x * side * 5;
    ctx.fillStyle = '#fffdf0'; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#203e2d'; ctx.beginPath(); ctx.arc(ex + dir.x, ey + dir.y, 2, 0, Math.PI * 2); ctx.fill();
  }
}

function overlay(title, description, button, icon) {
  $('title').textContent = title; $('description').textContent = description;
  $('start').textContent = button; $('icon').textContent = icon; $('cover').hidden = false;
}
function start(levelNumber = currentLevel) {
  clearInterval(timer); reset(levelNumber); state = 'playing'; $('cover').hidden = true;
  $('pause').disabled = false; $('pause').textContent = '暂停 Ⅱ';
  $('status').textContent = `${level.name}开始！${level.timeMs / 1000} 秒内吃到 ${level.target} 颗苹果。`;
  schedule(); focusBoardOnPhone();
}
function finish(kind = 'crash') {
  state = 'over'; clearInterval(timer); timer = null; $('pause').disabled = true;
  if (kind === 'win') {
    if (currentLevel === 1) {
      nextLevel = 2;
      overlay('第一关完成！', `得到 ${score} 分！第二关有石头和神奇传送门。`, '进入第二关 →', '🏆');
      $('status').textContent = '新关卡解锁：石头迷宫！';
    } else {
      overlay('石头迷宫完成！', `你穿过了传送门，吃到 ${applesEaten} 颗苹果！`, '再挑战第二关 →', '🎉');
      $('status').textContent = '两关全部完成！试试打破自己的最高分吧。';
    }
  } else if (kind === 'time') {
    overlay('时间到啦！', `还差 ${level.target - applesEaten} 颗苹果。记得追金苹果和连续吃哦！`, '再试一次 →', '⏰');
    $('status').textContent = '差一点！再试一次，一定能成功。';
  } else {
    overlay('小蛇休息一下！', `这次吃到了 ${applesEaten} 颗苹果，得到 ${score} 分。`, '再玩一次 →', '🌼');
    $('status').textContent = '撞到了，没关系，再试一次吧。';
  }
  updateHUD();
}

function eatApple(isGold) {
  combo = elapsed - lastAppleAt <= COMBO_MS ? combo + 1 : 1;
  lastAppleAt = elapsed; applesEaten++;
  const base = isGold ? 5 : 1;
  const bonus = Math.min(4, combo - 1);
  addScore(base + bonus);
  $('status').textContent = isGold
    ? `🌟 抓到金苹果！+${base + bonus} 分，算 1 颗任务苹果！`
    : combo > 1 ? `🔥 ${combo} 连吃！+${base + bonus} 分！` : '苹果 +1 分！快去追下一颗。';
}

function tick() {
  if (state !== 'playing') return;
  elapsed += stepMs;
  if (elapsed >= level.timeMs) { finish('time'); return; }
  const wasSlow = slowMs > 0;
  slowMs = Math.max(0, slowMs - stepMs);
  if (wasSlow && !slowMs) schedule();
  if (combo && elapsed - lastAppleAt > COMBO_MS) combo = 0;
  if (item && elapsed >= item.expires) item = null;
  if (!item && elapsed >= nextItemAt) spawnItem();
  if (goldApple && elapsed >= goldApple.expires) goldApple = null;
  if (!goldApple && elapsed >= nextGoldAt) spawnGold();
  if (goldApple && elapsed >= goldApple.movesAt) moveGold();
  if (queue.length) dir = queue.shift();

  let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
  const portalIndex = portals.findIndex(p => p.x === head.x && p.y === head.y);
  if (portalIndex >= 0) {
    const exit = portals[portalIndex === 0 ? 1 : 0];
    head = { x: exit.x, y: exit.y };
    $('status').textContent = '🌀 嗖！小蛇从另一个传送门出来啦！';
  }
  const eatsFood = food && head.x === food.x && head.y === food.y;
  const eatsGold = goldApple && head.x === goldApple.x && head.y === goldApple.y;
  const grows = eatsFood || eatsGold;
  const body = grows ? snake : snake.slice(0, -1);
  const collision = head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID
    || body.some(s => s.x === head.x && s.y === head.y)
    || obstacles.some(o => o.x === head.x && o.y === head.y);
  if (collision) {
    if (shield) {
      shield = false; queue = []; pause();
      overlay('护盾保护了你！', '小蛇已经停住。先选一个安全方向，再点继续玩。', '继续玩 →', '🛡️');
      $('status').textContent = '护盾用掉啦！换个方向就能继续。'; draw(); updateHUD(); return;
    }
    finish('crash'); return;
  }

  snake.unshift(head);
  if (eatsFood) { eatApple(false); spawnFood(); }
  else if (eatsGold) { eatApple(true); goldApple = null; nextGoldAt = elapsed + 10000; }
  else snake.pop();

  if (item && head.x === item.x && head.y === item.y) {
    const type = item.type; item = null; nextItemAt = elapsed + 3000;
    if (type === 0) { addScore(3); $('status').textContent = '🍒 樱桃 +3 分！'; }
    else if (type === 1) { slowMs = 8000; schedule(); $('status').textContent = '❄️ 慢下来啦！接下来 8 秒可以从容转弯。'; }
    else { shield = true; $('status').textContent = '🛡️ 护盾准备好啦！能挡住一次碰撞。'; }
  }
  updateHUD(); draw();
  if (applesEaten >= level.target) finish('win');
}

function turn(name) {
  if (!['playing', 'paused'].includes(state) || queue.length >= 2) return;
  const next = directions[name], last = queue.length ? queue[queue.length - 1] : dir;
  if ((next.x === -last.x && next.y === -last.y) || (next.x === last.x && next.y === last.y)) return;
  queue.push(next);
}
function pause() {
  if (state === 'playing') {
    state = 'paused'; clearInterval(timer); timer = null; $('pause').textContent = '继续 ▶';
    overlay('歇一会儿吧', '任务时间、道具和连吃倒计时都停住了。', '继续玩 →', '☁️');
    $('status').textContent = '已暂停，小蛇正在等你。';
  } else if (state === 'paused') {
    state = 'playing'; $('cover').hidden = true; $('pause').textContent = '暂停 Ⅱ';
    $('status').textContent = `继续挑战${level.name}！`; schedule();
  }
}

$('start').onclick = () => state === 'paused' ? pause() : start(nextLevel || currentLevel);
$('restart').onclick = () => start(currentLevel); $('pause').onclick = pause;
document.querySelectorAll('[data-restart]').forEach(b => b.onclick = () => start(currentLevel));
document.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => turn(b.dataset.dir));
document.addEventListener('keydown', e => {
  const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  const name = keys[e.key] || keys[e.key.toLowerCase()];
  if (name) { e.preventDefault(); turn(name); }
  else if (e.code === 'Space' && (state === 'playing' || state === 'paused')) { e.preventDefault(); if (!e.repeat) pause(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });
reset();
