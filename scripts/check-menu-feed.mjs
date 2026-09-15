#!/usr/bin/env node
// Validates the built /izzys-cafe.json against the shape external consumers depend on.
//
// This is a *published contract*, not an internal detail: the dizzyos LED-matrix sign in the
// kitchen fetches https://izzybennett.com/izzys-cafe.json and reads `title`, `sections[].heading`
// (which it calls .upper() on) and `sections[].items[]` (which it passes to a font metrics call).
// A wrong type there raises inside the sign's render loop, outside its guarded fetch — and because
// the sign falls back to a hardcoded stale menu rather than going blank, a broken feed shows
// customers a plausible menu of things the kitchen cannot make. So this runs against the real
// build artifact in CI, before anything is published.
//
// Deliberately checks shape and never item text: the menu is edited through /update-menu and
// committed by the Worker, so pinning contents would block every menu edit from deploying.
//
// Usage: node scripts/check-menu-feed.mjs [path-to-dist]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const feedPath = join(dist, 'izzys-cafe.json');

const errors = [];
const fail = (msg) => errors.push(msg);

let raw;
try {
  raw = readFileSync(feedPath, 'utf8');
} catch {
  console.error(`✗ ${feedPath} is missing. The menu feed must be part of every build — the sign`);
  console.error('  fetches it by hardcoded URL and shows a stale fallback menu when it 404s.');
  process.exit(1);
}

let feed;
try {
  feed = JSON.parse(raw);
} catch (err) {
  console.error(`✗ ${feedPath} is not valid JSON: ${err.message}`);
  process.exit(1);
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

if (!isPlainObject(feed)) {
  console.error('✗ feed must be a JSON object');
  process.exit(1);
}

if (!isNonEmptyString(feed.title)) {
  fail(`title must be a non-empty string (got ${JSON.stringify(feed.title)})`);
}

if (!Array.isArray(feed.sections)) {
  fail(`sections must be an array (got ${JSON.stringify(feed.sections)})`);
} else if (feed.sections.length === 0) {
  fail('sections must not be empty — an empty menu reads as an outage on the sign');
} else {
  feed.sections.forEach((section, i) => {
    const at = `sections[${i}]`;
    if (!isPlainObject(section)) {
      fail(`${at} must be an object (got ${JSON.stringify(section)})`);
      return;
    }
    if (!isNonEmptyString(section.heading)) {
      fail(`${at}.heading must be a non-empty string (got ${JSON.stringify(section.heading)})`);
    }
    if (!Array.isArray(section.items)) {
      fail(`${at}.items must be an array (got ${JSON.stringify(section.items)})`);
      return;
    }
    if (section.items.length === 0) {
      fail(`${at}.items must not be empty — the parser is meant to drop empty sections`);
    }
    section.items.forEach((item, j) => {
      if (!isNonEmptyString(item)) {
        fail(`${at}.items[${j}] must be a non-empty string (got ${JSON.stringify(item)})`);
      }
    });
  });

  // /order builds its drink chips from this section — an empty one renders an unsubmittable form.
  const hasDrinks = feed.sections.some(
    (s) => isPlainObject(s) && String(s.heading).toLowerCase() === 'drinks' && s.items?.length > 0
  );
  if (!hasDrinks) {
    fail('no non-empty "Drinks" section — /order would render with nothing to choose');
  }
}

if (errors.length > 0) {
  console.error(`✗ ${feedPath} breaks the published menu contract:\n`);
  for (const err of errors) console.error(`  · ${err}`);
  console.error('\nExpected shape: { title: string, sections: [{ heading: string, items: string[] }] }');
  console.error('Consumer: dizzyos apps/cafe_menu (LED sign). Changing this shape is a hardware change.');
  process.exit(1);
}

const summary = feed.sections.map((s) => `${s.heading} (${s.items.length})`).join(', ');
console.log(`✓ ${feedPath} matches the published menu contract`);
console.log(`  "${feed.title}" — ${summary}`);
