(() => {
  const gameEl = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const comboEl = document.getElementById('combo');
  const timeEl  = document.getElementById('time');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const muteToggle = document.getElementById('muteToggle');
  const messageEl = document.getElementById('message');

  // ---- State ----
  let score = 0;
  let combo = 0;
  let timeLeft = 60;             // seconds
  let running = false;
  let spawnTimer = 0;            // ms
  let lastTs = 0;
  let difficultyLevel = 0;       // grows with time
  let targets = new Set();
  let sfxEnabled = true;

  // ---- Audio (simple WebAudio beep) ----
  let audioCtx;
  function playBeep(freq = 800, time = 0.05, gain = 0.05) {
    if (!sfxEnabled) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const g   = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      g.gain.value = gain;
      osc.connect(g).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + time);
    } catch (_) { /* ignore */ }
  }

  // ---- Utils ----
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

  function setHUD() {
    scoreEl.textContent = score.toString();
    comboEl.textContent = combo.toString();
    timeEl.textContent  = Math.max(0, Math.floor(timeLeft)).toString();
  }

  function resetGame() {
    score = 0;
    combo = 0;
    timeLeft = 60;
    difficultyLevel = 0;
    setHUD();
    // clear targets
    targets.forEach(el => el.remove());
    targets.clear();
    messageEl.textContent = 'Tap the targets!';
  }

  function startGame() {
    if (running) return;
    resetGame();
    running = true;
    startBtn.disabled = true;
    restartBtn.disabled = true;
    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    startBtn.disabled = false;
    restartBtn.disabled = false;
    messageEl.textContent = `Time up! Score: ${score} (Max combo ${combo})`;
    playBeep(300, 0.2, 0.08);
  }

  // ---- Target spawn/behavior ----
  function spawnTarget() {
    // Difficulty curve: smaller size + faster despawn + more bad targets
    const tSize = clamp(70 - difficultyLevel * 4, 36, 70);
    const lifeMs = clamp(1300 - difficultyLevel * 70, 650, 1300);
    const isBad = Math.random() < clamp(0.10 + difficultyLevel * 0.04, 0.10, 0.45);
    const isRare = !isBad && Math.random() < 0.07;

    const x = rand(tSize, gameEl.clientWidth - tSize);
    const y = rand(tSize, gameEl.clientHeight - tSize);

    const t = document.createElement('div');
    t.className = `target ${isRare ? 'target--rare' : (isBad ? 'target--bad' : 'target--good')}`;
    t.style.left = `${x}px`;
    t.style.top  = `${y}px`;
    t.style.width = `${tSize}px`;
    t.style.height = `${tSize}px`;
    t.dataset.type = isBad ? 'bad' : (isRare ? 'rare' : 'good');
    t.dataset.expireAt = (performance.now() + lifeMs).toString();

    const ring = document.createElement('div');
    ring.className = 'target__ring';
    t.appendChild(ring);

    const label = document.createElement('span');
    label.textContent = isBad ? 'X' : (isRare ? '★' : '+');
    t.appendChild(label);

    // Click/tap handler
    t.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); // avoid miss click on background
      hitTarget(t);
    }, { passive: true });

    targets.add(t);
    gameEl.appendChild(t);
  }

  function hitTarget(t) {
    const kind = t.dataset.type;
    const rect = t.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // pop text
    const pop = document.createElement('div');
    pop.className = 'pop';
    let delta = 0;
    if (kind === 'good') {
      combo = Math.min(combo + 1, 999);
      const mult = 1 + Math.min(Math.floor(combo / 5), 4); // max x5
      delta = 10 * mult;
      score += delta;
      playBeep(1000 + mult * 120, 0.04, 0.05);
      pop.textContent = `+${delta} (x${mult})`;
      messageEl.textContent = `Nice! Combo ${combo}`;
    } else if (kind === 'rare') {
      combo = Math.min(combo + 2, 999);
      const mult = 2 + Math.min(Math.floor(combo / 5), 3); // start higher
      delta = 35 * mult;
      score += delta;
      playBeep(1400, 0.06, 0.06);
      pop.textContent = `RARE +${delta} (x${mult})`;
      messageEl.textContent = `RARE! Combo ${combo}`;
    } else { // bad
      combo = 0;
      delta = -15;
      score = Math.max(0, score + delta);
      playBeep(240, 0.08, 0.07);
      pop.textContent = `${delta}`;
      messageEl.textContent = `Oops! Combo reset`;
    }
    setHUD();

    // place pop near target center relative to viewport, convert to game coords
    const gx = cx - gameEl.getBoundingClientRect().left;
    const gy = cy - gameEl.getBoundingClientRect().top;
    pop.style.left = `${gx}px`;
    pop.style.top  = `${gy}px`;
    gameEl.appendChild(pop);
    setTimeout(() => pop.remove(), 700);

    // remove target
    t.remove();
    targets.delete(t);
  }

  // Miss click = background click
  gameEl.addEventListener('pointerdown', (ev) => {
    if (!running) return;
    // If clicked directly on game area (not target)
    if (ev.target === gameEl) {
      combo = 0;
      messageEl.textContent = `Miss! Combo reset`;
      setHUD();
      playBeep(220, 0.06, 0.06);
    }
  }, { passive: true });

  // ---- Game loop ----
  function loop(ts) {
    if (!running) return;

    const dt = ts - lastTs;
    lastTs = ts;

    // Time countdown
    timeLeft -= dt / 1000;
    if (timeLeft <= 0) {
      timeLeft = 0;
      setHUD();
      return endGame();
    }

    // Difficulty increases over time
    difficultyLevel = Math.floor((60 - timeLeft) / 6); // every 6s increases

    // Spawn control: base interval minus difficulty
    spawnTimer += dt;
    const baseInterval = 650; // ms
    const interval = clamp(baseInterval - difficultyLevel * 40, 280, baseInterval);
    if (spawnTimer >= interval) {
      spawnTimer = 0;
      // multi-spawn at higher difficulties
      const count = 1 + Math.floor(difficultyLevel / 3);
      for (let i = 0; i < count; i++) spawnTarget();
    }

    // Despawn expired targets
    const now = ts;
    targets.forEach(t => {
      const expireAt = Number(t.dataset.expireAt || now);
      if (expireAt <= now) {
        t.remove();
        targets.delete(t);
      } else {
        // slight jitter animation on higher difficulty
        if (difficultyLevel >= 5) {
          const j = Math.sin(now / 60 + Math.random()) * 1.2;
          t.style.transform = `translate(-50%, calc(-50% + ${j}px))`;
        }
      }
    });

    setHUD();
    requestAnimationFrame(loop);
  }

  // ---- Controls ----
  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', () => {
    resetGame();
    startGame();
  });
  muteToggle.addEventListener('change', (e) => {
    sfxEnabled = !e.target.checked;
  });

  // Accessibility: prevent long-press context menu on mobile
  window.addEventListener('contextmenu', (e) => {
    if (e.target.classList && e.target.classList.contains('target')) e.preventDefault();
  });
