import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_VALUES = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 10, Q: 10, K: 10 };
const RANK_ORDER  = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
const PHASES = { FIRSTCUT: "firstcut", CRIB: "crib", PEG: "peg", SHOW: "show", DONE: "done" };

// ─── Card Utilities ──────────────────────────────────────────────────────────
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardValue(card) {
  return RANK_VALUES[card.rank];
}

function cardOrder(card) {
  return RANK_ORDER[card.rank];
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k)
  ];
}

// ─── Scoring Engine ──────────────────────────────────────────────────────────
function scoreFifteens(cards) {
  let pts = 0;
  for (let size = 2; size <= cards.length; size++) {
    for (const combo of combinations(cards, size)) {
      const total = combo.reduce((sum, c) => sum + cardValue(c), 0);
      if (total === 15) pts += 2;
    }
  }
  return pts;
}

function scorePairs(cards) {
  let pts = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].rank === cards[j].rank) pts += 2;
    }
  }
  return pts;
}

function scoreRuns(cards) {
  const n = cards.length;
  for (let size = n; size >= 3; size--) {
    let count = 0;
    for (const combo of combinations(cards, size)) {
      const sorted = [...combo].sort((a, b) => cardOrder(a) - cardOrder(b));
      let isRun = true;
      for (let i = 1; i < sorted.length; i++) {
        if (cardOrder(sorted[i]) - cardOrder(sorted[i - 1]) !== 1) {
          isRun = false;
          break;
        }
      }
      if (isRun) count++;
    }
    if (count > 0) return size * count;
  }
  return 0;
}

function scoreFlush(hand4, shared, isCrib) {
  const suit = hand4[0].suit;
  if (hand4.every(c => c.suit === suit)) {
    if (shared && shared.suit === suit) return 5;
    if (!isCrib) return 4;
  }
  return 0;
}

function scoreNobs(hand4, shared) {
  if (!shared) return 0;
  return hand4.some(c => c.rank === "J" && c.suit === shared.suit) ? 1 : 0;
}

function scoreHand(hand4, shared, isCrib = false) {
  const all = shared ? [...hand4, shared] : hand4;
  const pts = scoreFifteens(all) + scorePairs(all) + scoreRuns(all) + scoreFlush(hand4, shared, isCrib) + scoreNobs(hand4, shared);
  return pts;
}

function getScoreBreakdown(hand4, shared, isCrib = false) {
  const all = shared ? [...hand4, shared] : hand4;
  const lines = [];

  // Fifteens
  for (let size = 2; size <= all.length; size++) {
    for (const combo of combinations(all, size)) {
      const total = combo.reduce((sum, c) => sum + cardValue(c), 0);
      if (total === 15) {
        lines.push({
          type: "fifteen",
          pts: 2,
          label: `Fifteen: ${combo.map(c => c.rank + c.suit).join(" + ")} = 2 pts`
        });
      }
    }
  }

  // Pairs
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].rank === all[j].rank) {
        lines.push({
          type: "pair",
          pts: 2,
          label: `Pair: ${all[i].rank}${all[i].suit} & ${all[j].rank}${all[j].suit} = 2 pts`
        });
      }
    }
  }

  // Runs
  let runHandled = false;
  for (let size = all.length; size >= 3 && !runHandled; size--) {
    const foundRuns = [];
    for (const combo of combinations(all, size)) {
      const sorted = [...combo].sort((a, b) => cardOrder(a) - cardOrder(b));
      let isRun = true;
      for (let i = 1; i < sorted.length; i++) {
        if (cardOrder(sorted[i]) - cardOrder(sorted[i - 1]) !== 1) {
          isRun = false;
          break;
        }
      }
      if (isRun) foundRuns.push(sorted);
    }
    if (foundRuns.length > 0) {
      for (const run of foundRuns) {
        lines.push({
          type: "run",
          pts: size,
          label: `Run of ${size}: ${run.map(c => c.rank + c.suit).join("-")} = ${size} pts`
        });
      }
      runHandled = true;
    }
  }

  // Flush
  const flushSuit = hand4[0].suit;
  if (hand4.every(c => c.suit === flushSuit)) {
    if (shared && shared.suit === flushSuit) {
      lines.push({ type: "flush", pts: 5, label: `Flush (5 cards, all ${flushSuit}) = 5 pts` });
    } else if (!isCrib) {
      lines.push({ type: "flush", pts: 4, label: `Flush (4 cards, all ${flushSuit}) = 4 pts` });
    }
  }

  // His Nobs
  if (shared) {
    const nob = hand4.find(c => c.rank === "J" && c.suit === shared.suit);
    if (nob) {
      lines.push({ type: "nobs", pts: 1, label: `His Nobs: J${nob.suit} matches shared card suit = 1 pt` });
    }
  }

  const total = lines.reduce((sum, l) => sum + l.pts, 0);
  return { lines, total };
}

function scorePegging(played, newCard) {
  const stack = [...played, newCard];
  const total = stack.reduce((sum, c) => sum + cardValue(c), 0);
  let pts = 0;
  if (total === 15) pts += 2;
  if (total === 31) pts += 2;

  // Pairs at end
  let pairLen = 1;
  for (let i = stack.length - 2; i >= 0; i--) {
    if (stack[i].rank === newCard.rank) pairLen++;
    else break;
  }
  if (pairLen === 2) pts += 2;
  else if (pairLen === 3) pts += 6;
  else if (pairLen === 4) pts += 12;

  // Runs at end (only when no pair interrupts)
  if (pairLen === 1 && stack.length >= 3) {
    for (let len = stack.length; len >= 3; len--) {
      const seg = stack.slice(-len);
      const sorted = [...seg].sort((a, b) => cardOrder(a) - cardOrder(b));
      let isRun = true;
      for (let i = 1; i < sorted.length; i++) {
        if (cardOrder(sorted[i]) - cardOrder(sorted[i - 1]) !== 1) {
          isRun = false;
          break;
        }
      }
      if (isRun) { pts += len; break; }
    }
  }
  return pts;
}

// ─── AI Logic ────────────────────────────────────────────────────────────────
function estimateCribValue(cards, difficulty) {
  if (difficulty === "easy") return 4;
  let val = 4;
  if (cards.some(c => c.rank === "5")) val += 4;
  if (cards[0].rank === cards[1].rank) val += 2;
  return val;
}

function estimateHandValue(keep, discard, isDealer, difficulty) {
  const deck = createDeck().filter(c => ![...keep, ...discard].find(x => x.id === c.id));
  const sample = difficulty === "hard" ? 20 : 10;
  let total = 0;
  for (let i = 0; i < sample; i++) {
    const shared = deck[Math.floor(Math.random() * deck.length)];
    total += scoreHand(keep, shared);
    if (isDealer) total += estimateCribValue(discard, difficulty) * 0.5;
    else total -= estimateCribValue(discard, difficulty) * 0.3;
  }
  return total / sample;
}

function aiSelectCribCards(hand6, isDealer, difficulty) {
  const combos = combinations(hand6, 2);
  let best = null;
  let bestScore = -Infinity;
  for (const discard of combos) {
    const keep = hand6.filter(c => !discard.includes(c));
    const score = estimateHandValue(keep, discard, isDealer, difficulty);
    if (score > bestScore) { bestScore = score; best = discard; }
  }
  if (difficulty === "easy" && Math.random() < 0.4) {
    return combos[Math.floor(Math.random() * combos.length)];
  }
  return best;
}

function aiSelectPegCard(hand, stack, count, difficulty) {
  const valid = hand.filter(c => count + cardValue(c) <= 31);
  if (!valid.length) return null;
  if (difficulty === "easy") return valid[Math.floor(Math.random() * valid.length)];
  let best = null;
  let bestScore = -1;
  for (const c of valid) {
    const pts = scorePegging(stack, c);
    const newCount = count + cardValue(c);
    let score = pts * 10;
    if (newCount === 15 || newCount === 31) score += 20;
    if (difficulty === "hard") {
      const remaining = 31 - newCount;
      if (remaining === 10 || remaining === 5 || remaining === 15) score -= 5;
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// ─── Lodge Palette ────────────────────────────────────────────────────────────
// Dark mahogany, hunter-green baize, aged brass, malt-whisky amber
const L = {
  mahogany:  "#1E0E06",
  mahoganyM: "#2E1A0A",
  mahoganyL: "#4A2C12",
  brass:     "#B8880A",
  brassL:    "#D4A820",
  gold:      "#F0C840",
  cream:     "#F2ECD8",
  parchment: "#E8DEC0",
  felt:      "#0D2E18",
  feltM:     "#174228",
  feltL:     "#245A38",
  leather:   "#6B3A18",
  leatherL:  "#8B5228",
  whisky:    "#C07830",
  whiskyD:   "#7A4810",
  ink:       "#0C0804",
};

// Royal Stewart tartan — properly woven with dark green base, crimson bands, navy & gold pins
const TARTAN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='%23003a00'/%3E%3Crect x='0' y='0' width='96' height='16' fill='%23001e00' opacity='0.6'/%3E%3Crect x='0' y='32' width='96' height='16' fill='%23001e00' opacity='0.6'/%3E%3Crect x='0' y='64' width='96' height='16' fill='%23001e00' opacity='0.6'/%3E%3Crect x='0' y='0' width='16' height='96' fill='%23001e00' opacity='0.6'/%3E%3Crect x='32' y='0' width='16' height='96' fill='%23001e00' opacity='0.6'/%3E%3Crect x='64' y='0' width='16' height='96' fill='%23001e00' opacity='0.6'/%3E%3Crect x='0' y='5' width='96' height='7' fill='%23bb0000' opacity='0.9'/%3E%3Crect x='0' y='37' width='96' height='7' fill='%23bb0000' opacity='0.9'/%3E%3Crect x='0' y='69' width='96' height='7' fill='%23bb0000' opacity='0.9'/%3E%3Crect x='5' y='0' width='7' height='96' fill='%23bb0000' opacity='0.9'/%3E%3Crect x='37' y='0' width='7' height='96' fill='%23bb0000' opacity='0.9'/%3E%3Crect x='69' y='0' width='7' height='96' fill='%23bb0000' opacity='0.9'/%3E%3Crect x='0' y='14' width='96' height='2' fill='%23000088' opacity='0.75'/%3E%3Crect x='0' y='46' width='96' height='2' fill='%23000088' opacity='0.75'/%3E%3Crect x='0' y='78' width='96' height='2' fill='%23000088' opacity='0.75'/%3E%3Crect x='14' y='0' width='2' height='96' fill='%23000088' opacity='0.75'/%3E%3Crect x='46' y='0' width='2' height='96' fill='%23000088' opacity='0.75'/%3E%3Crect x='78' y='0' width='2' height='96' fill='%23000088' opacity='0.75'/%3E%3Crect x='0' y='12' width='96' height='1' fill='%23d4af37' opacity='0.8'/%3E%3Crect x='0' y='44' width='96' height='1' fill='%23d4af37' opacity='0.8'/%3E%3Crect x='0' y='76' width='96' height='1' fill='%23d4af37' opacity='0.8'/%3E%3Crect x='12' y='0' width='1' height='96' fill='%23d4af37' opacity='0.8'/%3E%3Crect x='44' y='0' width='1' height='96' fill='%23d4af37' opacity='0.8'/%3E%3Crect x='76' y='0' width='1' height='96' fill='%23d4af37' opacity='0.8'/%3E%3C/svg%3E")`;

// Wood grain overlay (applied on board surfaces)
const WOODGRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='80'%3E%3Cpath d='M0 14 Q60 10 120 15 Q180 20 240 14' stroke='%23000' stroke-width='1' fill='none' stroke-opacity='0.07'/%3E%3Cpath d='M0 30 Q60 26 120 31 Q180 36 240 30' stroke='%23000' stroke-width='0.8' fill='none' stroke-opacity='0.05'/%3E%3Cpath d='M0 46 Q60 42 120 47 Q180 52 240 46' stroke='%23000' stroke-width='1.2' fill='none' stroke-opacity='0.06'/%3E%3Cpath d='M0 62 Q60 58 120 63 Q180 68 240 62' stroke='%23000' stroke-width='0.7' fill='none' stroke-opacity='0.05'/%3E%3C/svg%3E")`;

// ─── SVG Illustration Components ─────────────────────────────────────────────

// Cut-crystal Scotch tumbler with amber dram and ice
function SvgScotch({ size = 54, style = {} }) {
  return (
    <svg width={size} height={Math.round(size * 1.1)} viewBox="0 0 54 60" fill="none" style={style}>
      <defs>
        <linearGradient id="scotchLiq" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#7B3E0E" stopOpacity="0.92"/>
          <stop offset="45%"  stopColor="#C07830" stopOpacity="0.96"/>
          <stop offset="100%" stopColor="#7B3E0E" stopOpacity="0.88"/>
        </linearGradient>
        <linearGradient id="scotchGlass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.48)"/>
          <stop offset="22%"  stopColor="rgba(255,255,255,0.07)"/>
          <stop offset="78%"  stopColor="rgba(255,255,255,0.04)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0.35)"/>
        </linearGradient>
      </defs>
      {/* Amber liquid */}
      <path d="M9 36 L45 36 L41 55 L13 55 Z" fill="url(#scotchLiq)"/>
      {/* Liquid meniscus shimmer */}
      <ellipse cx="27" cy="36" rx="18" ry="2.2" fill="#D4961A" fillOpacity="0.55"/>
      {/* Ice cube */}
      <rect x="15" y="23" width="16" height="11" rx="2" fill="rgba(210,238,255,0.55)" stroke="rgba(195,228,255,0.5)" strokeWidth="0.7"/>
      <line x1="15" y1="27" x2="31" y2="27" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
      <line x1="22" y1="23" x2="22" y2="34" stroke="rgba(255,255,255,0.22)" strokeWidth="0.5"/>
      {/* Crystal-cut facet lines on glass */}
      <line x1="18" y1="9"  x2="16" y2="55" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9"/>
      <line x1="27" y1="9"  x2="27" y2="55" stroke="rgba(255,255,255,0.18)" strokeWidth="0.6"/>
      <line x1="36" y1="9"  x2="38" y2="55" stroke="rgba(255,255,255,0.25)" strokeWidth="0.9"/>
      <line x1="8"  y1="22" x2="46" y2="22" stroke="rgba(255,255,255,0.15)" strokeWidth="0.6"/>
      {/* Glass body */}
      <path d="M7 9 L47 9 L41 55 L13 55 Z" fill="url(#scotchGlass)" stroke="rgba(215,235,255,0.5)" strokeWidth="1.3"/>
      {/* Left highlight */}
      <path d="M9 11 L11 51" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
      {/* Top rim */}
      <path d="M7 9 Q27 6 47 9" stroke="rgba(255,255,255,0.42)" strokeWidth="1.1" fill="none"/>
      {/* Base slab */}
      <rect x="11" y="55" width="32" height="3.5" rx="1.5" fill="rgba(200,220,240,0.24)" stroke="rgba(215,235,255,0.38)" strokeWidth="1"/>
      <rect x="9"  y="58" width="36" height="2"   rx="1"   fill="rgba(200,220,240,0.16)" stroke="rgba(215,235,255,0.28)" strokeWidth="0.8"/>
    </svg>
  );
}

// Hand-rolled Havana cigar with gold band, pale ash, glowing ember
function SvgCigar({ width = 100, style = {} }) {
  return (
    <svg width={width} height={Math.round(width * 0.17)} viewBox="0 0 100 17" fill="none" style={style}>
      <defs>
        <linearGradient id="cigarWrap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#7A5018"/>
          <stop offset="35%"  stopColor="#5A3A0E"/>
          <stop offset="100%" stopColor="#3C2408"/>
        </linearGradient>
        <linearGradient id="cigarBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#D4AF37"/>
          <stop offset="50%"  stopColor="#B89010"/>
          <stop offset="100%" stopColor="#9A7A08"/>
        </linearGradient>
      </defs>
      {/* Tobacco wrapper */}
      <path d="M14 1 Q57 0.2 86 1 L86 16 Q57 16.8 14 16 Z" fill="url(#cigarWrap)"/>
      {/* Wrapper vein lines */}
      <path d="M16 5  Q50 4.5 84 5"  stroke="#8A6018" strokeWidth="0.65" strokeOpacity="0.5"/>
      <path d="M16 11 Q50 11.5 84 11" stroke="#3A2008" strokeWidth="0.55" strokeOpacity="0.4"/>
      {/* Gold band */}
      <rect x="27" y="1" width="14" height="15" fill="url(#cigarBand)"/>
      <rect x="28" y="2" width="12" height="13" fill="none" stroke="#7A5A08" strokeWidth="0.6"/>
      <line x1="27" y1="8.5" x2="41" y2="8.5" stroke="#C8A010" strokeWidth="0.5" strokeOpacity="0.6"/>
      {/* Foot (cut end) */}
      <ellipse cx="14" cy="8.5" rx="4"   ry="7.6" fill="#2E1604"/>
      <ellipse cx="14" cy="8.5" rx="2.5" ry="5.2" fill="#1E0E02"/>
      <ellipse cx="14" cy="8.5" rx="1"   ry="2.5" fill="#140A01"/>
      {/* Ash column */}
      <ellipse cx="86" cy="8.5" rx="6"   ry="7.7" fill="#C8C4BC"/>
      <ellipse cx="88" cy="8.5" rx="4.5" ry="6"   fill="#DAD6CE"/>
      <ellipse cx="90" cy="8.5" rx="3"   ry="4.2" fill="#E8E4DC"/>
      {/* Ember */}
      <ellipse cx="93" cy="8.5" rx="3.2" ry="4"   fill="#E84010" fillOpacity="0.88"/>
      <ellipse cx="94.5" cy="8.5" rx="1.8" ry="2.2" fill="#FF8030" fillOpacity="0.72"/>
      {/* Smoke */}
      <path d="M95 5 C97 3 95 1 97 -1"  stroke="#B0ACA8" strokeWidth="0.7" strokeOpacity="0.45" fill="none"/>
      <path d="M96 4 C99 2 97 0 99 -2"  stroke="#B0ACA8" strokeWidth="0.5" strokeOpacity="0.3"  fill="none"/>
    </svg>
  );
}

// Heraldic stag head silhouette — proper antlers, clean lodge-crest style
function SvgStagHead({ size = 72, color = "#C8A430", style = {} }) {
  const o = color + "CC"; // main fill
  const s = color + "88"; // shadow tones
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" style={style}>
      {/* Left antler main beam */}
      <path d="M33 36 Q28 26 24 18 Q21 12 18 6" stroke={o} strokeWidth="3.2" fill="none" strokeLinecap="round"/>
      {/* Left tine 1 */}
      <path d="M27 22 Q22 16 18 12" stroke={o} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      {/* Left tine 2 */}
      <path d="M22 15 Q18 9  15 5"  stroke={o} strokeWidth="2"   fill="none" strokeLinecap="round"/>
      {/* Left brow tine */}
      <path d="M31 30 Q24 28 19 24" stroke={o} strokeWidth="2"   fill="none" strokeLinecap="round"/>
      {/* Right antler main beam */}
      <path d="M47 36 Q52 26 56 18 Q59 12 62 6" stroke={o} strokeWidth="3.2" fill="none" strokeLinecap="round"/>
      {/* Right tine 1 */}
      <path d="M53 22 Q58 16 62 12" stroke={o} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
      {/* Right tine 2 */}
      <path d="M58 15 Q62 9  65 5"  stroke={o} strokeWidth="2"   fill="none" strokeLinecap="round"/>
      {/* Right brow tine */}
      <path d="M49 30 Q56 28 61 24" stroke={o} strokeWidth="2"   fill="none" strokeLinecap="round"/>
      {/* Head */}
      <ellipse cx="40" cy="54" rx="14" ry="17" fill={color} fillOpacity="0.72"/>
      {/* Ears */}
      <ellipse cx="26" cy="47" rx="5.5" ry="7.5" fill={color} fillOpacity="0.62" transform="rotate(-22 26 47)"/>
      <ellipse cx="54" cy="47" rx="5.5" ry="7.5" fill={color} fillOpacity="0.62" transform="rotate(22 54 47)"/>
      {/* Muzzle */}
      <ellipse cx="40" cy="65" rx="7.5" ry="5.5" fill={color} fillOpacity="0.58"/>
      {/* Eyes */}
      <circle cx="33" cy="51" r="2.2" fill={o}/>
      <circle cx="47" cy="51" r="2.2" fill={o}/>
      {/* Nostrils */}
      <ellipse cx="37.5" cy="67" rx="1.6" ry="1.1" fill={s}/>
      <ellipse cx="42.5" cy="67" rx="1.6" ry="1.1" fill={s}/>
    </svg>
  );
}

// Scottish thistle — national emblem, spiky florets, stem with leaves
function SvgThistle({ size = 50, color = "#5A3878", style = {} }) {
  const floretAngles = Array.from({ length: 16 }, (_, i) => i * (360 / 16));
  const bracts       = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg width={size} height={Math.round(size * 1.35)} viewBox="0 0 50 68" fill="none" style={style}>
      {/* Stem */}
      <line x1="25" y1="64" x2="25" y2="32" stroke="#2A5818" strokeWidth="2" strokeLinecap="round"/>
      {/* Stem leaves */}
      <path d="M25 52 Q16 48 12 41 Q18 43 25 49" fill="#2A5818" fillOpacity="0.72"/>
      <path d="M25 44 Q34 40 38 33 Q32 35 25 41" fill="#2A5818" fillOpacity="0.72"/>
      {/* Bract spines */}
      {bracts.map((a, i) => {
        const r = (a * Math.PI) / 180;
        return <line key={i} x1="25" y1="30" x2={25 + Math.sin(r) * 12} y2={30 - Math.cos(r) * 12}
          stroke={color} strokeWidth="1.3" strokeOpacity="0.6" strokeLinecap="round"/>;
      })}
      {/* Outer petal ring */}
      <circle cx="25" cy="28" r="12" fill={color} fillOpacity="0.16" stroke={color} strokeWidth="0.9" strokeOpacity="0.5"/>
      {/* Floret spines */}
      {floretAngles.map((a, i) => {
        const r = (a * Math.PI) / 180;
        return <line key={i}
          x1={25 + Math.sin(r) * 5} y1={28 - Math.cos(r) * 5}
          x2={25 + Math.sin(r) * 15} y2={28 - Math.cos(r) * 15}
          stroke={color} strokeWidth="1.6" strokeOpacity="0.82" strokeLinecap="round"/>;
      })}
      {/* Centre disc */}
      <circle cx="25" cy="28" r="6"   fill={color} fillOpacity="0.65"/>
      <circle cx="25" cy="28" r="3.2" fill={color} fillOpacity="0.88"/>
    </svg>
  );
}

// Decorative brass corner bracket — wrought-iron lodge style
function SvgCorner({ size = 28, color = "#C8A430", flipH = false, flipV = false, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none"
      style={{ display: "block", transform: `scale(${flipH ? -1 : 1},${flipV ? -1 : 1})`, ...style }}>
      <path d="M2 26 L2 5 Q2 2 5 2 L26 2"
        stroke={color} strokeWidth="1.6" strokeLinecap="round" fill="none" strokeOpacity="0.72"/>
      <path d="M2 20 Q8 20 8 14 L8 8"
        stroke={color} strokeWidth="1"   strokeLinecap="round" fill="none" strokeOpacity="0.45"/>
      <path d="M2 14 Q5 14 5 11"
        stroke={color} strokeWidth="0.8" strokeLinecap="round" fill="none" strokeOpacity="0.35"/>
      <circle cx="2"  cy="2"  r="2.2" fill={color} fillOpacity="0.62"/>
      <circle cx="26" cy="2"  r="1.4" fill={color} fillOpacity="0.42"/>
      <circle cx="2"  cy="26" r="1.4" fill={color} fillOpacity="0.42"/>
    </svg>
  );
}

// Gold brass divider rule with central diamond motif
function SvgRule({ color = "#C8A430", style = {} }) {
  return (
    <svg width="100%" height="12" viewBox="0 0 280 12" preserveAspectRatio="none" style={style}>
      <line x1="0"   y1="6" x2="106" y2="6" stroke={color} strokeWidth="0.7" strokeOpacity="0.55"/>
      <path d="M112 6 L118 3 L124 6 L118 9 Z" fill={color} fillOpacity="0.72"/>
      <path d="M128 4.5 L132 3 L136 4.5 L132 6 Z" fill={color} fillOpacity="0.42"/>
      <line x1="142" y1="6" x2="280" y2="6" stroke={color} strokeWidth="0.7" strokeOpacity="0.55"/>
    </svg>
  );
}

// ─── Board Themes ─────────────────────────────────────────────────────────────

const BOARD_THEMES = [
  {
    id: "lodge",
    name: "The Highland Lodge",
    tableBg: "radial-gradient(ellipse at 45% 35%, #2A1508 0%, #140A03 55%, #080401 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#3A1E08", boardBorder: "#1E0E04",
    boardAccent: "#C8A020", boardHighlight: "rgba(200,160,32,0.15)",
    trackColor: "#140A02", holeColor: "#D4B030",
    peg1Color: "#D4A820", peg2Color: "#C04820",
    textColor: "#F0E8D0", btnBg: "#3A1E08", btnBorder: "#C8A020",
    boardSvgDeco: (bw, bh) => `
      <circle cx="${bw/2}" cy="${bh/2}" r="${Math.min(bw,bh)*0.34}" fill="none" stroke="#C8A020" stroke-width="0.6" stroke-opacity="0.12"/>
      <path d="M${bw*0.08} ${bh*0.5} L${bw*0.18} ${bh*0.28} L${bw*0.28} ${bh*0.5}" stroke="#C8A020" stroke-width="0.5" fill="none" stroke-opacity="0.1"/>
      <path d="M${bw*0.72} ${bh*0.5} L${bw*0.82} ${bh*0.28} L${bw*0.92} ${bh*0.5}" stroke="#C8A020" stroke-width="0.5" fill="none" stroke-opacity="0.1"/>`,
  },
  {
    id: "outdoors",
    name: "The Great Outdoors",
    tableBg: "radial-gradient(ellipse at 30% 40%, #1A3A0A 0%, #0D2205 55%, #060F02 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#284818", boardBorder: "#162808",
    boardAccent: "#7AB040", boardHighlight: "rgba(122,176,64,0.12)",
    trackColor: "#0E1E06", holeColor: "#9CC860",
    peg1Color: "#E8A020", peg2Color: "#C83020",
    textColor: "#E0F0C8", btnBg: "#284818", btnBorder: "#7AB040",
    boardSvgDeco: (bw, bh) => `
      <path d="M${bw*0.06} ${bh*0.82} L${bw*0.14} ${bh*0.55} L${bw*0.22} ${bh*0.82}" fill="#1A3808" fill-opacity="0.5"/>
      <path d="M${bw*0.10} ${bh*0.88} L${bw*0.18} ${bh*0.52} L${bw*0.26} ${bh*0.88}" fill="#1A3808" fill-opacity="0.4"/>
      <path d="M${bw*0.78} ${bh*0.82} L${bw*0.86} ${bh*0.55} L${bw*0.94} ${bh*0.82}" fill="#1A3808" fill-opacity="0.5"/>`,
  },
  {
    id: "fishing",
    name: "Loch & Fly",
    tableBg: "radial-gradient(ellipse at 50% 60%, #0A2040 0%, #061228 60%, #030810 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#103050", boardBorder: "#081828",
    boardAccent: "#3A90C0", boardHighlight: "rgba(58,144,192,0.12)",
    trackColor: "#060E1E", holeColor: "#60B8E8",
    peg1Color: "#E8CC20", peg2Color: "#E86820",
    textColor: "#C8E8F8", btnBg: "#103050", btnBorder: "#3A90C0",
    boardSvgDeco: (bw, bh) => `
      <path d="M0 ${bh*0.65} Q${bw*0.25} ${bh*0.5} ${bw*0.5} ${bh*0.65} Q${bw*0.75} ${bh*0.8} ${bw} ${bh*0.65}" stroke="#3A90C0" stroke-width="0.7" fill="none" stroke-opacity="0.22"/>
      <path d="M0 ${bh*0.78} Q${bw*0.25} ${bh*0.63} ${bw*0.5} ${bh*0.78} Q${bw*0.75} ${bh*0.93} ${bw} ${bh*0.78}" stroke="#3A90C0" stroke-width="0.5" fill="none" stroke-opacity="0.15"/>`,
  },
  {
    id: "chicago",
    name: "Chicago",
    tableBg: "radial-gradient(ellipse at 50% 0%, #101830 0%, #080E1E 55%, #030610 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#0C1A38", boardBorder: "#081028",
    boardAccent: "#3A90E8", boardHighlight: "rgba(58,144,232,0.1)",
    trackColor: "#040A14", holeColor: "#80B8F0",
    peg1Color: "#C81020", peg2Color: "#3A90E8",
    textColor: "#D0E4F8", btnBg: "#0C1A38", btnBorder: "#3A90E8",
    boardSvgDeco: (bw, bh) => `
      <rect x="${bw*0.06}" y="${bh*0.28}" width="${bw*0.06}" height="${bh*0.62}" fill="#3A90E8" fill-opacity="0.05"/>
      <rect x="${bw*0.16}" y="${bh*0.18}" width="${bw*0.05}" height="${bh*0.72}" fill="#3A90E8" fill-opacity="0.04"/>
      <rect x="${bw*0.52}" y="${bh*0.12}" width="${bw*0.07}" height="${bh*0.78}" fill="#3A90E8" fill-opacity="0.05"/>
      <rect x="${bw*0.68}" y="${bh*0.32}" width="${bw*0.05}" height="${bh*0.58}" fill="#3A90E8" fill-opacity="0.04"/>`,
  },
  {
    id: "badgers",
    name: "UW Badgers",
    tableBg: "radial-gradient(ellipse at 50% 50%, #780008 0%, #480005 55%, #1E0002 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#680006", boardBorder: "#400004",
    boardAccent: "#E8E0D8", boardHighlight: "rgba(255,255,255,0.15)",
    trackColor: "#280002", holeColor: "#F8D0D0",
    peg1Color: "#F0E8E0", peg2Color: "#F0C030",
    textColor: "#FFE8E8", btnBg: "#880008", btnBorder: "#E8E0D8",
    boardSvgDeco: (bw, bh) => `
      <text x="${bw/2}" y="${bh*0.65}" text-anchor="middle" font-size="${bh*0.55}" font-family="Georgia,serif" font-weight="bold" fill="#ffffff" fill-opacity="0.055">W</text>`,
  },
  {
    id: "oshkosh",
    name: "UW-Oshkosh Titans",
    tableBg: "radial-gradient(ellipse at 50% 50%, #141E78 0%, #0C1458 55%, #060A2C 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#101878", boardBorder: "#080E50",
    boardAccent: "#D4A800", boardHighlight: "rgba(212,168,0,0.15)",
    trackColor: "#060A2C", holeColor: "#E8CC20",
    peg1Color: "#D4A800", peg2Color: "#F0F0F0",
    textColor: "#E8EAF8", btnBg: "#101878", btnBorder: "#D4A800",
    boardSvgDeco: (bw, bh) => `
      <text x="${bw/2}" y="${bh*0.7}" text-anchor="middle" font-size="${bh*0.6}" font-family="Georgia,serif" font-weight="bold" fill="#D4A800" fill-opacity="0.07">T</text>`,
  },
  {
    id: "loyola",
    name: "Loyola Ramblers",
    tableBg: "radial-gradient(ellipse at 50% 50%, #540000 0%, #2E0000 55%, #120000 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#480000", boardBorder: "#2C0000",
    boardAccent: "#C4A020", boardHighlight: "rgba(196,160,32,0.15)",
    trackColor: "#160000", holeColor: "#E8CC80",
    peg1Color: "#C4A020", peg2Color: "#F0F0F0",
    textColor: "#FFF0E0", btnBg: "#580000", btnBorder: "#C4A020",
    boardSvgDeco: (bw, bh) => `
      <circle cx="${bw/2}" cy="${bh/2}" r="${Math.min(bw,bh)*0.38}" fill="none" stroke="#C4A020" stroke-width="0.7" stroke-opacity="0.14"/>
      <circle cx="${bw/2}" cy="${bh/2}" r="${Math.min(bw,bh)*0.26}" fill="none" stroke="#C4A020" stroke-width="0.5" stroke-opacity="0.1"/>`,
  },
  {
    id: "woodworking",
    name: "The Workshop",
    tableBg: "radial-gradient(ellipse at 50% 50%, #523010 0%, #3A2008 55%, #1C0E04 100%)",
    tablePatternSvg: WOODGRAIN,
    boardBg: "#604018", boardBorder: "#402A08",
    boardAccent: "#D09020", boardHighlight: "rgba(208,144,32,0.12)",
    trackColor: "#221006", holeColor: "#E8B060",
    peg1Color: "#C07830", peg2Color: "#B06820",
    textColor: "#F8ECD8", btnBg: "#604018", btnBorder: "#D09020",
    boardSvgDeco: (bw, bh) => `
      <path d="M0 ${bh*0.25} Q${bw*0.25} ${bh*0.22} ${bw*0.5} ${bh*0.26} Q${bw*0.75} ${bh*0.30} ${bw} ${bh*0.25}" stroke="#D09020" stroke-width="0.5" fill="none" stroke-opacity="0.18"/>
      <path d="M0 ${bh*0.5}  Q${bw*0.25} ${bh*0.46} ${bw*0.5} ${bh*0.51} Q${bw*0.75} ${bh*0.56} ${bw} ${bh*0.5}"  stroke="#D09020" stroke-width="0.5" fill="none" stroke-opacity="0.14"/>
      <path d="M0 ${bh*0.75} Q${bw*0.25} ${bh*0.71} ${bw*0.5} ${bh*0.76} Q${bw*0.75} ${bh*0.81} ${bw} ${bh*0.75}" stroke="#D09020" stroke-width="0.5" fill="none" stroke-opacity="0.11"/>`,
  },
];

// ─── Card Component ───────────────────────────────────────────────────────────
function CardComp({ card, selected, onClick, small, faceDown, theme, disabled, highlight }) {
  const isRed = card && (card.suit === "♥" || card.suit === "♦");
  const w = small ? 42 : 58;
  const h = small ? 62 : 84;
  const accent = theme ? theme.boardAccent : "#ffd700";

  let borderColor = "#d0d0d0";
  let borderWidth = 1.5;
  let shadow = "0 3px 8px rgba(0,0,0,0.35)";
  let transform = "none";

  if (highlight) {
    borderColor = "#ffd700";
    borderWidth = 3;
    shadow = "0 0 14px rgba(255,215,0,0.6), 0 3px 8px rgba(0,0,0,0.4)";
    transform = "translateY(-4px)";
  } else if (selected) {
    borderColor = accent;
    borderWidth = 3;
    shadow = `0 0 10px ${accent}88, 0 3px 8px rgba(0,0,0,0.4)`;
    transform = "translateY(-9px)";
  }

  const cardBg = faceDown
    ? `linear-gradient(145deg, ${L.mahogany} 0%, ${L.mahoganyM} 50%, ${L.mahogany} 100%)`
    : "linear-gradient(175deg, #FEFCF8 0%, #F6F0E6 100%)";

  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        width: w,
        height: h,
        borderRadius: 7,
        background: cardBg,
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow: shadow,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: small ? "2px" : "3px",
        cursor: disabled ? "default" : "pointer",
        userSelect: "none",
        transition: "all 0.12s",
        transform: transform,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {faceDown ? (
        // Elegant mahogany card back — diagonal lattice + brass diamond inlay
        <svg width="100%" height="100%" viewBox="0 0 58 84" preserveAspectRatio="none" style={{ position:"absolute",inset:0,borderRadius:6 }}>
          <rect width="58" height="84" fill={L.mahoganyM}/>
          {/* Diagonal grid lattice */}
          {Array.from({length:14},(_,i)=>(
            <line key={"d"+i} x1={-10+i*8} y1="0" x2={i*8+60} y2="84"
              stroke={L.brassL} strokeWidth="0.35" strokeOpacity="0.18"/>
          ))}
          {Array.from({length:14},(_,i)=>(
            <line key={"u"+i} x1={i*8+10} y1="0" x2={i*8-60} y2="84"
              stroke={L.brassL} strokeWidth="0.35" strokeOpacity="0.18"/>
          ))}
          {/* Inner brass border */}
          <rect x="4" y="4" width="50" height="76" rx="3" fill="none"
            stroke={L.brassL} strokeWidth="0.9" strokeOpacity="0.45"/>
          {/* Central diamond inlay */}
          <path d="M29 28 L38 42 L29 56 L20 42 Z" fill="none"
            stroke={L.brassL} strokeWidth="1.1" strokeOpacity="0.55"/>
          <path d="M29 33 L34 42 L29 51 L24 42 Z"
            fill={L.brassL} fillOpacity="0.22"/>
          {/* Corner pip marks */}
          <circle cx="9"  cy="9"  r="1.5" fill={L.brassL} fillOpacity="0.38"/>
          <circle cx="49" cy="9"  r="1.5" fill={L.brassL} fillOpacity="0.38"/>
          <circle cx="9"  cy="75" r="1.5" fill={L.brassL} fillOpacity="0.38"/>
          <circle cx="49" cy="75" r="1.5" fill={L.brassL} fillOpacity="0.38"/>
        </svg>
      ) : card ? (
        <>
          <div style={{
            fontSize: small ? 10 : 13,
            fontWeight: "bold",
            color: isRed ? "#c62828" : "#1a1a1a",
            alignSelf: "flex-start",
            lineHeight: 1.1,
            fontFamily: "Georgia, serif",
            whiteSpace: "pre",
          }}>
            {card.rank + "\n" + card.suit}
          </div>
          <div style={{
            fontSize: small ? 18 : 26,
            color: isRed ? "#c62828" : "#1a1a1a",
            lineHeight: 1,
          }}>
            {card.suit}
          </div>
          <div style={{
            fontSize: small ? 10 : 13,
            fontWeight: "bold",
            color: isRed ? "#c62828" : "#1a1a1a",
            alignSelf: "flex-end",
            transform: "rotate(180deg)",
            lineHeight: 1.1,
            fontFamily: "Georgia, serif",
            whiteSpace: "pre",
          }}>
            {card.rank + "\n" + card.suit}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Cribbage Board ──────────────────────────────────────────────────────────
function CribbageBoard({ playerScore, aiScore, theme, playerPrevScore, aiPrevScore }) {
  const holeSpacing = 13;
  const startX = 38;
  const rowH = 20;
  const holesPerRow = 30;
  const boardW = startX * 2 + holesPerRow * holeSpacing + 20;
  const boardH = 110;

  function holePos(score, lane) {
    if (score <= 0) return { x: startX - 18, y: 26 + lane * rowH };
    const seg = Math.min(score, 121);
    const col = (seg - 1) % holesPerRow;
    const pass = Math.floor((seg - 1) / holesPerRow);
    const rev = pass % 2 === 1;
    const x = rev
      ? startX + (holesPerRow - 1 - col) * holeSpacing
      : startX + col * holeSpacing;
    return { x, y: 26 + lane * rowH };
  }

  const p = holePos(playerScore, 1);
  const pp = holePos(playerPrevScore, 1);
  const a = holePos(aiScore, 2);
  const ap = holePos(aiPrevScore, 2);

  const scoreMarkers = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115];

  return (
    <div style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}>
      <svg width="100%" viewBox={`0 0 ${boardW} ${boardH}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="boardGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.boardHighlight} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <radialGradient id="peg1Grad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
            <stop offset="40%" stopColor={theme.peg1Color} />
            <stop offset="100%" stopColor={theme.peg1Color} stopOpacity="0.6" />
          </radialGradient>
          <radialGradient id="peg2Grad" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.8)" />
            <stop offset="40%" stopColor={theme.peg2Color} />
            <stop offset="100%" stopColor={theme.peg2Color} stopOpacity="0.6" />
          </radialGradient>
        </defs>

        {/* Board body */}
        <rect x="1" y="1" width={boardW - 2} height={boardH - 2} rx="18"
          fill={theme.boardBg} stroke={theme.boardBorder} strokeWidth="3" />
        {/* Inner highlight bevel */}
        <rect x="4" y="4" width={boardW - 8} height={boardH - 8} rx="15"
          fill="none" stroke={theme.boardHighlight} strokeWidth="1.5" />
        {/* Gradient overlay */}
        <rect x="4" y="4" width={boardW - 8} height={boardH - 8} rx="15"
          fill="url(#boardGrad)" />

        {/* SVG board art / decorations */}
        <g dangerouslySetInnerHTML={{ __html: theme.boardSvgDeco ? theme.boardSvgDeco(boardW, boardH) : "" }} />

        {/* Lane separator */}
        <line x1={startX - 26} y1={26 + 1.5 * rowH} x2={boardW - 8} y2={26 + 1.5 * rowH}
          stroke={theme.boardAccent + "22"} strokeWidth="1" strokeDasharray="3 4" />

        {/* Lane labels */}
        <text x="12" y={26 + rowH + 6} fontSize="8" fill={theme.peg1Color} fontWeight="bold" fontFamily="serif">YOU</text>
        <text x="12" y={26 + 2 * rowH + 6} fontSize="8" fill={theme.peg2Color} fontWeight="bold" fontFamily="serif">CPU</text>

        {/* Start area background */}
        <rect x="2" y="15" width={startX - 22} height={boardH - 30} rx="4" fill="rgba(0,0,0,0.25)" />

        {/* Score holes */}
        {[0, 1, 2, 3, 4].map(pass => {
          const rev = pass % 2 === 1;
          return Array.from({ length: holesPerRow }, (_, col) => {
            const score = pass * holesPerRow + col + 1;
            if (score > 121) return null;
            const xPos = rev
              ? startX + (holesPerRow - 1 - col) * holeSpacing
              : startX + col * holeSpacing;
            const isMark = score % 5 === 0;
            return [1, 2].map(lane => (
              <g key={`${pass}-${col}-${lane}`}>
                <circle
                  cx={xPos} cy={26 + lane * rowH}
                  r={isMark ? 4.5 : 3.5}
                  fill={theme.trackColor}
                  stroke={theme.holeColor + "55"}
                  strokeWidth="0.5"
                />
                {isMark && (
                  <circle cx={xPos} cy={26 + lane * rowH} r="1.5"
                    fill={theme.holeColor + "44"} />
                )}
              </g>
            ));
          });
        })}

        {/* Score markers */}
        {scoreMarkers.map(score => {
          const seg = Math.min(score, 121);
          const col = (seg - 1) % holesPerRow;
          const pass = Math.floor((seg - 1) / holesPerRow);
          const rev = pass % 2 === 1;
          const xPos = rev
            ? startX + (holesPerRow - 1 - col) * holeSpacing
            : startX + col * holeSpacing;
          return (
            <text key={score} x={xPos} y={26 + 3 * rowH - 4}
              fontSize="5.5" fill={theme.holeColor + "66"} textAnchor="middle">
              {score}
            </text>
          );
        })}

        {/* Previous (back) pegs */}
        {playerPrevScore > 0 && (
          <circle cx={pp.x} cy={pp.y} r="5"
            fill={theme.peg1Color + "40"} stroke={theme.peg1Color + "80"} strokeWidth="1.5" />
        )}
        {aiPrevScore > 0 && (
          <circle cx={ap.x} cy={ap.y} r="5"
            fill={theme.peg2Color + "40"} stroke={theme.peg2Color + "80"} strokeWidth="1.5" />
        )}

        {/* Current pegs */}
        <circle cx={p.x} cy={p.y} r="7" fill="url(#peg1Grad)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
          <animate attributeName="r" values="7;8;7" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx={p.x - 1} cy={p.y - 1.5} r="2" fill="rgba(255,255,255,0.5)" />

        <circle cx={a.x} cy={a.y} r="7" fill="url(#peg2Grad)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
          <animate attributeName="r" values="7;8;7" dur="2.5s" repeatCount="indefinite" />
        </circle>
        <circle cx={a.x - 1} cy={a.y - 1.5} r="2" fill="rgba(255,255,255,0.5)" />

        {/* Start peg outlines */}
        <circle cx={startX - 18} cy={26 + rowH} r="6"
          fill={theme.peg1Color + "30"} stroke={theme.peg1Color + "60"} strokeWidth="1" />
        <circle cx={startX - 18} cy={26 + 2 * rowH} r="6"
          fill={theme.peg2Color + "30"} stroke={theme.peg2Color + "60"} strokeWidth="1" />

        {/* Score readout */}
        <rect x={boardW / 2 - 46} y={boardH - 16} width="92" height="13" rx="4" fill="rgba(0,0,0,0.4)" />
        <text x={boardW / 2} y={boardH - 6} fontSize="9"
          fill={theme.boardAccent} textAnchor="middle" fontFamily="Georgia, serif" fontWeight="bold">
          You: {playerScore}  •  CPU: {aiScore}
        </text>
      </svg>
    </div>
  );
}

// ─── Score Breakdown Panel ───────────────────────────────────────────────────
function ScoreBreakdownPanel({ hand4, sharedCard, isCrib, label, theme }) {
  if (!hand4 || !sharedCard) return null;
  const { lines, total } = getScoreBreakdown(hand4, sharedCard, isCrib);

  const TYPE_COLOR = {
    fifteen: "#ffd54f",
    pair: "#81d4fa",
    run: "#a5d6a7",
    flush: "#ce93d8",
    nobs: "#ffab91",
  };
  const TYPE_ICON = {
    fifteen: "15",
    pair: "=",
    run: "→",
    flush: "♠",
    nobs: "J",
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.92)",
      border: "1px solid rgba(0,0,0,0.15)",
      borderRadius: 10,
      padding: "10px 12px",
      width: "100%",
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: "bold",
        color: "#111",
        marginBottom: 7,
        letterSpacing: 1,
        fontFamily: "Georgia, serif",
        textTransform: "uppercase",
      }}>
        {label}
      </div>

      {/* Cards row */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        {hand4.map((c, i) => (
          <CardComp key={i} card={c} theme={theme} disabled small />
        ))}
        <span style={{ color: "#333", fontSize: 16, fontWeight: "bold", margin: "0 3px" }}>+</span>
        <CardComp card={sharedCard} theme={theme} disabled small highlight />
        <span style={{ color: "#555", fontSize: 10, marginLeft: 3 }}>(shared)</span>
      </div>

      {/* Breakdown lines */}
      {lines.length === 0 ? (
        <div style={{ fontSize: 12, color: "#c00", fontStyle: "italic", padding: "3px 0" }}>
          No scoring combinations — 0 points
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {lines.map((line, i) => {
            const col = TYPE_COLOR[line.type] || "#aaa";
            return (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "3px 6px",
                borderRadius: 5,
                background: col + "30",
                border: `1px solid ${col}66`,
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: "50%",
                  background: col, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 9, fontWeight: "bold",
                  color: "#1a1a1a", flexShrink: 0,
                }}>
                  {TYPE_ICON[line.type] || "?"}
                </span>
                <span style={{ fontSize: 11, color: "#111", flex: 1, fontFamily: "Georgia, serif" }}>
                  {line.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: "bold", color: "#111", fontFamily: "Georgia, serif" }}>
                  +{line.pts}
                </span>
              </div>
            );
          })}
          <div style={{
            display: "flex", justifyContent: "flex-end",
            paddingTop: 4, marginTop: 2,
            borderTop: "1px solid rgba(0,0,0,0.15)",
          }}>
            <span style={{ fontSize: 13, fontWeight: "bold", color: "#111", fontFamily: "Georgia, serif" }}>
              Total: {total} pts
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Game Log ────────────────────────────────────────────────────────────────
function GameLog({ entries, theme }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div ref={ref} style={{
      height: 100,
      overflowY: "auto",
      background: "rgba(255,255,255,0.88)",
      border: "1px solid rgba(0,0,0,0.18)",
      borderRadius: 8,
      padding: "5px 10px",
      fontFamily: "Georgia, serif",
      fontSize: 11.5,
    }}>
      {entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 2, color: "#111", lineHeight: 1.4 }}>
          {e.text}
        </div>
      ))}
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────
export default function CribbageGame() {
  const [screen, setScreen] = useState("menu");
  const [selectedTheme, setSelectedTheme] = useState(BOARD_THEMES[0]);
  const [difficulty, setDifficulty] = useState("medium");
  const [gameState, setGameState] = useState(null);
  const [log, setLog] = useState([]);

  const addLog = useCallback((text, type = "info") => {
    setLog(prev => [...prev.slice(-50), { text, type }]);
  }, []);

  function startGame() {
    setLog([]);
    addLog(`Board: ${selectedTheme.name} | Difficulty: ${difficulty.toUpperCase()}`);
    addLog("Cut for first dealer — low card deals. Click to cut!");
    setGameState({
      phase: PHASES.FIRSTCUT,
      cutDeck: shuffle(createDeck()),
      playerCutCard: null,
      aiCutCard: null,
      playerHand: [],
      aiHand: [],
      crib: [],
      deck: [],
      sharedCard: null,
      isPlayerDealer: false,
      playerScore: 0,
      aiScore: 0,
      playerPrevScore: 0,
      aiPrevScore: 0,
      selectedCards: [],
      pegStack: [],
      pegCount: 0,
      playerPegHand: [],
      aiPegHand: [],
      pegTurn: "player",
      showIndex: 0,
      goPlayer: false,
      goAi: false,
      cribDiscarded: false,
    });
    setScreen("game");
  }

  function handleFirstCut() {
    const deck = gameState.cutDeck;
    const pi = Math.floor(Math.random() * Math.floor(deck.length / 2));
    const ai = Math.floor(deck.length / 2) + Math.floor(Math.random() * Math.floor(deck.length / 2));
    const pc = deck[pi];
    const ac = deck[ai];
    const pv = RANK_ORDER[pc.rank];
    const av = RANK_ORDER[ac.rank];
    let isPlayerDealer;
    if (pv === av) {
      isPlayerDealer = Math.random() < 0.5;
      addLog(`Tie! ${pc.rank}${pc.suit} vs ${ac.rank}${ac.suit} — ${isPlayerDealer ? "You" : "CPU"} deal first.`);
    } else {
      isPlayerDealer = pv < av;
      addLog(`You cut: ${pc.rank}${pc.suit}  |  CPU cuts: ${ac.rank}${ac.suit}`);
      addLog(`${isPlayerDealer ? "You have" : "CPU has"} the low card — ${isPlayerDealer ? "You" : "CPU"} deal first!`);
    }
    const nd = shuffle(createDeck());
    const ph = nd.slice(0, 6);
    const ah = nd.slice(6, 12);
    addLog("--- First Hand Dealt ---");
    setGameState(prev => ({
      ...prev,
      phase: PHASES.CRIB,
      playerCutCard: pc,
      aiCutCard: ac,
      isPlayerDealer,
      playerHand: ph,
      aiHand: ah,
      deck: nd.slice(12),
      crib: [],
      sharedCard: null,
      selectedCards: [],
      pegStack: [],
      pegCount: 0,
      playerPegHand: ph,
      aiPegHand: ah,
      goPlayer: false,
      goAi: false,
      cribDiscarded: false,
      showIndex: 0,
    }));
  }

  // AI crib discard
  useEffect(() => {
    if (!gameState || gameState.phase !== PHASES.CRIB || gameState.cribDiscarded) return;
    const dis = aiSelectCribCards(gameState.aiHand, !gameState.isPlayerDealer, difficulty);
    const keep = gameState.aiHand.filter(c => !dis.find(x => x.id === c.id));
    addLog("CPU discarded 2 cards to the crib.");
    setGameState(prev => ({
      ...prev,
      aiHand: keep,
      aiPegHand: keep,
      crib: [...prev.crib, ...dis],
      cribDiscarded: true,
    }));
  }, [gameState?.phase, gameState?.cribDiscarded]);

  function handleCribSelect(card) {
    if (gameState.phase !== PHASES.CRIB) return;
    const sel = gameState.selectedCards;
    const already = sel.find(c => c.id === card.id);
    if (already) {
      setGameState(prev => ({ ...prev, selectedCards: sel.filter(c => c.id !== card.id) }));
    } else if (sel.length < 2) {
      setGameState(prev => ({ ...prev, selectedCards: [...sel, card] }));
    }
  }

  function confirmCribDiscard() {
    if (!gameState || gameState.selectedCards.length !== 2) return;
    const dis = gameState.selectedCards;
    const keep = gameState.playerHand.filter(c => !dis.find(x => x.id === c.id));
    addLog(`You discarded ${dis.map(c => c.rank + c.suit).join(", ")} to the crib.`);
    const newCrib = [...gameState.crib, ...dis];
    const topCard = gameState.deck[0];
    addLog(`Shared card flipped: ${topCard.rank}${topCard.suit}`);
    let bp = 0;
    let ba = 0;
    if (topCard.rank === "J") {
      if (gameState.isPlayerDealer) {
        bp = 2;
        addLog("His Heels! You score 2 pts!", "score");
      } else {
        ba = 2;
        addLog("His Heels! CPU scores 2 pts!", "ai");
      }
    }
    const firstPegger = gameState.isPlayerDealer ? "ai" : "player";
    setGameState(prev => ({
      ...prev,
      playerHand: keep,
      playerPegHand: keep,
      crib: newCrib,
      deck: prev.deck.slice(1),
      sharedCard: topCard,
      selectedCards: [],
      phase: PHASES.PEG,
      pegTurn: firstPegger,
      pegStack: [],
      pegCount: 0,
      goPlayer: false,
      goAi: false,
      playerScore: prev.playerScore + bp,
      playerPrevScore: bp > 0 ? prev.playerScore : prev.playerPrevScore,
      aiScore: prev.aiScore + ba,
      aiPrevScore: ba > 0 ? prev.aiScore : prev.aiPrevScore,
    }));
    addLog("Pegging begins! " + (gameState.isPlayerDealer ? "CPU leads." : "You lead."));
  }

  // AI peg turn
  useEffect(() => {
    if (!gameState || gameState.phase !== PHASES.PEG || gameState.pegTurn !== "ai") return;
    const timer = setTimeout(() => {
      const { aiPegHand, pegStack, pegCount, goPlayer, goAi } = gameState;

      if (aiPegHand.length === 0 && gameState.playerPegHand.length === 0) {
        addLog("All cards played!");
        setGameState(prev => ({ ...prev, phase: PHASES.SHOW, showIndex: 0 }));
        addLog("--- THE SHOW ---");
        return;
      }

      const valid = aiPegHand.filter(c => pegCount + cardValue(c) <= 31);
      if (!valid.length) {
        if (!goAi) {
          addLog("CPU says Go!", "ai");
          setGameState(prev => ({ ...prev, goAi: true, pegTurn: "player" }));
        } else if (goPlayer || gameState.playerPegHand.length === 0) {
          addLog("Go! CPU scores 1 pt.", "ai");
          setGameState(prev => ({
            ...prev,
            aiScore: prev.aiScore + 1,
            aiPrevScore: prev.aiScore,
            pegStack: [],
            pegCount: 0,
            goPlayer: false,
            goAi: false,
            pegTurn: "player",
          }));
        }
        return;
      }

      const card = aiSelectPegCard(aiPegHand, pegStack, pegCount, difficulty);
      if (!card) return;
      const nc = pegCount + cardValue(card);
      const pts = scorePegging(pegStack, card);
      const ns = [...pegStack, card];
      const nh = aiPegHand.filter(c => c.id !== card.id);
      const msgType = pts > 0 ? "ai" : "info";
      addLog(`CPU plays ${card.rank}${card.suit} → count: ${nc}${pts > 0 ? ` (+${pts} pts)` : ""}`, msgType);

      let newAiScore = gameState.aiScore + pts;
      if (nc === 31 && pts === 0) {
        newAiScore += 2;
        addLog("31! CPU scores 2 pts.", "ai");
      }

      const nextTurn = nc === 31
        ? (gameState.isPlayerDealer ? "ai" : "player")
        : "player";

      setGameState(prev => ({
        ...prev,
        aiPegHand: nh,
        pegStack: nc === 31 ? [] : ns,
        pegCount: nc === 31 ? 0 : nc,
        aiScore: newAiScore,
        aiPrevScore: prev.aiScore,
        pegTurn: nextTurn,
        goAi: false,
        goPlayer: nc === 31 ? false : prev.goPlayer,
      }));
    }, 900);
    return () => clearTimeout(timer);
  }, [gameState?.pegTurn, gameState?.phase, gameState?.aiPegHand?.length]);

  function handlePegPlay(card) {
    if (!gameState || gameState.phase !== PHASES.PEG || gameState.pegTurn !== "player") return;
    const { pegStack, pegCount } = gameState;
    if (pegCount + cardValue(card) > 31) {
      addLog("Can't play — would exceed 31!");
      return;
    }
    const nc = pegCount + cardValue(card);
    const pts = scorePegging(pegStack, card);
    const ns = [...pegStack, card];
    const nh = gameState.playerPegHand.filter(c => c.id !== card.id);
    const msgType = pts > 0 ? "score" : "info";
    addLog(`You play ${card.rank}${card.suit} → count: ${nc}${pts > 0 ? ` (+${pts} pts)` : ""}`, msgType);

    let newPlayerScore = gameState.playerScore + pts;
    if (nc === 31 && pts === 0) {
      newPlayerScore += 2;
      addLog("31! You score 2 pts.", "score");
    }

    const nextTurn = nc === 31
      ? (gameState.isPlayerDealer ? "ai" : "player")
      : "ai";

    setGameState(prev => ({
      ...prev,
      playerPegHand: nh,
      pegStack: nc === 31 ? [] : ns,
      pegCount: nc === 31 ? 0 : nc,
      playerScore: newPlayerScore,
      playerPrevScore: prev.playerScore,
      pegTurn: nextTurn,
      goPlayer: false,
      goAi: nc === 31 ? false : prev.goAi,
    }));
  }

  function handlePlayerGo() {
    if (!gameState || gameState.phase !== PHASES.PEG || gameState.pegTurn !== "player") return;
    const valid = gameState.playerPegHand.filter(c => gameState.pegCount + cardValue(c) <= 31);
    if (valid.length > 0) {
      addLog("You must play a card if you can!");
      return;
    }
    addLog("You say Go!");
    if (gameState.goAi || gameState.aiPegHand.length === 0) {
      addLog("Go! You score 1 pt.", "score");
      setGameState(prev => ({
        ...prev,
        playerScore: prev.playerScore + 1,
        playerPrevScore: prev.playerScore,
        pegStack: [],
        pegCount: 0,
        goPlayer: false,
        goAi: false,
        pegTurn: "ai",
      }));
    } else {
      setGameState(prev => ({ ...prev, goPlayer: true, pegTurn: "ai" }));
    }
  }

  // Check pegging done
  useEffect(() => {
    if (!gameState || gameState.phase !== PHASES.PEG) return;
    if (
      gameState.playerPegHand.length === 0 &&
      gameState.aiPegHand.length === 0 &&
      gameState.pegTurn === "player"
    ) {
      addLog("Last card! You score 1 pt.", "score");
      setGameState(prev => ({
        ...prev,
        playerScore: prev.playerScore + 1,
        playerPrevScore: prev.playerScore,
        phase: PHASES.SHOW,
        showIndex: 0,
      }));
      addLog("--- THE SHOW ---");
    }
  }, [gameState?.playerPegHand?.length, gameState?.aiPegHand?.length]);

  function handleShow() {
    if (!gameState || gameState.phase !== PHASES.SHOW) return;
    const { showIndex, sharedCard, isPlayerDealer, playerHand, aiHand, crib } = gameState;

    if (showIndex === 0) {
      const hand = isPlayerDealer ? aiHand : playerHand;
      const pts = scoreHand(hand, sharedCard);
      const who = isPlayerDealer ? "CPU" : "You";
      addLog(`${who} score ${pts} pts in hand.`, isPlayerDealer ? "ai" : "score");
      const key = isPlayerDealer ? "aiScore" : "playerScore";
      const pk = isPlayerDealer ? "aiPrevScore" : "playerPrevScore";
      setGameState(prev => ({ ...prev, [key]: prev[key] + pts, [pk]: prev[key], showIndex: 1 }));

    } else if (showIndex === 1) {
      const hand = isPlayerDealer ? playerHand : aiHand;
      const pts = scoreHand(hand, sharedCard);
      const who = isPlayerDealer ? "You" : "CPU";
      addLog(`${who} score ${pts} pts in hand.`, isPlayerDealer ? "score" : "ai");
      const key = isPlayerDealer ? "playerScore" : "aiScore";
      const pk = isPlayerDealer ? "playerPrevScore" : "aiPrevScore";
      setGameState(prev => ({ ...prev, [key]: prev[key] + pts, [pk]: prev[key], showIndex: 2 }));

    } else if (showIndex === 2) {
      const pts = scoreHand(crib, sharedCard, true);
      const who = isPlayerDealer ? "You" : "CPU";
      addLog(`${who} score ${pts} pts in crib.`, isPlayerDealer ? "score" : "ai");
      const key = isPlayerDealer ? "playerScore" : "aiScore";
      const pk = isPlayerDealer ? "playerPrevScore" : "aiPrevScore";
      setGameState(prev => {
        const newScore = prev[key] + pts;
        const winner = newScore >= 121 ? (isPlayerDealer ? "player" : "ai") : null;
        return { ...prev, [key]: newScore, [pk]: prev[key], showIndex: 3, phase: winner ? PHASES.DONE : PHASES.SHOW, winner };
      });

    } else {
      setGameState(prev => {
        if (prev.playerScore >= 121 || prev.aiScore >= 121) {
          return { ...prev, phase: PHASES.DONE, winner: prev.playerScore >= 121 ? "player" : "ai" };
        }
        const nd = shuffle(createDeck());
        const ph = nd.slice(0, 6);
        const ah = nd.slice(6, 12);
        addLog("--- New Deal ---");
        return {
          ...prev,
          phase: PHASES.CRIB,
          playerHand: ph,
          aiHand: ah,
          crib: [],
          deck: nd.slice(12),
          sharedCard: null,
          selectedCards: [],
          pegStack: [],
          pegCount: 0,
          playerPegHand: ph,
          aiPegHand: ah,
          isPlayerDealer: !prev.isPlayerDealer,
          goPlayer: false,
          goAi: false,
          cribDiscarded: false,
          showIndex: 0,
        };
      });
    }
  }

  const t = selectedTheme;

  // ── MENU ──────────────────────────────────────────────────────────────────
  if (screen === "menu") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#001800",
        backgroundImage: TARTAN_SVG,
        backgroundSize: "96px 96px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: L.cream, padding: 24, position: "relative", overflow: "hidden",
      }}>
        {/* Radial vignette */}
        <div style={{ position:"absolute", inset:0,
          background:"radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.72) 100%)",
          pointerEvents:"none" }}/>

        {/* Corner brackets */}
        <div style={{ position:"absolute", top:14, left:14 }}><SvgCorner size={32} color={L.brassL}/></div>
        <div style={{ position:"absolute", top:14, right:14 }}><SvgCorner size={32} color={L.brassL} flipH/></div>
        <div style={{ position:"absolute", bottom:14, left:14 }}><SvgCorner size={32} color={L.brassL} flipV/></div>
        <div style={{ position:"absolute", bottom:14, right:14 }}><SvgCorner size={32} color={L.brassL} flipH flipV/></div>

        {/* Title card */}
        <div style={{ position:"relative", zIndex:1, textAlign:"center", marginBottom:32,
          padding:"32px 52px 28px",
          background:"rgba(8,4,1,0.72)", backdropFilter:"blur(3px)",
          border:`1.5px solid ${L.brass}55`, borderRadius:4,
          boxShadow:`0 14px 52px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}>
          {/* Stag heraldic crest */}
          <SvgStagHead size={68} color={L.brassL} style={{ display:"block", margin:"0 auto 8px" }}/>
          <SvgRule color={L.brassL} style={{ marginBottom:14 }}/>
          <h1 style={{
            fontSize:50, fontWeight:"bold", color:L.gold, margin:0,
            letterSpacing:8, fontFamily:"Georgia,serif",
            textShadow:`0 0 40px ${L.brass}55, 0 2px 4px rgba(0,0,0,0.8)`, lineHeight:1,
          }}>CRIBBAGE</h1>
          <SvgRule color={L.brassL} style={{ marginTop:14 }}/>
        </div>

        {/* Buttons */}
        <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", gap:12, width:"100%", maxWidth:280 }}>
          <button onClick={() => setScreen("boardSelect")} style={{
            background:`linear-gradient(180deg, ${L.mahoganyL} 0%, ${L.mahoganyM} 100%)`,
            color: L.gold, border:`1.5px solid ${L.brassL}`,
            padding:"15px 32px", fontSize:16, borderRadius:4, cursor:"pointer",
            fontFamily:"Georgia,serif", fontWeight:"bold", letterSpacing:2,
            boxShadow:`0 4px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)`,
          }}>NEW GAME</button>
          <button onClick={() => setScreen("rules")} style={{
            background:`linear-gradient(180deg, ${L.mahoganyM} 0%, ${L.mahogany} 100%)`,
            color: L.cream, border:`1px solid ${L.brass}88`,
            padding:"13px 32px", fontSize:14, borderRadius:4, cursor:"pointer",
            fontFamily:"Georgia,serif", letterSpacing:1,
            boxShadow:`0 4px 16px rgba(0,0,0,0.55)`,
          }}>HOW TO PLAY</button>
        </div>
      </div>
    );
  }

  // ── BOARD SELECT ──────────────────────────────────────────────────────────
  if (screen === "boardSelect") {
    return (
      <div style={{
        minHeight: "100vh", background: "#001400",
        backgroundImage: TARTAN_SVG, backgroundSize: "96px 96px",
        padding: "20px 16px", fontFamily: "Georgia, serif", overflowY: "auto",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:22, paddingTop:8 }}>
            <div style={{ fontSize:10, color:L.brassL, letterSpacing:4, marginBottom:6, opacity:0.7 }}>
              CHOOSE YOUR TABLE
            </div>
            <h2 style={{ fontSize:27, color:L.gold, letterSpacing:3, margin:0,
              textShadow:`0 0 20px ${L.brass}44` }}>Select a Board</h2>
            <SvgRule color={L.brassL} style={{ margin:"10px auto 0", maxWidth:260, display:"block" }}/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))", gap:14 }}>
            {BOARD_THEMES.map(theme => {
              const isSelected = selectedTheme.id === theme.id;
              return (
                <div key={theme.id}
                  onClick={() => { setSelectedTheme(theme); setScreen("diffSelect"); }}
                  style={{
                    background: theme.tableBg, borderRadius:6, padding:14, cursor:"pointer",
                    transition:"all 0.18s", overflow:"hidden",
                    border:`2px solid ${isSelected ? theme.boardAccent : "rgba(200,168,32,0.18)"}`,
                    boxShadow: isSelected
                      ? `0 0 22px ${theme.boardAccent}55, 0 5px 18px rgba(0,0,0,0.55)`
                      : "0 4px 14px rgba(0,0,0,0.45)",
                    transform: isSelected ? "scale(1.03)" : "scale(1)",
                  }}>
                  {/* Mini board SVG preview */}
                  <svg width="100%" viewBox="0 0 160 50" style={{ display:"block", marginBottom:10, borderRadius:3 }}>
                    <rect x="1" y="1" width="158" height="48" rx="8"
                      fill={theme.boardBg} stroke={theme.boardBorder} strokeWidth="2"/>
                    <rect x="3" y="3" width="154" height="44" rx="6"
                      fill="none" stroke={theme.boardAccent + "33"} strokeWidth="1"/>
                    {/* Board deco art */}
                    {theme.boardSvgDeco && (
                      <g dangerouslySetInnerHTML={{ __html: theme.boardSvgDeco(160, 50) }}/>
                    )}
                    {/* Holes */}
                    {Array.from({ length: 15 }, (_, i) =>
                      [1, 2].map(lane => (
                        <circle key={`${i}-${lane}`}
                          cx={12 + i * 9} cy={14 + lane * 16} r="3.5"
                          fill={theme.trackColor} stroke={theme.holeColor + "66"} strokeWidth="0.5"/>
                      ))
                    )}
                    <circle cx="6" cy="22" r="5" fill={theme.peg1Color} stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
                    <circle cx="6" cy="38" r="5" fill={theme.peg2Color} stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
                  </svg>
                  <div style={{ fontSize:13, fontWeight:"bold", color:theme.boardAccent,
                    lineHeight:1.3, marginBottom:6, letterSpacing:0.5 }}>
                    {theme.name}
                  </div>
                  {/* Peg colour swatches */}
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ width:10, height:10, borderRadius:"50%", background:theme.peg1Color,
                      display:"inline-block", boxShadow:"0 1px 3px rgba(0,0,0,0.4)" }}/>
                    <span style={{ width:10, height:10, borderRadius:"50%", background:theme.peg2Color,
                      display:"inline-block", boxShadow:"0 1px 3px rgba(0,0,0,0.4)" }}/>
                    {isSelected && <span style={{ fontSize:9, color:theme.boardAccent,
                      letterSpacing:1, opacity:0.8 }}>SELECTED</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign:"center", marginTop:20 }}>
            <button onClick={() => setScreen("menu")} style={{
              background:"rgba(255,255,255,0.07)", color:L.cream,
              border:`1px solid ${L.brass}44`,
              padding:"10px 24px", borderRadius:4, cursor:"pointer",
              fontFamily:"Georgia, serif", fontSize:13, letterSpacing:1,
            }}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  // ── DIFFICULTY SELECT ──────────────────────────────────────────────────────
  if (screen === "diffSelect") {
    return (
      <div style={{
        minHeight: "100vh", background: t.tableBg, backgroundImage: t.tablePatternSvg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "Georgia, serif", color: t.textColor, padding: 24, position: "relative",
      }}>
        <div style={{ position:"absolute", inset:0,
          background:"radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.6) 100%)",
          pointerEvents:"none" }}/>
        <div style={{
          position:"relative", zIndex:1,
          background:"rgba(4,2,0,0.72)", backdropFilter:"blur(8px)",
          borderRadius:4, padding:"30px 34px",
          border:`1px solid ${t.boardAccent}44`,
          maxWidth:340, width:"100%",
          boxShadow:"0 10px 44px rgba(0,0,0,0.7)",
        }}>
          <SvgThistle size={36} color={t.boardAccent} style={{ display:"block", margin:"0 auto 10px" }}/>
          <h2 style={{ color:t.boardAccent, fontSize:24, letterSpacing:3,
            marginBottom:4, textAlign:"center", textTransform:"uppercase" }}>Difficulty</h2>
          <SvgRule color={t.boardAccent} style={{ marginBottom:20 }}/>
          {[
            { id:"easy",   label:"Novice",  desc:"A relaxed game — good for learning" },
            { id:"medium", label:"Regular", desc:"Balanced play with proper strategy" },
            { id:"hard",   label:"Expert",  desc:"Near-optimal — bring your best game" },
          ].map(d => (
            <div key={d.id} onClick={() => setDifficulty(d.id)} style={{
              background: difficulty === d.id
                ? `linear-gradient(135deg, ${t.btnBg}cc, ${t.boardAccent}22)`
                : "rgba(0,0,0,0.35)",
              border:`1.5px solid ${difficulty === d.id ? t.boardAccent : "rgba(255,255,255,0.12)"}`,
              borderRadius:4, padding:"13px 18px", cursor:"pointer",
              transition:"all 0.15s", marginBottom:10,
              boxShadow: difficulty === d.id ? `0 0 14px ${t.boardAccent}33` : "none",
            }}>
              <div style={{ fontSize:15, fontWeight:"bold",
                color: difficulty === d.id ? t.boardAccent : t.textColor }}>{d.label}</div>
              <div style={{ fontSize:11, opacity:0.55, marginTop:3 }}>{d.desc}</div>
            </div>
          ))}
          <div style={{ display:"flex", gap:12, marginTop:20, justifyContent:"center" }}>
            <button onClick={() => setScreen("boardSelect")} style={{
              background:"rgba(0,0,0,0.3)", color:t.textColor,
              border:"1px solid rgba(255,255,255,0.22)",
              padding:"11px 20px", borderRadius:4, cursor:"pointer",
              fontFamily:"Georgia, serif", fontSize:13, letterSpacing:1,
            }}>Back</button>
            <button onClick={startGame} style={{
              background:`linear-gradient(135deg, ${t.btnBg}, ${t.boardAccent}44)`,
              color:t.textColor, border:`1.5px solid ${t.boardAccent}`,
              padding:"11px 24px", fontSize:15, borderRadius:4, cursor:"pointer",
              fontFamily:"Georgia, serif", fontWeight:"bold", letterSpacing:1,
              boxShadow:`0 4px 18px ${t.boardAccent}44`,
            }}>Deal Cards</button>
          </div>
        </div>
      </div>
    );
  }

  // ── RULES ──────────────────────────────────────────────────────────────────
  if (screen === "rules") {
    return (
      <div style={{
        minHeight:"100vh", background:"#001400",
        backgroundImage:TARTAN_SVG, backgroundSize:"96px 96px",
        padding:24, fontFamily:"Georgia, serif", color:L.cream, overflowY:"auto",
      }}>
        <div style={{ maxWidth:620, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <h2 style={{ fontSize:28, color:L.gold, letterSpacing:3, margin:0 }}>The Rules</h2>
            <SvgRule color={L.brassL} style={{ margin:"10px auto 0", maxWidth:260, display:"block" }}/>
          </div>
          {[
            ["Objective", "First to 121 points wins. The board's twin lanes of holes track each player's progress with two pegs each."],
            ["Cut for Dealer", "At game start, each player cuts the deck. Low card deals first — Ace is lowest. Ties are recut."],
            ["The Deal", "Each player receives 6 cards and discards 2 to the Crib — a bonus hand belonging to the dealer."],
            ["The Shared Card", "After discarding, the top deck card is flipped. It counts in every hand during scoring. A Jack scores the dealer 2 pts immediately (His Heels)."],
            ["Pegging", "Players alternately play cards face-up counting toward 31. Score for exactly 15 or 31, pairs, runs, and Go (when opponent cannot play)."],
            ["The Show", "Score your hand + shared card: fifteens (2 pts each), pairs (2 pts), runs, flush (4–5 pts), His Nobs (Jack matching shared card suit = 1 pt). Non-dealer scores first."],
            ["The Crib", "The dealer scores the crib as a bonus hand. A flush in the crib requires all 5 cards — including the shared card — to be the same suit."],
          ].map(([title, desc]) => (
            <div key={title} style={{
              marginBottom:14, padding:"12px 16px",
              background:"rgba(255,255,255,0.04)",
              borderLeft:`3px solid ${L.brassL}`,
              borderRadius:"0 3px 3px 0",
            }}>
              <div style={{ fontWeight:"bold", color:L.gold, fontSize:14, marginBottom:5, letterSpacing:0.5 }}>
                {title}
              </div>
              <div style={{ fontSize:13, lineHeight:1.7, color:L.cream, opacity:0.82 }}>{desc}</div>
            </div>
          ))}
          <div style={{ textAlign:"center", marginTop:20 }}>
            <button onClick={() => setScreen("menu")} style={{
              background:`rgba(200,168,32,0.12)`, color:L.gold,
              border:`1.5px solid ${L.brass}`,
              padding:"12px 28px", borderRadius:4, cursor:"pointer",
              fontFamily:"Georgia, serif", fontSize:14, letterSpacing:1,
            }}>Back to Menu</button>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME SCREEN ──────────────────────────────────────────────────────────
  if (!gameState || screen !== "game") return null;

  const {
    phase, playerHand, aiHand, crib, sharedCard, selectedCards,
    pegStack, pegCount, playerPegHand, aiPegHand, pegTurn,
    isPlayerDealer, playerScore, aiScore, playerPrevScore, aiPrevScore,
    showIndex, goPlayer, goAi, winner,
  } = gameState;

  const canPlay = pegTurn === "player" && phase === PHASES.PEG;
  const validPeg = canPlay ? playerPegHand.filter(c => pegCount + cardValue(c) <= 31) : [];

  // Which hand/cards to show in score breakdown
  let breakdownHand4 = null;
  let breakdownLabel = "";
  let breakdownIsCrib = false;
  if (phase === PHASES.SHOW && sharedCard) {
    if (showIndex === 0) {
      breakdownHand4 = isPlayerDealer ? aiHand : playerHand;
      breakdownLabel = isPlayerDealer ? "CPU's Hand" : "Your Hand";
    } else if (showIndex === 1) {
      breakdownHand4 = isPlayerDealer ? playerHand : aiHand;
      breakdownLabel = isPlayerDealer ? "Your Hand" : "CPU's Hand";
    } else if (showIndex === 2) {
      breakdownHand4 = crib;
      breakdownLabel = isPlayerDealer ? "Your Crib" : "CPU's Crib";
      breakdownIsCrib = true;
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: t.tableBg,
      backgroundImage: t.tablePatternSvg,
      fontFamily: "Georgia, 'Times New Roman', serif",
      color: "#111",
      padding: "10px 10px 16px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      maxWidth: 700,
      margin: "0 auto",
      position: "relative",
    }}>

      {/* Felt vignette */}
      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.45) 100%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <button onClick={() => setScreen("menu")} style={{
            background: "rgba(255,255,255,0.85)", color: "#111",
            border: "1px solid rgba(0,0,0,0.25)",
            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontFamily: "Georgia, serif",
          }}>≡ Menu</button>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: "bold", color: "#111", letterSpacing: 1 }}>
              {t.name}
            </div>
            <div style={{ fontSize: 10, color: "#333", letterSpacing: 1 }}>
              {phase === PHASES.FIRSTCUT ? "CUT FOR DEAL" : phase.toUpperCase()} · {isPlayerDealer ? "Your" : "CPU"} Crib · {difficulty.toUpperCase()}
            </div>
          </div>
          <button onClick={() => setScreen("boardSelect")} style={{
            background: "rgba(255,255,255,0.85)", color: "#111",
            border: "1px solid rgba(0,0,0,0.25)",
            padding: "6px 12px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontFamily: "Georgia, serif",
          }}>Board</button>
        </div>

        {/* Cribbage Board */}
        <CribbageBoard
          playerScore={playerScore} aiScore={aiScore} theme={t}
          playerPrevScore={playerPrevScore} aiPrevScore={aiPrevScore}
        />

        {/* Score badges */}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {[{ who: "YOU", score: playerScore, color: t.peg1Color }, { who: "CPU", score: aiScore, color: t.peg2Color }].map(s => (
            <div key={s.who} style={{
              textAlign: "center", background: "rgba(255,255,255,0.88)",
              borderRadius: 10, padding: "6px 18px",
              border: `2px solid ${s.color}`, minWidth: 70,
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}>
              <div style={{ fontSize: 10, color: "#444", letterSpacing: 1 }}>{s.who}</div>
              <div style={{ fontSize: 26, fontWeight: "bold", color: "#111", lineHeight: 1.1 }}>{s.score}</div>
              <div style={{ fontSize: 9, color: "#666" }}>/121</div>
            </div>
          ))}
        </div>

        {/* Win Screen */}
        {phase === PHASES.DONE && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}>
            <div style={{
              textAlign: "center", padding: "36px 44px",
              background: t.boardBg, borderRadius: 22,
              border: `3px solid ${t.boardAccent}`,
              boxShadow: `0 0 60px ${t.boardAccent}44`,
              maxWidth: 340,
            }}>
              {winner === "player"
                ? <SvgStagHead size={56} color={t.boardAccent} style={{ display:"block", margin:"0 auto 8px" }}/>
                : <SvgThistle  size={40} color={t.boardAccent} style={{ display:"block", margin:"0 auto 8px" }}/>
              }
              <div style={{ fontSize: 30, fontWeight: "bold", color: t.boardAccent, marginBottom: 6 }}>
                {winner === "player" ? "You Win!" : "CPU Wins!"}
              </div>
              <div style={{ fontSize: 15, opacity: 0.75, marginBottom: 8 }}>
                You: {playerScore} | CPU: {aiScore}
              </div>
              {playerScore < 91 && winner === "ai" && <div style={{ color: "#ef9a9a", marginBottom: 8 }}>You were skunked!</div>}
              {aiScore < 91 && winner === "player" && <div style={{ color: t.boardAccent, marginBottom: 8 }}>You skunked the CPU!</div>}
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
                <button onClick={startGame} style={{
                  background: t.btnBg, color: "#fff", border: `2px solid ${t.boardAccent}`,
                  padding: "12px 22px", fontSize: 15, borderRadius: 10, cursor: "pointer", fontFamily: "Georgia, serif",
                }}>Play Again</button>
                <button onClick={() => setScreen("menu")} style={{
                  background: "rgba(255,255,255,0.15)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.4)",
                  padding: "12px 22px", fontSize: 15, borderRadius: 10, cursor: "pointer", fontFamily: "Georgia, serif",
                }}>Menu</button>
              </div>
            </div>
          </div>
        )}

        {/* CPU Hand */}
        <div>
          <div style={{ fontSize: 11, color: "#111", fontWeight: "bold", marginBottom: 5, textAlign: "center", letterSpacing: 1 }}>
            CPU HAND {phase === PHASES.SHOW ? `(${aiHand.length} cards)` : ""}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
            {phase === PHASES.FIRSTCUT ? null
              : phase === PHASES.SHOW
                ? aiHand.map(c => <CardComp key={c.id} card={c} theme={t} disabled />)
                : phase === PHASES.PEG
                  ? aiPegHand.map((_, i) => <CardComp key={i} card={{ suit: "♠", rank: "?" }} faceDown theme={t} small />)
                  : Array.from({ length: gameState.aiHand?.length || 4 }, (_, i) =>
                      <CardComp key={i} card={{ suit: "♠", rank: "?" }} faceDown theme={t} small />
                    )
            }
          </div>
        </div>

        {/* Table Surface */}
        <div style={{
          width: "100%",
          background: "rgba(255,255,255,0.88)",
          borderRadius: 14,
          padding: "10px 12px",
          border: "1px solid rgba(0,0,0,0.15)",
          minHeight: 90,
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Subtle felt weave */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: 14, opacity: 0.04,
            backgroundImage: "repeating-linear-gradient(45deg, #fff 0px, #fff 1px, transparent 1px, transparent 6px)",
            pointerEvents: "none",
          }} />

          {/* FIRSTCUT phase */}
          {phase === PHASES.FIRSTCUT && (
            <div style={{ textAlign: "center", position: "relative" }}>
              <div style={{ fontSize: 14, color: "#111", marginBottom: 8, fontWeight: "bold", letterSpacing: 1 }}>
                Cut for First Dealer
              </div>
              <div style={{ fontSize: 12, color: "#444", marginBottom: 12 }}>
                Low card deals. Ace is lowest.
              </div>
              {gameState.playerCutCard ? (
                <div style={{ display: "flex", justifyContent: "center", gap: 32, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#444", marginBottom: 4, letterSpacing: 1 }}>YOU CUT</div>
                    <CardComp card={gameState.playerCutCard} theme={t} disabled />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: "#444", marginBottom: 4, letterSpacing: 1 }}>CPU CUTS</div>
                    <CardComp card={gameState.aiCutCard} theme={t} disabled />
                  </div>
                </div>
              ) : (
                <button onClick={handleFirstCut} style={{
                  background: t.btnBg,
                  color: "#fff", border: `2px solid ${t.boardAccent}`,
                  padding: "12px 28px", fontSize: 16, borderRadius: 10, cursor: "pointer",
                  fontFamily: "Georgia, serif", fontWeight: "bold",
                  boxShadow: `0 4px 16px ${t.boardAccent}44`,
                }}>Cut the Deck</button>
              )}
            </div>
          )}

          {/* PEG phase */}
          {phase === PHASES.PEG && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              {sharedCard && (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 9, color: "#333", marginBottom: 3, fontWeight: "bold", letterSpacing: 1.5 }}>
                    SHARED
                  </div>
                  <CardComp card={sharedCard} theme={t} disabled highlight />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#111", marginBottom: 5, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span>Count: <strong style={{ color: "#111", fontSize: 16 }}>{pegCount}</strong>
                    {pegCount > 0 ? " / 31" : ""}</span>
                  {goPlayer && <span style={{ color: "#b45309", fontSize: 11, fontWeight: "bold" }}>You said Go</span>}
                  {goAi && <span style={{ color: "#b45309", fontSize: 11, fontWeight: "bold" }}>CPU said Go</span>}
                  <span style={{ color: "#555", fontSize: 11 }}>
                    {pegTurn === "player" ? "→ Your turn" : "→ CPU thinking…"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 48, alignItems: "center" }}>
                  {pegStack.map((c, i) => <CardComp key={i} card={c} theme={t} small disabled />)}
                  {pegStack.length === 0 && (
                    <span style={{ color: "#888", fontSize: 12, fontStyle: "italic" }}>No cards played yet</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SHOW phase */}
          {phase === PHASES.SHOW && (
            <div>
              {/* Top row: shared card + crib (when scoring crib) + action */}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
                {sharedCard && (
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: "#333", marginBottom: 3, fontWeight: "bold", letterSpacing: 1.5 }}>
                      SHARED
                    </div>
                    <CardComp card={sharedCard} theme={t} disabled highlight />
                  </div>
                )}
                {showIndex === 2 && crib.length > 0 && (
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: "#333", marginBottom: 3, fontWeight: "bold", letterSpacing: 1.5 }}>
                      CRIB ({isPlayerDealer ? "YOURS" : "CPU's"})
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {crib.map((c, i) => <CardComp key={i} card={c} theme={t} disabled small />)}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, textAlign: "center", paddingTop: 4 }}>
                  <div style={{ fontSize: 12, color: "#111", marginBottom: 8, fontWeight: "bold" }}>
                    {showIndex === 0 && `— ${isPlayerDealer ? "CPU's" : "Your"} Hand —`}
                    {showIndex === 1 && `— ${isPlayerDealer ? "Your" : "CPU's"} Hand —`}
                    {showIndex === 2 && `— ${isPlayerDealer ? "Your" : "CPU's"} Crib —`}
                    {showIndex === 3 && "— Show Complete! —"}
                  </div>
                  {showIndex < 3 && (
                    <button onClick={handleShow} style={{
                      background: t.btnBg,
                      color: "#fff", border: `2px solid ${t.boardAccent}`,
                      padding: "9px 20px", borderRadius: 8, cursor: "pointer",
                      fontFamily: "Georgia, serif", fontSize: 14, fontWeight: "bold",
                    }}>Score It →</button>
                  )}
                  {showIndex === 3 && (
                    <button onClick={handleShow} style={{
                      background: t.btnBg,
                      color: "#fff", border: `2px solid ${t.boardAccent}`,
                      padding: "9px 20px", borderRadius: 8, cursor: "pointer",
                      fontFamily: "Georgia, serif", fontSize: 14, fontWeight: "bold",
                    }}>New Deal →</button>
                  )}
                </div>
              </div>

              {/* Score breakdown */}
              {showIndex < 3 && breakdownHand4 && (
                <ScoreBreakdownPanel
                  hand4={breakdownHand4}
                  sharedCard={sharedCard}
                  isCrib={breakdownIsCrib}
                  label={breakdownLabel}
                  theme={t}
                />
              )}
            </div>
          )}

          {/* CRIB phase */}
          {phase === PHASES.CRIB && (
            <div style={{ textAlign: "center", fontSize: 13, position: "relative" }}>
              <span style={{ color: "#111", fontWeight: "bold" }}>
                Crib belongs to {isPlayerDealer ? "You" : "CPU"}
              </span>
              <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 7 }}>
                {gameState.crib.map((c, i) => (
                  <CardComp key={i} card={c} faceDown theme={t} small disabled />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Your Hand */}
        <div>
          <div style={{ fontSize: 11, color: "#111", fontWeight: "bold", marginBottom: 5, textAlign: "center", letterSpacing: 1 }}>
            {phase === PHASES.FIRSTCUT && "CUT THE DECK TO DETERMINE FIRST DEALER"}
            {phase === PHASES.CRIB && `YOUR HAND — SELECT 2 TO DISCARD (${selectedCards.length}/2)`}
            {phase === PHASES.PEG && "YOUR HAND — TAP A CARD TO PLAY"}
            {phase === PHASES.SHOW && "YOUR HAND"}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            {phase === PHASES.FIRSTCUT ? null
              : phase === PHASES.PEG
                ? playerPegHand.map(c => (
                    <CardComp key={c.id} card={c} theme={t}
                      onClick={() => handlePegPlay(c)}
                      disabled={!canPlay || pegCount + cardValue(c) > 31} />
                  ))
                : playerHand.map(c => (
                    <CardComp key={c.id} card={c} theme={t}
                      selected={phase === PHASES.CRIB && selectedCards.some(s => s.id === c.id)}
                      onClick={() => phase === PHASES.CRIB ? handleCribSelect(c) : undefined}
                      disabled={phase !== PHASES.CRIB} />
                  ))
            }
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {phase === PHASES.FIRSTCUT && gameState.playerCutCard && (
            <button onClick={() => {
              const nd = shuffle(createDeck());
              const ph = nd.slice(0, 6);
              const ah = nd.slice(6, 12);
              addLog("--- First Hand Dealt ---");
              setGameState(prev => ({
                ...prev,
                phase: PHASES.CRIB,
                playerHand: ph,
                aiHand: ah,
                deck: nd.slice(12),
                crib: [],
                sharedCard: null,
                selectedCards: [],
                pegStack: [],
                pegCount: 0,
                playerPegHand: ph,
                aiPegHand: ah,
                goPlayer: false,
                goAi: false,
                cribDiscarded: false,
                showIndex: 0,
              }));
            }} style={{
              background: t.btnBg,
              color: "#fff", border: `2px solid ${t.boardAccent}`,
              padding: "12px 26px", fontSize: 15, borderRadius: 10, cursor: "pointer",
              fontFamily: "Georgia, serif", fontWeight: "bold",
              boxShadow: `0 4px 14px ${t.boardAccent}44`,
            }}>Deal First Hand</button>
          )}
          {phase === PHASES.CRIB && selectedCards.length === 2 && (
            <button onClick={confirmCribDiscard} style={{
              background: t.btnBg,
              color: "#fff", border: `2px solid ${t.boardAccent}`,
              padding: "12px 26px", fontSize: 15, borderRadius: 10, cursor: "pointer",
              fontFamily: "Georgia, serif", fontWeight: "bold",
              boxShadow: `0 4px 14px ${t.boardAccent}44`,
            }}>Discard to Crib</button>
          )}
          {canPlay && validPeg.length === 0 && (
            <button onClick={handlePlayerGo} style={{
              background: "linear-gradient(135deg, #e65100, #ff9800)",
              color: "#fff", border: "2px solid #ffcc02",
              padding: "12px 26px", fontSize: 15, borderRadius: 10, cursor: "pointer",
              fontFamily: "Georgia, serif", fontWeight: "bold",
              boxShadow: "0 4px 14px rgba(255,152,0,0.4)",
            }}>Say "Go!" →</button>
          )}
        </div>

        {/* Game Log */}
        <GameLog entries={log} theme={t} />

      </div>
    </div>
  );
}
