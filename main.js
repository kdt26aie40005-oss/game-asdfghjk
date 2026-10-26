const SAVE_KEY = "nail-clicker-save";
const SAVE_INTERVAL_MS = 60000;
const TICK_MS = 100;

// 各施設の強化（金づち以外）。段階ごとの「必要な施設の数」と「最初の値段の何倍か」
const TIER_REQUIREMENTS = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350];
const TIER_COST_MULTS = [10, 50, 500, 5e4, 5e6, 5e8, 5e11, 5e14, 5e17, 5e20];

// 金づちの強化
const HAMMER_TIER_REQUIREMENTS = [1, 1, 10, 25, 50, 100, 150, 200, 250, 300];
const HAMMER_TIER_COSTS = [100, 500, 1e4, 1e5, 1e7, 1e8, 1e9, 1e10, 1e13, 1e16];
// 1〜3 段目はクリックと金づちを 2 倍にする。4 段目から「施設 1 つにつき +0.1」が付く
const HAMMER_DOUBLING_TIERS = 3;
const FINGERS_TIER = 4;
// 5〜10 段目で、4 段目の +0.1 を何倍にするか
const FINGERS_MULTS = [5, 10, 20, 20, 20, 20];

// 大工さんの組み合わせ強化。値段は組み合わせる施設の最初の値段の 50 倍
const SYNERGY_COST_MULT = 50;
const SYNERGY_CARPENTER_REQUIREMENT = 15;

// 手袋の強化。条件はクリックで作った釘の本数
const GLOVE_COSTS = [5e4, 5e6, 5e8, 5e10];
const GLOVE_REQUIREMENTS = [1e3, 1e5, 1e7, 1e9];
const GLOVE_CPS_RATE = 0.01;

const UNITS = ["", "万", "億", "兆", "京", "垓", "秭", "穣", "溝", "澗", "正", "載", "極"];

const buildingById = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

let state = createInitialState();

function createInitialState() {
  return {
    nails: 0,
    handmade: 0, // クリックで作った釘の本数
    owned: Object.fromEntries(BUILDINGS.map((b) => [b.id, 0])),
    upgrades: new Set(),
  };
}

function has(upgradeId) {
  return state.upgrades.has(upgradeId);
}

// ---------- 強化の一覧を作る ----------

const UPGRADES = [];

for (const b of BUILDINGS) {
  b.tiers.forEach(([name, desc], i) => {
    const tier = i + 1;
    if (b.id === "hammer") {
      UPGRADES.push({
        id: `hammer-${tier}`,
        name,
        desc,
        cost: HAMMER_TIER_COSTS[i],
        effect: hammerEffectText(tier),
        isUnlocked: () => state.owned.hammer >= HAMMER_TIER_REQUIREMENTS[i],
      });
    } else {
      UPGRADES.push({
        id: `${b.id}-${tier}`,
        name,
        desc,
        cost: b.baseCost * TIER_COST_MULTS[i],
        effect: `${b.name}の生産量が2倍`,
        isUnlocked: () => state.owned[b.id] >= TIER_REQUIREMENTS[i],
      });
    }
  });
}

SYNERGIES.forEach((s, i) => {
  const target = buildingById[s.building];
  UPGRADES.push({
    id: `synergy-${s.building}`,
    name: s.name,
    desc: s.desc,
    cost: target.baseCost * SYNERGY_COST_MULT,
    effect: `大工さんの生産量が2倍。${target.name}は大工さん${i + 1}人につき+1%`,
    isUnlocked: () =>
      state.owned.carpenter >= SYNERGY_CARPENTER_REQUIREMENT && state.owned[s.building] >= 1,
  });
});

GLOVES.forEach((g, i) => {
  UPGRADES.push({
    id: `glove-${i + 1}`,
    name: g.name,
    desc: g.desc,
    cost: GLOVE_COSTS[i],
    effect: "クリックするたび、毎秒の生産量の1%を追加で獲得",
    isUnlocked: () => state.handmade >= GLOVE_REQUIREMENTS[i],
  });
});

function hammerEffectText(tier) {
  if (tier <= HAMMER_DOUBLING_TIERS) return "クリックと金づちの効果が2倍";
  if (tier === FINGERS_TIER) return "金づち以外の施設1つにつき、クリックと金づちが+0.1本";
  return `「千本の金づち」の効果が${FINGERS_MULTS[tier - FINGERS_TIER - 1]}倍`;
}

// ---------- 生産量の計算 ----------

function countTiers(buildingId, fromTier, toTier) {
  let count = 0;
  for (let t = fromTier; t <= toTier; t++) {
    if (has(`${buildingId}-${t}`)) count++;
  }
  return count;
}

// 金づちの 4 段目以降で、クリックと金づち 1 つに足される本数
function fingersBonus() {
  if (!has(`hammer-${FINGERS_TIER}`)) return 0;
  let bonus = 0.1;
  FINGERS_MULTS.forEach((mult, i) => {
    if (has(`hammer-${FINGERS_TIER + 1 + i}`)) bonus *= mult;
  });
  const otherBuildings = BUILDINGS.reduce(
    (sum, b) => (b.id === "hammer" ? sum : sum + state.owned[b.id]),
    0
  );
  return bonus * otherBuildings;
}

function hammerMultiplier() {
  return Math.pow(2, countTiers("hammer", 1, HAMMER_DOUBLING_TIERS));
}

// 施設 1 種類ぶんの毎秒の生産量
function buildingCps(b) {
  const owned = state.owned[b.id];
  if (owned === 0) return 0;

  if (b.id === "hammer") {
    return (b.cps * hammerMultiplier() + fingersBonus()) * owned;
  }

  let mult = Math.pow(2, countTiers(b.id, 1, b.tiers.length));
  SYNERGIES.forEach((s, i) => {
    if (!has(`synergy-${s.building}`)) return;
    if (b.id === "carpenter") mult *= 2;
    if (b.id === s.building) mult *= 1 + (state.owned.carpenter * 0.01) / (i + 1);
  });
  return b.cps * mult * owned;
}

function perSecond() {
  return BUILDINGS.reduce((sum, b) => sum + buildingCps(b), 0);
}

function clickValue() {
  const gloves = GLOVES.filter((_, i) => has(`glove-${i + 1}`)).length;
  return hammerMultiplier() + fingersBonus() + perSecond() * GLOVE_CPS_RATE * gloves;
}

function costOf(building) {
  return Math.ceil(building.baseCost * Math.pow(1.15, state.owned[building.id]));
}

// ---------- 数の表示 ----------

// 1 万未満はそのまま、1 万以上は日本語の単位で有効数字 3 桁（切り捨て）にする
function format(n, fractionDigits = 0) {
  if (n < 1e4) {
    return n.toLocaleString("ja-JP", { maximumFractionDigits: fractionDigits });
  }
  const step = Math.pow(10, Math.floor(Math.log10(n)) - 2);
  const truncated = Math.floor(n / step) * step;
  const unitIndex = Math.min(Math.floor(Math.log10(truncated) / 4), UNITS.length - 1);
  const value = Number((truncated / Math.pow(10, unitIndex * 4)).toPrecision(3));
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 2 }) + UNITS[unitIndex];
}

// ---------- 画面 ----------

const nailsEl = document.getElementById("nails");
const perSecondEl = document.getElementById("perSecond");
const nailButton = document.getElementById("nail");
const upgradesEl = document.getElementById("upgrades");
const buildingsEl = document.getElementById("buildings");

const buildingViews = [];
let shownUpgradeKey = null;
let upgradeViews = [];

function buildBuildings() {
  for (const b of BUILDINGS) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.innerHTML =
      `<span><span class="item-name">${b.name}</span>` +
      `<small>${b.desc}</small>` +
      `<small class="cost"></small></span>` +
      `<span class="owned"></span>`;
    button.addEventListener("click", () => buyBuilding(b));
    li.appendChild(button);
    buildingsEl.appendChild(li);
    buildingViews.push({
      building: b,
      button,
      cost: button.querySelector(".cost"),
      owned: button.querySelector(".owned"),
    });
  }
}

function visibleUpgrades() {
  return UPGRADES.filter((u) => !has(u.id) && u.isUnlocked()).sort((a, b) => a.cost - b.cost);
}

// 並ぶ強化が変わったときだけ作り直す（毎回作り直すとクリックしにくくなるため）
function renderUpgrades() {
  const visible = visibleUpgrades();
  const key = visible.map((u) => u.id).join(",");
  if (key !== shownUpgradeKey) {
    shownUpgradeKey = key;
    upgradesEl.innerHTML = "";
    upgradeViews = visible.map((u) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.innerHTML =
        `<span><span class="item-name">${u.name}</span>` +
        `<small class="effect">${u.effect}</small>` +
        `<small>${u.desc}</small></span>` +
        `<span class="cost">${format(u.cost)} 本</span>`;
      button.addEventListener("click", () => buyUpgrade(u));
      li.appendChild(button);
      upgradesEl.appendChild(li);
      return { upgrade: u, button };
    });
    if (visible.length === 0) {
      upgradesEl.innerHTML = '<li class="empty">まだ買える強化はありません</li>';
    }
  }
  for (const v of upgradeViews) {
    v.button.disabled = state.nails < v.upgrade.cost;
  }
}

function render() {
  nailsEl.textContent = format(Math.floor(state.nails));
  perSecondEl.textContent = format(perSecond(), 1);
  for (const v of buildingViews) {
    const cost = costOf(v.building);
    v.button.disabled = state.nails < cost;
    v.cost.textContent = `${format(cost)} 本`;
    v.owned.textContent = state.owned[v.building.id];
  }
  renderUpgrades();
}

// ---------- 操作 ----------

function buyBuilding(building) {
  const cost = costOf(building);
  if (state.nails < cost) return;
  state.nails -= cost;
  state.owned[building.id] += 1;
  render();
}

function buyUpgrade(upgrade) {
  if (has(upgrade.id) || state.nails < upgrade.cost) return;
  state.nails -= upgrade.cost;
  state.upgrades.add(upgrade.id);
  render();
}

function showFloat(x, y) {
  const el = document.createElement("span");
  el.className = "float";
  el.textContent = CLICK_WORDS[Math.floor(Math.random() * CLICK_WORDS.length)];
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  nailButton.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

nailButton.addEventListener("click", (e) => {
  const gain = clickValue();
  state.nails += gain;
  state.handmade += gain;
  const rect = nailButton.getBoundingClientRect();
  showFloat(e.clientX - rect.left, e.clientY - rect.top);
  render();
});

// ---------- セーブ ----------

function save() {
  const data = { ...state, upgrades: [...state.upgrades] };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function load() {
  const data = localStorage.getItem(SAVE_KEY);
  if (!data) return;
  let saved;
  try {
    saved = JSON.parse(data);
  } catch {
    return;
  }
  state.nails = saved.nails ?? 0;
  state.handmade = saved.handmade ?? 0;
  for (const b of BUILDINGS) {
    state.owned[b.id] = saved.owned?.[b.id] ?? 0;
  }
  state.upgrades = new Set(saved.upgrades ?? []);
}

document.getElementById("reset").addEventListener("click", () => {
  localStorage.removeItem(SAVE_KEY);
  state = createInitialState();
  render();
});

// 0.1 秒ごとに毎秒の生産分を加算する
setInterval(() => {
  state.nails += perSecond() * (TICK_MS / 1000);
  render();
}, TICK_MS);

setInterval(save, SAVE_INTERVAL_MS);
window.addEventListener("beforeunload", save);

load();
buildBuildings();
render();
