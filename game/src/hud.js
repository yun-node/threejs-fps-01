// hud.js — DOM HUD, buy menu, banners, kill feed. One job: the screen chrome.
import { WEAPONS, GRENADES } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    health: $('health'), healthNum: $('health-num'), healthFill: $('health-fill'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammoName: $('ammo-name'), ammo: $('ammo'),
    roundNum: $('round-num'), timer: $('timer'), score: $('score'),
    moneyNum: $('money-num'), feed: $('feed'), objective: $('objective'),
    hitmarker: $('hitmarker'), crosshair: $('crosshair'),
    plantbar: $('plantbar'), plantLabel: $('plant-label'), plantFill: $('plant-fill'),
    banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    hint: $('hint'),
    menu: $('overlay-menu'), buy: $('overlay-buy'), end: $('overlay-end'),
    buyRound: $('buy-round'), buyMoney: $('buy-money'), shop: $('shop'),
    endTitle: $('end-title'), endCopy: $('end-copy'),
  };
  let hitTimer = 0;
  const hud = {
    el,
    update(S) {
      const p = S.player, a = S.arsenal;
      const w = WEAPONS[a.current];
      el.healthNum.textContent = Math.ceil(p.hp);
      el.healthFill.style.width = `${Math.max(0, p.hp)}%`;
      el.health.classList.toggle('low', p.hp <= 30);
      el.ammoMag.textContent = a.mag[a.current];
      el.ammoReserve.textContent = ` / ${a.reserve[a.current]}`;
      el.ammoName.textContent = w.name + (a.reloading > 0 ? ' — RELOADING' : '');
      el.ammo.classList.toggle('empty', a.mag[a.current] === 0);
      el.roundNum.textContent = S.round;
      const t = Math.max(0, Math.ceil(S.roundTimeLeft));
      el.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      el.timer.classList.toggle('warn', S.roundTimeLeft < 20);
      el.score.textContent = `${S.score.won} – ${S.score.lost}`;
      el.moneyNum.textContent = `$${S.money}`;
      // Crosshair spreads with current spread.
      const spread = S.spreadPx || 0;
      el.crosshair.style.transform = `translate(-50%, -50%) scale(${1 + spread * 0.12})`;
      // Plant / defuse progress — only while a round is live.
      const planting = S.phase === 'playing' && S.plantProgress > 0 && S.plantProgress < 1 && S.bomb.state === 'carried';
      const defusing = S.phase === 'playing' && S.bomb.state === 'planted' && S.defuseProgress > 0;
      if (planting) {
        el.plantbar.style.display = 'block';
        el.plantLabel.textContent = 'Planting charge… hold E';
        el.plantFill.style.width = `${S.plantProgress * 100}%`;
      } else if (defusing) {
        el.plantbar.style.display = 'block';
        el.plantLabel.textContent = 'HOSTILE DEFUSING THE CHARGE';
        el.plantFill.style.width = `${S.defuseProgress * 100}%`;
      } else if (S.phase === 'playing' && S.bomb.state === 'planted') {
        el.plantbar.style.display = 'block';
        el.plantLabel.textContent = `CHARGE LIVE — ${Math.ceil(S.bomb.timer)}s`;
        el.plantFill.style.width = `${(1 - S.bomb.timer / 35) * 100}%`;
      } else {
        el.plantbar.style.display = 'none';
      }
      if (S.phase !== 'playing') el.hint.style.display = 'none';
      if (hitTimer > 0) hitTimer -= 1;
      if (hitTimer === 0) el.hitmarker.classList.remove('on', 'kill');
    },
    hitmarker(kill) {
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', !!kill);
      hitTimer = 6;
    },
    feedLine(html) {
      const div = document.createElement('div');
      div.innerHTML = html;
      el.feed.prepend(div);
      while (el.feed.children.length > 5) el.feed.lastChild.remove();
    },
    banner(win, title, sub) {
      el.banner.style.display = 'block';
      el.banner.className = win ? 'win' : 'lose';
      el.banner.id = 'banner';
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
    },
    hideBanner() { el.banner.style.display = 'none'; },
    hint(text) {
      el.hint.style.display = text ? 'block' : 'none';
      el.hint.textContent = text || '';
    },
    showMenu() { el.menu.hidden = false; el.buy.hidden = true; el.end.hidden = true; },
    showBuy(S) {
      el.menu.hidden = true; el.end.hidden = true; el.buy.hidden = false;
      el.buyRound.textContent = S.round;
      el.buyMoney.textContent = `$${S.money} — buy what you need, then deploy`;
      el.shop.innerHTML = '';
      const items = [];
      for (const id in WEAPONS) items.push({ key: String(items.length + 1), id, name: WEAPONS[id].name, price: WEAPONS[id].price, owned: !!S.arsenal.owned[id] });
      items.push({ key: '5', id: 'frag', name: GRENADES.frag.name, price: GRENADES.frag.price, owned: false, count: S.arsenal.grenades.frag });
      items.push({ key: '6', id: 'flash', name: GRENADES.flash.name, price: GRENADES.flash.price, owned: false, count: S.arsenal.grenades.flash });
      for (const it of items) {
        const d = document.createElement('div');
        d.className = 'item' + (it.owned ? ' owned' : '') + (!it.owned && it.price > S.money ? ' poor' : '');
        const label = it.count !== undefined ? `${it.name} ×${it.count}` : it.name;
        d.innerHTML = `<span><span class="key">${it.key}</span>${label}</span><span class="price">${it.owned ? 'OWNED' : '$' + it.price}</span>`;
        d.addEventListener('click', () => S.buyItem(it.id));
        el.shop.appendChild(d);
      }
    },
    showEnd(won, lost) {
      el.menu.hidden = true; el.buy.hidden = true; el.end.hidden = false;
      el.endTitle.textContent = won > lost ? 'SHIFT COMPLETE — FOUNDRY-9 IS YOURS' : 'SHIFT LOST — THE FOUNDRY KEEPS ITS SECRETS';
      el.endCopy.textContent = `Final score ${won} – ${lost} over 8 rounds. The charge is spent, the furnace cools, and the next crew is already clocking in.`;
    },
    hideAll() { el.menu.hidden = true; el.buy.hidden = true; el.end.hidden = true; },
  };
  return hud;
}
