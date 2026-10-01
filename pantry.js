'use strict';
/* Pack-aware pantry tracking — deterministic, no LLM involved.
   Catalog (pantry-catalog.json): the known multi-week items and how long a
   pack lasts. State (pantry-state.json): the running weeksRemaining counter
   per item, plus which calendar week (Monday) was last processed and what
   it decided, so a day's re-run within the same week is a no-op.
   True one-off basics (oil, salt, stock cubes, flour, ...) are simply never
   given a catalog entry, so they never enter this system at all. */

function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function mondayOf(dateYMD) {
  const d = new Date(dateYMD + 'T00:00:00');
  const dow = d.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(d, -back);
}

// catalog: [{ id, name, match, weeksSupply }]
// state: { lastProcessedWeek, thisWeekRestock, items: { id: { weeksRemaining } } }
// meals: the WEEK_MEAL_PLAN-shaped object (meals.json), keyed by YYYY-MM-DD
// todayYMD: today's date in Europe/London, 'YYYY-MM-DD'
function computePantryRestock(catalog, state, meals, todayYMD) {
  state = state && typeof state === 'object' ? state : { lastProcessedWeek: null, thisWeekRestock: [], items: {} };
  state.items = state.items || {};

  const mon = mondayOf(todayYMD);
  const weekKey = ymd(mon);

  // Already decided this calendar week — same answer every day until Monday rolls over.
  if (state.lastProcessedWeek === weekKey) {
    return { restock: state.thisWeekRestock || [], state: state };
  }

  let text = '';
  for (let i = 0; i < 7; i++) {
    const e = meals && meals[ymd(addDays(mon, i))];
    if (e && e.recipe && Array.isArray(e.recipe.ingredients)) {
      text += ' ' + e.recipe.ingredients.join(' ');
    }
  }
  const lowered = text.toLowerCase();

  const restock = [];
  (catalog || []).forEach(function (item) {
    let re;
    try { re = new RegExp(item.match, 'i'); } catch (e) { return; }
    if (!re.test(lowered)) return; // not used this week — no change, not listed

    const tracked = state.items[item.id];
    if (!tracked) {
      // First time this item has ever been seen: buy it now, start tracking at a full pack.
      state.items[item.id] = { weeksRemaining: item.weeksSupply };
      restock.push(item.name);
      return;
    }
    tracked.weeksRemaining -= 1;
    if (tracked.weeksRemaining <= 0) {
      restock.push(item.name);
      tracked.weeksRemaining = item.weeksSupply; // fresh pack assumed bought
    }
    // else: still some left — stays off the list this week.
  });

  state.lastProcessedWeek = weekKey;
  state.thisWeekRestock = restock;
  return { restock: restock, state: state };
}

module.exports = { computePantryRestock: computePantryRestock, mondayOf: mondayOf, ymd: ymd };
