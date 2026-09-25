#!/usr/bin/env node
'use strict';
/* Bakes alex-mission-control.template.html + cal-primary.json + cal-alex.json
   + mum-unusual.json into index.html by rewriting the SNAPSHOT var block.
   Run from this directory. */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const TEMPLATE_PATH = path.join(ROOT, 'alex-mission-control.template.html');
const OUT_PATH = path.join(ROOT, 'index.html');

// Same keyword lists Langley Departures uses to tell the kids' events apart.
const FRANCIS_KEYWORDS = ['hockey', 'goalkeep', 'goalie', 'qehs', 'humber', 'trial'];
const MATHILDA_KEYWORDS = ['gymnastic', 'swim', 'nursery', 'happy days', 'allegro', 'emmerson'];
// Alex's own calendar colour legend (confirmed by Jessica, same as the Dad
// card on Langley Departures): colorId 6 = away from home/normal workplace,
// colorId 5 = leave (home, not working). Anything else = an ordinary day.
const ALEX_AWAY_COLOR_ID = '6';
const ALEX_LEAVE_COLOR_ID = '5';

function readJSON(name, fallback) {
  const p = path.join(ROOT, name);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return fallback; }
}
function londonYMD(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
}
function londonHM(iso) {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
}
function matchesAny(title, keywords) {
  const t = (title || '').toLowerCase();
  return keywords.some(function (k) { return t.indexOf(k) !== -1; });
}
function eventsOn(events, targetYMD) {
  return (events || []).filter(function (ev) {
    if (ev.start && ev.start.date && !ev.start.dateTime) {
      // All-day, possibly multi-day (e.g. a week-long "Leave" block) — the
      // end date is exclusive, so check the target day falls inside [start, end).
      const startYMD = ev.start.date.slice(0, 10);
      const endYMD = ev.end && ev.end.date ? ev.end.date.slice(0, 10) : startYMD;
      return startYMD <= targetYMD && targetYMD < endYMD;
    }
    const startDate = ev.start && ev.start.dateTime;
    if (!startDate) return false;
    return londonYMD(new Date(startDate)) === targetYMD;
  });
}
function isAllDay(ev) {
  return !!(ev.start && ev.start.date && !ev.start.dateTime);
}
function toBoardEvent(ev) {
  const allDay = isAllDay(ev);
  return {
    time: allDay ? null : londonHM(ev.start.dateTime),
    title: ev.summary || 'Event',
    loc: ev.location || '',
    allDay: allDay
  };
}

const now = new Date();
const todayYMD = londonYMD(now);
const tomorrowYMD = londonYMD(new Date(now.getTime() + 86400000));

const primary = readJSON('cal-primary.json', { events: [] });
const alexCal = readJSON('cal-alex.json', { events: [] });
const mumUnusual = readJSON('mum-unusual.json', { note: null });

const primaryToday = eventsOn(primary.events, todayYMD);
const primaryTomorrow = eventsOn(primary.events, tomorrowYMD);
const francisToday = primaryToday.filter(function (ev) { return matchesAny(ev.summary, FRANCIS_KEYWORDS); }).map(toBoardEvent);
const francisTomorrow = primaryTomorrow.filter(function (ev) { return matchesAny(ev.summary, FRANCIS_KEYWORDS); }).map(toBoardEvent);
const mathildaToday = primaryToday.filter(function (ev) { return matchesAny(ev.summary, MATHILDA_KEYWORDS); }).map(toBoardEvent);
const mathildaTomorrow = primaryTomorrow.filter(function (ev) { return matchesAny(ev.summary, MATHILDA_KEYWORDS); }).map(toBoardEvent);

const alexToday_raw = eventsOn(alexCal.events, todayYMD);
const alexTomorrow_raw = eventsOn(alexCal.events, tomorrowYMD);

// An all-day event with colorId 5/6 sets Alex's status badge rather than
// appearing as a normal agenda item; 'away' wins if both are somehow present.
let alexStatus = 'normal';
alexToday_raw.forEach(function (ev) {
  if (!isAllDay(ev)) return;
  if (ev.colorId === ALEX_AWAY_COLOR_ID) alexStatus = 'away';
  else if (ev.colorId === ALEX_LEAVE_COLOR_ID && alexStatus !== 'away') alexStatus = 'leave';
});
const alexToday = alexToday_raw
  .filter(function (ev) {
    return !(isAllDay(ev) && (ev.colorId === ALEX_AWAY_COLOR_ID || ev.colorId === ALEX_LEAVE_COLOR_ID));
  })
  .map(toBoardEvent);
const alexTomorrow = alexTomorrow_raw
  .filter(function (ev) {
    return !(isAllDay(ev) && (ev.colorId === ALEX_AWAY_COLOR_ID || ev.colorId === ALEX_LEAVE_COLOR_ID));
  })
  .map(toBoardEvent);

const snapshot = {
  updatedISO: now.toISOString(),
  forDate: todayYMD,
  alexStatus: alexStatus,
  alexToday: alexToday,
  alexTomorrow: alexTomorrow,
  // Hand-curated, not calendar-derived — see mum-unusual.json.
  mumUnusual: (mumUnusual && mumUnusual.note) ? mumUnusual.note : null,
  francisToday: francisToday,
  francisTomorrow: francisTomorrow,
  mathildaToday: mathildaToday,
  mathildaTomorrow: mathildaTomorrow
};

const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const snapshotJs = 'var SNAPSHOT = ' + JSON.stringify(snapshot, null, 4) + ';';
const patched = template.replace(/var SNAPSHOT = \{[\s\S]*?\n {2}\};/, snapshotJs);

if (patched === template) {
  console.error('template drifted: SNAPSHOT block not found in ' + TEMPLATE_PATH);
  process.exit(1);
}

fs.writeFileSync(OUT_PATH, patched);
console.log(
  'alex-mission-control: today ' + todayYMD + ' / tomorrow ' + tomorrowYMD +
  ' | alexStatus=' + alexStatus +
  ' | alexToday=' + alexToday.length + ' alexTomorrow=' + alexTomorrow.length +
  ' | francisToday=' + francisToday.length + ' francisTomorrow=' + francisTomorrow.length +
  ' | mathildaToday=' + mathildaToday.length + ' mathildaTomorrow=' + mathildaTomorrow.length +
  ' | mumUnusual=' + (snapshot.mumUnusual ? 'yes' : 'no')
);
