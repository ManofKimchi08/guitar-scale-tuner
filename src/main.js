/* ============================================================
   Scales, heard. — main application logic
   Pure vanilla JS, no build step. Loads after src/i18n.js.
   ============================================================ */

// ---------- music data ----------
const NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DEG = { 0: "1", 1: "b2", 2: "2", 3: "b3", 4: "3", 5: "4", 6: "b5", 7: "5", 8: "b6", 9: "6", 10: "b7", 11: "7" };
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  natural_minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  major_pent: [0, 2, 4, 7, 9],
  minor_pent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10]
};
const SCALE_IDS = Object.keys(SCALES);
const TUNINGS = {
  standard: [64, 59, 55, 50, 45, 40],
  half_down: [63, 58, 54, 49, 44, 39],
  whole_down: [62, 57, 53, 48, 43, 38],
  drop_d: [64, 59, 55, 50, 45, 38],
  double_drop_d: [62, 59, 55, 50, 45, 38],
  drop_c: [62, 57, 53, 48, 43, 36],
  dadgad: [62, 57, 55, 50, 45, 38],
  open_g: [62, 59, 55, 50, 43, 38],
  open_d: [62, 57, 54, 50, 45, 38]
};
const TUNING_IDS = Object.keys(TUNINGS);
let currentTuningId = "standard";
let strings = [...TUNINGS[currentTuningId]];
let tuningMode = "preset"; // "preset" | "custom"
let guideMode = "scale"; // "scale" | "chord"
let chordTypeVal = "major"; // "major" | "minor" | "dom7" | "maj7" | "min7"
let isStrumming = false;
let lastStrummedString = -1;
const CHORDS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10]
};
const FRETS = 12;

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const pc = m => ((m % 12) + 12) % 12;
const freqToMidi = f => Math.round(12 * Math.log2(f / 440) + 69);
const midiToFreq = m => 440 * Math.pow(2, (m - 69) / 12);
const centsOff = (f, m) => Math.floor(1200 * Math.log2(f / midiToFreq(m)));
const getMidiName = m => NOTE[pc(m)] + (Math.floor(m / 12) - 1);

// ---------- i18n ----------
let LANG = "en";
function t(key) { return (I18N[LANG] && I18N[LANG][key]) || (I18N.en && I18N.en[key]) || key; }
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.documentElement.lang = LANG;
}
function initLang() {
  let saved = null;
  try { saved = localStorage.getItem("ehyo_lang"); } catch (e) { }
  LANG = saved || (navigator.language || "en").slice(0, 2);
  if (!I18N[LANG]) LANG = "en";
  const sel = $("langSel");
  Object.keys(I18N).forEach(code => {
    const o = document.createElement("option");
    o.value = code; o.textContent = LANG_NAMES[code] || code;
    sel.appendChild(o);
  });
  sel.value = LANG;
  sel.onchange = e => setLang(e.target.value);
}
function setLang(l) {
  LANG = l;
  try { localStorage.setItem("ehyo_lang", l); } catch (e) { }
  applyStaticI18n();
  rebuildScaleSel();
  rebuildTuningSel();
  refreshDynamic();
  drawFB();
}
// ---------- pitch detection (autocorrelation, ACF2+) ----------
function autoCorrelate(buf, sr) {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < sensitivity) return { f: -1, rms };

  let r1 = 0, r2 = SIZE - 1, th = 0.2;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < th) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < th) { r2 = SIZE - i; break; } }
  const b = buf.slice(r1, r2), N = b.length, c = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N - i; j++) s += b[j] * b[j + i]; c[i] = s; }

  let d = 0; while (d + 1 < N && c[d] > c[d + 1]) d++;
  let mv = -1, mp = -1;
  for (let i = d; i < N; i++) { if (c[i] > mv) { mv = c[i]; mp = i; } }
  let T = mp; if (T <= 0) return { f: -1, rms };
  const x1 = c[T - 1] || 0, x2 = c[T], x3 = c[T + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
  if (a) T = T - bb / (2 * a);
  const f = sr / T;
  if (f < 70 || f > 1400) return { f: -1, rms }; // guitar-ish range guard
  return { f, rms };
}

// ---------- state ----------
let audioCtx, analyser, source, stream, raf, buf;
let running = false;
let rootPc = 9;                 // default A
let scaleId = "minor_pent";
let labelMode = "name";         // "name" | "deg"
let handMode = "right";        // "right" | "left"
let quizMode = false;
let score = 0, streak = 0, history = [], lock = false, targetInterval = null, litPcs = [];
let sensitivity = 0.015, stabNeeded = 4;
let pcScores = Array(12).fill(0);
let targetChordName = "";
let targetChordPcs = [];
let detectedPcs = [];
let ws = null;

const scaleSet = () => SCALES[scaleId];

// ---------- selects ----------
function buildKeySel() {
  const sel = $("keySel"); sel.innerHTML = "";
  NOTE.forEach((n, i) => { const o = document.createElement("option"); o.value = i; o.textContent = n; sel.appendChild(o); });
  sel.value = rootPc;
}
function rebuildScaleSel() {
  const sel = $("scaleSel"); const cur = scaleId; sel.innerHTML = "";
  SCALE_IDS.forEach(id => { const o = document.createElement("option"); o.value = id; o.textContent = t("scale_" + id); sel.appendChild(o); });
  sel.value = cur;
}
function rebuildTuningSel() {
  const menuContainer = $("tuningPresetField");
  if (!menuContainer) return;
  menuContainer.innerHTML = `
    <small data-i18n="lblTuningPreset">${t("lblTuningPreset")}</small>
    <div class="custom-dropdown" id="tuningDropdownContainer">
      <button class="dropdown-trigger" id="customDropTrigger">${t("tuning_" + currentTuningId)}</button>
      <ul class="dropdown-menu">
        <li class="has-submenu">
          <span>${t("tuning_cat_standard")}</span>
          <ul class="submenu">
            <li data-value="standard">${t("tuning_standard")}</li>
            <li data-value="half_down">${t("tuning_half_down")}</li>
            <li data-value="whole_down">${t("tuning_whole_down")}</li>
          </ul>
        </li>
        <li class="has-submenu">
          <span>${t("tuning_cat_drop")}</span>
          <ul class="submenu">
            <li data-value="drop_d">${t("tuning_drop_d")}</li>
            <li data-value="double_drop_d">${t("tuning_double_drop_d")}</li>
            <li data-value="drop_c">${t("tuning_drop_c")}</li>
          </ul>
        </li>
        <li class="has-submenu">
          <span>${t("tuning_cat_other")}</span>
          <ul class="submenu">
            <li data-value="dadgad">${t("tuning_dadgad")}</li>
            <li data-value="open_g">${t("tuning_open_g")}</li>
            <li data-value="open_d">${t("tuning_open_d")}</li>
          </ul>
        </li>
      </ul>
    </div>
  `;

  // Re-bind click events
  document.querySelectorAll("#tuningDropdownContainer .submenu li[data-value]").forEach(li => {
    li.onclick = e => {
      const val = e.currentTarget.getAttribute("data-value");
      currentTuningId = val;
      strings = [...TUNINGS[currentTuningId]];
      for (let i = 0; i < 6; i++) {
        const strSel = $(`strSel_${i}`);
        if (strSel) strSel.value = strings[i];
      }
      const trigger = $("customDropTrigger");
      if (trigger) trigger.textContent = e.currentTarget.textContent;
      drawFB();
      if (quizMode && running) newQuiz();

      const menu = document.querySelector("#tuningDropdownContainer .dropdown-menu");
      if (menu) menu.style.display = "none";
    };
  });

  const container = $("tuningDropdownContainer");
  if (container) {
    container.onmouseleave = () => {
      const menu = document.querySelector("#tuningDropdownContainer .dropdown-menu");
      if (menu) menu.style.display = "";
    };
  }

  buildCustomTuningSelects();
}
function buildCustomTuningSelects() {
  const noteRange = [];
  for (let m = 76; m >= 36; m--) { // E5 down to C2
    noteRange.push({ midi: m, label: getMidiName(m) });
  }
  for (let i = 0; i < 6; i++) {
    const sel = $(`strSel_${i}`);
    sel.innerHTML = "";
    noteRange.forEach(n => {
      const o = document.createElement("option");
      o.value = n.midi;
      o.textContent = n.label;
      sel.appendChild(o);
    });
    sel.value = strings[i];
    sel.onchange = () => {
      strings[i] = parseInt(sel.value, 10);
      drawFB();
      if (quizMode && running) newQuiz();
    };
  }
}

function getChordVoicings(rootPc, chordType) {
  const rf6 = (rootPc - 4 + 12) % 12;
  const rf5 = (rootPc - 9 + 12) % 12;
  const rf4 = (rootPc - 2 + 12) % 12;

  const voicings = [];

  // 6th string root (E-shape)
  let v6 = [];
  if (chordType === "major") v6 = [rf6, rf6, rf6 + 1, rf6 + 2, rf6 + 2, rf6];
  else if (chordType === "minor") v6 = [rf6, rf6, rf6, rf6 + 2, rf6 + 2, rf6];
  else if (chordType === "dom7") v6 = [rf6, rf6, rf6 + 1, rf6, rf6 + 2, rf6];
  else if (chordType === "maj7") v6 = [null, rf6, rf6 + 1, rf6 + 1, null, rf6];
  else if (chordType === "min7") v6 = [rf6, rf6, rf6, rf6, rf6 + 2, rf6];
  voicings.push({ rootString: 6, baseFret: rf6, frets: v6, labelId: "voicing_6th" });

  // 5th string root (A-shape)
  let v5 = [];
  if (chordType === "major") v5 = [rf5, rf5 + 2, rf5 + 2, rf5 + 2, rf5, null];
  else if (chordType === "minor") v5 = [rf5, rf5 + 1, rf5 + 2, rf5 + 2, rf5, null];
  else if (chordType === "dom7") v5 = [rf5, rf5 + 2, rf5, rf5 + 2, rf5, null];
  else if (chordType === "maj7") v5 = [rf5, rf5 + 1, rf5 + 1, rf5 + 2, rf5, null];
  else if (chordType === "min7") v5 = [rf5, rf5 + 1, rf5, rf5 + 2, rf5, null];
  voicings.push({ rootString: 5, baseFret: rf5, frets: v5, labelId: "voicing_5th" });

  // 4th string root (D-shape)
  let v4 = [];
  if (chordType === "major") v4 = [rf4 + 2, rf4 + 3, rf4 + 2, rf4, null, null];
  else if (chordType === "minor") v4 = [rf4 + 1, rf4 + 3, rf4 + 2, rf4, null, null];
  else if (chordType === "dom7") v4 = [rf4 + 1, rf4 + 2, rf4 + 1, rf4, null, null];
  else if (chordType === "maj7") v4 = [rf4 + 2, rf4 + 2, rf4 + 2, rf4, null, null];
  else if (chordType === "min7") v4 = [rf4 + 1, rf4 + 1, rf4 + 1, rf4, null, null];
  voicings.push({ rootString: 4, baseFret: rf4, frets: v4, labelId: "voicing_4th" });

  // Filter frets to be valid
  voicings.forEach(v => {
    v.frets = v.frets.map(f => {
      if (f === null) return null;
      if (f < 0 || f > 12) return null;
      return f;
    });
  });

  voicings.sort((a, b) => a.baseFret - b.baseFret);
  return voicings;
}

function rebuildVoicingSel() {
  const sel = $("voicingSel");
  if (!sel) return;
  sel.innerHTML = "";
  const voicings = getChordVoicings(rootPc, chordTypeVal);
  voicings.forEach((v, idx) => {
    const o = document.createElement("option");
    o.value = idx;
    // e.g. "6번줄 루트 폼 (Fret 3)"
    o.textContent = `${t(v.labelId)} (Fret ${v.baseFret})`;
    sel.appendChild(o);
  });
  sel.value = 0;
}

function selectVoicingByFret(f) {
  if (guideMode !== "chord") return;
  const voicings = getChordVoicings(rootPc, chordTypeVal);
  if (voicings.length === 0) return;

  const voicingIdx = voicings.findIndex(v => v.baseFret === f);
  if (voicingIdx !== -1) {
    const sel = $("voicingSel");
    if (sel) {
      sel.value = voicingIdx;
      drawFB();
      if (quizMode && running) newQuiz();
    }
  }
}

function updateGuideModeFields() {
  const isScale = (guideMode === "scale");
  const sf = $("scaleField"); if (sf) sf.style.display = isScale ? "block" : "none";
  const ctf = $("chordTypeField"); if (ctf) ctf.style.display = isScale ? "none" : "block";
  const vf = $("voicingField"); if (vf) vf.style.display = isScale ? "none" : "block";

  if (!isScale) {
    rebuildVoicingSel();
  }
}

// ---------- fretboard ----------
function inScale(midi) {
  if (guideMode === "scale") {
    return scaleSet().includes(pc(midi - rootPc));
  } else {
    const chordPcs = CHORDS[chordTypeVal] || CHORDS.major;
    return chordPcs.includes(pc(midi - rootPc));
  }
}
function labelFor(midi) {
  if (labelMode === "name") return NOTE[pc(midi)];
  if (guideMode === "scale") return DEG[pc(midi - rootPc)];

  // Chord mode interval degree labeling
  const offset = pc(midi - rootPc);
  if (offset === 0) return "1";
  if (offset === 3 || offset === 4) return "3";
  if (offset === 7) return "5";
  if (offset === 10 || offset === 11) return "7";
  return "?";
}
function drawFB() {
  const W = 840, H = 250, padL = 46, padR = 18, padT = 24, padB = 36;
  const fw = (W - padL - padR) / FRETS, sh = (H - padT - padB) / (strings.length - 1);
  const fretX = f => handMode === "left" ? (W - (padL + f * fw) + padL) : (padL + f * fw);
  const xOf = f => { const base = f === 0 ? padL - 4 : padL + (f - 0.5) * fw; return handMode === "left" ? (W - (base - padL) - padL) : base; };
  let s = "";
  s += `<rect x="${padL}" y="${padT - 12}" width="${W - padL - padR}" height="${H - padT - padB + 24}" rx="6" fill="#0e1216" stroke="#252c34"/>`;
  [3, 5, 7, 9].forEach(f => { s += `<circle cx="${(fretX(f) + fretX(f - 1)) / 2}" cy="${H / 2}" r="4.5" fill="#252c34"/>`; });
  const m12 = (fretX(12) + fretX(11)) / 2;
  s += `<circle cx="${m12}" cy="${padT + sh * 1.2}" r="4.5" fill="#252c34"/><circle cx="${m12}" cy="${padT + sh * 3.8}" r="4.5" fill="#252c34"/>`;
  const rootFrets = new Set();

  if (guideMode === "scale") {
    for (let si = 0; si < strings.length; si++) {
      for (let f = 0; f <= FRETS; f++) {
        const p = strings[si] + f;
        if (pc(p - rootPc) === 0) {
          rootFrets.add(f);
        }
      }
    }
  } else {
    const voicings = getChordVoicings(rootPc, chordTypeVal);
    voicings.forEach(v => {
      rootFrets.add(v.baseFret);
    });
  }

  for (let f = 1; f <= FRETS; f++) { const x = fretX(f); s += `<line x1="${x}" y1="${padT - 12}" x2="${x}" y2="${H - padB + 12}" stroke="#3a434d" stroke-width="2"/>`; }
  const nutX = handMode === "left" ? fretX(0) : padL - 4;
  s += `<rect x="${nutX - 1}" y="${padT - 12}" width="4" height="${H - padT - padB + 24}" fill="#c9d2db"/>`;
  for (let f = 0; f <= FRETS; f++) {
    const x = f === 0 ? xOf(0) : (fretX(f) + fretX(f - 1)) / 2;
    let cls = "fret-num";
    let fillCol = "#7e8a96";
    let isHigh = false;
    if (rootFrets.has(f)) {
      cls += " highlight-root";
      fillCol = "var(--root)";
      isHigh = true;
    }
    s += `<text x="${x}" y="${H - 8}" class="${cls}" data-fret="${f}" fill="${fillCol}" font-family="monospace" font-size="${isHigh ? '13.5' : '12'}" text-anchor="middle" style="font-weight: ${isHigh ? '900' : 'bold'};">${f}</text>`;
  }
  for (let si = 0; si < strings.length; si++) {
    const y = padT + si * sh;
    s += `<line x1="${padL - 4}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#586472" stroke-width="${1 + si * 0.4}" opacity=".75"/>`;
  }

  let activeVoicing = null;
  if (guideMode === "chord") {
    const voicings = getChordVoicings(rootPc, chordTypeVal);
    const selIdx = parseInt($("voicingSel")?.value, 10) || 0;
    activeVoicing = voicings[selIdx] || null;
  }

  for (let si = 0; si < strings.length; si++) {
    for (let f = 0; f <= FRETS; f++) {
      const p = strings[si] + f;

      let shouldShow = false;
      if (guideMode === "scale") {
        shouldShow = inScale(p);
      } else {
        if (activeVoicing && activeVoicing.frets[si] === f) {
          shouldShow = true;
        }
      }
      if (!shouldShow) continue;

      const x = xOf(f), y = padT + si * sh;
      const isRoot = pc(p - rootPc) === 0;
      const isLit = litPcs.includes(pc(p));
      const fill = isLit ? "var(--hit)" : (isRoot ? "var(--root)" : "var(--tone)");
      const extra = isLit ? 'stroke="#fff" stroke-width="2" filter="url(#g)"' : "";
      s += `<g class="note-dot" data-midi="${p}" style="cursor: pointer;">`;
      s += `<circle cx="${x}" cy="${y}" r="10.5" fill="${fill}" ${extra}/>`;
      s += `<text x="${x}" y="${y}" class="dot-text">${labelFor(p)}</text>`;
      s += `</g>`;
    }
  }
  const defs = `<defs><filter id="g"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  $("fb").innerHTML = defs + s;
  updateTunerLabels();
}

function updateChordQuizPrompt() {
  const allNames = targetChordPcs.map(pc => NOTE[pc]).join(", ");
  const remPcs = targetChordPcs.filter(pc => !detectedPcs.includes(pc));
  const remNames = remPcs.map(pc => NOTE[pc]).join(", ");

  if (LANG === "ko") {
    $("prompt").textContent = `[${targetChordName}] 코드를 차례로 연주하세요! (${allNames})\n- 남은 음: ${remNames || "없음"}`;
  } else if (LANG === "ja") {
    $("prompt").textContent = `[${targetChordName}] コードを順に弾いてください！ (${allNames})\n- 残り: ${remNames || "なし"}`;
  } else {
    $("prompt").textContent = `Play [${targetChordName}] chord! (${allNames})\n- Remaining: ${remNames || "None"}`;
  }
}

function newQuiz() {
  lock = false; history = []; litPcs = [];
  const infoEl = $("chordQuizInfo");
  if (guideMode === "chord") {
    // Pick a random key (0-11)
    const randRoot = Math.floor(Math.random() * 12);
    // Pick a random chord type from CHORDS
    const types = Object.keys(CHORDS);
    const randType = types[Math.floor(Math.random() * types.length)];

    const chordIntervals = CHORDS[randType];
    targetChordPcs = chordIntervals.map(i => (randRoot + i) % 12);
    targetChordPcs = [...new Set(targetChordPcs)].sort((a, b) => a - b);

    const rootName = NOTE[randRoot];
    const typeLabel = t("chord_" + randType);
    targetChordName = `${rootName} ${typeLabel}`;

    detectedPcs = [];
    updateChordQuizPrompt();

    $("bigNote").textContent = targetChordName;
    $("degTxt").textContent = targetChordPcs.map(pc => NOTE[pc]).join(", ");

    if (infoEl) {
      infoEl.innerHTML = t("chordQuizArpeggioInfo");
      infoEl.style.display = "block";
    }

    const v = $("verdict"); v.textContent = t("verdictWaiting"); v.className = "verdict idle";
    drawFB();
  } else {
    if (infoEl) infoEl.style.display = "none";
    const tones = scaleSet().slice();
    let tgt; do { tgt = tones[Math.floor(Math.random() * tones.length)]; } while (tgt === targetInterval && tones.length > 1);
    targetInterval = tgt;
    const p = pc(rootPc + tgt);
    $("prompt").textContent = t("promptQuiz");
    $("bigNote").textContent = labelMode === "deg" ? DEG[tgt] : NOTE[p];
    $("degTxt").textContent = labelMode === "deg" ? `(${NOTE[p]})` : t("degPrefix") + DEG[tgt];
    const v = $("verdict"); v.textContent = t("verdictWaiting"); v.className = "verdict idle";
    drawFB();
  }
}
function quizSolved() {
  lock = true; score++; streak++;
  $("scoreEl").textContent = score; $("streakEl").textContent = streak;
  const v = $("verdict"); v.textContent = t("verdictCorrect"); v.className = "verdict ok";
  setTimeout(() => { if (running && quizMode) newQuiz(); }, 1100);
}

// ---------- live update ----------
function update(res) {
  const v = $("verdict");
  if (res.f < 0) {
    $("bigNote").textContent = "––"; $("hz").textContent = "";
    $("needle").style.left = "50%"; $("needle").className = "needle";
    if (!quizMode) { $("degTxt").textContent = ""; v.textContent = t("verdictNoSignal"); v.className = "verdict idle"; }
    if (litPcs.length > 0) { litPcs = []; drawFB(); }
    updateTunerUI([]);
    return;
  }
  const m = freqToMidi(res.f), p = pc(m), cents = centsOff(res.f, m), oct = Math.floor(m / 12) - 1;
  $("hz").textContent = res.f.toFixed(1) + " Hz · " + NOTE[p] + oct;
  const cl = Math.max(-50, Math.min(50, cents));
  $("needle").style.left = (50 + cl) + "%";
  $("needle").className = "needle" + (Math.abs(cents) < 10 ? " ok" : "");
  if (litPcs.length !== 1 || litPcs[0] !== p) { litPcs = [p]; drawFB(); }
  updateTunerUI([{ midi: m, f: res.f }]);

  if (quizMode) {
    if (guideMode === "chord") {
      $("bigNote").textContent = NOTE[p];
      const hit = targetChordPcs.includes(p);
      if (!lock && hit && Math.abs(cents) < 40) {
        history.push(p); if (history.length > stabNeeded) history.shift();
        if (history.length >= stabNeeded && history.every(x => x === p)) {
          if (!detectedPcs.includes(p)) {
            detectedPcs.push(p);
            updateChordQuizPrompt();
          }
          if (detectedPcs.length === targetChordPcs.length) {
            quizSolved();
          }
        }
      } else if (!hit) {
        history = [];
      }
    } else {
      $("bigNote").textContent = labelMode === "deg" ? DEG[targetInterval] : NOTE[pc(rootPc + targetInterval)];
      const hit = (pc(m - rootPc) === targetInterval);
      if (!lock && hit && Math.abs(cents) < 40) {
        history.push(p); if (history.length > stabNeeded) history.shift();
        if (history.length >= stabNeeded && history.every(x => x === p)) quizSolved();
      } else if (!hit) { history = []; }
    }
  } else {
    $("bigNote").textContent = NOTE[p];
    const interval = pc(m - rootPc);
    if (inScale(m)) {
      $("degTxt").textContent = t("degPrefix") + DEG[interval];
      v.textContent = (guideMode === "chord") ? t("verdictInChord") : t("verdictInScale"); v.className = "verdict ok";
    } else {
      $("degTxt").textContent = "";
      v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale"); v.className = "verdict no";
    }
  }
}
function loop() {
  if (!running) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    raf = requestAnimationFrame(loop);
    return;
  }
  analyser.getFloatTimeDomainData(buf);
  update(autoCorrelate(buf, audioCtx.sampleRate));
  raf = requestAnimationFrame(loop);
}

// ---------- audio ----------
async function getStream(id) {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      ...(id ? { deviceId: { exact: id } } : {})
    }
  });
}
async function listDevices() {
  const d = await navigator.mediaDevices.enumerateDevices();
  const ins = d.filter(x => x.kind === "audioinput"), sel = $("deviceSel");
  const curVal = sel.value;
  sel.innerHTML = "";

  // Add ASIO Python Server option
  const asioOpt = document.createElement("option");
  asioOpt.value = "asio_ws";
  asioOpt.textContent = `⚡ ${t("optAsioWebsocket")}`;
  sel.appendChild(asioOpt);

  ins.forEach((x, i) => {
    const o = document.createElement("option");
    o.value = x.deviceId;
    o.textContent = x.label || ("Input " + (i + 1));
    sel.appendChild(o);
  });

  // Preserve value if possible
  if (curVal && Array.from(sel.options).some(o => o.value === curVal)) {
    sel.value = curVal;
  } else {
    sel.value = "asio_ws";
  }
  sel.disabled = false;
}
function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function playMidiNote(midi) {
  try {
    ensureAudioCtx();
  } catch (e) {
    console.warn("AudioContext initialization failed: ", e);
    return;
  }
  const freq = midiToFreq(midi);
  const osc = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  const now = audioCtx.currentTime;

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq, now);

  filter.type = 'lowpass';
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(freq * 4, now);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.6);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.2, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc2.start(now);
  osc.stop(now + 1.05);
  osc2.stop(now + 1.05);
}

let clickTimeout = null;
function handleNoteClick(midi) {
  playMidiNote(midi);
  const p = pc(midi);
  litPcs = [p];
  drawFB();

  if (quizMode) {
    const hit = (pc(midi - rootPc) === targetInterval);
    if (hit) {
      history = Array(stabNeeded).fill(p);
      quizSolved();
    }
  } else {
    $("bigNote").textContent = NOTE[p];
    const interval = pc(midi - rootPc);
    const v = $("verdict");
    if (inScale(midi)) {
      $("degTxt").textContent = t("degPrefix") + DEG[interval];
      v.textContent = (guideMode === "chord") ? t("verdictInChord") : t("verdictInScale"); v.className = "verdict ok";
    } else {
      $("degTxt").textContent = "";
      v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale"); v.className = "verdict no";
    }

    if (!running) {
      if (clickTimeout) clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        if (!running) {
          $("bigNote").textContent = "––";
          $("degTxt").textContent = "";
          v.textContent = t("verdictIdle"); v.className = "verdict idle";
          litPcs = [];
          drawFB();
        }
      }, 1000);
    }
  }
}

function connectAsioWs() {
  return new Promise((resolve, reject) => {
    if (ws) {
      try { ws.close(); } catch (e) { }
    }
    $("verdict").textContent = t("verdictAsioConnecting");
    $("verdict").className = "verdict idle";

    ws = new WebSocket("ws://127.0.0.1:8765");
    let resolved = false;

    ws.onopen = () => {
      resolved = true;
      $("verdict").textContent = t("verdictAsioConnected");
      $("verdict").className = "verdict ok";
      $("err").textContent = "";
      resolve();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        updatePoly(data);
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onerror = (error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(t("verdictAsioError")));
      } else {
        $("err").textContent = t("verdictAsioError");
        $("verdict").textContent = t("verdictIdle");
        $("verdict").className = "verdict idle";
      }
    };

    ws.onclose = () => {
      if (running && $("deviceSel").value === "asio_ws") {
        stop();
        $("err").textContent = t("verdictAsioError");
      }
    };
  });
}

function updatePoly(res) {
  const v = $("verdict");
  if (!res.notes || res.notes.length === 0) {
    $("bigNote").textContent = "––";
    $("hz").textContent = "";
    $("needle").style.left = "50%";
    $("needle").className = "needle";
    if (!quizMode) {
      $("degTxt").textContent = "";
      v.textContent = t("verdictNoSignal");
      v.className = "verdict idle";
    }
    if (litPcs.length > 0) {
      litPcs = [];
      drawFB();
    }
    pcScores.fill(0);
    updateTunerUI([]);
    return;
  }

  const activeNotes = (guideMode === "chord") ? res.notes : [res.notes[0]];

  const freqStr = activeNotes.map(n => n.f.toFixed(1) + " Hz").join(" · ");
  const noteNames = activeNotes.map(n => n.name).join(" · ");
  $("hz").textContent = freqStr;
  $("bigNote").textContent = noteNames;

  // Tuner cents feedback on the first note
  const firstMidi = activeNotes[0].midi;
  const firstFreq = activeNotes[0].f;
  const cents = centsOff(firstFreq, firstMidi);
  const cl = Math.max(-50, Math.min(50, cents));
  $("needle").style.left = (50 + cl) + "%";
  $("needle").className = "needle" + (Math.abs(cents) < 10 ? " ok" : "");

  // Update pitch class scores with hysteresis (Temporal Smoothing)
  const currentPcs = activeNotes.map(n => pc(n.midi));
  for (let i = 0; i < 12; i++) {
    if (currentPcs.includes(i)) {
      pcScores[i] = Math.min(stabNeeded, pcScores[i] + 1);
    } else {
      pcScores[i] = Math.max(0, pcScores[i] - 1);
    }
  }

  // Active threshold: must be active for at least half of stabNeeded (min 1 frame)
  const threshold = Math.max(1, Math.ceil(stabNeeded / 2));
  const newLitPcs = [];
  for (let i = 0; i < 12; i++) {
    if (pcScores[i] >= threshold) {
      newLitPcs.push(i);
    }
  }

  const same = (litPcs.length === newLitPcs.length) && litPcs.every((val, index) => val === newLitPcs[index]);
  if (!same) {
    litPcs = newLitPcs;
    drawFB();
  }

  const detected = activeNotes.map(n => ({ midi: n.midi, f: n.f }));
  updateTunerUI(detected);

  if (quizMode) {
    if (guideMode === "chord") {
      if (!lock) {
        let changed = false;
        newLitPcs.forEach(p => {
          if (targetChordPcs.includes(p) && !detectedPcs.includes(p)) {
            detectedPcs.push(p);
            changed = true;
          }
        });
        if (changed) {
          updateChordQuizPrompt();
        }
        if (detectedPcs.length === targetChordPcs.length) {
          quizSolved();
        }
      }
    } else {
      const p = pc(firstMidi);
      $("bigNote").textContent = labelMode === "deg" ? DEG[targetInterval] : NOTE[pc(rootPc + targetInterval)];
      const hit = (pc(firstMidi - rootPc) === targetInterval);
      if (!lock && hit && Math.abs(cents) < 40) {
        history.push(p); if (history.length > stabNeeded) history.shift();
        if (history.length >= stabNeeded && history.every(x => x === p)) quizSolved();
      } else if (!hit) {
        history = [];
      }
    }
  } else {
    const allInScale = activeNotes.every(n => inScale(n.midi));
    const degrees = activeNotes.map(n => DEG[pc(n.midi - rootPc)]).filter(x => x).join(" · ");
    if (allInScale) {
      $("degTxt").textContent = t("degPrefix") + degrees;
      v.textContent = (guideMode === "chord") ? t("verdictInChord") : t("verdictInScale");
      v.className = "verdict ok";
    } else {
      $("degTxt").textContent = degrees ? (t("degPrefix") + degrees) : "";
      v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
      v.className = "verdict no";
    }
  }
}

async function connect(id) {
  if (ws) {
    try { ws.close(); } catch (e) { }
    ws = null;
  }
  if (id === "asio_ws") {
    if (source) { source.disconnect(); source = null; }
    if (stream) { stream.getTracks().forEach(tk => tk.stop()); stream = null; }
    await connectAsioWs();
    return;
  }
  if (source) source.disconnect();
  if (stream) stream.getTracks().forEach(tk => tk.stop());
  stream = await getStream(id);
  ensureAudioCtx();
  source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser(); analyser.fftSize = 2048;
  buf = new Float32Array(analyser.fftSize);
  source.connect(analyser); // NOT to destination -> avoids feedback
}
async function start() {
  $("err").textContent = "";
  try {
    const devId = $("deviceSel").value;
    await connect(devId);
    if (devId !== "asio_ws") {
      await listDevices();
    }
    running = true;
    $("led").classList.add("on"); $("powerTxt").textContent = t("powerOn");
    $("startBtn").textContent = t("btnStop");
    if (quizMode) {
      newQuiz();
    } else {
      $("prompt").textContent = (guideMode === "chord") ? t("promptChordHover") : t("promptPlay");
    }
    loop();
  } catch (e) {
    $("err").textContent = e.message;
    stop();
  }
}
function stop() {
  running = false; cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach(tk => tk.stop());
  if (ws) {
    try { ws.close(); } catch (e) { }
    ws = null;
  }
  $("led").classList.remove("on"); $("powerTxt").textContent = t("powerOff");
  $("startBtn").textContent = t("btnStart");
  $("bigNote").textContent = "––"; litPcs = []; drawFB();
  updateTunerUI([]);
  refreshDynamic();
}

// ---------- dynamic text refresh (after lang change) ----------
function refreshDynamic() {
  $("powerTxt").textContent = running ? t("powerOn") : t("powerOff");
  $("startBtn").textContent = running ? t("btnStop") : t("btnStart");
  $("modeSub").textContent = quizMode ? t("subQuiz") : t("subPractice");
  const infoEl = $("chordQuizInfo");
  if (quizMode) {
    if (guideMode === "chord") {
      if (running) {
        // keep chord quiz prompt intact
        updateChordQuizPrompt();
      } else {
        $("prompt").textContent = t("promptQuiz");
      }
      if (infoEl) {
        infoEl.innerHTML = t("chordQuizArpeggioInfo");
        infoEl.style.display = "block";
      }
    } else {
      if (infoEl) infoEl.style.display = "none";
      if (running) newQuiz();
      else { $("prompt").textContent = t("promptQuiz"); }
    }
  } else {
    if (infoEl) infoEl.style.display = "none";
    if (guideMode === "chord") {
      $("prompt").textContent = t("promptChordHover");
    } else {
      $("prompt").textContent = running ? t("promptPlay") : t("promptPlay");
    }
    if (!running) { $("verdict").textContent = t("verdictIdle"); $("degTxt").textContent = ""; }
  }
}

// ---------- events ----------
function setMode(q) {
  quizMode = q;
  if (window.syncModeToggle) window.syncModeToggle();
  if ($("modeSub")) $("modeSub").textContent = q ? t("subQuiz") : t("subPractice");
  history = []; lock = false;
  if (q) { newQuiz(); }
  else {
    refreshDynamic();
  }
}
function checkStrum(e) {
  if (guideMode !== "chord") return;

  const rect = $("fb").getBoundingClientRect();
  const mouseY = e.clientY - rect.top;
  const mouseX = e.clientX - rect.left;

  // Convert relative coordinates to SVG coordinates (SVG width: 840, height: 250)
  const svgY = (mouseY / rect.height) * 250;
  const svgX = (mouseX / rect.width) * 840;

  // Restrict strumming within horizontal fretboards
  if (svgX < 36 || svgX > 830) return;

  // sh = (250 - 24 - 36) / (strings.length - 1) = 190 / 5 = 38
  const padT = 24;
  const sh = 190 / (strings.length - 1);

  const si = Math.round((svgY - padT) / sh);
  if (si >= 0 && si < strings.length) {
    if (si !== lastStrummedString) {
      const voicings = getChordVoicings(rootPc, chordTypeVal);
      const selIdx = parseInt($("voicingSel")?.value, 10) || 0;
      const activeVoicing = voicings[selIdx] || null;

      if (activeVoicing) {
        const f = activeVoicing.frets[si];
        if (f !== null) {
          const midi = strings[si] + f;
          playMidiNote(midi);

          litPcs = [pc(midi)];
          drawFB();

          if (clickTimeout) clearTimeout(clickTimeout);
          clickTimeout = setTimeout(() => {
            litPcs = [];
            drawFB();
          }, 800);
        }
      }
      lastStrummedString = si;
    }
  }
}

function setLabel(m) {
  labelMode = m;
  if (window.syncLabelToggle) window.syncLabelToggle();
  drawFB();
  if (quizMode) newQuiz();
}

function bindEvents() {
  $("startBtn").onclick = () => running ? stop() : start();
  $("deviceSel").onchange = async e => { if (running) { try { await connect(e.target.value); } catch (err) { $("err").textContent = "Device switch failed: " + err.message; } } };
  $("keySel").onchange = e => { rootPc = parseInt(e.target.value); drawFB(); if (quizMode) newQuiz(); };
  $("scaleSel").onchange = e => { scaleId = e.target.value; drawFB(); if (quizMode) newQuiz(); };
  $("tuningModeSel").value = tuningMode;
  $("tuningModeSel").onchange = e => {
    tuningMode = e.target.value;
    const isPreset = tuningMode === "preset";
    $("tuningPresetField").style.display = isPreset ? "block" : "none";
    $("tuningCustomField").style.display = isPreset ? "none" : "block";
    if (isPreset) {
      strings = [...TUNINGS[currentTuningId]];
    } else {
      // Sync strings array with current select values
      for (let i = 0; i < 6; i++) {
        strings[i] = parseInt($(`strSel_${i}`).value, 10);
      }
    }
    drawFB();
    if (quizMode) newQuiz();
  };
  $("sens").oninput = e => sensitivity = parseFloat(e.target.value);
  $("keySel").addEventListener("change", () => {
    if (guideMode === "chord") {
      rebuildVoicingSel();
      drawFB();
    }
  });
  $("chordTypeSel").onchange = e => {
    chordTypeVal = e.target.value;
    rebuildVoicingSel();
    drawFB();
    if (quizMode) newQuiz();
  };
  $("voicingSel").onchange = () => {
    drawFB();
    if (quizMode) newQuiz();
  };
  $("stab").oninput = e => { stabNeeded = parseInt(e.target.value); $("stabVal").textContent = stabNeeded; };
  $("fb").onclick = e => {
    const dot = e.target.closest(".note-dot");
    if (dot) {
      const midi = parseInt(dot.getAttribute("data-midi"), 10);
      handleNoteClick(midi);
      return;
    }
    const num = e.target.closest(".fret-num");
    if (num) {
      const f = parseInt(num.getAttribute("data-fret"), 10);
      selectVoicingByFret(f);
      return;
    }
  };

  const fb = $("fb");

  // Hover strumming for desktop
  fb.onmousemove = e => {
    checkStrum(e);
  };

  fb.onmouseleave = () => {
    lastStrummedString = -1;
  };

  // Touch strumming with touchstart/touchmove for mobile devices
  fb.ontouchstart = e => {
    if (e.target.closest(".fret-num")) return;
    isStrumming = true;
    lastStrummedString = -1;
    checkStrum(e.touches[0]);
    e.preventDefault();
  };

  fb.ontouchmove = e => {
    if (isStrumming) {
      checkStrum(e.touches[0]);
    }
    e.preventDefault();
  };

  fb.ontouchend = () => {
    isStrumming = false;
    lastStrummedString = -1;
  };
}

// ---------- slide toggle helper & setups ----------
function makeSlideToggle({ toggleId, handlerId, leftLabelId, rightLabelId, travelDistance = 88, getVal, setVal }) {
  const toggle = $(toggleId);
  const handler = $(handlerId);
  const leftLabel = $(leftLabelId);
  const rightLabel = $(rightLabelId);
  if (!toggle || !handler) return null;

  const dragThreshold = 10;
  let isDragging = false;
  let startX = 0;
  let currentX = 0;

  const syncUI = () => {
    const val = getVal(); // true = right, false = left
    toggle.classList.toggle("active-right", val);
    if (rightLabel) rightLabel.classList.toggle("active", val);
    if (leftLabel) leftLabel.classList.toggle("active", !val);
    handler.style.transform = val ? `translateX(${travelDistance}px)` : "translateX(0px)";
  };

  const handleStart = clientX => {
    isDragging = true;
    startX = clientX;
    currentX = clientX;
    handler.style.transition = "none";
  };

  const handleMove = clientX => {
    if (!isDragging) return;
    currentX = clientX;
    let diff = currentX - startX;
    let baseLeft = getVal() ? travelDistance : 0;
    let targetTranslation = baseLeft + diff;
    if (targetTranslation < 0) targetTranslation = 0;
    if (targetTranslation > travelDistance) targetTranslation = travelDistance;
    handler.style.transform = `translateX(${targetTranslation}px)`;
  };

  const handleEnd = clientX => {
    if (!isDragging) return;
    isDragging = false;
    handler.style.transition = "";

    let diff = clientX - startX;
    if (Math.abs(diff) < dragThreshold) {
      setVal(!getVal());
    } else {
      let baseLeft = getVal() ? travelDistance : 0;
      let finalTranslation = baseLeft + diff;
      setVal(finalTranslation > (travelDistance / 2));
    }
    syncUI();
  };

  toggle.onmousedown = e => handleStart(e.clientX);
  window.addEventListener("mousemove", e => { if (isDragging) handleMove(e.clientX); });
  window.addEventListener("mouseup", e => { if (isDragging) handleEnd(e.clientX); });

  toggle.ontouchstart = e => handleStart(e.touches[0].clientX);
  toggle.ontouchmove = e => handleMove(e.touches[0].clientX);
  toggle.ontouchend = e => handleEnd(currentX);

  return syncUI;
}

function initSlideToggles() {
  window.syncModeToggle = makeSlideToggle({
    toggleId: "modeToggle",
    handlerId: "modeHandler",
    leftLabelId: "togglePractice",
    rightLabelId: "toggleQuiz",
    getVal: () => quizMode,
    setVal: val => setMode(val)
  });

  window.syncLabelToggle = makeSlideToggle({
    toggleId: "labelToggle",
    handlerId: "labelHandler",
    leftLabelId: "toggleName",
    rightLabelId: "toggleDeg",
    getVal: () => labelMode === "deg",
    setVal: val => setLabel(val ? "deg" : "name")
  });

  window.syncHandToggle = makeSlideToggle({
    toggleId: "handToggle",
    handlerId: "handHandler",
    leftLabelId: "toggleLeft",
    rightLabelId: "toggleRight",
    getVal: () => handMode === "right",
    setVal: val => {
      handMode = val ? "right" : "left";
      drawFB();
    }
  });

  window.syncGuideToggle = makeSlideToggle({
    toggleId: "guideToggle",
    handlerId: "guideHandler",
    leftLabelId: "toggleScale",
    rightLabelId: "toggleChord",
    getVal: () => guideMode === "chord",
    setVal: val => {
      guideMode = val ? "chord" : "scale";
      updateGuideModeFields();
      refreshDynamic();
      drawFB();
      if (quizMode) newQuiz();
    }
  });
}

function updateTunerLabels() {
  const tunerLayout = $("tunerLayout");
  if (!tunerLayout) return;
  const tunerStrings = tunerLayout.querySelectorAll(".tuner-string");
  tunerStrings.forEach(el => {
    const idx = parseInt(el.getAttribute("data-string-idx"), 10);
    const midi = strings[idx];
    if (isNaN(midi)) return;
    const stringNum = idx + 1;
    const label = stringNum + NOTE[pc(midi)];
    const labelEl = el.querySelector(".string-label");
    if (labelEl) labelEl.textContent = label;
  });
}

function updateTunerUI(detected) {
  const tunerLayout = $("tunerLayout");
  if (!tunerLayout) return;
  const tunerStrings = tunerLayout.querySelectorAll(".tuner-string");
  tunerStrings.forEach(el => {
    el.className = "tuner-string";
  });

  if (!detected || detected.length === 0) return;

  detected.forEach(n => {
    let minDiff = Infinity;
    let closestIdx = -1;
    for (let i = 0; i < 6; i++) {
      const diff = Math.abs(n.midi - strings[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    if (closestIdx !== -1 && minDiff <= 1.5) {
      const targetMidi = strings[closestIdx];
      const cents = centsOff(n.f, targetMidi);
      const el = tunerLayout.querySelector(`.tuner-string[data-string-idx="${closestIdx}"]`);
      if (el) {
        el.classList.add("active");
        if (Math.abs(cents) < 10) {
          el.classList.add("in-tune");
        } else if (cents < 0) {
          el.classList.add("flat");
        } else {
          el.classList.add("sharp");
        }
      }
    }
  });
}

function initDeviceSel() {
  const sel = $("deviceSel");
  sel.innerHTML = "";

  const asioOpt = document.createElement("option");
  asioOpt.value = "asio_ws";
  asioOpt.textContent = `⚡ ${t("optAsioWebsocket")}`;
  sel.appendChild(asioOpt);

  const defaultOpt = document.createElement("option");
  defaultOpt.value = "mic_default";
  defaultOpt.setAttribute("data-i18n", "optSelectAfter");
  defaultOpt.textContent = t("optSelectAfter");
  sel.appendChild(defaultOpt);

  sel.value = "asio_ws";
  sel.disabled = false;
}

// ---------- init ----------
initLang();
applyStaticI18n();
buildKeySel();
rebuildScaleSel();
rebuildTuningSel();
initSlideToggles();
bindEvents();
initDeviceSel();
drawFB();
