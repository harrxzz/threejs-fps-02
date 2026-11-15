// The DOM HUD: health, ammo, timer, score, money, bots alive, bomb status, crosshair,
// hit marker, kill feed, damage direction, plant progress, buy menu and every overlay.
// It never touches the simulation; main.js pushes numbers in and reads callbacks out.
const OVERLAY_COPY = {
  start: {
    title: 'SABLE LINE',
    copy: 'A desert compound, two bomb sites, four defenders. Plant the bomb at A or B — or clear the site the hard way. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'SABLE LINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  matchWin: {
    title: 'Match won',
    copy: 'Five rounds to Sable Line. The compound is yours.',
    action: 'Play again',
  },
  matchLoss: {
    title: 'Match lost',
    copy: 'The defenders held the compound. Run it back.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthValue = $('health-value');
  const healthFill = $('health-fill');
  const armorTag = $('armor-tag');
  const bombTag = $('bomb-tag');
  const timerEl = $('timer');
  const phaseEl = $('phase-label');
  const scoreValue = $('score-value');
  const botsValue = $('bots-value');
  const moneyValue = $('money-value');
  const grenadeValue = $('grenade-value');
  const bombStatus = $('bomb-status');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const killfeed = $('killfeed');
  const damageDir = $('damage-dir');
  const damageArrow = $('damage-arrow');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buymenu = $('buymenu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const scopeOverlay = $('scope-overlay');
  const vignette = $('vignette');
  let hitTimer = 0;
  let damageTimer = 0;
  let bannerTimer = 0;
  let vignetteTimer = 0;
  let last = {};
  let buyHandler = null;
  let buyOpen = false;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, armor) {
      setText(healthValue, 'hp', String(Math.max(0, Math.ceil(hp))));
      healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      healthFill.classList.toggle('low', hp <= 30);
      armorTag.hidden = !armor;
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammo.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(timerEl, 'timer', `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      setText(phaseEl, 'phase', phase === 'buy' ? 'BUY PHASE' : phase === 'live' ? 'ROUND LIVE' : phase === 'planted' ? 'BOMB PLANTED' : 'ROUND OVER');
      timerEl.classList.toggle('urgent', (phase === 'live' && seconds <= 15) || phase === 'planted');
    },
    setScore(wins, losses, round) {
      setText(scoreValue, 'score', `${wins} — ${losses}`);
      setText($('round-value'), 'round', `ROUND ${round}`);
    },
    setMoney(amount) {
      setText(moneyValue, 'money', `$${amount}`);
      setText(buyMoney, 'buymoney', `$${amount}`);
    },
    setBotsAlive(n) {
      setText(botsValue, 'bots', String(n));
    },
    setGrenades(n) {
      setText(grenadeValue, 'nade', n > 0 ? `◉ ${n}` : '○ 0');
    },
    setBombCarried(carried) {
      bombTag.hidden = !carried;
      bombTag.textContent = 'BOMB CARRIED';
    },
    setBombStatus(text) {
      setText(bombStatus, 'bombstatus', text);
      bombStatus.hidden = text === '';
    },
    setPlantProgress(p) {
      if (p < 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.max(0, Math.min(100, p * 100))}%`;
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.max(2, Math.min(26, px))}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 5000);
    },
    damageFrom(angleRad) {
      damageDir.hidden = false;
      damageArrow.style.transform = `rotate(${angleRad}rad)`;
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => {
        damageDir.hidden = true;
      }, 900);
    },
    vignetteFlash() {
      vignette.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => vignette.classList.remove('on'), 220);
    },
    setScoped(on) {
      scopeOverlay.hidden = !on;
      crosshair.style.visibility = on ? 'hidden' : 'visible';
    },
    showBanner(titleText, subText, ms = 3000) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showOverlay(mode, score) {
      const text = OVERLAY_COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'matchWin' || mode === 'matchLoss' ? `${text.copy} Final score ${score}.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    isBuyOpen() {
      return buyOpen;
    },
    showBuy(items, money, owned, grenades, armor) {
      buyOpen = true;
      buymenu.hidden = false;
      setText(buyMoney, 'buymoney', `$${money}`);
      buyItems.innerHTML = '';
      for (const item of items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        const isOwned = item.kind === 'weapon' && owned.has(item.id);
        const isGrenade = item.kind === 'grenade' && grenades >= 1;
        const isArmor = item.kind === 'armor' && armor;
        const afford = money >= item.price;
        row.disabled = isOwned || isGrenade || isArmor || !afford;
        const state = isOwned ? 'OWNED' : isGrenade ? 'HELD' : isArmor ? 'WORN' : afford ? `$${item.price}` : `$${item.price} — NO CASH`;
        row.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-desc">${item.desc}</span><span class="buy-price">${state}</span>`;
        row.addEventListener('click', () => {
          if (buyHandler) buyHandler(item);
        });
        buyItems.appendChild(row);
      }
    },
    hideBuy() {
      buyOpen = false;
      buymenu.hidden = true;
    },
  };
}
