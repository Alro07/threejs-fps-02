// The DOM HUD: health, ammo, money, timer, score, killfeed, round banner, bomb
// status and the buy menu. It never touches the simulation; main.js pushes numbers
// in and reads callbacks out. All updates are cached so the DOM is only touched
// when a value actually changes.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoBox = $('ammo');
  const healthValue = $('health-value');
  const healthBar = $('health-bar');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const roundValue = $('round-value');
  const weaponName = $('weapon-name');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bombStatus = $('bomb-status');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage-flash');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const grenadeCount = $('grenade-count');
  let hitTimer = 0;
  let bannerTimer = 0;
  const cache = {};

  function setText(el, key, value) {
    if (cache[key] === value) return;
    cache[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'weapon', name);
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      setText(healthValue, 'hp', String(Math.max(0, Math.ceil(health))));
      healthBar.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthBar.classList.toggle('low', health <= 30);
      setText($('armor-value'), 'armor', armor > 0 ? `+${Math.ceil(armor)} ARMOR` : '');
    },
    setMoney(money) { setText(moneyValue, 'money', `$${money}`); setText(buyMoney, 'buymoney', `$${money}`); },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerValue, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      timerValue.classList.toggle('urgent', s <= 10);
    },
    setTimerText(text) {
      setText(timerValue, 'timer', text);
      timerValue.classList.remove('urgent');
    },
    setScore(vanguard, ember, round) {
      setText(scoreValue, 'score', `VANGUARD ${vanguard} — ${ember} EMBER`);
      setText(roundValue, 'round', `ROUND ${round} / 9`);
      const buyRound = $('buy-round');
      if (buyRound) buyRound.textContent = String(round);
    },
    setGrenades(count) { setText(grenadeCount, 'nades', count > 0 ? `◉ ${count} FRAG [G]` : ''); },
    setBomb(text, active) {
      setText(bombStatus, 'bomb', text);
      bombStatus.classList.toggle('active', !!active);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    hurt() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    feed(text, good) {
      const line = document.createElement('div');
      line.className = good ? 'feed-good' : 'feed-bad';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, sub = '', holdMs = 2600) {
      banner.querySelector('.banner-title').textContent = text;
      banner.querySelector('.banner-sub').textContent = sub;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      if (Number.isFinite(holdMs)) bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    showOverlay(mode, detail = '') {
      const COPY = {
        start: ['DUSTLINE', 'Round-based tactical FPS. Plant the charge at A or B, or eliminate EMBER. First to 5 rounds takes the match.', 'Click to play'],
        paused: ['DUSTLINE', 'Paused. Click to resume.', 'Click to resume'],
        dead: ['You are down', 'Your squad fights on. Next round starts soon.', 'Keep watching'],
        matchWin: ['MATCH WON', detail, 'Play again'],
        matchLose: ['MATCH LOST', detail, 'Play again'],
      };
      const [t, c, action] = COPY[mode] || COPY.start;
      title.textContent = t;
      copy.textContent = c;
      play.textContent = action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
    showBuy(show) { buyMenu.hidden = !show; },
    buyVisible() { return !buyMenu.hidden; },
    onBuy(handler) {
      buyMenu.querySelectorAll('[data-buy]').forEach((button) => {
        button.addEventListener('click', () => handler(button.dataset.buy));
      });
    },
  };
}
