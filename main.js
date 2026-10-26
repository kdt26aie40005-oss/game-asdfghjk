const SAVE_KEY = "nail-clicker-save";

// ショップの施設。cps は 1 つあたりの毎秒の釘の本数
const BUILDINGS = [
  { id: "hammer", name: "金づち", baseCost: 15, cps: 0.1 },
  { id: "carpenter", name: "大工さん", baseCost: 100, cps: 1 },
  { id: "nailgun", name: "釘打ち機", baseCost: 1100, cps: 8 },
  { id: "workshop", name: "工務店", baseCost: 12000, cps: 47 },
  { id: "factory", name: "釘工場", baseCost: 130000, cps: 260 },
];

let state = {
  nails: 0,
  owned: Object.fromEntries(BUILDINGS.map((b) => [b.id, 0])),
};

const nailsEl = document.getElementById("nails");
const perSecondEl = document.getElementById("perSecond");
const nailButton = document.getElementById("nail");
const shopEl = document.getElementById("shop");

function costOf(building) {
  return Math.ceil(building.baseCost * Math.pow(1.15, state.owned[building.id]));
}

function perSecond() {
  return BUILDINGS.reduce((sum, b) => sum + b.cps * state.owned[b.id], 0);
}

function format(n) {
  return Math.floor(n).toLocaleString("ja-JP");
}

function buildShop() {
  for (const b of BUILDINGS) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.addEventListener("click", () => buy(b));
    li.appendChild(button);
    shopEl.appendChild(li);
    b.button = button;
  }
}

function render() {
  nailsEl.textContent = format(state.nails);
  perSecondEl.textContent = perSecond().toFixed(1);
  for (const b of BUILDINGS) {
    const cost = costOf(b);
    b.button.disabled = state.nails < cost;
    b.button.innerHTML =
      `<span>${b.name}<small>${format(cost)} 本 / 毎秒 +${b.cps}</small></span>` +
      `<span class="owned">${state.owned[b.id]}</span>`;
  }
}

function buy(building) {
  const cost = costOf(building);
  if (state.nails < cost) return;
  state.nails -= cost;
  state.owned[building.id] += 1;
  render();
}

function showFloat(x, y) {
  const el = document.createElement("span");
  el.className = "float";
  el.textContent = "+1";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  nailButton.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

nailButton.addEventListener("click", (e) => {
  state.nails += 1;
  const rect = nailButton.getBoundingClientRect();
  showFloat(e.clientX - rect.left, e.clientY - rect.top);
  render();
});

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  const data = localStorage.getItem(SAVE_KEY);
  if (!data) return;
  const saved = JSON.parse(data);
  state.nails = saved.nails ?? 0;
  for (const b of BUILDINGS) {
    state.owned[b.id] = saved.owned?.[b.id] ?? 0;
  }
}

document.getElementById("reset").addEventListener("click", () => {
  localStorage.removeItem(SAVE_KEY);
  state.nails = 0;
  for (const b of BUILDINGS) state.owned[b.id] = 0;
  render();
});

// 0.1 秒ごとに毎秒の生産分を加算する
const TICK_MS = 100;
setInterval(() => {
  state.nails += perSecond() * (TICK_MS / 1000);
  render();
}, TICK_MS);

setInterval(save, 5000);
window.addEventListener("beforeunload", save);

load();
buildShop();
render();
