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
const freqToMidi = f => Math.round(12 * Math.log2(f / refPitch) + 69);
const midiToFreq = m => refPitch * Math.pow(2, (m - 69) / 12);
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
let refPitch = 440;
let pcScores = Array(12).fill(0);
let isScanning = false;
let scanInterval = null;
let scanDuration = 12000;
let scanTimeElapsed = 0;
let scanChromaHistory = Array(12).fill(0);
let targetChordName = "";
let targetChordPcs = [];
let detectedPcs = [];
let ws = null;
let monitorGainNode = null;
let isMonitoringEnabled = false;
let monitorVolume = 0.7;

function updateMonitoring() {
  if (monitorGainNode && audioCtx) {
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
  }
  sendMonitoringState();
}

function sendMonitoringState() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: "set_monitoring",
        enabled: isMonitoringEnabled,
        volume: monitorVolume
      }));
    } catch (e) {}
  }
}

// ---------- Pitch Trajectory & Stability Analyzer ----------
let pitchHistory = []; // { time, cents } ring buffer for last 5 seconds

// ---------- Backing Track Jam Assistant ----------
let isJamPlaying = false;
let jamTimer = null;
let jamBpm = 100;
let jamProgressionKey = "pop";
let jamChordIndex = 0;
let jamBarCount = 1;
let jamTargetChordPcs = [];
let jamCurrentChordName = "––";

// ---------- Smart Speed-up Metronome ----------
let isMetroPlaying = false;
let metroTimer = null;
let metroBpm = 100;
let metroBeat = 0;
let metroBarCount = 0;

// ---------- Circle of Fifths Data ----------
const CIRCLE_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const CIRCLE_MINOR = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];

// ---------- 25-State HMM Viterbi Filter ----------
const HMM_STATES = 25; // 0..11: Major, 12..23: minor, 24: No Chord
let hmmLogProbs = Array(HMM_STATES).fill(-Math.log(HMM_STATES));
let HMM_TEMPLATES = [];
let HMM_TRANSITION = [];

function initHMM() {
  HMM_TEMPLATES = [];
  // 1. Build Chord Templates
  for (let s = 0; s < 24; s++) {
    const isMajor = s < 12;
    const root = s % 12;
    const template = Array(12).fill(0.02); // background noise floor
    const intervals = isMajor ? [0, 4, 7] : [0, 3, 7];
    intervals.forEach(interval => {
      template[(root + interval) % 12] = 1.0;
    });
    // Normalize template
    const sum = template.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(template.map(v => v / sum));
  }

  // 2. Build HMM Transition Matrix
  HMM_TRANSITION = [];
  for (let i = 0; i < HMM_STATES; i++) {
    const row = Array(HMM_STATES).fill(0);
    if (i === 24) {
      // Silence state: high self-persistence
      row[24] = 0.85;
      for (let j = 0; j < 24; j++) row[j] = 0.15 / 24;
    } else {
      // Chord state: high self-persistence
      row[i] = 0.95;
      row[24] = 0.02; // Transition to silence
      
      const iRoot = i % 12;
      const iIsMajor = i < 12;
      let chordSum = 0;
      
      for (let j = 0; j < 24; j++) {
        if (j === i) continue;
        const jRoot = j % 12;
        const jIsMajor = j < 12;
        const diff = (jRoot - iRoot + 12) % 12;
        
        // Music theory transition helpers (Circle of Fifths, relative Major/minor)
        let isRelated = false;
        if (diff === 5 || diff === 7) isRelated = true;
        if (iIsMajor && !jIsMajor && diff === 9) isRelated = true;
        if (!iIsMajor && jIsMajor && diff === 3) isRelated = true;
        
        row[j] = isRelated ? 0.025 : 0.001;
        chordSum += row[j];
      }
      
      // Normalize remaining transitions to sum to 0.03
      const norm = 0.03 / chordSum;
      for (let j = 0; j < 24; j++) {
        if (j !== i) row[j] *= norm;
      }
    }
    
    // Normalize row to sum to 1.0
    const rowSum = row.reduce((a, b) => a + b, 0);
    HMM_TRANSITION.push(row.map(v => v / rowSum));
  }
}

function runHMM(chroma, rms) {
  const isSilence = rms < sensitivity;
  const emission = Array(HMM_STATES).fill(0);
  
  if (isSilence) {
    emission[24] = 0.95;
    for (let j = 0; j < 24; j++) emission[j] = 0.05 / 24;
  } else {
    let maxSim = -1;
    for (let s = 0; s < 24; s++) {
      const temp = HMM_TEMPLATES[s];
      let dot = 0, normC = 0, normT = 0;
      for (let i = 0; i < 12; i++) {
        dot += chroma[i] * temp[i];
        normC += chroma[i] * chroma[i];
        normT += temp[i] * temp[i];
      }
      const sim = (normC > 0 && normT > 0) ? (dot / (Math.sqrt(normC) * Math.sqrt(normT))) : 0;
      emission[s] = Math.max(0.001, sim);
      if (sim > maxSim) maxSim = sim;
    }
    emission[24] = Math.max(0.001, 1.0 - maxSim);
    
    // Normalize emission vector
    const sum = emission.reduce((a, b) => a + b, 0);
    for (let j = 0; j < HMM_STATES; j++) emission[j] /= sum;
  }
  
  // Viterbi Trellis Update Step
  const nextLogProbs = Array(HMM_STATES).fill(-Infinity);
  for (let j = 0; j < HMM_STATES; j++) {
    let maxVal = -Infinity;
    for (let i = 0; i < HMM_STATES; i++) {
      const val = hmmLogProbs[i] + Math.log(HMM_TRANSITION[i][j]);
      if (val > maxVal) maxVal = val;
    }
    nextLogProbs[j] = maxVal + Math.log(emission[j]);
  }
  hmmLogProbs = nextLogProbs;
  
  // Find maximum likelihood state
  let maxIdx = 0, maxVal = -Infinity;
  for (let s = 0; s < HMM_STATES; s++) {
    if (hmmLogProbs[s] > maxVal) {
      maxVal = hmmLogProbs[s];
      maxIdx = s;
    }
  }
  return maxIdx;
}

initHMM();

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
      const isJamTone = isJamPlaying && jamTargetChordPcs.includes(pc(p));
      
      let fill = isLit ? "var(--hit)" : (isRoot ? "var(--root)" : "var(--tone)");
      if (!isLit && isJamTone) {
        fill = "#ffaa00"; // Glowing Gold for Jam Track Target Chord Tones
      }
      
      let extra = isLit ? 'stroke="#fff" stroke-width="2" filter="url(#g)"' : "";
      if (!isLit && isJamTone) {
        extra = 'stroke="#ffd880" stroke-width="1.8" filter="url(#g)"';
      }
      
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
  updatePitchTracker(cents);
  drawPitchCanvas();

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

  if (isScanning && litPcs.length > 0) {
    litPcs.forEach(note => {
      scanChromaHistory[note] += 1;
    });
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

function sendRefPitch() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_ref_pitch", value: refPitch }));
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
      sendRefPitch();
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
    hmmLogProbs.fill(-Math.log(HMM_STATES));
    updateTunerUI([]);
    return;
  }

  let newLitPcs = [];
  const isChordModeHMM = (guideMode === "chord") && (res.chroma !== undefined);
  let hmmState = 24;

  if (isChordModeHMM) {
    // Run HMM Viterbi Filter on 12D Chroma vector
    hmmState = runHMM(res.chroma, res.rms);
    if (hmmState < 24) {
      const root = hmmState % 12;
      const isMajor = hmmState < 12;
      const intervals = isMajor ? [0, 4, 7] : [0, 3, 7];
      newLitPcs = intervals.map(d => (root + d) % 12);
      
      const rootName = NOTE[root];
      const typeLabel = t("chord_" + (isMajor ? "major" : "minor"));
      if (!quizMode) {
        $("bigNote").textContent = `${rootName} ${typeLabel}`;
        $("hz").textContent = "";
        $("degTxt").textContent = "";
        v.textContent = t("verdictInChord");
        v.className = "verdict ok";
      }
    } else {
      newLitPcs = [];
      if (!quizMode) {
        $("bigNote").textContent = "––";
        $("hz").textContent = "";
        $("degTxt").textContent = "";
        v.textContent = t("verdictNoSignal");
        v.className = "verdict idle";
      }
    }
  } else {
    // Scale Mode (or fallback): single note processing
    const activeNotes = [res.notes[0]];
    const freqStr = activeNotes[0].f.toFixed(1) + " Hz";
    const noteNames = activeNotes[0].name;
    $("hz").textContent = freqStr;
    $("bigNote").textContent = noteNames;

    // Tuner cents feedback on the first note
    const firstMidi = activeNotes[0].midi;
    const firstFreq = activeNotes[0].f;
    const cents = centsOff(firstFreq, firstMidi);
    const cl = Math.max(-50, Math.min(50, cents));
    $("needle").style.left = (50 + cl) + "%";
    $("needle").className = "needle" + (Math.abs(cents) < 10 ? " ok" : "");
    updatePitchTracker(cents);
    drawPitchCanvas();

    // Hysteresis note smoothing
    const currentPcs = activeNotes.map(n => pc(n.midi));
    for (let i = 0; i < 12; i++) {
      if (currentPcs.includes(i)) {
        pcScores[i] = Math.min(stabNeeded, pcScores[i] + 1);
      } else {
        pcScores[i] = Math.max(0, pcScores[i] - 1);
      }
    }
    const threshold = Math.max(1, Math.ceil(stabNeeded / 2));
    for (let i = 0; i < 12; i++) {
      if (pcScores[i] >= threshold) {
        newLitPcs.push(i);
      }
    }
  }

  const same = (litPcs.length === newLitPcs.length) && litPcs.every((val, index) => val === newLitPcs[index]);
  if (!same) {
    litPcs = newLitPcs;
    drawFB();
  }

  const activeNotes = (guideMode === "chord") ? res.notes : [res.notes[0]];
  const detected = activeNotes.map(n => ({ midi: n.midi, f: n.f }));
  updateTunerUI(detected);

  if (quizMode) {
    if (guideMode === "chord") {
      if (!lock) {
        // 1. Arpeggio accumulation
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
        
        // 2. HMM direct chord match
        let isCorrectChord = false;
        if (isChordModeHMM && hmmState < 24) {
          const rootName = NOTE[hmmState % 12];
          const typeLabel = t("chord_" + (hmmState < 12 ? "major" : "minor"));
          const detectedChordName = `${rootName} ${typeLabel}`;
          if (detectedChordName === targetChordName) {
            isCorrectChord = true;
          }
        }

        if (detectedPcs.length === targetChordPcs.length || isCorrectChord) {
          detectedPcs = [...targetChordPcs];
          updateChordQuizPrompt();
          quizSolved();
        }
      }
    } else {
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
    }
  }

  if (isScanning && litPcs.length > 0) {
    litPcs.forEach(note => {
      scanChromaHistory[note] += 1;
    });
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
  source.connect(analyser);
  
  // Direct Audio Monitoring passthrough node (zero processing latency)
  monitorGainNode = audioCtx.createGain();
  monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
  source.connect(monitorGainNode);
  monitorGainNode.connect(audioCtx.destination);
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

// ---------- Scale Scanner Logic ----------
function startScan() {
  if (!running) {
    alert(t("errScanMic"));
    return;
  }
  isScanning = true;
  scanTimeElapsed = 0;
  scanChromaHistory.fill(0);
  
  $("btnScan").textContent = t("btnScanStop");
  $("btnScan").className = "ghost act"; // glowing active state
  $("scanProgressContainer").style.display = "flex";
  $("scanProgressFill").style.width = "0%";
  $("scanResults").style.display = "none";
  
  const tickMs = 100;
  scanInterval = setInterval(() => {
    scanTimeElapsed += tickMs;
    const pct = Math.min(100, (scanTimeElapsed / scanDuration) * 100);
    $("scanProgressFill").style.width = pct + "%";
    
    if (scanTimeElapsed >= scanDuration) {
      stopScan(true);
    }
  }, tickMs);
}

function stopScan(completed) {
  isScanning = false;
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  
  $("btnScan").textContent = t("btnScanStart");
  $("btnScan").className = "ghost";
  $("scanProgressContainer").style.display = "none";
  
  if (completed) {
    calculateScanResults();
  }
}

function calculateScanResults() {
  const sum = scanChromaHistory.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    $("scanResults").innerHTML = `<div style="color:var(--muted)">No notes detected during scan. Try playing again.</div>`;
    $("scanResults").style.display = "block";
    return;
  }
  
  // Normalize user chroma history
  const userChroma = scanChromaHistory.map(v => v / sum);
  const results = [];
  
  // Calculate Cosine Similarity to all scale templates
  for (let root = 0; root < 12; root++) {
    SCALE_IDS.forEach(scaleId => {
      const template = Array(12).fill(0);
      SCALES[scaleId].forEach(interval => {
        template[(root + interval) % 12] = 1;
      });
      // Normalize template
      const tempSum = template.reduce((a, b) => a + b, 0);
      const normalizedTemplate = template.map(v => v / tempSum);
      
      // Calculate dot product and norms
      let dot = 0, normUser = 0, normTemp = 0;
      for (let i = 0; i < 12; i++) {
        dot += userChroma[i] * normalizedTemplate[i];
        normUser += userChroma[i] * userChroma[i];
        normTemp += normalizedTemplate[i] * normalizedTemplate[i];
      }
      const similarity = (normUser > 0 && normTemp > 0) ? (dot / Math.sqrt(normUser * normTemp)) : 0;
      results.push({ root, scaleId, similarity });
    });
  }
  
  // Sort and pick top 5
  const sorted = results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  
  let html = `<b style="font-size:12px; color:var(--tone); display:block; margin-bottom:8px;">${t("scanResultsTitle")}</b>`;
  sorted.forEach(res => {
    const rootName = NOTE[res.root];
    const scaleName = t("scale_" + res.scaleId);
    const percentage = Math.round(res.similarity * 100);
    html += `<div class="scan-result-item" data-root="${res.root}" data-scale="${res.scaleId}" style="display:flex; justify-content:space-between; margin-bottom:6px; cursor:pointer; padding:6px 8px; border-radius:6px; background:#161b22; border:1px solid var(--line); transition:all 0.1s ease;">
      <span><b>${rootName} ${scaleName}</b></span>
      <span style="color:var(--ok); font-weight:bold;">${percentage}%</span>
    </div>`;
  });
  
  $("scanResults").innerHTML = html;
  $("scanResults").style.display = "block";
}

// ---------- Pitch Trajectory & Bending Analyzer ----------
function updatePitchTracker(cents) {
  const now = performance.now();
  pitchHistory.push({ time: now, cents: cents });
  pitchHistory = pitchHistory.filter(item => now - item.time <= 5000);
  
  if (pitchHistory.length > 5) {
    const values = pitchHistory.map(item => item.cents);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const score = Math.max(0, Math.min(100, Math.round(100 - stdDev * 2.5)));
    const el = $("stabilityVal");
    if (el) el.textContent = score + "%";
  }
}

function drawPitchCanvas() {
  const canvas = $("pitchCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  
  ctx.clearRect(0, 0, W, H);
  
  const centerY = H / 2;
  const centsToY = c => centerY - (c / 200) * (H / 2 - 6);
  
  // Center 0 cent line
  ctx.strokeStyle = "rgba(76, 208, 125, 0.4)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(W, centerY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Bending +100c line
  ctx.strokeStyle = "rgba(255, 170, 0, 0.25)";
  ctx.beginPath();
  ctx.moveTo(0, centsToY(100));
  ctx.lineTo(W, centsToY(100));
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 170, 0, 0.5)";
  ctx.font = "8px monospace";
  ctx.fillText("+100c (1/2)", 4, centsToY(100) - 2);
  
  // Bending +200c line
  ctx.strokeStyle = "rgba(255, 68, 68, 0.25)";
  ctx.beginPath();
  ctx.moveTo(0, centsToY(200));
  ctx.lineTo(W, centsToY(200));
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 68, 68, 0.5)";
  ctx.fillText("+200c (Full)", 4, centsToY(200) - 2);
  
  if (pitchHistory.length < 2) return;
  
  const now = performance.now();
  ctx.strokeStyle = "#4ca6ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  for (let i = 0; i < pitchHistory.length; i++) {
    const item = pitchHistory[i];
    const age = now - item.time;
    const x = W - (age / 5000) * W;
    const y = Math.max(4, Math.min(H - 4, centsToY(item.cents)));
    
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ---------- Circle of Fifths Visualizer ----------
function renderCircleOfFifths() {
  const svg = $("circleSvg");
  if (!svg) return;
  svg.innerHTML = "";
  
  const cx = 160, cy = 160, outerR = 140, midR = 95, innerR = 55;
  const numSectors = 12;
  const anglePerSector = (2 * Math.PI) / numSectors;
  
  const activeMajorRoot = NOTE[rootPc];
  const relativeMinorPc = (rootPc + 9) % 12;
  const relativeMinorRoot = NOTE[relativeMinorPc] + "m";
  const fourthPc = (rootPc + 5) % 12;
  const fifthPc = (rootPc + 7) % 12;
  
  let s = "";
  for (let i = 0; i < 12; i++) {
    const startAngle = i * anglePerSector - Math.PI / 2 - anglePerSector / 2;
    const endAngle = startAngle + anglePerSector;
    
    // Outer Major Sector
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);
    const x3 = cx + midR * Math.cos(endAngle);
    const y3 = cy + midR * Math.sin(endAngle);
    const x4 = cx + midR * Math.cos(startAngle);
    const y4 = cy + midR * Math.sin(startAngle);
    
    const majorKey = CIRCLE_MAJOR[i];
    const majorPc = NOTE.indexOf(majorKey.replace("b", "#"));
    const isMajorActive = NOTE[rootPc] === NOTE[pc(majorPc)];
    const isMajorRelative = (NOTE[fourthPc] === NOTE[pc(majorPc)]) || (NOTE[fifthPc] === NOTE[pc(majorPc)]);
    
    let majorCls = "circle-sector";
    if (isMajorActive) majorCls += " active-root";
    else if (isMajorRelative) majorCls += " related-key";
    
    const dOuter = `M ${x1} ${y1} A ${outerR} ${outerR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${midR} ${midR} 0 0 0 ${x4} ${y4} Z`;
    s += `<path d="${dOuter}" class="${majorCls}" data-pc="${pc(majorPc)}" data-type="major"/>`;
    
    // Outer Text
    const textAngle = startAngle + anglePerSector / 2;
    const textR = (outerR + midR) / 2;
    const tx = cx + textR * Math.cos(textAngle);
    const ty = cy + textR * Math.sin(textAngle);
    s += `<text x="${tx}" y="${ty}" class="circle-text ${isMajorActive ? 'active-root' : ''}">${majorKey}</text>`;
    
    // Inner minor Sector
    const mx1 = cx + midR * Math.cos(startAngle);
    const my1 = cy + midR * Math.sin(startAngle);
    const mx2 = cx + midR * Math.cos(endAngle);
    const my2 = cy + midR * Math.sin(endAngle);
    const mx3 = cx + innerR * Math.cos(endAngle);
    const my3 = cy + innerR * Math.sin(endAngle);
    const mx4 = cx + innerR * Math.cos(startAngle);
    const my4 = cy + innerR * Math.sin(startAngle);
    
    const minorKey = CIRCLE_MINOR[i];
    const minorPc = NOTE.indexOf(minorKey.replace('m','').replace("b", "#"));
    const isMinorActive = NOTE[relativeMinorPc] === NOTE[pc(minorPc)];
    
    let minorCls = "circle-sector";
    if (isMinorActive) minorCls += " relative-key";
    
    const dInner = `M ${mx1} ${my1} A ${midR} ${midR} 0 0 1 ${mx2} ${my2} L ${mx3} ${my3} A ${innerR} ${innerR} 0 0 0 ${mx4} ${my4} Z`;
    s += `<path d="${dInner}" class="${minorCls}" data-pc="${pc(minorPc)}" data-type="minor"/>`;
    
    // Inner Text
    const textInnerR = (midR + innerR) / 2;
    const itx = cx + textInnerR * Math.cos(textAngle);
    const ity = cy + textInnerR * Math.sin(textAngle);
    s += `<text x="${itx}" y="${ity}" class="circle-text" style="font-size:10px; fill:${isMinorActive ? '#ffaa00' : 'var(--muted)'}">${minorKey}</text>`;
  }
  
  svg.innerHTML = s;
}

// ---------- Backing Track Jam Assistant ----------
const JAM_PROGRESSIONS = {
  pop: [0, 7, 9, 5],      // I - V - vi - IV
  jazz: [2, 7, 0, 9],     // ii - V - I - VI
  blues: [0, 5, 0, 7],    // I - IV - I - V
  sad: [0, 8, 3, 10]      // i - VI - III - VII
};

function playJamSynthChord(rootPcVal, isMinor, durationSec) {
  try {
    ensureAudioCtx();
    const now = audioCtx.currentTime;
    const chordIntervals = isMinor ? [0, 3, 7] : [0, 4, 7];
    const rootMidi = 48 + rootPcVal; // C3 octave area
    
    chordIntervals.forEach(interval => {
      const midi = rootMidi + interval;
      const freq = midiToFreq(midi);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + durationSec);
    });
  } catch (e) {
    console.error("Jam synth play error:", e);
  }
}

function startJamTrack() {
  isJamPlaying = true;
  jamChordIndex = 0;
  jamBarCount = 1;
  $("btnJam").textContent = t("btnJamStop");
  $("btnJam").className = "ghost act";
  
  stepJamTrack();
}

function stopJamTrack() {
  isJamPlaying = false;
  if (jamTimer) {
    clearTimeout(jamTimer);
    jamTimer = null;
  }
  jamTargetChordPcs = [];
  $("btnJam").textContent = t("btnJamPlay");
  $("btnJam").className = "ghost";
  $("jamCurrentChord").textContent = "––";
  $("jamBarCounter").textContent = "Bar 1/4";
  drawFB();
}

function stepJamTrack() {
  if (!isJamPlaying) return;
  
  const progPattern = JAM_PROGRESSIONS[jamProgressionKey] || JAM_PROGRESSIONS.pop;
  const currentInterval = progPattern[jamChordIndex % progPattern.length];
  const chordRootPc = (rootPc + currentInterval) % 12;
  const isMinorChord = (jamProgressionKey === "sad" && (jamChordIndex % 4 === 0)) || (jamProgressionKey === "pop" && jamChordIndex % 4 === 2) || (jamProgressionKey === "jazz" && jamChordIndex % 4 === 0);
  
  const chordIntervals = isMinorChord ? [0, 3, 7] : [0, 4, 7];
  jamTargetChordPcs = chordIntervals.map(i => (chordRootPc + i) % 12);
  jamCurrentChordName = NOTE[chordRootPc] + (isMinorChord ? "m" : "");
  
  $("jamCurrentChord").textContent = jamCurrentChordName;
  $("jamBarCounter").textContent = `Bar ${jamChordIndex + 1}/${progPattern.length}`;
  
  const secondsPerBar = (60 / jamBpm) * 4;
  playJamSynthChord(chordRootPc, isMinorChord, secondsPerBar);
  drawFB();
  
  jamChordIndex = (jamChordIndex + 1) % progPattern.length;
  jamTimer = setTimeout(stepJamTrack, secondsPerBar * 1000);
}

// ---------- Smart Speed-up Metronome ----------
function playMetronomeClick(isDownbeat) {
  try {
    ensureAudioCtx();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(isDownbeat ? 1200 : 800, now);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {
    console.error("Click error:", e);
  }
}

function startMetronome() {
  isMetroPlaying = true;
  metroBeat = 0;
  metroBarCount = 0;
  $("btnMetro").textContent = t("btnMetroStop");
  $("btnMetro").className = "ghost act";
  stepMetronome();
}

function stopMetronome() {
  isMetroPlaying = false;
  if (metroTimer) {
    clearTimeout(metroTimer);
    metroTimer = null;
  }
  $("btnMetro").textContent = t("btnMetroStart");
  $("btnMetro").className = "ghost";
  const dots = document.querySelectorAll("#metroBeatDots .metro-dot");
  dots.forEach(d => d.className = "metro-dot");
}

function stepMetronome() {
  if (!isMetroPlaying) return;
  
  const isDownbeat = (metroBeat === 0);
  playMetronomeClick(isDownbeat);
  
  const dots = document.querySelectorAll("#metroBeatDots .metro-dot");
  dots.forEach((d, idx) => {
    if (idx === metroBeat) {
      d.className = isDownbeat ? "metro-dot downbeat" : "metro-dot active";
    } else {
      d.className = "metro-dot";
    }
  });
  
  metroBeat = (metroBeat + 1) % 4;
  if (metroBeat === 0) {
    metroBarCount++;
    const autoSpeed = $("metroAutoSpeed")?.checked;
    if (autoSpeed && metroBarCount > 0 && metroBarCount % 4 === 0) {
      metroBpm = Math.min(220, metroBpm + 5);
      $("metroBpm").value = metroBpm;
      $("metroBpmVal").textContent = metroBpm;
    }
  }
  
  const intervalMs = (60 / metroBpm) * 1000;
  metroTimer = setTimeout(stepMetronome, intervalMs);
}

function bindEvents() {
  $("btnScan").onclick = () => {
    if (isScanning) {
      stopScan(false);
    } else {
      startScan();
    }
  };
  
  $("scanResults").onclick = e => {
    const item = e.target.closest(".scan-result-item");
    if (item) {
      const root = parseInt(item.getAttribute("data-root"), 10);
      const scale = item.getAttribute("data-scale");
      rootPc = root;
      scaleId = scale;
      $("keySel").value = root;
      $("scaleSel").value = scale;
      drawFB();
      if (quizMode) newQuiz();
      
      // Visual feedback: briefly highlight the selected item
      item.style.borderColor = "var(--tone)";
      setTimeout(() => {
        item.style.borderColor = "var(--line)";
      }, 500);
    }
  };

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
  $("refPitch").oninput = e => { refPitch = parseInt(e.target.value); $("refPitchVal").textContent = refPitch; sendRefPitch(); };

  // Circle of Fifths Event Listeners
  if ($("btnCircleModal")) {
    $("btnCircleModal").onclick = () => {
      renderCircleOfFifths();
      $("circleModal").style.display = "flex";
    };
  }
  if ($("btnCloseCircle")) {
    $("btnCloseCircle").onclick = () => {
      $("circleModal").style.display = "none";
    };
  }
  if ($("circleSvg")) {
    $("circleSvg").onclick = e => {
      const sector = e.target.closest(".circle-sector");
      if (sector) {
        const pcVal = parseInt(sector.getAttribute("data-pc"), 10);
        if (!isNaN(pcVal)) {
          rootPc = pcVal;
          $("keySel").value = pcVal;
          drawFB();
          renderCircleOfFifths();
          if (quizMode) newQuiz();
        }
      }
    };
  }

  // Jam Track Assistant Event Listeners
  if ($("btnJam")) {
    $("btnJam").onclick = () => isJamPlaying ? stopJamTrack() : startJamTrack();
  }
  if ($("jamProgSel")) {
    $("jamProgSel").onchange = e => {
      jamProgressionKey = e.target.value;
      if (isJamPlaying) {
        stopJamTrack();
        startJamTrack();
      }
    };
  }
  if ($("jamBpm")) {
    $("jamBpm").oninput = e => {
      jamBpm = parseInt(e.target.value, 10);
      $("jamBpmVal").textContent = jamBpm;
    };
  }

  // Smart Speed-up Metronome Event Listeners
  if ($("btnMetro")) {
    $("btnMetro").onclick = () => isMetroPlaying ? stopMetronome() : startMetronome();
  }
  if ($("metroBpm")) {
    $("metroBpm").oninput = e => {
      metroBpm = parseInt(e.target.value, 10);
      $("metroBpmVal").textContent = metroBpm;
    };
  }

  // Direct Audio Monitoring Event Listeners
  if ($("monitorToggle")) {
    $("monitorToggle").onchange = e => {
      isMonitoringEnabled = e.target.checked;
      updateMonitoring();
    };
  }
  if ($("monitorVol")) {
    $("monitorVol").oninput = e => {
      monitorVolume = parseFloat(e.target.value);
      if ($("monitorVolVal")) {
        $("monitorVolVal").textContent = Math.round(monitorVolume * 100) + "%";
      }
      updateMonitoring();
    };
  }
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
