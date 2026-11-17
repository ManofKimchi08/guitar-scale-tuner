/* ============================================================
   Scales, heard. — main application logic
   Pure vanilla JS, compatible with file:// and http(s)://
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

const GUITAR_TUNINGS = {
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

const BASS_TUNINGS = {
  bass_standard: [43, 38, 33, 28],      // G2, D2, A1, E1 (41.2Hz)
  bass_drop_d: [43, 38, 33, 26],        // G2, D2, A1, D1 (36.7Hz)
  bass_half_down: [42, 37, 32, 27],     // Gb2, Db2, Ab1, Eb1
  bass_d_standard: [41, 36, 31, 26]     // F2, C2, G1, D1
};

let currentInstrument = "guitar"; // "guitar" | "bass"

function getTuningsForInstrument() {
  return (currentInstrument === "bass") ? BASS_TUNINGS : GUITAR_TUNINGS;
}

const TUNINGS = new Proxy({}, {
  get(target, prop) {
    const tDict = getTuningsForInstrument();
    return tDict[prop] || GUITAR_TUNINGS[prop] || BASS_TUNINGS[prop];
  },
  has(target, prop) {
    const tDict = getTuningsForInstrument();
    return prop in tDict || prop in GUITAR_TUNINGS || prop in BASS_TUNINGS;
  },
  ownKeys() {
    return Object.keys(getTuningsForInstrument());
  },
  getOwnPropertyDescriptor(target, prop) {
    return { enumerable: true, configurable: true, value: this.get(target, prop) };
  }
});

const CIRCLE_MAJOR = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
const CIRCLE_MINOR = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "Bbm", "Fm", "Cm", "Gm", "Dm"];
const CIRCLE_KEY_PC = {
  "C": 0, "G": 7, "D": 2, "A": 9, "E": 4, "B": 11,
  "F#": 6, "Db": 1, "Ab": 8, "Eb": 3, "Bb": 10, "F": 5
};

const JAM_PROGRESSIONS = {
  pop: [
    { deg: 0, isMinor: false }, // I
    { deg: 7, isMinor: false }, // V
    { deg: 9, isMinor: true },  // vi
    { deg: 5, isMinor: false }  // IV
  ],
  jazz: [
    { deg: 2, isMinor: true },  // ii
    { deg: 7, isMinor: false }, // V
    { deg: 0, isMinor: false }, // I
    { deg: 9, isMinor: true }   // vi
  ],
  blues: [
    { deg: 0, isMinor: false }, // I
    { deg: 5, isMinor: false }, // IV
    { deg: 0, isMinor: false }, // I
    { deg: 7, isMinor: false }  // V
  ],
  sad: [
    { deg: 0, isMinor: true },  // i (minor)
    { deg: 8, isMinor: false }, // VI (Major)
    { deg: 3, isMinor: false }, // III (Major in natural minor)
    { deg: 10, isMinor: false } // VII (Major)
  ]
};

let currentTuningId = "standard";
let strings = [...GUITAR_TUNINGS[currentTuningId]];
let tuningMode = "preset"; // "preset" | "custom"
let guideMode = "scale"; // "scale" | "chord"
let chordTypeVal = "major"; // "major" | "minor" | "dom7" | "maj7" | "min7"
let isLeftHand = false;

// ---------- DOM & Math Helpers ----------
const $ = id => document.getElementById(id);
const pc = m => ((m % 12) + 12) % 12;
const freqToMidi = f => Math.round(69 + 12 * Math.log2(f / refPitch));
const midiToFreq = m => refPitch * Math.pow(2, (m - 69) / 12);
const centsOff = (f, m) => Math.round(1200 * Math.log2(f / midiToFreq(m)));
const inScale = m => SCALES[scaleId].includes(pc(m - rootPc));

// ---------- i18n ----------
let LANG = "en";
function t(key) {
  const dict = window.I18N || {};
  return (dict[LANG] && dict[LANG][key]) || (dict.en && dict.en[key]) || key;
}
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.documentElement.lang = LANG;
}
function initLang() {
  let saved = null;
  try { saved = localStorage.getItem("ehyo_lang"); } catch (e) { }
  LANG = saved || (navigator.language || "en").slice(0, 2);
  const dict = window.I18N || {};
  if (!dict[LANG]) LANG = "en";
  const sel = $("langSel");
  if (!sel) return;
  sel.innerHTML = "";
  const names = window.LANG_NAMES || {};
  Object.keys(dict).forEach(code => {
    const o = document.createElement("option");
    o.value = code; o.textContent = names[code] || code;
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
  rebuildDeviceDropdown();
  updateAsioStatusBadge();
  listOutputDevices();
  refreshDynamic();
  if (!isJamPlaying && $("jamBarCounter")) {
    const prog = JAM_PROGRESSIONS[jamProgressionKey] || JAM_PROGRESSIONS.pop;
    $("jamBarCounter").textContent = `${t("lblBar")} 1/${prog.length}`;
  }
  drawFB();
}

// ---------- HMM 25-State Viterbi Chord Decoder ----------
const HMM_STATES = 25;
let hmmLogProbs = Array(HMM_STATES).fill(-Math.log(HMM_STATES));
let HMM_TEMPLATES = [];

function initHMMTemplates() {
  HMM_TEMPLATES = [];
  // 0..11 Major
  for (let r = 0; r < 12; r++) {
    const t = Array(12).fill(0.02);
    t[r] = 1.0; t[(r + 4) % 12] = 0.8; t[(r + 7) % 12] = 0.8;
    const sum = t.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(t.map(v => v / sum));
  }
  // 12..23 Minor
  for (let r = 0; r < 12; r++) {
    const t = Array(12).fill(0.02);
    t[r] = 1.0; t[(r + 3) % 12] = 0.8; t[(r + 7) % 12] = 0.8;
    const sum = t.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(t.map(v => v / sum));
  }
  // 24 No Chord
  HMM_TEMPLATES.push(Array(12).fill(1 / 12));
}
initHMMTemplates();

function runHMM(chroma, rms) {
  if (!chroma || chroma.length < 12) return 24;
  const P_SELF = 0.96;
  const P_OTHER = (1.0 - P_SELF) / (HMM_STATES - 1);
  const logP_SELF = Math.log(P_SELF);
  const logP_OTHER = Math.log(P_OTHER);

  const chromaSum = chroma.reduce((a, b) => a + b, 0);
  const normChroma = chromaSum > 0 ? chroma.map(v => v / chromaSum) : Array(12).fill(1 / 12);

  const logEmissions = Array(HMM_STATES);
  if (rms < 0.005) {
    for (let s = 0; s < 24; s++) logEmissions[s] = -10.0;
    logEmissions[24] = 0.0;
  } else {
    for (let s = 0; s < HMM_STATES; s++) {
      const tmpl = HMM_TEMPLATES[s];
      let dot = 0.0;
      for (let i = 0; i < 12; i++) dot += normChroma[i] * tmpl[i];
      logEmissions[s] = Math.log(Math.max(1e-6, dot));
    }
  }

  const newLogProbs = Array(HMM_STATES);
  for (let j = 0; j < HMM_STATES; j++) {
    let maxTrans = -Infinity;
    for (let i = 0; i < HMM_STATES; i++) {
      const trans = (i === j) ? logP_SELF : logP_OTHER;
      const score = hmmLogProbs[i] + trans;
      if (score > maxTrans) maxTrans = score;
    }
    newLogProbs[j] = maxTrans + logEmissions[j];
  }

  const normMax = Math.max(...newLogProbs);
  for (let s = 0; s < HMM_STATES; s++) hmmLogProbs[s] = newLogProbs[s] - normMax;

  let bestState = 24, bestScore = -Infinity;
  for (let s = 0; s < HMM_STATES; s++) {
    if (hmmLogProbs[s] > bestScore) {
      bestScore = hmmLogProbs[s];
      bestState = s;
    }
  }
  return bestState;
}

// ---------- Audio State & Engine ----------
let audioCtx = null, analyser = null, source = null, stream = null, raf = null, buf = null;
let running = false;
let rootPc = 9;                 // default A
let scaleId = "minor_pent";
let labelMode = "name";         // "name" | "deg" | "finger"
let appMode = "practice";       // "practice" | "quiz" | "rhythm"
let quizMode = false;
let targetInterval = 0;
let score = 0, streak = 0, lock = false;
let sensitivity = 0.015;
let stabNeeded = 4;
let history = [];
let litPcs = [];
let refPitch = 440;
let ws = null;

let monitorGainNode = null;
let isMonitoringEnabled = false;
let monitorVolume = 0.7;
let nextAsioPcmTime = 0;

// Scale Scanner State
let isScanning = false;
let scanInterval = null;
let scanDuration = 12000;
let scanTimeElapsed = 0;
let scanChromaHistory = Array(12).fill(0);

// Quiz & Arpeggio State
let targetChordName = "";
let targetChordPcs = [];
let detectedPcs = [];
let currentChordPcs = [];

// Voicing Guide State
let voicingMode = false;
let currentVoicingsList = [];
let currentVoicingIdx = 0;
let currentVoicing = null;

// Pitch Trajectory State
let pitchHistory = [];

// Jam Assistant State
let isJamPlaying = false;
let jamTimer = null;
let jamProgressionKey = "pop";
let jamBpm = 90;
let jamBarIndex = 0;
let jamTargetChordPcs = [];

// Metronome State
let isMetroPlaying = false;
let metroTimer = null;
let metroBpm = 100;
let metroBeatCount = 0;
let metroBarCount = 0;
let isAutoSpeedUp = true;

// Rhythm Game & Smart Fingering State
const FINGER_BADGES = ["⓪", "①", "②", "③", "④"];
const FINGER_COLORS = ["#94a3b8", "#38bdf8", "#22c55e", "#f59e0b", "#ec4899"];
let rhythmBoxId = "box1";       // "open" | "box1" | "box2" | "box3" | "high" | "full"
let rhythmDrillId = "run";      // "run" | "seq" | "chord" | "random"
let rhythmMeterId = "4_4";      // "4_4" | "3_4" | "6_8" | "12_8" | "2_4" | "5_4" | "7_8"
let rhythmSubdivId = "quarter"; // "quarter" | "eighth" | "triplet" | "sixteenth" | "shuffle" | ...
let rhythmBpm = 90;
let rhythmNoteCount = 24;
let rhythmLatencyMs = 45;
let isRhythmPlaying = false;
let rhythmRaf = null;
let rhythmStartTime = 0;
let rhythmChart = [];
let rhythmScore = 0;
let rhythmCombo = 0;
let rhythmMaxCombo = 0;
let rhythmCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
let rhythmOffsets = [];
let rhythmParticles = [];
let rhythmScheduledClickBeat = -4;
let rhythmTotalBeats = 0;
let rhythmLastHitTime = 0;
let rhythmLastHitMidi = -1;
let rhythmCurrentTarget = null;
let rhythmNextTarget = null;

function getFretBoxRange(boxId) {
  switch (boxId) {
    case "open": return [0, 4];
    case "box1": return [5, 8];
    case "box2": return [7, 10];
    case "box3": return [9, 12];
    case "high": return [12, 15];
    case "full": return [0, 12];
    default: return [5, 8];
  }
}

function getRecommendedFinger(sIdx, fret, boxIdOverride = null) {
  if (fret <= 0) return 0; // Open string

  // 1. If in Chord mode with an active CAGED voicing, use the exact chord voicing finger
  if (guideMode === "chord" && voicingMode && currentVoicing && currentInstrument !== "bass") {
    if (currentVoicing.frets[sIdx] === fret && currentVoicing.fingers && currentVoicing.fingers[sIdx] !== null) {
      return currentVoicing.fingers[sIdx];
    }
  }

  // 2. Determine the active 4-fret hand box window
  let minF = 1, maxF = 4;
  const effectiveBox = boxIdOverride || (appMode === "rhythm" ? rhythmBoxId : "full");
  if (effectiveBox && effectiveBox !== "full") {
    const [bMin, bMax] = getFretBoxRange(effectiveBox);
    if (fret >= Math.max(1, bMin) && fret <= bMax) {
      minF = Math.max(1, bMin);
      maxF = bMax;
    } else if (fret <= 4) { minF = 1; maxF = 4; }
    else if (fret <= 8) { minF = 5; maxF = 8; }
    else if (fret <= 12) { minF = 9; maxF = 12; }
    else { minF = 12; maxF = 15; }
  } else {
    if (fret <= 4) { minF = 1; maxF = 4; }
    else if (fret <= 8) { minF = 5; maxF = 8; }
    else if (fret <= 12) { minF = 9; maxF = 12; }
    else { minF = 12; maxF = 15; }
  }

  // 3. Inspect active scale/chord notes on this string inside [minF, maxF] for ergonomic 2-note / 3NPS rules
  const openMidi = strings[sIdx] || 40;
  const isChordMode = (guideMode === "chord");
  const chordPcs = isChordMode ? getChordPcs(rootPc, chordTypeVal) : [];
  const activeFrets = [];
  for (let f = minF; f <= maxF; f++) {
    const m = openMidi + f;
    const ok = isChordMode ? chordPcs.includes(pc(m)) : inScale(m);
    if (ok) activeFrets.push(f);
  }

  if (activeFrets.includes(fret)) {
    if (activeFrets.length === 2) {
      const [f1, f2] = activeFrets;
      const f1Finger = (f1 > minF && (f2 - f1) <= 2) ? 2 : 1;
      if (fret === f1) return f1Finger;
      const span = f2 - f1;
      return Math.max(2, Math.min(4, f1Finger + span));
    } else if (activeFrets.length === 3) {
      const [f1, f2, f3] = activeFrets;
      if (fret === f1) return 1;
      if (fret === f3) return 4;
      if (fret === f2) {
        return (f2 - f1 <= 1 || f3 - f1 >= 4) ? 2 : 3;
      }
    }
  }

  // 4. Standard 1-Finger-Per-Fret fallback relative to minF
  return Math.max(1, Math.min(4, fret - minF + 1));
}

function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

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
    } catch (e) { }
  }
}

function sendRefPitch() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_ref_pitch", value: refPitch }));
  }
}

let currentAsioSampleRate = 44100;

function playAsioPcmChunk(pcmData, sampleRate = (currentAsioSampleRate || 44100)) {
  if (!pcmData || pcmData.length === 0) return;
  const needMonitor = isMonitoringEnabled;
  const needRec = isRecording && !!recDestNode;
  if (!needMonitor && !needRec) return;
  ensureAudioCtx();

  if (needMonitor && !monitorGainNode && audioCtx) {
    monitorGainNode = audioCtx.createGain();
    monitorGainNode.gain.setValueAtTime(monitorVolume, audioCtx.currentTime);
    monitorGainNode.connect(audioCtx.destination);
  }

  const effectiveSr = sampleRate > 0 ? sampleRate : 44100;
  const buffer = audioCtx.createBuffer(1, pcmData.length, effectiveSr);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < pcmData.length; i++) {
    channelData[i] = pcmData[i];
  }

  const sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = buffer;

  // Resource Cleanup on Completion
  sourceNode.onended = () => {
    try { sourceNode.disconnect(); } catch (e) { }
  };

  if (needMonitor && monitorGainNode) {
    sourceNode.connect(monitorGainNode);
  }
  if (needRec && recDestNode) {
    try { sourceNode.connect(recDestNode); } catch (e) { }
  }

  const now = audioCtx.currentTime;
  const MAX_PCM_LATENCY = 0.050; // Maximum allowed queue latency
  if (nextAsioPcmTime < now || (nextAsioPcmTime - now) > MAX_PCM_LATENCY) {
    nextAsioPcmTime = now + 0.005;
  }
  sourceNode.start(nextAsioPcmTime);
  nextAsioPcmTime += buffer.duration;
}

async function setAudioOutputDevice(deviceId) {
  ensureAudioCtx();
  if (typeof audioCtx.setSinkId === "function") {
    try {
      await audioCtx.setSinkId(deviceId);
      console.log("Audio output device set to:", deviceId);
    } catch (e) {
      console.warn("Failed to set audio output device:", e);
    }
  }
}

async function listOutputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === "audiooutput");
    const sel = $("outputDeviceSel");
    if (!sel) return;
    const curVal = sel.value;
    sel.innerHTML = "";

    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = t("optDefaultOutput");
    sel.appendChild(defOpt);

    outputs.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || (`Output ${i + 1}`);
      sel.appendChild(opt);
    });

    if (curVal && Array.from(sel.options).some(o => o.value === curVal)) {
      sel.value = curVal;
    }
  } catch (e) {
    console.warn("Error listing output devices:", e);
  }
}

async function getStream(id) {
  let cleanId = id;
  if (cleanId && cleanId.startsWith("mic_dev_")) {
    cleanId = cleanId.slice("mic_dev_".length);
  }
  const isSpecificId = cleanId && cleanId !== "mic_default" && cleanId !== "asio_ws" && !cleanId.startsWith("asio_dev_");
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      ...(isSpecificId ? { deviceId: { exact: cleanId } } : {})
    }
  });
}

let currentAsioDevices = [];
let currentAsioDeviceId = null;
let asioBridgeAvailable = false;
let asioAutoDetectTimer = null;
let asioPopoverOpen = false;
let currentAsioBadgeState = "warn";

function getWebMicDefaultLabel() {
  if (LANG === "ko") return "브라우저 기본 마이크 / USB 인터페이스 (무설치)";
  if (LANG === "ja") return "ブラウザ標準マイク / USBインターフェース (インストール不要)";
  return "Browser Default Mic / USB Interface (No Install)";
}

async function rebuildDeviceDropdown() {
  const sel = $("deviceSel");
  if (!sel) return;

  const prevValue = sel.value;
  sel.innerHTML = "";

  // 1. ASIO & Audio Interfaces (Local Bridge)
  if (currentAsioDevices && currentAsioDevices.length > 0) {
    const asioGroup = document.createElement("optgroup");
    asioGroup.label = t("optAsioDeviceGroup");

    currentAsioDevices.forEach(d => {
      const o = document.createElement("option");
      o.value = "asio_dev_" + d.id;
      const isAsioTag = d.is_asio ? "⚡ " : "🎙️ ";
      o.textContent = `${isAsioTag}${d.name} [${d.api}]`;
      asioGroup.appendChild(o);
    });
    sel.appendChild(asioGroup);
  } else {
    const asioOpt = document.createElement("option");
    asioOpt.value = "asio_ws";
    asioOpt.textContent = `⚡ ${t("optAsioWebsocket")}`;
    sel.appendChild(asioOpt);
  }

  // 2. Web Audio Direct Microphones (Browser - Always Available Without Install)
  const micGroup = document.createElement("optgroup");
  micGroup.label = t("optMicDeviceGroup");

  const defaultMicOpt = document.createElement("option");
  defaultMicOpt.value = "mic_default";
  defaultMicOpt.textContent = `🎙️ ${getWebMicDefaultLabel()}`;
  micGroup.appendChild(defaultMicOpt);
  sel.appendChild(micGroup);

  if (currentAsioDeviceId !== null && currentAsioDeviceId !== undefined && (!prevValue || prevValue === "asio_ws" || prevValue.startsWith("asio_dev_"))) {
    sel.value = "asio_dev_" + currentAsioDeviceId;
  } else if (prevValue && Array.from(sel.options).some(o => o.value === prevValue)) {
    sel.value = prevValue;
  } else if (sel.options.length > 0) {
    sel.value = sel.options[0].value;
  }
  sel.disabled = false;

  let micDevices = [];
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    try {
      const d = await Promise.race([
        navigator.mediaDevices.enumerateDevices(),
        new Promise(r => setTimeout(() => r([]), 500))
      ]);
      micDevices = (d || []).filter(x => x.kind === "audioinput");
    } catch (e) { }
  }

  micDevices.forEach((x, i) => {
    if (!x.deviceId || x.deviceId === "default") return;
    const o = document.createElement("option");
    o.value = "mic_dev_" + x.deviceId;
    o.textContent = `🎙️ ${x.label || ("Microphone " + (i + 1))}`;
    micGroup.appendChild(o);
  });

  if (prevValue && Array.from(sel.options).some(o => o.value === prevValue)) {
    sel.value = prevValue;
  }
}

function updateAsioStatusBadge(state = currentAsioBadgeState) {
  currentAsioBadgeState = state;
  const pill = $("asioStatusBadge");
  const txt = $("asioStatusTxt");
  if (!pill || !txt) return;

  pill.classList.remove("is-ok", "is-warn", "is-web");
  if (state === "ok") {
    pill.classList.add("is-ok");
    txt.textContent = LANG === "ja" ? "ASIO 接続済" : (LANG === "en" ? "ASIO Connected" : "ASIO 연결됨");
  } else if (state === "web") {
    pill.classList.add("is-web");
    txt.textContent = LANG === "ja" ? "Webマイク" : (LANG === "en" ? "Web Mic Active" : "웹 마이크 사용 중");
  } else {
    pill.classList.add("is-warn");
    txt.textContent = LANG === "ja" ? "ASIO 未検出" : (LANG === "en" ? "ASIO Setup" : "ASIO 미감지 · 설정");
  }
}

function refreshAsioDiagnosticView(bridgeOk) {
  const pop = $("asioSmartPopover");
  if (!pop) return;
  const card = pop.querySelector(".asio-smart-popover-card");
  const diagBadge = $("asioDiagBadge");
  const nodeBridge = $("asioNodeBridge");
  const nodeBridgeSub = $("asioNodeBridgeSub");
  const nodeDriverSub = $("asioNodeDriverSub");
  const conn2Wrap = $("asioConn2Wrap");
  const conn2Arrow = $("asioConn2Arrow");
  const conn2Lbl = $("asioConn2Lbl");
  const conn1Lbl = $("asioConn1Lbl");
  const radarBanner = $("asioRadarBanner");
  const radarTxt = $("asioRadarTxt");

  const asioHwDevs = (currentAsioDevices || []).filter(d => d.is_asio);

  if (bridgeOk) {
    if (card) card.classList.add("is-connected");
    if (diagBadge) {
      diagBadge.className = "asio-diag-badge is-ok";
      diagBadge.textContent = "● 연결됨";
    }
    if (nodeBridge) nodeBridge.className = "asio-flow-node ok";
    if (nodeBridgeSub) nodeBridgeSub.textContent = "● 실행 중 (127.0.0.1:8765)";
    if (conn2Wrap) conn2Wrap.className = "asio-flow-conn connected";
    if (conn2Arrow) conn2Arrow.textContent = "➔";
    if (conn2Lbl) conn2Lbl.textContent = "연결됨";
    if (conn1Lbl) conn1Lbl.textContent = asioHwDevs.length > 0 ? "인식" : "확인";
    if (nodeDriverSub) {
      nodeDriverSub.textContent = asioHwDevs.length > 0
        ? `● ${asioHwDevs.length}개 ASIO 장치 감지`
        : "⚠ ASIO 드라이버 미감지 (2단계 확인)";
    }
    if (radarBanner) radarBanner.classList.add("is-ok");
    if (radarTxt) {
      radarTxt.innerHTML = asioHwDevs.length > 0
        ? "<strong>연결 완료!</strong> ASIO 브릿지와 오디오 인터페이스가 정상 인식되었습니다."
        : "<strong>ASIO Bridge 연결됨!</strong> 전용 ASIO 드라이버가 안 보이면 2단계 ASIO4ALL을 확인하세요.";
    }
  } else {
    if (card) card.classList.remove("is-connected");
    if (diagBadge) {
      diagBadge.className = "asio-diag-badge is-missing";
      diagBadge.textContent = "● 미감지";
    }
    if (nodeBridge) nodeBridge.className = "asio-flow-node missing";
    if (nodeBridgeSub) nodeBridgeSub.textContent = "● 미감지 (설치 필요)";
    if (conn2Wrap) conn2Wrap.className = "asio-flow-conn broken";
    if (conn2Arrow) conn2Arrow.textContent = "✕";
    if (conn2Lbl) conn2Lbl.textContent = "단절";
    if (conn1Lbl) conn1Lbl.textContent = "대기";
    if (nodeDriverSub) nodeDriverSub.textContent = "ASIO 드라이버";
    if (radarBanner) radarBanner.classList.remove("is-ok");
    if (radarTxt) {
      radarTxt.innerHTML = "<strong>백그라운드 자동 감지 중...</strong> 프로그램을 설치·실행하면 창을 닫지 않아도 즉시 자동 연결됩니다.";
    }
  }
}

function probeAsioBridgeSilent(timeoutMs = 700) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    asioBridgeAvailable = true;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    let testWs = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      asioBridgeAvailable = ok;
      if (testWs && testWs.readyState <= WebSocket.OPEN) {
        try { testWs.close(); } catch (e) { }
      }
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      testWs = new WebSocket("ws://127.0.0.1:8765");
      testWs.onopen = () => {
        setTimeout(() => {
          clearTimeout(timer);
          finish(true);
        }, 120);
      };
      testWs.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "asio_device_list") {
            currentAsioDevices = data.devices || [];
            currentAsioDeviceId = data.current_device_id;
            rebuildDeviceDropdown();
            clearTimeout(timer);
            finish(true);
          }
        } catch (e) { }
      };
      testWs.onerror = () => {
        clearTimeout(timer);
        finish(false);
      };
    } catch (e) {
      clearTimeout(timer);
      finish(false);
    }
  });
}

function positionAsioSmartPopover() {
  const pop = $("asioSmartPopover");
  const arrow = $("asioPopoverArrow");
  const sel = $("deviceSel");
  if (!pop || pop.style.display === "none" || !sel) return;

  const r = sel.getBoundingClientRect();
  const popW = Math.min(560, window.innerWidth - 24);
  pop.style.width = `${popW}px`;
  const selCenterX = r.left + r.width / 2;
  const left = Math.max(12, Math.min(window.innerWidth - popW - 12, selCenterX - popW * 0.56));
  const top = Math.round(r.bottom + 11);

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${top}px`;
  if (arrow) {
    const arrowLeft = Math.max(18, Math.min(popW - 32, selCenterX - left - 7));
    arrow.style.left = `${Math.round(arrowLeft)}px`;
  }
}

function openAsioSmartPopover() {
  const pop = $("asioSmartPopover");
  const sel = $("deviceSel");
  if (!pop) return;

  asioPopoverOpen = true;
  pop.style.display = "block";
  if (sel) sel.classList.add("asio-alert-ring");
  refreshAsioDiagnosticView(asioBridgeAvailable);
  requestAnimationFrame(positionAsioSmartPopover);

  if (asioAutoDetectTimer) clearInterval(asioAutoDetectTimer);
  asioAutoDetectTimer = setInterval(async () => {
    if (!asioPopoverOpen) return;
    const wasAvail = asioBridgeAvailable;
    const ok = await probeAsioBridgeSilent(600);
    refreshAsioDiagnosticView(ok);
    if (ok) {
      updateAsioStatusBadge("ok");
      if (!wasAvail && running) {
        try { await connect($("deviceSel") ? $("deviceSel").value : "asio_ws"); } catch (e) { }
      }
    }
  }, 2200);
}

function closeAsioSmartPopover() {
  const pop = $("asioSmartPopover");
  const sel = $("deviceSel");
  asioPopoverOpen = false;
  if (pop) pop.style.display = "none";
  if (sel) sel.classList.remove("asio-alert-ring");
  if (asioAutoDetectTimer) {
    clearInterval(asioAutoDetectTimer);
    asioAutoDetectTimer = null;
  }
}

function toggleAsioSmartPopover() {
  if (asioPopoverOpen) {
    closeAsioSmartPopover();
    return;
  }
  openAsioSmartPopover();
  probeAsioBridgeSilent(650).then(ok => {
    refreshAsioDiagnosticView(ok);
    const selVal = $("deviceSel") ? $("deviceSel").value : "";
    if (ok) updateAsioStatusBadge("ok");
    else if (selVal.startsWith("mic_")) updateAsioStatusBadge("web");
    else updateAsioStatusBadge("warn");
  });
}

async function switchToBrowserMicAndStart(shouldStart = true) {
  const sel = $("deviceSel");
  if (sel) {
    if (!Array.from(sel.options).some(o => o.value === "mic_default")) {
      await rebuildDeviceDropdown();
    }
    const firstMic = Array.from(sel.options).find(o => o.value === "mic_default" || o.value.startsWith("mic_dev_"));
    if (firstMic) sel.value = firstMic.value;
  }
  updateAsioStatusBadge("web");
  closeAsioSmartPopover();
  if ($("err")) $("err").textContent = "";

  if (shouldStart) {
    if (running) {
      try { await connect($("deviceSel").value); } catch (e) { if ($("err")) $("err").textContent = e.message; }
    } else {
      await start();
    }
  }
}

async function listDevices() {
  await rebuildDeviceDropdown();
}

function connectAsioWs() {
  ensureAudioCtx();
  if (!monitorGainNode && audioCtx) {
    monitorGainNode = audioCtx.createGain();
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
    monitorGainNode.connect(audioCtx.destination);
  }
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
      sendMonitoringState();
      try {
        ws.send(JSON.stringify({ type: "set_sensitivity", value: sensitivity }));
        if (isRecording) {
          ws.send(JSON.stringify({ type: "set_browser_recording", enabled: true }));
        }
      } catch (e) { }
      resolve();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "asio_device_list") {
          currentAsioDevices = data.devices || [];
          currentAsioDeviceId = data.current_device_id;
          rebuildDeviceDropdown();
        }
        if (data.type === "asio_recording_saved") {
          const asioNotice = $("asioRecNotice");
          if (asioNotice) {
            asioNotice.style.display = "flex";
            const fileTxt = $("asioRecFileTxt");
            if (fileTxt) fileTxt.textContent = `${data.filename} (${data.duration}s)`;
          }
          return;
        }
        if (data.type === "asio_stream_started") {
          $("err").textContent = "";
          $("verdict").textContent = t("verdictAsioConnected");
          $("verdict").className = "verdict ok";
          if (data.sample_rate) {
            currentAsioSampleRate = data.sample_rate;
          }
          return;
        }
        if (data.type === "asio_error") {
          $("err").textContent = data.message;
          return;
        }
        if (data.sample_rate) {
          currentAsioSampleRate = data.sample_rate;
        }
        if (data.pcm) {
          playAsioPcmChunk(data.pcm, data.sample_rate || currentAsioSampleRate);
        }
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
  });
}

function autoCorrelate(inputBuf, sr) {
  const SIZE = inputBuf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += inputBuf[i] * inputBuf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < sensitivity) return { f: -1, rms };

  let r1 = 0, r2 = SIZE - 1, th = 0.2;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(inputBuf[i]) < th) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(inputBuf[SIZE - i]) < th) { r2 = SIZE - i; break; } }
  const b = inputBuf.slice(r1, r2), N = b.length;
  if (N < 64) return { f: -1, rms };

  const minFreq = (currentInstrument === "bass") ? 30.0 : 65.0;
  const maxFreq = 1400.0;
  const minLag = Math.max(2, Math.floor(sr / maxFreq));
  const maxLag = Math.min(N - 2, Math.ceil(sr / minFreq));

  const c = new Float32Array(maxLag + 2);
  for (let i = 0; i <= maxLag + 1; i++) {
    let s = 0;
    const limit = N - i;
    for (let j = 0; j < limit; j++) s += b[j] * b[j + i];
    c[i] = limit > 0 ? (s / limit) * (1.0 - 0.12 * (i / maxLag)) : 0;
  }

  let d = minLag;
  while (d + 1 <= maxLag && c[d] > c[d + 1]) d++;

  let mv = -1, mp = -1;
  for (let i = d; i <= maxLag; i++) {
    if (c[i] > mv) { mv = c[i]; mp = i; }
  }

  let T = mp;
  if (T <= 0 || T < minLag || T > maxLag) return { f: -1, rms };

  const x1 = c[T - 1] || 0, x2 = c[T], x3 = c[T + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
  if (a) T = T - bb / (2 * a);
  const f = sr / T;

  if (f < minFreq || f > maxFreq) return { f: -1, rms };
  return { f, rms };
}

// ---------- Pitch Tracker & Canvas ----------
function updatePitchTracker(cents) {
  const now = Date.now();
  pitchHistory.push({ time: now, cents: cents });
  while (pitchHistory.length > 0 && now - pitchHistory[0].time > 5000) {
    pitchHistory.shift();
  }

  drawPitchCanvas();

  if (pitchHistory.length > 10) {
    const centsArr = pitchHistory.map(x => x.cents);
    const mean = centsArr.reduce((a, b) => a + b, 0) / centsArr.length;
    const variance = centsArr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / centsArr.length;
    const stdDev = Math.sqrt(variance);

    const stabPct = Math.max(0, Math.min(100, Math.round(100 - stdDev * 3)));
    const stabEl = $("pitchStabilityVal");
    if (stabEl) {
      stabEl.textContent = stabPct + "%";
      if (stabPct > 80) stabEl.style.color = "var(--ok)";
      else if (stabPct > 50) stabEl.style.color = "#f59e0b";
      else stabEl.style.color = "var(--no)";
    }
  }
}

function drawPitchCanvas() {
  const canvas = $("pitchCanvas");
  if (!canvas) return;
  const drawer = $("sideDrawer");
  if (drawer && !drawer.classList.contains("open")) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  const centsToY = (c) => H / 2 - (c / 250) * (H / 2);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  [0, 100, 200, -100, -200].forEach(cVal => {
    const y = centsToY(cVal);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();

    ctx.fillStyle = cVal === 0 ? "#38bdf8" : (cVal > 0 ? "#f59e0b" : "#94a3b8");
    ctx.font = "10px sans-serif";
    ctx.fillText((cVal > 0 ? "+" + cVal : cVal) + "c", 6, y - 3);
  });

  ctx.setLineDash([]);
  if (pitchHistory.length < 2) return;

  const now = Date.now();
  const timeWindow = 5000;

  ctx.beginPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#38bdf8";

  for (let i = 0; i < pitchHistory.length; i++) {
    const item = pitchHistory[i];
    const age = now - item.time;
    const x = W - (age / timeWindow) * W;
    const y = centsToY(item.cents);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ---------- Fretboard Drawing & DOM Optimization ----------
let fretboardNoteElements = [];
let fretboardGeom = null;
let hoveredFretNote = null;
let handAnchorFretSmoothed = null;
let currentNeckWood = "ebony";
const FB_TILT_MIN = -35, FB_TILT_MAX = 78;
const FB_YAW_MIN = -80, FB_YAW_MAX = 80;
const FB_ZOOM_MIN = 0.50, FB_ZOOM_MAX = 2.50;
let fbViewMode = "studio"; // "2d" | "studio" | "deep" | "custom"
let fbTiltDeg = 38;
let fbYawDeg = 12;
let fbZoom = 1.0;
let fbPanX = 0;
let fbPanY = 0;
let isDragging3dCam = false;
let isPanningCam = false;
let wasDragged3d = false;
let dragStartX = 0, dragStartY = 0, dragStartTilt = 38, dragStartYaw = 12;
let dragStartPanX = 0, dragStartPanY = 0;

function updateCam3dUI() {
  const zoomPct = Math.round(fbZoom * 100);
  const readout = $("fbCamReadout");
  if (readout) {
    const yawVal = Math.round(fbYawDeg);
    const yawStr = yawVal > 0 ? `+${yawVal}` : `${yawVal}`;
    readout.textContent = (Math.abs(fbTiltDeg) <= 1.5 && Math.abs(fbYawDeg) <= 1.5)
      ? `2D FLAT (0°) · ${zoomPct}%`
      : `PITCH ${Math.round(fbTiltDeg)}° · YAW ${yawStr}° · ${zoomPct}%`;
  }
  const zoomSlider = $("fbZoomSlider");
  if (zoomSlider) zoomSlider.value = String(zoomPct);
  const zoomValEl = $("fbZoomVal");
  if (zoomValEl) zoomValEl.textContent = `${zoomPct}%`;

  document.querySelectorAll(".v3d-preset-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-view3d") === fbViewMode);
  });
  const fb = $("fb");
  if (fb) {
    fb.classList.toggle("is-3d-orbit", Math.abs(fbTiltDeg) > 1.5 || Math.abs(fbYawDeg) > 1.5 || fbZoom !== 1);
  }
}

function setFbZoom(nextZoom, focusSvgX = null, focusSvgY = null) {
  const clamped = Math.max(FB_ZOOM_MIN, Math.min(FB_ZOOM_MAX, nextZoom));
  if (focusSvgX !== null && focusSvgY !== null && fbZoom > 0) {
    const ratio = clamped / fbZoom;
    fbPanX = (focusSvgX - 535) * (1 - ratio) + fbPanX * ratio;
    fbPanY = (focusSvgY - 200) * (1 - ratio) + fbPanY * ratio;
  }
  if (clamped <= 1.0 && Math.abs(fbPanX) + Math.abs(fbPanY) > 0) {
    fbPanX *= 0.5;
    fbPanY *= 0.5;
    if (Math.abs(fbPanX) < 1) fbPanX = 0;
    if (Math.abs(fbPanY) < 1) fbPanY = 0;
  }
  fbPanX = Math.max(-340, Math.min(340, fbPanX));
  fbPanY = Math.max(-190, Math.min(190, fbPanY));
  fbZoom = clamped;
  updateCam3dUI();
  drawFB();
}

function setFbViewMode(mode) {
  fbViewMode = mode;
  fbPanX = 0;
  fbPanY = 0;
  if (mode === "2d") {
    fbTiltDeg = 0;
    fbYawDeg = 0;
    fbZoom = 1.0;
  } else if (mode === "deep") {
    fbTiltDeg = 56;
    fbYawDeg = 0;
    fbZoom = 1.15;
  } else {
    fbViewMode = "studio";
    fbTiltDeg = 38;
    fbYawDeg = isLeftHand ? -12 : 12;
    fbZoom = 1.0;
  }
  updateCam3dUI();
  drawFB();
}

function setNeckWood(wood) {
  const valid = ["ebony", "rosewood", "maple", "cyber"];
  currentNeckWood = valid.includes(wood) ? wood : "ebony";
  document.body.setAttribute("data-neck-wood", currentNeckWood);
  document.querySelectorAll(".neck-theme-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-wood") === currentNeckWood);
  });
  drawFB();
}

function renderStaticFretboard() {
  const fb = $("fb"); if (!fb) return;
  fb.innerHTML = "";
  fretboardNoteElements = [];
  updateCam3dUI();

  const frets = 15;
  const numStrings = strings.length;
  const W = 1060, H = 430;
  fb.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const ns = "http://www.w3.org/2000/svg";
  const is3D = (Math.abs(fbTiltDeg) > 1.5 || Math.abs(fbYawDeg) > 1.5);
  const tiltRad = is3D ? (fbTiltDeg * Math.PI) / 180 : 0;
  const yawRad = is3D ? (fbYawDeg * Math.PI) / 180 : 0;
  const camDist = 920;

  const showHandArea = is3D || (appMode === "rhythm") || (labelMode === "finger") || (guideMode === "chord" && voicingMode && currentInstrument !== "bass") || (hoveredFretNote !== null);
  const cxScreen = 535;
  const cyScreen = is3D ? (showHandArea ? 204 : 185) : (showHandArea ? 172 : 185);
  const dirSign = isLeftHand ? -1 : 1;

  // SVG <defs> for 3D Guitar Neck Woods, Pearloid Inlays, Lighting, & Rhythm Gradients
  const defs = document.createElementNS(ns, "defs");
  defs.innerHTML = `
    <linearGradient id="woodGrad_ebony" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#222229"/>
      <stop offset="28%" stop-color="#141418"/>
      <stop offset="68%" stop-color="#19191f"/>
      <stop offset="100%" stop-color="#0d0d10"/>
    </linearGradient>
    <linearGradient id="woodGrad_rosewood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#542c1c"/>
      <stop offset="32%" stop-color="#3a1c10"/>
      <stop offset="72%" stop-color="#472315"/>
      <stop offset="100%" stop-color="#28120a"/>
    </linearGradient>
    <linearGradient id="woodGrad_maple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#efd49c"/>
      <stop offset="35%" stop-color="#e1ba70"/>
      <stop offset="72%" stop-color="#e8c788"/>
      <stop offset="100%" stop-color="#cfa256"/>
    </linearGradient>
    <linearGradient id="woodGrad_cyber" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22193c"/>
      <stop offset="38%" stop-color="#110c21"/>
      <stop offset="75%" stop-color="#1b1332"/>
      <stop offset="100%" stop-color="#0a0714"/>
    </linearGradient>
    <linearGradient id="bodyCutawayGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1c1c23"/>
      <stop offset="55%" stop-color="#111115"/>
      <stop offset="100%" stop-color="#08080a"/>
    </linearGradient>
    <linearGradient id="neckBackWoodGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#52525b"/>
      <stop offset="45%" stop-color="#27272e"/>
      <stop offset="100%" stop-color="#0e0e11"/>
    </linearGradient>
    <radialGradient id="pearlInlayGrad" cx="35%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#64748b"/>
    </radialGradient>
    <linearGradient id="rhythmPillarGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#facc15" stop-opacity="0.52"/>
      <stop offset="55%" stop-color="#facc15" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#facc15" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rhythmLaserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#facc15"/>
      <stop offset="55%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#c084fc"/>
    </linearGradient>
    <linearGradient id="coachDigit" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(29, 78, 216, 0.64)"/>
      <stop offset="52%" stop-color="rgba(59, 130, 246, 0.42)"/>
      <stop offset="100%" stop-color="rgba(147, 197, 253, 0.68)"/>
    </linearGradient>
    <linearGradient id="coachBehind" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(59, 130, 246, 0.46)"/>
      <stop offset="100%" stop-color="rgba(30, 58, 138, 0.16)"/>
    </linearGradient>
    <linearGradient id="forearmFadeGrad" gradientUnits="userSpaceOnUse" x1="470" y1="285" x2="535" y2="425">
      <stop offset="0%" stop-color="white" stop-opacity="1"/>
      <stop offset="45%" stop-color="white" stop-opacity="0.86"/>
      <stop offset="100%" stop-color="white" stop-opacity="0"/>
    </linearGradient>
    <mask id="forearmFadeMask">
      <rect x="-1000" y="-1000" width="${W + 2000}" height="${H + 2000}" fill="url(#forearmFadeGrad)"/>
    </mask>
    <filter id="glowYellowHand" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="5.0" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow3dSoft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  `;
  fb.appendChild(defs);

  const neckThemes = {
    ebony:    { fill: "url(#woodGrad_ebony)",    binding: "#dfd4bc", border: "#3f3f4a", sideWall: "#18181f", sideDot: "#181512", fret: "#d4d4d8", nut: "#fef3c7", inlayAlpha: "0.52", numCol: "#71717a" },
    rosewood: { fill: "url(#woodGrad_rosewood)", binding: "#fef3c7", border: "#b45309", sideWall: "#451a03", sideDot: "#18181b", fret: "#e4e4e7", nut: "#fef3c7", inlayAlpha: "0.85", numCol: "#a8a29e" },
    maple:    { fill: "url(#woodGrad_maple)",    binding: "#92400e", border: "#92400e", sideWall: "#b45309", sideDot: "#18181b", fret: "#71717a", nut: "#fef9c3", inlayAlpha: "0.55", numCol: "#a1a1aa" },
    cyber:    { fill: "url(#woodGrad_cyber)",    binding: "#a78bfa", border: "#7c3aed", sideWall: "#2e1065", sideDot: "#38bdf8", fret: "#67e8f9", nut: "#e9d5ff", inlayAlpha: "0.65", numCol: "#a78bfa" }
  };
  const nt = neckThemes[currentNeckWood] || neckThemes.ebony;

  // 12-TET Logarithmic Fret Ratios (0..15)
  const physMax = 1 - Math.pow(2, -frets / 12);
  const fretRatio = [];
  const ratioOfFret = (f) => {
    const p = (1 - Math.pow(2, -Math.max(0, Math.min(frets, f)) / 12)) / physMax;
    return 0.88 * p + 0.12 * (Math.max(0, Math.min(frets, f)) / frets);
  };
  for (let i = 0; i <= frets; i++) {
    fretRatio.push(ratioOfFret(i));
  }

  // World Coordinate Geometry (wx along neck -370..+370, wy across strings, wz height)
  const neckHalfLen = 370;
  const nutHalfNeck = 54;
  const endHalfNeck = 66;
  const nutHalfStr = 46;
  const endHalfStr = 58;

  const wxAtRatio = (t) => dirSign * (-neckHalfLen + (neckHalfLen * 2) * t);
  const halfNeckAt = (t) => nutHalfNeck + (endHalfNeck - nutHalfNeck) * t;
  const halfStrAt = (t) => nutHalfStr + (endHalfStr - nutHalfStr) * t;
  const strYWorld = (sIdx, t) => {
    const hs = halfStrAt(t);
    return -hs + sIdx * ((hs * 2) / Math.max(1, numStrings - 1));
  };

  // True 3D Perspective Camera Projection (collapses cleanly to 2D Flat when !is3D)
  const project3D = (wx, wy, wz = 0) => {
    if (!is3D) {
      return {
        x: cxScreen + fbPanX + wx * fbZoom,
        y: cyScreen + fbPanY + wy * fbZoom,
        scale: fbZoom,
        depth: 0
      };
    }
    const normY = Math.max(-1, Math.min(1, wy / 68));
    const archZ = 10 * (1 - normY * normY);
    const zTotal = wz + archZ;

    const x1 = wx * Math.cos(yawRad) - wy * Math.sin(yawRad);
    const y1 = wx * Math.sin(yawRad) + wy * Math.cos(yawRad);
    const z1 = zTotal;

    const y2 = y1 * Math.cos(tiltRad) - z1 * Math.sin(tiltRad);
    const z2 = y1 * Math.sin(tiltRad) + z1 * Math.cos(tiltRad);

    const persp = (camDist / Math.max(240, camDist - z2)) * fbZoom;
    return {
      x: cxScreen + fbPanX + x1 * persp,
      y: cyScreen + fbPanY + y2 * persp,
      scale: persp,
      depth: z2
    };
  };

  const noteWorldCoord = (sIdx, fNum) => {
    if (fNum <= 0) {
      return { wx: dirSign * (-neckHalfLen - 19), wy: strYWorld(sIdx, 0), t: 0 };
    }
    const clamped = Math.min(frets, fNum);
    const lo = Math.floor(clamped);
    const hi = Math.min(frets, lo + 1);
    const frac = clamped - lo;
    const tLo = lo === 0 ? 0 : (ratioOfFret(lo - 1) + ratioOfFret(lo)) / 2;
    const tHi = (ratioOfFret(hi - 1) + ratioOfFret(hi)) / 2;
    const t = tLo + (tHi - tLo) * frac;
    return { wx: wxAtRatio(t), wy: strYWorld(sIdx, t), t };
  };

  const projectNote = (sIdx, fNum, wz = 7) => {
    const { wx, wy, t } = noteWorldCoord(sIdx, fNum);
    const p = project3D(wx, wy, wz);
    return { cx: p.x, cy: p.y, scale: p.scale, wx, wy, t };
  };

  const fretX = fretRatio.map(t => project3D(wxAtRatio(t), 0, 0).x);
  const stringY = (sIdx, fNum = 7) => projectNote(sIdx, fNum, is3D ? 7 : 0).cy;
  const fretCenterX = (fNum) => projectNote(Math.floor(numStrings / 2), fNum, is3D ? 7 : 0).cx;

  fretboardGeom = {
    fretX, fretRatio, stringY, fretCenterX, project3D, projectNote, noteWorldCoord,
    wxAtRatio, halfNeckAt, halfStrAt, strYWorld, ratioOfFret, dirSign,
    nutHalfNeck, endHalfNeck, neckHalfLen,
    is3D, tiltRad, yawRad, fbZoom, fbPanX, fbPanY, W, H, neckH: H, fullH: H, frets, numStrings, cyScreen, showHandArea
  };

  // ==============================================================
  // LAYER 0 (3D ONLY): Floor Shadow, Cutaway Body -> Behind-Neck Hand Layer -> Headstock, Side Slab & Dots
  // ==============================================================
  if (is3D) {
    // 0a. Ambient studio drop-shadow below 3D neck
    const shPts = [
      project3D(wxAtRatio(0), -nutHalfNeck - 2, -24),
      project3D(wxAtRatio(1), -endHalfNeck - 2, -24),
      project3D(wxAtRatio(1), endHalfNeck + 4, -24),
      project3D(wxAtRatio(0), nutHalfNeck + 4, -24)
    ];
    const shPoly = document.createElementNS(ns, "polygon");
    shPoly.setAttribute("points", shPts.map(p => `${p.x.toFixed(1)},${(p.y + 14).toFixed(1)}`).join(" "));
    shPoly.setAttribute("fill", "rgba(0,0,0,0.52)");
    shPoly.setAttribute("filter", "url(#glow3dSoft)");
    fb.appendChild(shPoly);

    // 0b. Guitar Body Cutaway Silhouette & Neck Pickup at High-Fret End (15F+)
    const xCut = dirSign * (neckHalfLen - 26);
    const pNT = project3D(xCut, -endHalfNeck + 1, -2);
    const pNB = project3D(xCut, endHalfNeck - 1, -2);
    const pH1 = project3D(dirSign * (neckHalfLen + 78), -128, -8);
    const pH2 = project3D(dirSign * (neckHalfLen + 115), -110, -10);
    const pH3 = project3D(dirSign * (neckHalfLen + 115), 118, -10);
    const pH4 = project3D(dirSign * (neckHalfLen + 45), 98, -8);
    const bodyPath = document.createElementNS(ns, "path");
    bodyPath.setAttribute(
      "d",
      `M ${pNT.x.toFixed(1)} ${pNT.y.toFixed(1)} ` +
      `Q ${(pNT.x + dirSign * 24).toFixed(1)} ${(pNT.y - 54).toFixed(1)} ${pH1.x.toFixed(1)} ${pH1.y.toFixed(1)} ` +
      `L ${pH2.x.toFixed(1)} ${pH2.y.toFixed(1)} L ${pH3.x.toFixed(1)} ${pH3.y.toFixed(1)} ` +
      `Q ${pH4.x.toFixed(1)} ${pH4.y.toFixed(1)} ${pNB.x.toFixed(1)} ${pNB.y.toFixed(1)} Z`
    );
    bodyPath.setAttribute("fill", "url(#bodyCutawayGrad)");
    bodyPath.setAttribute("stroke", "#2a2a33");
    bodyPath.setAttribute("stroke-width", "1.4");
    fb.appendChild(bodyPath);

    // Neck Pickup Silhouette
    const pkX1 = dirSign * (neckHalfLen + 26);
    const pkX2 = dirSign * (neckHalfLen + 56);
    const pkPts = [
      project3D(pkX1, -50, 2), project3D(pkX2, -50, 2),
      project3D(pkX2, 50, 2), project3D(pkX1, 50, 2)
    ];
    const pkPoly = document.createElementNS(ns, "polygon");
    pkPoly.setAttribute("points", pkPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    pkPoly.setAttribute("fill", "#15151a");
    pkPoly.setAttribute("stroke", "#3f3f4a");
    pkPoly.setAttribute("stroke-width", "1.2");
    fb.appendChild(pkPoly);
    for (let s = 0; s < numStrings; s++) {
      const pp = project3D((pkX1 + pkX2) / 2, -40 + s * (80 / Math.max(1, numStrings - 1)), 3);
      const pole = document.createElementNS(ns, "ellipse");
      pole.setAttribute("cx", pp.x.toFixed(1));
      pole.setAttribute("cy", pp.y.toFixed(1));
      pole.setAttribute("rx", (3 * pp.scale).toFixed(1));
      pole.setAttribute("ry", (2.8 * Math.abs(Math.cos(tiltRad)) * pp.scale).toFixed(1));
      pole.setAttribute("fill", "#a1a1aa");
      fb.appendChild(pole);
    }
  }

  // Behind-Neck 3D Left-Hand Layer (Top inner palm cushion + bottom thenar & faded wrist rendered under neck/binding)
  const handBehindNeckLayer = document.createElementNS(ns, "g");
  handBehindNeckLayer.setAttribute("id", "fretboardHandBehindNeckLayer");
  handBehindNeckLayer.style.pointerEvents = "none";
  fb.appendChild(handBehindNeckLayer);

  if (is3D) {
    // 0c. Angled Left/Right Headstock Transition & Tuning Pegs + String Labels at Nut (0F-)
    const xNut = wxAtRatio(0);
    const pNT0 = project3D(xNut, -nutHalfNeck, 0);
    const pNB0 = project3D(xNut, nutHalfNeck, 0);
    const pHT = project3D(dirSign * (-neckHalfLen - 92), -nutHalfNeck - 16, -24);
    const pHB = project3D(dirSign * (-neckHalfLen - 92), nutHalfNeck + 4, -24);
    const headPoly = document.createElementNS(ns, "polygon");
    headPoly.setAttribute("points", `${pNT0.x.toFixed(1)},${pNT0.y.toFixed(1)} ${pHT.x.toFixed(1)},${pHT.y.toFixed(1)} ${pHB.x.toFixed(1)},${pHB.y.toFixed(1)} ${pNB0.x.toFixed(1)},${pNB0.y.toFixed(1)}`);
    headPoly.setAttribute("fill", currentNeckWood === "rosewood" ? "#2e160d" : (currentNeckWood === "maple" ? "#b48a46" : "#141418"));
    headPoly.setAttribute("stroke", "#32323c");
    headPoly.setAttribute("stroke-width", "1.4");
    fb.appendChild(headPoly);

    for (let s = 0; s < numStrings; s++) {
      const p0 = project3D(xNut, strYWorld(s, 0), 4.5);
      const pPeg = project3D(dirSign * (-neckHalfLen - 25 - s * 10.5), -nutHalfNeck - 2, -16);
      const stHead = document.createElementNS(ns, "line");
      stHead.setAttribute("x1", p0.x.toFixed(1)); stHead.setAttribute("y1", p0.y.toFixed(1));
      stHead.setAttribute("x2", pPeg.x.toFixed(1)); stHead.setAttribute("y2", pPeg.y.toFixed(1));
      stHead.setAttribute("stroke", "#71717a"); stHead.setAttribute("stroke-width", "1.05");
      fb.appendChild(stHead);

      const pegC = document.createElementNS(ns, "ellipse");
      pegC.setAttribute("cx", pPeg.x.toFixed(1)); pegC.setAttribute("cy", pPeg.y.toFixed(1));
      pegC.setAttribute("rx", "4.2"); pegC.setAttribute("ry", "2.8");
      pegC.setAttribute("fill", "#d4d4d8"); pegC.setAttribute("stroke", "#27272a"); pegC.setAttribute("stroke-width", "0.9");
      fb.appendChild(pegC);

      const sLblP = project3D(dirSign * (-neckHalfLen - 96), strYWorld(s, 0), 1.5);
      const sLbl = document.createElementNS(ns, "text");
      sLbl.setAttribute("x", sLblP.x.toFixed(1));
      sLbl.setAttribute("y", (sLblP.y + 3.5).toFixed(1));
      sLbl.setAttribute("text-anchor", dirSign > 0 ? "end" : "start");
      sLbl.setAttribute("font-size", "10.5");
      sLbl.setAttribute("font-weight", "700");
      sLbl.setAttribute("font-family", "var(--mono, ui-monospace, monospace)");
      sLbl.setAttribute("fill", s === numStrings - 1 ? "#fdba74" : "#94a3b8");
      sLbl.textContent = `${s + 1}${NOTE[pc(strings[s])]}`;
      fb.appendChild(sLbl);
    }

    // 0d. 3D Front Neck Thickness Slab + Binding + Glowing Side Position Dots facing the player!
    const segs = 26;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const x0 = wxAtRatio(t0), x1 = wxAtRatio(t1);
      const y0 = halfNeckAt(t0), y1 = halfNeckAt(t1);
      const tl = project3D(x0, y0, 0), tr = project3D(x1, y1, 0);
      const bl = project3D(x0, y0, -6.5), br = project3D(x1, y1, -6.5);
      const wBL = project3D(x0, y0 - 2, -19), wBR = project3D(x1, y1 - 2, -19);

      const bindPoly = document.createElementNS(ns, "polygon");
      bindPoly.setAttribute("points", `${tl.x.toFixed(1)},${tl.y.toFixed(1)} ${tr.x.toFixed(1)},${tr.y.toFixed(1)} ${br.x.toFixed(1)},${br.y.toFixed(1)} ${bl.x.toFixed(1)},${bl.y.toFixed(1)}`);
      bindPoly.setAttribute("fill", nt.binding);
      bindPoly.setAttribute("fill-opacity", (currentNeckWood === "rosewood" || currentNeckWood === "ebony") ? "0.88" : "0.62");
      fb.appendChild(bindPoly);

      const wallPoly = document.createElementNS(ns, "polygon");
      wallPoly.setAttribute("points", `${bl.x.toFixed(1)},${bl.y.toFixed(1)} ${br.x.toFixed(1)},${br.y.toFixed(1)} ${wBR.x.toFixed(1)},${wBR.y.toFixed(1)} ${wBL.x.toFixed(1)},${wBL.y.toFixed(1)}`);
      wallPoly.setAttribute("fill", nt.sideWall);
      fb.appendChild(wallPoly);
    }

    // Side Position Dots along the front binding strip (3, 5, 7, 9, 12 double, 15)
    [3, 5, 7, 9, 15].forEach(f => {
      const mr = (fretRatio[f - 1] + fretRatio[f]) / 2;
      const sp = project3D(wxAtRatio(mr), halfNeckAt(mr), -3.3);
      const sd = document.createElementNS(ns, "circle");
      sd.setAttribute("cx", sp.x.toFixed(1)); sd.setAttribute("cy", sp.y.toFixed(1));
      sd.setAttribute("r", "2.1"); sd.setAttribute("fill", nt.sideDot); sd.setAttribute("opacity", "0.92");
      fb.appendChild(sd);
    });
    {
      const mr = (fretRatio[11] + fretRatio[12]) / 2;
      [-4, 4].forEach(dx => {
        const sp = project3D(wxAtRatio(mr) + dx, halfNeckAt(mr), -3.3);
        const sd = document.createElementNS(ns, "circle");
        sd.setAttribute("cx", sp.x.toFixed(1)); sd.setAttribute("cy", sp.y.toFixed(1));
        sd.setAttribute("r", "2.0"); sd.setAttribute("fill", nt.sideDot);
        fb.appendChild(sd);
      });
    }

    // 15F C-Shape Curved Cross-Section End-Cap
    const xEndCap = wxAtRatio(1);
    const hwCap = halfNeckAt(1);
    const capPts = [];
    for (let k = 0; k <= 12; k++) {
      const yy = -hwCap + (2 * hwCap * k) / 12;
      capPts.push(project3D(xEndCap, yy, 0));
    }
    capPts.push(project3D(xEndCap, hwCap - 2, -19));
    capPts.push(project3D(xEndCap, -hwCap + 2, -19));
    const capPoly = document.createElementNS(ns, "polygon");
    capPoly.setAttribute("points", capPts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    capPoly.setAttribute("fill", nt.sideWall);
    capPoly.setAttribute("stroke", nt.border);
    capPoly.setAttribute("stroke-width", "1.1");
    fb.appendChild(capPoly);
  }

  // ==============================================================
  // LAYER 1: Tapered & Curved Fingerboard Surface
  // ==============================================================
  {
    const topPts = [], botPts = [];
    const boardSegs = is3D ? 20 : 2;
    for (let i = 0; i <= boardSegs; i++) {
      const t = i / boardSegs;
      const wx = wxAtRatio(t);
      const hw = halfNeckAt(t);
      topPts.push(project3D(wx, -hw, 0));
      botPts.unshift(project3D(wx, hw, 0));
    }
    const boardPoly = document.createElementNS(ns, "polygon");
    boardPoly.setAttribute("points", [...topPts, ...botPts].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    boardPoly.setAttribute("fill", nt.fill);
    boardPoly.setAttribute("stroke", nt.border);
    boardPoly.setAttribute("stroke-width", "1.5");
    boardPoly.setAttribute("stroke-linejoin", "round");
    fb.appendChild(boardPoly);

    // Specular arch crest sheen in 3D mode
    if (is3D && currentNeckWood !== "maple") {
      const cr1 = project3D(wxAtRatio(0), -11, 0.4);
      const cr2 = project3D(wxAtRatio(1), -11, 0.4);
      const cr3 = project3D(wxAtRatio(1), 11, 0.4);
      const cr4 = project3D(wxAtRatio(0), 11, 0.4);
      const crest = document.createElementNS(ns, "polygon");
      crest.setAttribute("points", [cr1, cr2, cr3, cr4].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
      crest.setAttribute("fill", "rgba(255,255,255,0.035)");
      fb.appendChild(crest);
    }
  }

  // ==============================================================
  // LAYER 2: 3D Slotted Bone Nut (0F), Arched Metallic Frets, & Fret Numbers
  // ==============================================================
  for (let i = 0; i <= frets; i++) {
    const t = fretRatio[i];
    const wx = wxAtRatio(t);
    const hw = halfNeckAt(t);

    if (i === 0) {
      if (is3D) {
        const dxN = dirSign * 4.5;
        const nTL = project3D(wx - dxN, -hw, 4.5), nTR = project3D(wx + dxN * 0.4, -hw, 4.5);
        const nBR = project3D(wx + dxN * 0.4, hw, 4.5), nBL = project3D(wx - dxN, hw, 4.5);
        const nFB = project3D(wx + dxN * 0.4, hw, 0), nFBL = project3D(wx - dxN, hw, 0);
        const nutTop = document.createElementNS(ns, "polygon");
        nutTop.setAttribute("points", `${nTL.x.toFixed(1)},${nTL.y.toFixed(1)} ${nTR.x.toFixed(1)},${nTR.y.toFixed(1)} ${nBR.x.toFixed(1)},${nBR.y.toFixed(1)} ${nBL.x.toFixed(1)},${nBL.y.toFixed(1)}`);
        nutTop.setAttribute("fill", nt.nut); nutTop.setAttribute("stroke", "#a8a29e"); nutTop.setAttribute("stroke-width", "0.8");
        fb.appendChild(nutTop);
        const nutFront = document.createElementNS(ns, "polygon");
        nutFront.setAttribute("points", `${nBL.x.toFixed(1)},${nBL.y.toFixed(1)} ${nBR.x.toFixed(1)},${nBR.y.toFixed(1)} ${nFB.x.toFixed(1)},${nFB.y.toFixed(1)} ${nFBL.x.toFixed(1)},${nFBL.y.toFixed(1)}`);
        nutFront.setAttribute("fill", "#d6d3d1");
        fb.appendChild(nutFront);
      } else {
        const pT = project3D(wx, -hw, 0), pB = project3D(wx, hw, 0);
        const nut = document.createElementNS(ns, "line");
        nut.setAttribute("x1", pT.x); nut.setAttribute("y1", pT.y);
        nut.setAttribute("x2", pB.x); nut.setAttribute("y2", pB.y);
        nut.setAttribute("stroke", nt.nut); nut.setAttribute("stroke-width", "5.2");
        fb.appendChild(nut);
      }
    } else {
      const steps = is3D ? 8 : 1;
      let dWire = "", dShadow = "";
      for (let k = 0; k <= steps; k++) {
        const yy = -hw + (2 * hw * k) / steps;
        const pW = project3D(wx, yy, is3D ? 1.5 : 0);
        const pS = project3D(wx + dirSign * 2, yy, 0.2);
        dWire += (k === 0 ? "M " : "L ") + `${pW.x.toFixed(1)} ${pW.y.toFixed(1)} `;
        dShadow += (k === 0 ? "M " : "L ") + `${pS.x.toFixed(1)} ${pS.y.toFixed(1)} `;
      }
      const fShad = document.createElementNS(ns, "path");
      fShad.setAttribute("d", dShadow); fShad.setAttribute("fill", "none");
      fShad.setAttribute("stroke", "rgba(0,0,0,0.58)"); fShad.setAttribute("stroke-width", (2.2 * Math.pow(fbZoom, 0.5)).toFixed(2));
      fb.appendChild(fShad);

      const fLine = document.createElementNS(ns, "path");
      fLine.setAttribute("d", dWire); fLine.setAttribute("fill", "none");
      fLine.setAttribute("stroke", nt.fret); fLine.setAttribute("stroke-width", (1.95 * Math.pow(fbZoom, 0.5)).toFixed(2));
      fLine.setAttribute("stroke-opacity", "0.75"); fLine.setAttribute("stroke-linecap", "round");
      fb.appendChild(fLine);

      // Fret numbers along elevated top edge (above finger badges in 3D, and bottom edge in flat 2D)
      const mt = (fretRatio[i - 1] + t) / 2;
      const mpTop = project3D(wxAtRatio(mt), -halfNeckAt(mt) - (is3D ? (showHandArea ? 88 : 22) : 13), is3D && showHandArea ? 14 : 0);
      const numTop = document.createElementNS(ns, "text");
      numTop.setAttribute("x", mpTop.x.toFixed(1));
      numTop.setAttribute("y", mpTop.y.toFixed(1));
      numTop.setAttribute("class", "fret-num");
      numTop.setAttribute("data-fret", i);
      numTop.setAttribute("fill", nt.numCol);
      numTop.setAttribute("font-size", ((is3D && showHandArea ? 11.5 : 10.5) * mpTop.scale).toFixed(1));
      numTop.textContent = i;
      fb.appendChild(numTop);

      if (!is3D) {
        const mpBot = project3D(wxAtRatio(mt), halfNeckAt(mt) + 13, 0);
        const numBot = document.createElementNS(ns, "text");
        numBot.setAttribute("x", mpBot.x.toFixed(1));
        numBot.setAttribute("y", mpBot.y.toFixed(1));
        numBot.setAttribute("class", "fret-num");
        numBot.setAttribute("data-fret", i);
        numBot.setAttribute("fill", nt.numCol);
        numBot.textContent = i;
        fb.appendChild(numBot);
      }
    }
  }

  // ==============================================================
  // LAYER 3: Pearloid Inlays & Tapered Rhythm Box Zone
  // ==============================================================
  const inlayFill = currentNeckWood === "maple" ? "#27272a" : "url(#pearlInlayGrad)";
  const ryRatio = is3D ? Math.max(0.35, Math.abs(Math.cos(tiltRad))) : 1.0;

  [3, 5, 7, 9, 15].forEach(f => {
    if (f <= frets) {
      const mt = (fretRatio[f - 1] + fretRatio[f]) / 2;
      const p = project3D(wxAtRatio(mt), 0, 0.2);
      const rx = (f >= 15 ? 4.5 : 5.3) * p.scale;
      const el = document.createElementNS(ns, "ellipse");
      el.setAttribute("cx", p.x.toFixed(1)); el.setAttribute("cy", p.y.toFixed(1));
      el.setAttribute("rx", rx.toFixed(1)); el.setAttribute("ry", (rx * ryRatio).toFixed(1));
      el.setAttribute("fill", inlayFill); el.setAttribute("fill-opacity", nt.inlayAlpha);
      fb.appendChild(el);
    }
  });
  {
    const mt = (fretRatio[11] + fretRatio[12]) / 2;
    const wx12 = wxAtRatio(mt);
    const y1W = strYWorld(Math.min(1, numStrings - 1), mt);
    const y2W = strYWorld(Math.max(0, numStrings - 2), mt);
    const offset1 = (strYWorld(1, mt) + strYWorld(2, mt)) / 2;
    const offset2 = (strYWorld(Math.max(0, numStrings - 3), mt) + strYWorld(numStrings - 2, mt)) / 2;
    const ys = numStrings <= 4 ? [-18, 18] : [offset1, offset2];
    ys.forEach(yy => {
      const p = project3D(wx12, yy, 0.2);
      const rx = 4.8 * p.scale;
      const el = document.createElementNS(ns, "ellipse");
      el.setAttribute("cx", p.x.toFixed(1)); el.setAttribute("cy", p.y.toFixed(1));
      el.setAttribute("rx", rx.toFixed(1)); el.setAttribute("ry", (rx * ryRatio).toFixed(1));
      el.setAttribute("fill", inlayFill); el.setAttribute("fill-opacity", nt.inlayAlpha);
      fb.appendChild(el);
    });
  }

  // Highlight active Tapered 3D Fret Box Zone when in Rhythm Mode
  if (appMode === "rhythm") {
    const [bMin, bMax] = getFretBoxRange(rhythmBoxId);
    const tA = bMin === 0 ? 0 : fretRatio[bMin - 1];
    const tB = fretRatio[Math.min(frets, bMax)];
    const xA = wxAtRatio(tA), xB = wxAtRatio(tB);
    const hA = halfNeckAt(tA) - 2, hB = halfNeckAt(tB) - 2;
    const p1 = project3D(xA, -hA, 0.6), p2 = project3D(xB, -hB, 0.6);
    const p3 = project3D(xB, hB, 0.6), p4 = project3D(xA, hA, 0.6);
    const boxPath = document.createElementNS(ns, "polygon");
    boxPath.setAttribute("id", "rhythmBoxZoneRect");
    boxPath.setAttribute("points", [p1, p2, p3, p4].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    boxPath.setAttribute("fill", "rgba(56, 189, 248, 0.08)");
    boxPath.setAttribute("stroke", "rgba(56, 189, 248, 0.45)");
    boxPath.setAttribute("stroke-dasharray", "4 3");
    fb.appendChild(boxPath);
  }

  // On-Fretboard Rhythm Back Layer (Fret Cell Energy Fill & Column Pulse rendered under strings/notes)
  const rhythmBackLayer = document.createElementNS(ns, "g");
  rhythmBackLayer.setAttribute("id", "fretboardRhythmBackLayer");
  rhythmBackLayer.style.pointerEvents = "none";
  fb.appendChild(rhythmBackLayer);

  // ==============================================================
  // LAYER 4: Floating 3D Strings Casting Real Wood Surface Shadows
  // ==============================================================
  for (let s = 0; s < numStrings; s++) {
    const x0W = wxAtRatio(0), x1W = wxAtRatio(1);
    const y0W = strYWorld(s, 0), y1W = strYWorld(s, 1);
    const strokeW = ((currentInstrument === "bass") ? (2.1 + s * 1.05) : (1.0 + s * 0.45)) * Math.pow(fbZoom, 0.55);
    const isWound = (currentInstrument === "bass") || (s >= 3);

    if (is3D) {
      const sh0 = project3D(x0W, y0W + 1.5, 0.2);
      const sh1 = project3D(x1W, y1W + 1.5, 0.2);
      const sShadow = document.createElementNS(ns, "line");
      sShadow.setAttribute("x1", sh0.x.toFixed(1)); sShadow.setAttribute("y1", (sh0.y + 3).toFixed(1));
      sShadow.setAttribute("x2", sh1.x.toFixed(1)); sShadow.setAttribute("y2", (sh1.y + 3).toFixed(1));
      sShadow.setAttribute("stroke", "rgba(0,0,0,0.48)"); sShadow.setAttribute("stroke-width", strokeW + 0.5);
      fb.appendChild(sShadow);
    }

    const p0 = project3D(x0W, y0W, is3D ? 4.5 : 0);
    const p1 = project3D(x1W, y1W, is3D ? 4.5 : 0);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", p0.x.toFixed(1)); line.setAttribute("y1", p0.y.toFixed(1));
    line.setAttribute("x2", p1.x.toFixed(1)); line.setAttribute("y2", p1.y.toFixed(1));
    line.setAttribute("stroke", currentNeckWood === "maple" ? "#52525b" : (isWound ? "#cbd5e1" : "#f4f4f5"));
    line.setAttribute("stroke-width", strokeW);
    line.setAttribute("stroke-opacity", isWound ? "0.8" : "0.88");
    fb.appendChild(line);

    if (isWound) {
      const coil = document.createElementNS(ns, "line");
      coil.setAttribute("x1", p0.x.toFixed(1)); coil.setAttribute("y1", p0.y.toFixed(1));
      coil.setAttribute("x2", p1.x.toFixed(1)); coil.setAttribute("y2", p1.y.toFixed(1));
      coil.setAttribute("stroke", currentNeckWood === "rosewood" ? "#d97706" : "#71717a");
      coil.setAttribute("stroke-width", strokeW * 0.7);
      coil.setAttribute("stroke-dasharray", "2.2 1.4");
      coil.setAttribute("stroke-opacity", "0.62");
      fb.appendChild(coil);
    }
  }

  // Dynamic 3D String Vibration Layer
  const stringVibeLayer = document.createElementNS(ns, "g");
  stringVibeLayer.setAttribute("id", "fretboardStringVibeLayer");
  stringVibeLayer.style.pointerEvents = "none";
  fb.appendChild(stringVibeLayer);

  // Hybrid Hand Back Layer (Palm, Knuckles, and 2-Segment Finger Bones rendered UNDER note pucks)
  const handBackLayer = document.createElementNS(ns, "g");
  handBackLayer.setAttribute("id", "fretboardHandBackLayer");
  handBackLayer.style.pointerEvents = "none";
  fb.appendChild(handBackLayer);

  // ==============================================================
  // LAYER 5: Scale/Chord Notes as 3D Beveled Cylinder Pucks (Sorted Back -> Front)
  // ==============================================================
  const isChordMode = (guideMode === "chord");
  if (!isChordMode) {
    voicingMode = false;
    currentVoicing = null;
  }
  currentChordPcs = isChordMode ? getChordPcs(rootPc, chordTypeVal) : [];

  const puckRyScale = is3D ? Math.max(0.48, Math.abs(Math.cos(tiltRad)) * 0.84) : 1.0;

  for (let s = 0; s < numStrings; s++) {
    const openMidi = strings[s];

    for (let f = 0; f <= frets; f++) {
      const midi = openMidi + f;
      const notePc = pc(midi);
      const isRoot = (notePc === rootPc);
      const inCurrentScale = inScale(midi);
      const inCurrentChord = isChordMode && currentChordPcs.includes(notePc);
      const isVisibleTone = isChordMode ? inCurrentChord : inCurrentScale;

      let isVoicingNote = false;
      if (voicingMode && currentVoicing && currentInstrument !== "bass") {
        const targetFret = currentVoicing.frets[s];
        if (targetFret !== null && targetFret === f) isVoicingNote = true;
      }

      if (voicingMode && !isVoicingNote) continue;
      if (!isVisibleTone && !voicingMode) continue;

      const pBase = projectNote(s, f, is3D ? 2.2 : 0);
      const pTop = projectNote(s, f, is3D ? 7.2 : 0);
      const rx = (f >= 12 ? 9.2 : 10.2) * pTop.scale;
      const ry = rx * puckRyScale;
      const fingerNum = getRecommendedFinger(s, f);

      const g = document.createElementNS(ns, "g");
      let classes = "note-dot";
      if (isRoot) classes += " is-root";
      const interval = pc(midi - rootPc);
      if (currentInstrument === "bass" && interval === 7) classes += " is-fifth";

      g.setAttribute("class", classes);
      g.setAttribute("data-midi", midi);
      g.setAttribute("data-pc", notePc);
      g.setAttribute("data-str", s);
      g.setAttribute("data-fret", f);
      g.setAttribute("data-cx", pTop.cx.toFixed(1));
      g.setAttribute("data-cy", pTop.cy.toFixed(1));
      g.setAttribute("data-finger", fingerNum);

      let fill = isRoot ? "var(--root)" : "var(--tone)";
      let rimFill = isRoot ? "#991b1b" : "#0369a1";

      if (is3D) {
        const rim = document.createElementNS(ns, "ellipse");
        rim.setAttribute("class", "note-rim");
        rim.setAttribute("cx", pBase.cx.toFixed(1));
        rim.setAttribute("cy", (pBase.cy + 1.4).toFixed(1));
        rim.setAttribute("rx", rx.toFixed(1));
        rim.setAttribute("ry", ry.toFixed(1));
        rim.setAttribute("fill", rimFill);
        rim.setAttribute("stroke", "rgba(0,0,0,0.65)");
        rim.setAttribute("stroke-width", "1");
        g.appendChild(rim);
      }

      const cap = document.createElementNS(ns, "ellipse");
      cap.setAttribute("class", "note-cap");
      cap.setAttribute("cx", pTop.cx.toFixed(1));
      cap.setAttribute("cy", pTop.cy.toFixed(1));
      cap.setAttribute("rx", rx.toFixed(1));
      cap.setAttribute("ry", ry.toFixed(1));
      cap.setAttribute("fill", fill);
      if (labelMode === "finger") {
        cap.setAttribute("stroke", FINGER_COLORS[fingerNum] || "#ffffff");
        cap.setAttribute("stroke-width", "2.1");
      } else if (currentNeckWood === "maple") {
        cap.setAttribute("stroke", "#18181b");
        cap.setAttribute("stroke-width", "1.5");
      }
      g.appendChild(cap);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", pTop.cx.toFixed(1));
      text.setAttribute("y", (pTop.cy + 3.4).toFixed(1));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", `${((f >= 12 ? 9.2 : (labelMode === "finger" ? 10.6 : 10.0)) * pTop.scale).toFixed(1)}px`);
      text.setAttribute("font-weight", "bold");

      let label = NOTE[notePc];
      if (labelMode === "deg") label = DEG[interval];
      else if (labelMode === "finger") label = FINGER_BADGES[fingerNum] || String(fingerNum);
      text.textContent = label;
      g.appendChild(text);

      fb.appendChild(g);
      fretboardNoteElements.push(g);
    }
  }

  // Hybrid Hand Tip Layer (Fingertip Pads, Nail Crescents, Barre Bars)
  const handTipLayer = document.createElementNS(ns, "g");
  handTipLayer.setAttribute("id", "fretboardHandTipLayer");
  handTipLayer.style.pointerEvents = "none";
  fb.appendChild(handTipLayer);

  const approachRing = document.createElementNS(ns, "ellipse");
  approachRing.setAttribute("id", "rhythmApproachRing");
  approachRing.setAttribute("class", "rhythm-approach-ring");
  approachRing.style.display = "none";
  fb.appendChild(approachRing);

  // On-Fretboard Rhythm Front Layer (3D Z-Pillar, Trajectory Arc + Ground Shadow, Orb, Popups)
  const rhythmFrontLayer = document.createElementNS(ns, "g");
  rhythmFrontLayer.setAttribute("id", "fretboardRhythmFrontLayer");
  rhythmFrontLayer.style.pointerEvents = "none";
  fb.appendChild(rhythmFrontLayer);

  // 3D Camera Orbit Axis Gizmo in top-right corner when 3D view is active
  if (is3D) {
    const gx = 1016, gy = 40;
    const gBox = document.createElementNS(ns, "g");
    gBox.setAttribute("opacity", "0.9");
    gBox.style.pointerEvents = "none";
    const bg = document.createElementNS(ns, "circle");
    bg.setAttribute("cx", gx); bg.setAttribute("cy", gy); bg.setAttribute("r", "24");
    bg.setAttribute("fill", "rgba(16,16,20,0.8)"); bg.setAttribute("stroke", "#2e2e38"); bg.setAttribute("stroke-width", "1.2");
    gBox.appendChild(bg);

    const ring = document.createElementNS(ns, "ellipse");
    ring.setAttribute("cx", gx); ring.setAttribute("cy", gy);
    ring.setAttribute("rx", "17"); ring.setAttribute("ry", (17 * Math.max(0.35, Math.abs(Math.cos(tiltRad)))).toFixed(1));
    ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "#38bdf8");
    ring.setAttribute("stroke-width", "1"); ring.setAttribute("stroke-dasharray", "3 2"); ring.setAttribute("opacity", "0.65");
    gBox.appendChild(ring);

    const axes = [
      [gx + 15 * Math.cos(yawRad), gy + 15 * Math.sin(yawRad) * Math.cos(tiltRad), "#ef4444"],
      [gx, gy - 16 * Math.sin(tiltRad), "#22c55e"],
      [gx - 12 * Math.sin(yawRad), gy + 12 * Math.cos(yawRad) * Math.cos(tiltRad), "#38bdf8"]
    ];
    axes.forEach(([ax, ay, col]) => {
      const ln = document.createElementNS(ns, "line");
      ln.setAttribute("x1", gx); ln.setAttribute("y1", gy);
      ln.setAttribute("x2", ax.toFixed(1)); ln.setAttribute("y2", ay.toFixed(1));
      ln.setAttribute("stroke", col); ln.setAttribute("stroke-width", "2"); ln.setAttribute("stroke-linecap", "round");
      gBox.appendChild(ln);
    });
    fb.appendChild(gBox);
  }
}

function updateStringVibrationOverlay(rNow) {
  const layer = $("fretboardStringVibeLayer");
  if (!layer || !fretboardGeom) return;
  layer.innerHTML = "";
  if (!fretboardGeom.is3D) return;

  let activeS = null, activeFret = 0, vibeColor = "#facc15";
  if (appMode === "rhythm" && rNow) {
    activeS = rNow.s;
    activeFret = rNow.fret;
    vibeColor = FINGER_COLORS[rNow.finger] || "#facc15";
  } else if (litPcs.length > 0) {
    const hitDot = fretboardNoteElements.find(g => litPcs.includes(parseInt(g.getAttribute("data-pc"), 10)));
    if (hitDot) {
      activeS = parseInt(hitDot.getAttribute("data-str"), 10);
      activeFret = parseInt(hitDot.getAttribute("data-fret"), 10);
      vibeColor = "#38bdf8";
    }
  }
  if (activeS === null || activeS === undefined) return;

  const { project3D, wxAtRatio, strYWorld, ratioOfFret } = fretboardGeom;
  const ns = "http://www.w3.org/2000/svg";
  const tStart = activeFret <= 0 ? 0 : (ratioOfFret(activeFret - 1) + ratioOfFret(activeFret)) / 2;
  const wxStart = wxAtRatio(tStart), wxEnd = wxAtRatio(1);

  let dTop = "", dBot = "";
  const steps = 16;
  for (let k = 0; k <= steps; k++) {
    const u = k / steps;
    const t = tStart + (1 - tStart) * u;
    const wx = wxStart + (wxEnd - wxStart) * u;
    const wy = strYWorld(activeS, t);
    const amp = Math.sin(u * Math.PI) * 5.2;
    const ptT = project3D(wx, wy, 4.5 + amp);
    const ptB = project3D(wx, wy, 4.5 - amp);
    dTop += (k === 0 ? "M " : "L ") + `${ptT.x.toFixed(1)} ${ptT.y.toFixed(1)} `;
    dBot += (k === 0 ? "M " : "L ") + `${ptB.x.toFixed(1)} ${ptB.y.toFixed(1)} `;
  }
  const pT = document.createElementNS(ns, "path");
  pT.setAttribute("d", dTop); pT.setAttribute("fill", "none");
  pT.setAttribute("stroke", vibeColor); pT.setAttribute("stroke-width", "2.1"); pT.setAttribute("opacity", "0.75");
  layer.appendChild(pT);

  const pB = document.createElementNS(ns, "path");
  pB.setAttribute("d", dBot); pB.setAttribute("fill", "none");
  pB.setAttribute("stroke", "#38bdf8"); pB.setAttribute("stroke-width", "2.1"); pB.setAttribute("opacity", "0.68");
  layer.appendChild(pB);
}

function renderFretboardHandOverlay(nowRel = 0) {
  const behindLayer = $("fretboardHandBehindNeckLayer");
  const backLayer = $("fretboardHandBackLayer");
  const tipLayer = $("fretboardHandTipLayer");
  const fb = $("fb");
  if (!backLayer || !tipLayer || !fretboardGeom) return;

  if (behindLayer) behindLayer.innerHTML = "";
  backLayer.innerHTML = "";
  tipLayer.innerHTML = "";

  const isChordVoicingActive = (guideMode === "chord" && voicingMode && currentVoicing && currentInstrument !== "bass");
  const shouldShowHand = (fretboardGeom.is3D && currentInstrument !== "bass") || (appMode === "rhythm") || (labelMode === "finger") || isChordVoicingActive || (hoveredFretNote !== null);

  if (fb) {
    fb.querySelectorAll(".fret-num").forEach(el => {
      el.removeAttribute("data-inbox");
      el.style.fill = "";
      el.style.fontWeight = "";
    });
  }
  if (!shouldShowHand) return;

  const {
    W = 1060, H = 430, frets, numStrings, dirSign = 1,
    project3D, projectNote, noteWorldCoord, wxAtRatio, halfNeckAt, strYWorld, ratioOfFret,
    is3D, tiltRad
  } = fretboardGeom;
  const ns = "http://www.w3.org/2000/svg";
  const zNoteTop = is3D ? 7.2 : 0;
  const ryScale3d = is3D ? Math.max(0.48, Math.abs(Math.cos(tiltRad)) * 0.84) : 1.0;

  const svgEl = (tag, attrs, parent) => {
    const node = document.createElementNS(ns, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, String(v));
      }
    }
    if (parent) parent.appendChild(node);
    return node;
  };

  // Highlight active box range or fall back cleanly for Scale / Chord / Rhythm
  const activeBoxId = appMode === "rhythm" ? rhythmBoxId : "box1";
  let [boxMin, boxMax] = getFretBoxRange(activeBoxId);

  // 1. Determine active finger target(s), next target, and optional Barre chord info
  const activeByFinger = { 1: null, 2: null, 3: null, 4: null };
  let primaryActive = null;
  let nextTarget = null;
  let barreInfo = null; // { fret, minS, maxS, finger: 1 }
  let openStringTarget = null;

  if (isRhythmPlaying) {
    primaryActive = rhythmCurrentTarget;
    nextTarget = rhythmNextTarget;
    if (primaryActive) {
      if (primaryActive.fret === 0) openStringTarget = primaryActive;
      else if (primaryActive.finger >= 1 && primaryActive.finger <= 4) activeByFinger[primaryActive.finger] = primaryActive;
    }
  } else if (isChordVoicingActive) {
    const f1Strings = [];
    let f1Fret = null;
    for (let s = 0; s < numStrings; s++) {
      const f = currentVoicing.frets[s];
      if (f === null || f === undefined || f <= 0) continue;
      const fNum = (currentVoicing.fingers && currentVoicing.fingers[s]) ? currentVoicing.fingers[s] : getRecommendedFinger(s, f);
      if (fNum === 1) {
        f1Strings.push(s);
        f1Fret = f;
      }
      if (fNum >= 1 && fNum <= 4) {
        if (!activeByFinger[fNum] || s > activeByFinger[fNum].s) {
          activeByFinger[fNum] = { s, fret: f, finger: fNum, pc: pc(strings[s] + f) };
        }
      }
    }
    if (f1Strings.length >= 2 && f1Fret > 0) {
      barreInfo = {
        fret: f1Fret,
        minS: Math.min(...f1Strings),
        maxS: Math.max(...f1Strings),
        finger: 1
      };
    }
    if (hoveredFretNote) {
      primaryActive = hoveredFretNote;
      if (hoveredFretNote.fret > 0 && hoveredFretNote.finger >= 1 && hoveredFretNote.finger <= 4) {
        activeByFinger[hoveredFretNote.finger] = hoveredFretNote;
      }
    }
  } else if (appMode === "rhythm") {
    const previewChart = getCachedRhythmPreviewChart();
    primaryActive = hoveredFretNote || previewChart[0] || null;
    nextTarget = hoveredFretNote ? null : (previewChart[1] || null);
    if (primaryActive) {
      if (primaryActive.fret === 0) openStringTarget = primaryActive;
      else if (primaryActive.finger >= 1 && primaryActive.finger <= 4) activeByFinger[primaryActive.finger] = primaryActive;
    }
  } else if (hoveredFretNote) {
    primaryActive = hoveredFretNote;
    if (primaryActive.fret === 0) openStringTarget = primaryActive;
    else if (primaryActive.finger >= 1 && primaryActive.finger <= 4) activeByFinger[primaryActive.finger] = primaryActive;
  } else if (litPcs && litPcs.length > 0) {
    const playedPc = litPcs[0];
    const matchDot = fretboardNoteElements.find(g => parseInt(g.getAttribute("data-pc"), 10) === playedPc);
    if (matchDot) {
      const s = parseInt(matchDot.getAttribute("data-str"), 10);
      const fret = parseInt(matchDot.getAttribute("data-fret"), 10);
      const finger = parseInt(matchDot.getAttribute("data-finger"), 10);
      primaryActive = { s, fret, finger, pc: playedPc };
      if (fret === 0) openStringTarget = primaryActive;
      else if (finger >= 1 && finger <= 4) activeByFinger[finger] = primaryActive;
    }
  }

  // Idle 3D Coach Preview: find a natural scale/root position inside active box so the 3D hand displays cleanly on load
  if (!primaryActive && !isChordVoicingActive) {
    const bStart = Math.max(1, boxMin === 0 ? 1 : boxMin);
    const bEnd = Math.min(frets, Math.max(bStart + 3, boxMax));
    const strPref = [2, 3, 1, 4, 5, 0].filter(s => s < numStrings);
    let bestCand = null;
    for (const wantRoot of [true, false]) {
      for (const s of strPref) {
        for (let f = bStart; f <= bEnd; f++) {
          const m = strings[s] + f;
          if (!inScale(m)) continue;
          const p = pc(m);
          if (wantRoot && p !== rootPc) continue;
          const recF = getRecommendedFinger(s, f, activeBoxId);
          bestCand = { s, fret: f, finger: (recF >= 1 && recF <= 4) ? recF : 1, pc: p, isIdlePreview: true };
          break;
        }
        if (bestCand) break;
      }
      if (bestCand) break;
    }
    if (bestCand) {
      primaryActive = bestCand;
      activeByFinger[bestCand.finger] = bestCand;
      for (let nf = bestCand.fret + 1; nf <= bEnd; nf++) {
        if (inScale(strings[bestCand.s] + nf)) {
          const recN = getRecommendedFinger(bestCand.s, nf, activeBoxId);
          nextTarget = { s: bestCand.s, fret: nf, finger: (recN >= 1 && recN <= 4) ? recN : Math.min(4, bestCand.finger + 1), pc: pc(strings[bestCand.s] + nf) };
          break;
        }
      }
    }
  }

  // 2. Compute Target 4-Fret Hand Anchor (Fret of Index Finger ①)
  let targetAnchorFret = Math.max(1, boxMin === 0 ? 1 : boxMin);
  if (isChordVoicingActive) {
    const validFrets = currentVoicing.frets.filter(f => f !== null && f > 0);
    if (validFrets.length > 0) {
      targetAnchorFret = Math.max(1, Math.min(frets - 3, Math.min(...validFrets)));
    }
  } else if (primaryActive && primaryActive.fret > 0 && primaryActive.finger >= 1) {
    targetAnchorFret = Math.max(1, Math.min(frets - 3, primaryActive.fret - (primaryActive.finger - 1)));
  }

  if (handAnchorFretSmoothed === null || !isRhythmPlaying) {
    handAnchorFretSmoothed = targetAnchorFret;
  } else {
    handAnchorFretSmoothed += (targetAnchorFret - handAnchorFretSmoothed) * 0.25;
  }

  const anchorF = handAnchorFretSmoothed;
  const minDispF = Math.round(anchorF);
  const maxDispF = Math.min(frets, minDispF + 3);

  // Highlight active fret numbers in top rail (3D)
  if (fb && is3D) {
    fb.querySelectorAll(".fret-num").forEach(el => {
      const fVal = parseInt(el.getAttribute("data-fret"), 10);
      if (fVal >= minDispF && fVal <= maxDispF) {
        el.style.fill = "#7dd3fc";
        el.style.fontWeight = "800";
      }
    });
  }

  // Smooth continuous fret coordinate helper supporting negative frets (below nut) and > frets
  const firstCellCenterT = (ratioOfFret(0) + ratioOfFret(1)) * 0.5;
  const lastCellCenterT = (ratioOfFret(frets - 1) + ratioOfFret(frets)) * 0.5;
  const lastCellStepT = lastCellCenterT - (ratioOfFret(frets - 2) + ratioOfFret(frets - 1)) * 0.5;
  const fretCoord = (sIdx, fCont) => {
    if (fCont < 0) {
      const t = fCont * firstCellCenterT;
      return { wx: wxAtRatio(t), wy: strYWorld(sIdx, Math.max(0, t)), t };
    }
    if (fCont > frets) {
      const t = lastCellCenterT + (fCont - frets) * lastCellStepT;
      return { wx: wxAtRatio(t), wy: strYWorld(sIdx, Math.min(1, t)), t };
    }
    return noteWorldCoord(sIdx, fCont);
  };

  // Scale digit radii gently with local fret width so upper frets never crowd together
  const anchorInt = Math.max(1, Math.min(frets - 1, Math.round(anchorF)));
  const localFretSpan = Math.abs(wxAtRatio(ratioOfFret(anchorInt)) - wxAtRatio(ratioOfFret(anchorInt - 1)));
  const rScale = Math.max(0.72, Math.min(1.02, localFretSpan / 62));

  // 3. 3D Catmull-Rom Tube Helper (IK Coach Style 2안)
  function buildTubePoints(nodes, samplesPerSeg = 8) {
    const dense = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const p0 = nodes[Math.max(0, i - 1)];
      const p1 = nodes[i];
      const p2 = nodes[i + 1];
      const p3 = nodes[Math.min(nodes.length - 1, i + 2)];
      for (let s = 0; s < samplesPerSeg; s++) {
        const u = s / samplesPerSeg;
        const u2 = u * u, u3 = u2 * u;
        const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        dense.push({
          wx: cr(p0.wx, p1.wx, p2.wx, p3.wx),
          wy: cr(p0.wy, p1.wy, p2.wy, p3.wy),
          wz: cr(p0.wz, p1.wz, p2.wz, p3.wz),
          r: cr(p0.r, p1.r, p2.r, p3.r)
        });
      }
    }
    dense.push(nodes[nodes.length - 1]);
    return dense;
  }

  function tubeOutlineSvgPath(dense, capStart = true, capEnd = true) {
    const pts = dense.map(p => ({ ...project3D(p.wx, p.wy, p.wz), r3: p.r }));
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const nx = -dy, ny = dx;
      const rad = pts[i].r3 * pts[i].scale;
      left.push({ x: pts[i].x + nx * rad, y: pts[i].y + ny * rad });
      right.push({ x: pts[i].x - nx * rad, y: pts[i].y - ny * rad });
    }
    const endP = pts[pts.length - 1], prevEnd = pts[pts.length - 2];
    const ex = endP.x - prevEnd.x, ey = endP.y - prevEnd.y;
    const elen = Math.hypot(ex, ey) || 1;
    const eTip = {
      x: endP.x + (ex / elen) * (endP.r3 * endP.scale * 0.94),
      y: endP.y + (ey / elen) * (endP.r3 * endP.scale * 0.94)
    };
    const startP = pts[0], nextStart = pts[1];
    const sx = startP.x - nextStart.x, sy = startP.y - nextStart.y;
    const slen = Math.hypot(sx, sy) || 1;
    const sTip = {
      x: startP.x + (sx / slen) * (startP.r3 * startP.scale * 0.85),
      y: startP.y + (sy / slen) * (startP.r3 * startP.scale * 0.85)
    };

    let d = `M ${left[0].x.toFixed(1)} ${left[0].y.toFixed(1)} `;
    for (let i = 1; i < left.length; i++) d += `L ${left[i].x.toFixed(1)} ${left[i].y.toFixed(1)} `;
    const rEnd = right[right.length - 1];
    d += capEnd
      ? `Q ${eTip.x.toFixed(1)} ${eTip.y.toFixed(1)} ${rEnd.x.toFixed(1)} ${rEnd.y.toFixed(1)} `
      : `L ${rEnd.x.toFixed(1)} ${rEnd.y.toFixed(1)} `;
    for (let i = right.length - 2; i >= 0; i--) d += `L ${right[i].x.toFixed(1)} ${right[i].y.toFixed(1)} `;
    d += capStart
      ? `Q ${sTip.x.toFixed(1)} ${sTip.y.toFixed(1)} ${left[0].x.toFixed(1)} ${left[0].y.toFixed(1)} Z`
      : "Z";
    return { d, pts };
  }

  function renderDigit3D(dense, opts) {
    const g = svgEl("g", {}, tipLayer);
    const { d, pts } = tubeOutlineSvgPath(dense, true, true);
    const col = opts.color || "#93c5fd";

    svgEl("path", {
      d, fill: "url(#coachDigit)",
      stroke: "rgba(147, 197, 253, 0.85)",
      "stroke-width": opts.isActive ? "1.8" : "1.45",
      "stroke-linejoin": "round",
      opacity: opts.isActive ? "0.96" : "0.88"
    }, g);

    // Subtle key light rim along proximal-to-distal surface
    const pStart = pts[Math.floor(pts.length * 0.14)];
    const pMid = pts[Math.floor(pts.length * 0.44)];
    const pEnd = pts[Math.floor(pts.length * 0.72)];
    svgEl("path", {
      d: `M ${(pStart.x - 3).toFixed(1)} ${(pStart.y - 2).toFixed(1)} Q ${(pMid.x - 4).toFixed(1)} ${(pMid.y - 2).toFixed(1)} ${(pEnd.x - 2).toFixed(1)} ${(pEnd.y - 1).toFixed(1)}`,
      fill: "none", stroke: "rgba(219, 234, 254, 0.65)",
      "stroke-width": opts.isThumb ? "5.0" : "3.6", "stroke-linecap": "round", opacity: "0.38"
    }, g);

    // Colored PIP & DIP joint rings for top 4 fingers (2안 signature)
    if (!opts.isThumb) {
      [0.34, 0.62].forEach(frac => {
        const idx = Math.floor(pts.length * frac);
        const jp = pts[idx];
        const jNext = pts[Math.min(pts.length - 1, idx + 1)];
        const ang = Math.atan2(jNext.y - jp.y, jNext.x - jp.x) * 180 / Math.PI + 90;
        svgEl("ellipse", {
          cx: jp.x.toFixed(1), cy: jp.y.toFixed(1),
          rx: (jp.r3 * jp.scale * 0.94).toFixed(1), ry: (4.4 * jp.scale).toFixed(1),
          transform: `rotate(${ang.toFixed(1)} ${jp.x.toFixed(1)} ${jp.y.toFixed(1)})`,
          fill: "none", stroke: col, "stroke-width": opts.isActive ? "2.0" : "1.55", opacity: opts.isActive ? "0.92" : "0.74"
        }, g);
      });
    }

    // Anatomical Fingernail + Lunula (~78% along distal phalanx)
    const nailIdx = Math.floor(pts.length * (opts.isThumb ? 0.76 : 0.78));
    const np = pts[nailIdx];
    const nPrev = pts[Math.max(0, nailIdx - 2)];
    const angleDeg = Math.atan2(np.y - nPrev.y, np.x - nPrev.x) * 180 / Math.PI;
    const nailW = np.r3 * np.scale * (opts.isThumb ? 1.24 : 0.96);
    const nailH = np.r3 * np.scale * (opts.isThumb ? 1.12 : 0.98);
    const ng = svgEl("g", {
      transform: `translate(${np.x.toFixed(1)} ${np.y.toFixed(1)}) rotate(${angleDeg.toFixed(1)})`
    }, g);
    svgEl("rect", {
      x: (-nailW * 0.50).toFixed(1), y: (-nailH * 0.52).toFixed(1),
      width: (nailW * 1.00).toFixed(1), height: (nailH * 1.04).toFixed(1),
      rx: (nailH * 0.42).toFixed(1),
      fill: "rgba(219, 234, 254, 0.34)", stroke: "rgba(191, 219, 254, 0.78)", "stroke-width": "1.0"
    }, ng);
    svgEl("path", {
      d: `M ${(-nailW * 0.44).toFixed(1)} ${(-nailH * 0.34).toFixed(1)} Q ${(-nailW * 0.02).toFixed(1)} 0 ${(-nailW * 0.44).toFixed(1)} ${(nailH * 0.34).toFixed(1)} Z`,
      fill: "rgba(255, 255, 255, 0.36)"
    }, ng);
    svgEl("ellipse", {
      cx: (nailW * 0.08).toFixed(1), cy: (-nailH * 0.18).toFixed(1),
      rx: (nailW * 0.24).toFixed(1), ry: (nailH * 0.12).toFixed(1),
      fill: "rgba(255, 255, 255, 0.34)"
    }, ng);

    return { pts, g };
  }

  // 4. Behind-Neck Hand Layer (Top-Right Inner Palm Cushion + Bottom Seamless Thenar & Faded Wrist)
  if (behindLayer) {
    // 4a. Top inner palm cushion peeking above top 1E behind ③ & ④
    const pc0 = fretCoord(0, anchorF - 0.05);
    const pc1 = fretCoord(0, anchorF + 0.85);
    const pc2 = fretCoord(0, anchorF + 2.20);
    const pc3 = fretCoord(0, anchorF + 3.05);
    const pc4 = fretCoord(0, anchorF + 2.88);
    const pA = project3D(pc0.wx, -halfNeckAt(Math.max(0, pc0.t)) + 2, -6);
    const pB = project3D(pc1.wx, -halfNeckAt(Math.max(0, pc1.t)) - 34, -6);
    const pC = project3D(pc2.wx, -halfNeckAt(Math.max(0, Math.min(1, pc2.t))) - 36, -6);
    const pD = project3D(pc3.wx, -halfNeckAt(Math.max(0, Math.min(1, pc3.t))) - 12, -4);
    const pE = project3D(pc4.wx, -halfNeckAt(Math.max(0, Math.min(1, pc4.t))) + 6, -12);
    svgEl("path", {
      d: `M ${pA.x.toFixed(1)} ${pA.y.toFixed(1)} C ${pB.x.toFixed(1)} ${pB.y.toFixed(1)}, ${pC.x.toFixed(1)} ${pC.y.toFixed(1)}, ${pD.x.toFixed(1)} ${pD.y.toFixed(1)} L ${pE.x.toFixed(1)} ${pE.y.toFixed(1)} Z`,
      fill: "url(#coachBehind)", stroke: "rgba(147, 197, 253, 0.72)", "stroke-width": "1.1", opacity: "0.92"
    }, behindLayer);

    // 4b. Unified Seamless Bottom Thenar + Palm + Forearm descending below bottom 6E binding
    const uc = (df, wyOff, wz) => {
      const c = fretCoord(numStrings - 1, anchorF + df);
      const tClamped = Math.max(0, Math.min(1, c.t));
      return project3D(c.wx, halfNeckAt(tClamped) + wyOff, wz);
    };
    const u0 = uc(-1.68, -4, -2);
    const u1 = uc(-1.55, 34, 4);
    const u2 = uc(-0.70, 54, 2);
    const u3 = uc(-0.15, 108, -14);
    const u4 = uc(0.55, 195, -32);
    const u5 = uc(2.45, 195, -32);
    const u6 = uc(2.25, 92, -16);
    const u7 = uc(2.52, 20, -8);
    const u8 = uc(2.55, -6, -8);

    // Sync #forearmFadeGrad linearly along the projected bottom wrist direction for any box/orbit angle
    const fadeGrad = $("forearmFadeGrad");
    if (fadeGrad) {
      const wStart = uc(0.6, 12, 0);
      const wEnd = uc(1.4, 185, -30);
      fadeGrad.setAttribute("x1", wStart.x.toFixed(1));
      fadeGrad.setAttribute("y1", wStart.y.toFixed(1));
      fadeGrad.setAttribute("x2", wEnd.x.toFixed(1));
      fadeGrad.setAttribute("y2", wEnd.y.toFixed(1));
    }

    const gArm = svgEl("g", { mask: "url(#forearmFadeMask)" }, behindLayer);
    svgEl("path", {
      d: `M ${u0.x.toFixed(1)} ${u0.y.toFixed(1)} C ${u1.x.toFixed(1)} ${u1.y.toFixed(1)}, ${u2.x.toFixed(1)} ${u2.y.toFixed(1)}, ${u3.x.toFixed(1)} ${u3.y.toFixed(1)} Q ${((u3.x + u4.x) * 0.5).toFixed(1)} ${((u3.y + u4.y) * 0.5).toFixed(1)} ${u4.x.toFixed(1)} ${u4.y.toFixed(1)} L ${u5.x.toFixed(1)} ${u5.y.toFixed(1)} C ${u6.x.toFixed(1)} ${u6.y.toFixed(1)}, ${u7.x.toFixed(1)} ${u7.y.toFixed(1)}, ${u8.x.toFixed(1)} ${u8.y.toFixed(1)} Z`,
      fill: "url(#coachBehind)", stroke: "rgba(147, 197, 253, 0.72)", "stroke-width": "1.15", opacity: "0.94"
    }, gArm);

    const tc0 = uc(-1.08, 22, 4);
    const tc1 = uc(-0.05, 30, 4);
    svgEl("path", {
      d: `M ${tc0.x.toFixed(1)} ${tc0.y.toFixed(1)} Q ${((tc0.x + tc1.x) * 0.5).toFixed(1)} ${((tc0.y + tc1.y) * 0.5 + 4).toFixed(1)} ${tc1.x.toFixed(1)} ${tc1.y.toFixed(1)}`,
      fill: "none", stroke: "rgba(219, 234, 254, 0.65)", "stroke-width": "2.2", "stroke-linecap": "round", opacity: "0.28"
    }, behindLayer);
  }

  // 5. Build Finger & Thumb 3D Control Nodes (Top 4 fingers ①..④ curl DOWN from 1E; Bottom Thumb curls UP over 6E)
  const baseRadii = [0, 19.2, 19.6, 18.8, 15.8];
  const fingerDefs = [];
  for (let fIdx = 4; fIdx >= 1; fIdx--) {
    const fColor = FINGER_COLORS[fIdx] || "#38bdf8";
    const activeTarget = activeByFinger[fIdx];
    const isActive = !!(activeTarget && activeTarget.fret > 0);
    const rF = baseRadii[fIdx] * rScale;

    let tipF, tipS, knuckleF;
    if (isActive) {
      tipF = activeTarget.fret;
      tipS = activeTarget.s;
      knuckleF = Math.max(0.5, tipF + 0.14);
    } else {
      // Relaxed standby fret column subtly gathered inward toward palm center
      const rel = (fIdx - 1) * 0.88;
      tipF = Math.min(frets, anchorF + rel);
      tipS = Math.min(numStrings - 1, 2); // Hover gently arched over middle string 3G
      knuckleF = tipF + 0.16;
    }

    // Barre chord overrides Finger 1 span cleanly across minS..maxS
    const isBarreF1 = (fIdx === 1 && barreInfo);
    if (isBarreF1) {
      tipF = barreInfo.fret;
      tipS = barreInfo.maxS;
      knuckleF = barreInfo.fret + 0.10;
    }

    const fcK = fretCoord(0, knuckleF);
    const fcMid1 = fretCoord(0, knuckleF - 0.05);
    const fcMid2 = fretCoord(Math.max(0, Math.min(numStrings - 1, tipS)), (knuckleF + tipF) * 0.5);
    const fcTip = fretCoord(tipS, tipF);
    const tK = Math.max(0, Math.min(1, fcK.t));
    const tM1 = Math.max(0, Math.min(1, fcMid1.t));
    const hwK = halfNeckAt(tK);
    const hwM1 = halfNeckAt(tM1);

    let wy1, wy2, wy3, wz1, wz2, wz3;
    if (isBarreF1) {
      const midS = (barreInfo.minS + barreInfo.maxS) * 0.5;
      wy1 = -hwM1 * 0.65;
      wy2 = strYWorld(midS, Math.max(0, Math.min(1, fcMid2.t)));
      wy3 = fcTip.wy - 4;
      wz1 = 15; wz2 = 12; wz3 = 7.5;
    } else if (tipS === 0) {
      wy1 = -hwM1 - 6;
      wy2 = fcMid2.wy - 8;
      wy3 = fcTip.wy - 8;
      wz1 = 19.5; wz2 = 16.5; wz3 = 5.4;
    } else {
      wy1 = tipS >= numStrings - 2 ? -hwM1 * 0.52 : -hwM1 - 4;
      wy2 = strYWorld(Math.max(1, tipS - 1), Math.max(0, Math.min(1, fcMid2.t)));
      wy3 = fcTip.wy - 9;
      wz1 = 19.5; wz2 = 16.0; wz3 = 5.2;
    }

    fingerDefs.push({
      id: fIdx,
      color: fColor,
      isActive,
      isBarreF1,
      tipWx: fcTip.wx,
      tipWy: wy3,
      knuckleWx: fcK.wx,
      nodes: [
        { wx: fcK.wx, wy: -hwK - 16, wz: 2, r: rF * 0.99 },
        { wx: fcMid1.wx, wy: wy1, wz: wz1, r: rF },
        { wx: fcMid2.wx, wy: wy2, wz: wz2, r: rF * 0.92 },
        { wx: fcTip.wx, wy: wy3, wz: wz3, r: rF * 0.85 }
      ]
    });
  }

  // Bottom Left Thumb curling UP & RIGHT over bottom 6E binding toward ① 검지
  const tBaseF = anchorF - 1.05;
  const thC0 = fretCoord(numStrings - 1, tBaseF - 0.12);
  const thC1 = fretCoord(numStrings - 1, tBaseF + 0.18);
  const thC2 = fretCoord(numStrings - 1, tBaseF + 0.42);
  const thC3 = fretCoord(Math.max(1, numStrings - 3), tBaseF + 0.62);
  const thumbNodes = [
    { wx: thC0.wx, wy: halfNeckAt(Math.max(0, Math.min(1, thC0.t))) + 15, wz: 11, r: 21.8 * rScale },
    { wx: thC1.wx, wy: halfNeckAt(Math.max(0, Math.min(1, thC1.t))) - 2, wz: 16.5, r: 22.2 * rScale },
    { wx: thC2.wx, wy: thC2.wy - 11, wz: 15.5, r: 20.6 * rScale },
    { wx: thC3.wx, wy: thC3.wy + 7, wz: 10.5, r: 18.8 * rScale }
  ];

  // 6. Cast Shadows on Fretboard (backLayer under note pucks)
  const drawCastShadow = (wx, wy, rx, ry, rotDeg) => {
    const p = project3D(wx + dirSign * 2, wy + 4, 2.1);
    svgEl("ellipse", {
      cx: p.x.toFixed(1), cy: p.y.toFixed(1),
      rx: (rx * p.scale).toFixed(1), ry: (ry * p.scale).toFixed(1),
      transform: `rotate(${rotDeg} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`,
      fill: "rgba(0, 0, 0, 0.34)", filter: "url(#glow3dSoft)"
    }, backLayer);
  };
  drawCastShadow(thC2.wx, thC2.wy, 26 * rScale, 13 * rScale, dirSign * -18);
  fingerDefs.forEach(fg => {
    const tip = fg.nodes[fg.nodes.length - 1];
    drawCastShadow(tip.wx, tip.wy, tip.r * 1.12, tip.r * 0.70, dirSign * -10);
  });

  // 7. Render 4 Fingers (painter order ④ -> ①), Barre Capsule (if active), and Bottom Thumb (tipLayer)
  const fingerRenderInfo = [];
  fingerDefs.forEach(fg => {
    if (fg.isBarreF1) {
      const pBTop = projectNote(barreInfo.minS, barreInfo.fret, zNoteTop);
      const pBBot = projectNote(barreInfo.maxS, barreInfo.fret, zNoteTop);
      const bw = 20 * ((pBTop.scale + pBBot.scale) * 0.5);
      svgEl("line", {
        x1: pBTop.cx.toFixed(1), y1: pBTop.cy.toFixed(1), x2: pBBot.cx.toFixed(1), y2: pBBot.cy.toFixed(1),
        stroke: "#38bdf8", "stroke-width": bw.toFixed(1), "stroke-linecap": "round", opacity: "0.28"
      }, tipLayer);
      svgEl("line", {
        x1: pBTop.cx.toFixed(1), y1: pBTop.cy.toFixed(1), x2: pBBot.cx.toFixed(1), y2: pBBot.cy.toFixed(1),
        stroke: "#38bdf8", "stroke-width": "2.6", "stroke-linecap": "round"
      }, tipLayer);
    }
    const dense = buildTubePoints(fg.nodes, 8);
    const res = renderDigit3D(dense, { color: fg.color, isThumb: false, isActive: fg.isActive });
    fingerRenderInfo.push({ fg, pts: res.pts });
  });

  const thumbDense = buildTubePoints(thumbNodes, 8);
  renderDigit3D(thumbDense, { color: "#fb923c", isThumb: true, isActive: true });

  // 8. Next-Note Ghost Ring & Target Active Glow Ring + Crisp Puck (on top of translucent fingers so always legible!)
  if (nextTarget && nextTarget.fret > 0 && nextTarget.finger >= 1 && nextTarget.finger <= 4) {
    const isSameAsActive = primaryActive && primaryActive.s === nextTarget.s && primaryActive.fret === nextTarget.fret;
    if (!isSameAsActive) {
      const pNext = projectNote(nextTarget.s, nextTarget.fret, zNoteTop);
      svgEl("ellipse", {
        cx: pNext.cx.toFixed(1), cy: pNext.cy.toFixed(1),
        rx: (13.5 * pNext.scale).toFixed(1), ry: (13.5 * ryScale3d * pNext.scale).toFixed(1),
        fill: "rgba(34, 211, 238, 0.14)", stroke: "#67e8f9",
        "stroke-width": "1.9", "stroke-dasharray": "4 3"
      }, tipLayer);
      if (!isRhythmPlaying && appMode !== "rhythm" && primaryActive && primaryActive.fret > 0) {
        const pCur = projectNote(primaryActive.s, primaryActive.fret, zNoteTop);
        const ctrlX = (pCur.cx + pNext.cx) * 0.5;
        const ctrlY = Math.min(pCur.cy, pNext.cy) - 18;
        svgEl("path", {
          d: `M ${pCur.cx.toFixed(1)} ${pCur.cy.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${pNext.cx.toFixed(1)} ${pNext.cy.toFixed(1)}`,
          fill: "none", stroke: "#67e8f9", "stroke-width": "1.7", "stroke-dasharray": "4 3", opacity: "0.78"
        }, tipLayer);
      }
    }
  }

  if (primaryActive && primaryActive.fret > 0) {
    const ap = projectNote(primaryActive.s, primaryActive.fret, zNoteTop);
    svgEl("circle", {
      cx: ap.cx.toFixed(1), cy: ap.cy.toFixed(1), r: (14.2 * ap.scale).toFixed(1),
      fill: "rgba(250, 204, 21, 0.22)", stroke: "#fde047", "stroke-width": "2.1",
      filter: "url(#glowYellowHand)"
    }, tipLayer);
    svgEl("circle", {
      cx: ap.cx.toFixed(1), cy: ap.cy.toFixed(1), r: (9.2 * ap.scale).toFixed(1),
      fill: "#facc15", stroke: "#ffffff", "stroke-width": "1.5", opacity: "0.95"
    }, tipLayer);
    const lblPc = (primaryActive.pc !== undefined) ? primaryActive.pc : pc(strings[primaryActive.s] + primaryActive.fret);
    svgEl("text", {
      x: ap.cx.toFixed(1), y: (ap.cy + 3.5 * ap.scale).toFixed(1),
      "text-anchor": "middle", "font-size": (10.2 * ap.scale).toFixed(1), "font-weight": "900", fill: "#0f172a"
    }, tipLayer).textContent = NOTE[lblPc];
  }

  if (openStringTarget && openStringTarget.fret === 0) {
    const pOpen = projectNote(openStringTarget.s, 0, zNoteTop);
    svgEl("ellipse", {
      cx: pOpen.cx.toFixed(1), cy: pOpen.cy.toFixed(1),
      rx: (15 * pOpen.scale).toFixed(1), ry: (15 * ryScale3d * pOpen.scale).toFixed(1),
      fill: "none", stroke: "#cbd5e1", "stroke-width": "2.2", "stroke-dasharray": "4 2"
    }, tipLayer);
  }

  // 9. Coaching HUD Callouts (Top ①②③④ Badges, 👍 하단 6E 엄지, ARCH 74° OK, HAND POS Dock)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // 9a. ①..④ Finger Badges cleanly ABOVE top 1E edge (below elevated Fret rail)
  fingerRenderInfo.forEach(({ fg, pts }) => {
    const kT = Math.max(0, Math.min(1, fretCoord(0, Math.max(0.5, anchorF + (fg.id - 1))).t));
    const bp = project3D(fg.knuckleWx, -halfNeckAt(kT) - 56, 6);
    const bx = clamp(bp.x, 16, W - 16);
    const by = clamp(bp.y, 28, H - 16);
    const kp = pts[Math.floor(pts.length * 0.16)];
    svgEl("line", {
      x1: bx.toFixed(1), y1: (by + 10).toFixed(1),
      x2: kp.x.toFixed(1), y2: (kp.y - 6).toFixed(1),
      stroke: fg.color, "stroke-width": "1.2", opacity: "0.68"
    }, tipLayer);
    svgEl("circle", {
      cx: bx.toFixed(1), cy: by.toFixed(1), r: fg.isActive ? "11.2" : "10.0",
      fill: fg.isActive ? fg.color : "#0f172a", stroke: fg.color, "stroke-width": fg.isActive ? "2.1" : "1.7"
    }, tipLayer);
    svgEl("text", {
      x: bx.toFixed(1), y: (by + 3.8).toFixed(1),
      "text-anchor": "middle", "font-size": "11.2", "font-weight": "800",
      fill: fg.isActive ? "#090c10" : fg.color
    }, tipLayer).textContent = String(fg.id);
  });

  // 9b. Thumb Callout Pill safely on the Nut side of the Thumb below 6E
  {
    const thEdge = fretCoord(numStrings - 1, tBaseF + 0.1);
    const tpEdge = project3D(thEdge.wx, halfNeckAt(Math.max(0, Math.min(1, thEdge.t))) + 14, 14);
    const thPillAnchor = fretCoord(numStrings - 1, tBaseF - 1.1);
    const tPill = project3D(thPillAnchor.wx, halfNeckAt(Math.max(0, Math.min(1, thPillAnchor.t))) + 52, 8);
    const pillW = 116;
    const rawCenterX = tPill.x - dirSign * (pillW * 0.5 + 4);
    const pillCx = clamp(rawCenterX, pillW * 0.5 + 8, W - pillW * 0.5 - 8);
    const pillCy = clamp(tPill.y, 18, H - 18);
    const edgeToThumbX = dirSign > 0 ? pillCx + pillW * 0.5 - 4 : pillCx - pillW * 0.5 + 4;
    svgEl("path", {
      d: `M ${(tpEdge.x - dirSign * 14).toFixed(1)} ${(tpEdge.y + 4).toFixed(1)} Q ${((tpEdge.x + edgeToThumbX) * 0.5).toFixed(1)} ${(pillCy + 8).toFixed(1)} ${edgeToThumbX.toFixed(1)} ${pillCy.toFixed(1)}`,
      fill: "none", stroke: "rgba(251, 146, 60, 0.65)", "stroke-width": "1.3", "stroke-dasharray": "4 3"
    }, tipLayer);
    svgEl("rect", {
      x: (pillCx - pillW * 0.5).toFixed(1), y: (pillCy - 11).toFixed(1),
      width: pillW, height: "22", rx: "10",
      fill: "rgba(15, 23, 42, 0.92)", stroke: "rgba(251, 146, 60, 0.55)", "stroke-width": "1.1"
    }, tipLayer);
    svgEl("text", {
      x: pillCx.toFixed(1), y: (pillCy + 3.5).toFixed(1),
      "text-anchor": "middle", "font-size": "10.5", "font-weight": "700", fill: "#fdba74"
    }, tipLayer).textContent = "👍 하단 6E 엄지";
  }

  // 9c. ARCH 74° OK Curve & Badge cleanly beside ④ 소지 (flips Left when anchorF > 9)
  const coachBodySide = anchorF <= 9;
  {
    const fArcBase = coachBodySide ? anchorF + 3.15 : anchorF - 0.55;
    const fcA0 = fretCoord(0, fArcBase);
    const fcA1 = fretCoord(0, fArcBase + (coachBodySide ? 0.30 : -0.30));
    const fcA2 = fretCoord(0, fArcBase + (coachBodySide ? 0.55 : -0.55));
    const hw0 = halfNeckAt(Math.max(0, Math.min(1, fcA0.t)));
    const hw1 = halfNeckAt(Math.max(0, Math.min(1, fcA1.t)));
    const hw2 = halfNeckAt(Math.max(0, Math.min(1, fcA2.t)));
    const aOrig = project3D(fcA0.wx, -hw0 - 20, 4);
    const aPeak = project3D(fcA1.wx, -hw1 - 30, 20);
    const aTip = project3D(fcA2.wx, -hw2 + 16, 4);
    svgEl("path", {
      d: `M ${aOrig.x.toFixed(1)} ${aOrig.y.toFixed(1)} Q ${aPeak.x.toFixed(1)} ${aPeak.y.toFixed(1)} ${aTip.x.toFixed(1)} ${aTip.y.toFixed(1)}`,
      fill: "none", stroke: "#38bdf8", "stroke-width": "1.75", "stroke-dasharray": "4 3"
    }, tipLayer);

    const bFret = coachBodySide ? anchorF + 5.75 : anchorF - 2.3;
    const fcB = fretCoord(0, bFret);
    const badgeTop = project3D(fcB.wx, -halfNeckAt(Math.max(0, Math.min(1, fcB.t))) - 42, 6);
    const bW = 108;
    const bCx = clamp(badgeTop.x, bW * 0.5 + 8, W - bW * 0.5 - 8);
    const bCy = clamp(badgeTop.y, 26, H - 20);
    svgEl("line", {
      x1: aPeak.x.toFixed(1), y1: (aPeak.y - 2).toFixed(1),
      x2: (bCx + (aPeak.x < bCx ? -bW * 0.5 + 2 : bW * 0.5 - 2)).toFixed(1), y2: bCy.toFixed(1),
      stroke: "rgba(56, 189, 248, 0.45)", "stroke-width": "1.2", "stroke-dasharray": "3 3"
    }, tipLayer);
    svgEl("rect", {
      x: (bCx - bW * 0.5).toFixed(1), y: (bCy - 12).toFixed(1),
      width: bW, height: "24", rx: "12",
      fill: "rgba(15, 23, 42, 0.94)", stroke: "rgba(56, 189, 248, 0.6)", "stroke-width": "1.2"
    }, tipLayer);
    svgEl("text", {
      x: bCx.toFixed(1), y: (bCy + 4).toFixed(1),
      "text-anchor": "middle", "font-size": "11.2", "font-weight": "800", fill: "#7dd3fc"
    }, tipLayer).textContent = "ARCH 74° OK";
  }

  // 9d. HAND POS Dock cleanly below open frets away from the Thumb & Wrist
  {
    const dFret = coachBodySide ? Math.min(frets - 1.5, anchorF + 6.4) : Math.max(1.2, anchorF - 2.4);
    const fcD = fretCoord(numStrings - 1, dFret);
    const dockAnchor = project3D(fcD.wx, halfNeckAt(Math.max(0, Math.min(1, fcD.t))) + 54, -4);
    const dText = barreInfo
      ? `BARRE ${barreInfo.fret}F (${currentVoicing ? currentVoicing.name : ""})`
      : isLeftHand
        ? `HAND POS: ${minDispF}F~${maxDispF}F · 오른손(④소지 ← ①검지)`
        : `HAND POS: ${minDispF}F~${maxDispF}F · 왼손(①검지 → ④소지)`;
    const dockW = barreInfo ? 236 : 268;
    const dockCx = clamp(dockAnchor.x, dockW * 0.5 + 10, W - dockW * 0.5 - 10);
    const dockCy = clamp(dockAnchor.y, 24, H - 22);
    svgEl("rect", {
      x: (dockCx - dockW * 0.5).toFixed(1), y: (dockCy - 15).toFixed(1),
      width: dockW, height: "30", rx: "10",
      fill: "rgba(15, 23, 42, 0.92)", stroke: "rgba(148, 163, 184, 0.38)", "stroke-width": "1.2"
    }, tipLayer);
    svgEl("text", {
      x: dockCx.toFixed(1), y: (dockCy + 4).toFixed(1),
      "text-anchor": "middle", "font-size": "11.2", "font-weight": "700", fill: "#e2e8f0"
    }, tipLayer).textContent = dText;
  }
}

function updateFretboardLit() {
  let rNow = null, rNext = null, rNext2 = null;
  if (appMode === "rhythm") {
    if (isRhythmPlaying) {
      rNow = rhythmCurrentTarget;
      rNext = rhythmNextTarget;
      const pendIdx = rhythmChart.findIndex(n => n.status === "pending");
      if (pendIdx !== -1 && pendIdx + 2 < rhythmChart.length) {
        rNext2 = rhythmChart[pendIdx + 2];
      }
    } else {
      const pChart = getCachedRhythmPreviewChart();
      rNow = pChart[0] || null;
      rNext = pChart[1] || null;
      rNext2 = pChart[2] || null;
    }
  }

  for (let i = 0; i < fretboardNoteElements.length; i++) {
    const g = fretboardNoteElements[i];
    const notePc = parseInt(g.getAttribute("data-pc"), 10);
    const sIdx = parseInt(g.getAttribute("data-str"), 10);
    const fret = parseInt(g.getAttribute("data-fret"), 10);
    const isLit = litPcs.includes(notePc);
    const isJamTarget = isJamPlaying && jamTargetChordPcs.includes(notePc);
    const isRhythmNow = rNow && rNow.s === sIdx && rNow.fret === fret;
    const isRhythmNext = rNext && rNext.s === sIdx && rNext.fret === fret && !isRhythmNow;
    const isRhythmNext2 = rNext2 && rNext2.s === sIdx && rNext2.fret === fret && !isRhythmNow && !isRhythmNext;

    g.classList.toggle("is-lit", isLit);
    g.classList.toggle("is-jam", isJamTarget && !isLit);
    g.classList.toggle("is-rhythm-target", !!isRhythmNow);
    g.classList.toggle("is-rhythm-next", !!isRhythmNext);
    g.classList.toggle("is-rhythm-next2", !!isRhythmNext2);
  }
  const nowRel = isRhythmPlaying && audioCtx ? (audioCtx.currentTime - rhythmStartTime) - (rhythmLatencyMs / 1000) : 0;
  updateStringVibrationOverlay(rNow);
  renderFretboardHandOverlay(nowRel);
  if (appMode === "rhythm") {
    drawRhythmHighway(nowRel);
  }
}

function drawFB() {
  renderStaticFretboard();
  updateFretboardLit();
  if (appMode === "rhythm" && !isRhythmPlaying) {
    drawRhythmHighway(0);
  }
}

function rebuildTunerUI() {
  const tunerLayout = $("tunerLayout");
  if (!tunerLayout) return;
  tunerLayout.innerHTML = "";
  const numStrings = strings.length;
  for (let i = 0; i < numStrings; i++) {
    const stringDiv = document.createElement("div");
    stringDiv.className = "tuner-string";
    stringDiv.setAttribute("data-string-idx", i);

    const peg = document.createElement("div");
    peg.className = "tuning-peg";

    const label = document.createElement("span");
    label.className = "string-label";
    const midi = strings[i];
    label.textContent = `${i + 1}${NOTE[pc(midi)]}`;

    stringDiv.appendChild(peg);
    stringDiv.appendChild(label);
    tunerLayout.appendChild(stringDiv);
  }
}

function updateTunerLabels() {
  rebuildTunerUI();
}

function updateTunerUI(detected) {
  const tunerLayout = $("tunerLayout");
  if (!tunerLayout) return;
  const tunerStrings = tunerLayout.querySelectorAll(".tuner-string");
  tunerStrings.forEach(el => { el.className = "tuner-string"; });

  if (!detected || detected.length === 0) return;

  const numStrings = strings.length;
  detected.forEach(n => {
    let minDiff = Infinity;
    let closestIdx = -1;
    for (let i = 0; i < numStrings; i++) {
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
          el.classList.add("tuned");
        } else if (cents < 0) {
          el.classList.add("flat");
        } else {
          el.classList.add("sharp");
        }
      }
    }
  });
}

function isCurrentModeMinor() {
  if (guideMode === "chord") {
    return chordTypeVal === "minor" || chordTypeVal === "min7";
  }
  return ["natural_minor", "harmonic_minor", "melodic_minor", "minor_pent", "blues", "dorian", "phrygian"].includes(scaleId);
}

function renderCircleOfFifths() {
  const svg = $("circleSvg"); if (!svg) return;
  svg.innerHTML = "";

  const cx = 150, cy = 150, rOuter = 135, rMid = 95, rInner = 55;
  const minorActive = isCurrentModeMinor();
  const lookupMajorPc = minorActive ? pc(rootPc + 3) : rootPc;
  const rootIndex = CIRCLE_MAJOR.findIndex(k => CIRCLE_KEY_PC[k] === lookupMajorPc);
  const activeIdx = rootIndex !== -1 ? rootIndex : 0;

  for (let i = 0; i < 12; i++) {
    const startAngle = (i * 30 - 105) * (Math.PI / 180);
    const endAngle = ((i + 1) * 30 - 105) * (Math.PI / 180);
    const midAngle = (startAngle + endAngle) / 2;

    let classOuter = "circle-sector";
    let classInner = "circle-sector";

    if (i === activeIdx) {
      if (minorActive) {
        classInner += " active-root";
        classOuter += " relative-key";
      } else {
        classOuter += " active-root";
        classInner += " relative-key";
      }
    } else if (i === (activeIdx + 11) % 12 || i === (activeIdx + 1) % 12) {
      classOuter += " related-key";
    }

    const notePcVal = CIRCLE_KEY_PC[CIRCLE_MAJOR[i]];
    const minorPcVal = pc(notePcVal + 9);

    const x1 = cx + rOuter * Math.cos(startAngle), y1 = cy + rOuter * Math.sin(startAngle);
    const x2 = cx + rOuter * Math.cos(endAngle), y2 = cy + rOuter * Math.sin(endAngle);
    const x3 = cx + rMid * Math.cos(endAngle), y3 = cy + rMid * Math.sin(endAngle);
    const x4 = cx + rMid * Math.cos(startAngle), y4 = cy + rMid * Math.sin(startAngle);

    const pathOuter = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathOuter.setAttribute("d", `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rMid} ${rMid} 0 0 0 ${x4} ${y4} Z`);
    pathOuter.setAttribute("class", classOuter);
    pathOuter.setAttribute("data-pc", notePcVal);
    pathOuter.setAttribute("data-minor", "0");
    svg.appendChild(pathOuter);

    const txOuter = cx + ((rOuter + rMid) / 2) * Math.cos(midAngle);
    const tyOuter = cy + ((rOuter + rMid) / 2) * Math.sin(midAngle);

    const txtOuter = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txtOuter.setAttribute("x", txOuter); txtOuter.setAttribute("y", tyOuter + 4);
    txtOuter.setAttribute("class", "circle-text");
    txtOuter.textContent = CIRCLE_MAJOR[i];
    svg.appendChild(txtOuter);

    const mx1 = cx + rMid * Math.cos(startAngle), my1 = cy + rMid * Math.sin(startAngle);
    const mx2 = cx + rMid * Math.cos(endAngle), my2 = cy + rMid * Math.sin(endAngle);
    const mx3 = cx + rInner * Math.cos(endAngle), my3 = cy + rInner * Math.sin(endAngle);
    const mx4 = cx + rInner * Math.cos(startAngle), my4 = cy + rInner * Math.sin(startAngle);

    const pathInner = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathInner.setAttribute("d", `M ${mx1} ${my1} A ${rMid} ${rMid} 0 0 1 ${mx2} ${my2} L ${mx3} ${my3} A ${rInner} ${rInner} 0 0 0 ${mx4} ${my4} Z`);
    pathInner.setAttribute("class", classInner);
    pathInner.setAttribute("data-pc", minorPcVal);
    pathInner.setAttribute("data-minor", "1");
    svg.appendChild(pathInner);

    const txInner = cx + ((rMid + rInner) / 2) * Math.cos(midAngle);
    const tyInner = cy + ((rMid + rInner) / 2) * Math.sin(midAngle);

    const txtInner = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txtInner.setAttribute("x", txInner); txtInner.setAttribute("y", tyInner + 3);
    txtInner.setAttribute("class", "circle-text minor");
    txtInner.textContent = CIRCLE_MINOR[i];
    svg.appendChild(txtInner);
  }
}

// ---------- HUD Arc Strobe Pitch Gauge Helper ----------
function updateHudArcGauge(cents, isIdle = false) {
  const needle = $("hudArcNeedle");
  const pivot = $("hudArcPivot");
  const centsTxt = $("hudArcCents");
  if (!needle || !centsTxt) return;

  if (isIdle) {
    needle.setAttribute("x2", "58");
    needle.setAttribute("y2", "12");
    needle.setAttribute("stroke", "#71717a");
    if (pivot) pivot.setAttribute("fill", "#71717a");
    centsTxt.textContent = "0¢";
    centsTxt.setAttribute("fill", "#71717a");
    return;
  }

  const clamped = Math.max(-50, Math.min(50, cents));
  const rad = ((clamped / 50) * 72 * Math.PI) / 180;
  const x2 = (58 + 40 * Math.sin(rad)).toFixed(1);
  const y2 = (52 - 40 * Math.cos(rad)).toFixed(1);
  const absC = Math.abs(cents);
  const col = absC <= 12 ? "#22c55e" : (absC <= 28 ? "#facc15" : "#ef4444");

  needle.setAttribute("x2", x2);
  needle.setAttribute("y2", y2);
  needle.setAttribute("stroke", col);
  if (pivot) pivot.setAttribute("fill", col);

  const rounded = Math.round(cents);
  centsTxt.textContent = `${rounded > 0 ? "+" : ""}${rounded}¢`;
  centsTxt.setAttribute("fill", col);
}

// ---------- Update Poly & Single Note Handlers ----------
function updatePoly(data) {
  const v = $("verdict");
  const activeNotes = data.notes || [];
  const chroma = data.chroma || [];
  const rms = data.rms || 0;

  // 1. Accumulate chroma for Scale Scanner if scanning
  if (isScanning && chroma && chroma.length === 12) {
    for (let i = 0; i < 12; i++) {
      scanChromaHistory[i] += chroma[i];
    }
  }

  if (activeNotes.length > 0) {
    litPcs = activeNotes.map(n => pc(n.midi));
  } else {
    litPcs = [];
  }

  updateFretboardLit();
  updateTunerUI(activeNotes);

  if (activeNotes.length === 0 && (!data.f || data.f <= 0)) {
    $("bigNote").textContent = "––";
    $("degTxt").textContent = "";
    $("hz").textContent = "";
    $("needle").style.left = "50%";
    updateHudArcGauge(0, true);
    v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
    v.className = "verdict idle";
    return;
  }

  // Determine dominant/primary note and accurate cents
  let firstMidi = 69;
  let cents = 0;
  let primaryF = -1;

  if (data.f && data.f > 0) {
    primaryF = data.f;
    firstMidi = freqToMidi(data.f);
    cents = centsOff(data.f, firstMidi);
  } else if (activeNotes.length > 0) {
    const sortedNotes = [...activeNotes].sort((a, b) => (b.amp || 0) - (a.amp || 0));
    const dominant = sortedNotes[0];
    firstMidi = dominant.midi;
    primaryF = dominant.f;
    cents = centsOff(dominant.f, firstMidi);
  }

  updatePitchTracker(cents);
  if (primaryF > 0) {
    $("hz").textContent = `${Math.round(primaryF)}Hz`;
  } else {
    $("hz").textContent = activeNotes.map(n => `${Math.round(n.f)}Hz`).join(" · ");
  }
  $("needle").style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
  updateHudArcGauge(cents, false);

  if (isRecording) {
    const elapsed = (Date.now() - recStartTime) / 1000;
    const allMidis = activeNotes.length > 0 ? activeNotes.map(n => n.midi) : [firstMidi];
    const displayNote = activeNotes.length > 1
      ? activeNotes.map(n => NOTE[pc(n.midi)]).join(" · ")
      : NOTE[pc(firstMidi)];
    const chordPcsNow = (guideMode === "chord") ? (currentChordPcs.length > 0 ? currentChordPcs : getChordPcs(rootPc, chordTypeVal)) : [];
    const inTargetNow = (guideMode === "chord")
      ? allMidis.every(m => chordPcsNow.includes(pc(m)))
      : allMidis.every(m => inScale(m));
    recordingTimeline.push({
      t: elapsed,
      note: displayNote,
      midi: firstMidi,
      midis: allMidis,
      cents: cents,
      inScale: inTargetNow,
      deg: allMidis.map(m => DEG[pc(m - rootPc)]).filter(Boolean).join(" · ")
    });
  }

  if (isRhythmPlaying) {
    checkRhythmHit(activeNotes.length > 0 ? activeNotes : [{ f: primaryF, midi: firstMidi }], primaryF, firstMidi, cents);
  }

  if (quizMode) {
    const p = pc(firstMidi);
    if (guideMode === "chord") {
      const noteNames = activeNotes.map(n => NOTE[pc(n.midi)]).join(" · ");
      $("bigNote").textContent = noteNames || NOTE[p];
      if (!lock) {
        const hmmState = runHMM(chroma, rms);
        if (hmmState < 24) {
          const rootIndex = hmmState % 12;
          const isMinor = (hmmState >= 12);
          const targetIsMinor = (chordTypeVal === "minor" || chordTypeVal === "min7");
          const rootMatches = (rootIndex === pc(rootPc + targetInterval));
          const qualityMatches = (isMinor === targetIsMinor);
          if (rootMatches && qualityMatches) {
            detectedPcs = [...targetChordPcs];
            updateChordQuizPrompt();
            quizSolved();
          }
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
    const noteNames = activeNotes.map(n => NOTE[pc(n.midi)]).join(" · ");
    $("bigNote").textContent = (data.f > 0 && activeNotes.length <= 1) ? NOTE[pc(firstMidi)] : (noteNames || NOTE[pc(firstMidi)]);
    const activeChordPcs = (currentChordPcs && currentChordPcs.length > 0) ? currentChordPcs : getChordPcs(rootPc, chordTypeVal);
    const evalNotes = activeNotes.length > 0 ? activeNotes : [{ midi: firstMidi }];
    const allInTarget = (guideMode === "chord")
      ? evalNotes.every(n => activeChordPcs.includes(pc(n.midi)))
      : evalNotes.every(n => inScale(n.midi));
    const degrees = evalNotes.map(n => DEG[pc(n.midi - rootPc)]).filter(x => x).join(" · ");
    $("degTxt").textContent = degrees ? (t("degPrefix") + degrees) : "";
    if (allInTarget) {
      v.textContent = (guideMode === "chord") ? t("verdictInChord") : t("verdictInScale");
      v.className = "verdict ok";
    } else {
      v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
      v.className = "verdict no";
    }
  }
}

function update(res) {
  const v = $("verdict");
  if (res.f < 0) {
    $("bigNote").textContent = "––";
    $("degTxt").textContent = "";
    $("hz").textContent = "";
    $("needle").style.left = "50%";
    updateHudArcGauge(0, true);
    v.textContent = (guideMode === "chord") ? t("verdictOutChord") : t("verdictOutScale");
    v.className = "verdict idle";
    litPcs = [];
    updateFretboardLit();
    updateTunerUI([]);
    return;
  }

  const m = freqToMidi(res.f);
  const p = pc(m);
  const cents = centsOff(res.f, m);

  if (isScanning) {
    scanChromaHistory[p] += 1.0;
  }

  updatePitchTracker(cents);
  litPcs = [p];
  updateFretboardLit();
  updateTunerUI([{ f: res.f, midi: m }]);
  $("hz").textContent = `${Math.round(res.f)}Hz`;
  $("needle").style.left = `${50 + Math.max(-50, Math.min(50, cents))}%`;
  updateHudArcGauge(cents, false);

  const activeChordPcs = (currentChordPcs && currentChordPcs.length > 0) ? currentChordPcs : getChordPcs(rootPc, chordTypeVal);

  if (isRecording) {
    const elapsed = (Date.now() - recStartTime) / 1000;
    recordingTimeline.push({
      t: elapsed,
      note: NOTE[p],
      midi: m,
      midis: [m],
      cents: cents,
      inScale: (guideMode === "chord") ? activeChordPcs.includes(p) : inScale(m),
      deg: DEG[pc(m - rootPc)]
    });
  }

  if (isRhythmPlaying) {
    checkRhythmHit([{ f: res.f, midi: m }], res.f, m, cents);
  }

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
          if (detectedPcs.length === targetChordPcs.length) quizSolved();
        }
      } else if (!hit) { history = []; }
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
    const isChordTarget = (guideMode === "chord");
    const isToneOk = isChordTarget ? activeChordPcs.includes(p) : inScale(m);
    if (isToneOk) {
      $("degTxt").textContent = t("degPrefix") + DEG[interval];
      v.textContent = isChordTarget ? t("verdictInChord") : t("verdictInScale");
      v.className = "verdict ok";
    } else {
      $("degTxt").textContent = "";
      v.textContent = isChordTarget ? t("verdictOutChord") : t("verdictOutScale");
      v.className = "verdict no";
    }
  }
}

function loop() {
  if (!running) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    raf = null;
    return;
  }
  if (!analyser || !buf) return;
  analyser.getFloatTimeDomainData(buf);
  update(autoCorrelate(buf, audioCtx.sampleRate));
  raf = requestAnimationFrame(loop);
}

// ---------- Audio Lifecycle ----------
async function connect(id) {
  ensureAudioCtx();
  if (!monitorGainNode && audioCtx) {
    monitorGainNode = audioCtx.createGain();
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
    monitorGainNode.connect(audioCtx.destination);
  }

  if (ws) {
    try { ws.close(); } catch (e) { }
    ws = null;
  }
  if (id === "asio_ws" || (id && id.startsWith("asio_dev_"))) {
    if (source) { source.disconnect(); source = null; }
    if (stream) { stream.getTracks().forEach(tk => tk.stop()); stream = null; }
    await connectAsioWs();
    if (id && id.startsWith("asio_dev_")) {
      const devId = parseInt(id.slice("asio_dev_".length), 10);
      currentAsioDeviceId = devId;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "select_asio_device", device_id: devId }));
      }
    }
    return;
  }
  if (source) source.disconnect();
  if (stream) stream.getTracks().forEach(tk => tk.stop());
  stream = await getStream(id);
  source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser(); 
  analyser.fftSize = (currentInstrument === "bass") ? 4096 : 2048;
  buf = new Float32Array(analyser.fftSize);
  source.connect(analyser);

  source.connect(monitorGainNode);
  if (running) {
    if (raf) cancelAnimationFrame(raf);
    loop();
  }
}

async function start() {
  $("err").textContent = "";
  const devId = $("deviceSel") ? $("deviceSel").value : "mic_default";
  try {
    await connect(devId);
    if (devId && !devId.startsWith("asio_")) {
      await listDevices();
      updateAsioStatusBadge("web");
    } else {
      updateAsioStatusBadge("ok");
      closeAsioSmartPopover();
    }
    running = true;
    $("led").classList.add("on"); $("powerTxt").textContent = t("powerOn");
    $("startBtn").textContent = t("btnStop");
    $("startBtn").classList.add("danger");
    if (quizMode) {
      newQuiz();
    } else {
      $("prompt").textContent = (guideMode === "chord") ? t("promptChordHover") : t("promptPlay");
    }
    loop();
  } catch (e) {
    const isAsioChoice = (devId === "asio_ws" || (devId && devId.startsWith("asio_dev_")));
    if (isAsioChoice) {
      updateAsioStatusBadge("warn");
      stop();
      $("err").textContent = "";
      openAsioSmartPopover();
    } else {
      $("err").textContent = e.message;
      stop();
    }
  }
}

function stop() {
  running = false; if (raf) cancelAnimationFrame(raf);
  if (isRecording) {
    try { stopRecording(); } catch (e) { }
  }
  if (isScanning) {
    try { stopScan(); } catch (e) { }
  }
  if (source) {
    try { source.disconnect(); } catch (e) { }
    source = null;
  }
  if (analyser) {
    try { analyser.disconnect(); } catch (e) { }
    analyser = null;
  }
  if (stream) {
    stream.getTracks().forEach(tk => tk.stop());
    stream = null;
  }
  if (ws) {
    try { ws.close(); } catch (e) { }
    ws = null;
  }
  $("led").classList.remove("on"); $("powerTxt").textContent = t("powerOff");
  $("startBtn").textContent = t("btnStart");
  $("startBtn").classList.remove("danger");
  $("bigNote").textContent = "––"; litPcs = []; updateFretboardLit();
  updateTunerUI([]);
  updateHudArcGauge(0, true);
  refreshDynamic();
}

function refreshDynamic() {
  if ($("powerTxt")) $("powerTxt").textContent = running ? t("powerOn") : t("powerOff");
  if ($("startBtn")) {
    $("startBtn").textContent = running ? t("btnStop") : t("btnStart");
    $("startBtn").classList.toggle("danger", running);
  }
  if ($("modeSub")) {
    $("modeSub").textContent = appMode === "rhythm" ? t("subRhythm") : (quizMode ? t("subQuiz") : t("subPractice"));
  }
  if ($("btnRhythmToggle")) {
    $("btnRhythmToggle").textContent = isRhythmPlaying ? t("btnRhythmStop") : t("btnRhythmStart");
    $("btnRhythmToggle").classList.toggle("danger", isRhythmPlaying);
  }
  if (!isRhythmPlaying && $("rhythmJudgeBanner")) {
    $("rhythmJudgeBanner").textContent = t("rhythmReady");
  }
  if (isRhythmPlaying || appMode === "rhythm") {
    drawRhythmHighway(audioCtx ? audioCtx.currentTime : 0);
  }
}

// ---------- Practice Tools & Quiz ----------
function newQuiz() {
  lock = false; history = []; detectedPcs = [];
  const set = SCALES[scaleId];
  targetInterval = set[Math.floor(Math.random() * set.length)];

  if (guideMode === "chord") {
    const chordTypes = ["major", "minor", "dom7", "maj7", "min7"];
    const selectedType = chordTypes[Math.floor(Math.random() * chordTypes.length)];
    const targetRootPc = pc(rootPc + targetInterval);
    const rootName = NOTE[targetRootPc];
    const typeLabel = t("chord_" + selectedType);

    targetChordName = `${rootName} ${typeLabel}`;
    const chordIntervalsMap = {
      major: [0, 4, 7], minor: [0, 3, 7], dom7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10]
    };
    targetChordPcs = (chordIntervalsMap[selectedType] || [0, 4, 7]).map(i => pc(targetRootPc + i));
    updateChordQuizPrompt();
  } else {
    const targetNoteName = labelMode === "deg" ? DEG[targetInterval] : NOTE[pc(rootPc + targetInterval)];
    $("prompt").textContent = t("promptTarget") + " " + targetNoteName;
  }
  $("verdict").textContent = t("verdictWait"); $("verdict").className = "verdict wait";
}

function updateChordQuizPrompt() {
  const missingPcs = targetChordPcs.filter(p => !detectedPcs.includes(p));
  const missingNames = missingPcs.map(p => NOTE[p]).join(", ");
  if (missingPcs.length === 0) {
    $("prompt").textContent = `🎉 ${targetChordName} ${t("promptChordComplete")}`;
  } else {
    $("prompt").textContent = `${t("promptPlayChord")}: ${targetChordName} (${t("promptMissing")}: ${missingNames})`;
  }
}

function quizSolved() {
  lock = true; score++; streak++;
  $("scoreEl").textContent = score; $("streakEl").textContent = streak;
  $("verdict").textContent = t("verdictOk"); $("verdict").className = "verdict ok";
  setTimeout(() => { if (running && quizMode) newQuiz(); }, 900);
}

let masterSynthBus = null;
function getMasterSynthBus() {
  if (!masterSynthBus && audioCtx) {
    masterSynthBus = audioCtx.createGain();
    masterSynthBus.gain.setValueAtTime(1.0, audioCtx.currentTime);
    masterSynthBus.connect(audioCtx.destination);
  }
  return masterSynthBus || (audioCtx ? audioCtx.destination : null);
}

function playMidiNote(midi) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const freq = midiToFreq(midi);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);

  osc.connect(gain);
  const dest = getMasterSynthBus();
  if (dest) gain.connect(dest);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 1.2);

  osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { } };
}

function playJamSynthChord(rootPcVal, isMinor, durationSec = 2.0, time = (audioCtx ? audioCtx.currentTime : 0)) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const thirdInterval = isMinor ? 3 : 4;
  const chordNotes = [rootPcVal + 48, rootPcVal + thirdInterval + 48, rootPcVal + 7 + 48];
  const baseTime = Math.max(audioCtx.currentTime, time);

  chordNotes.forEach((midi, idx) => {
    const freq = midiToFreq(midi);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, baseTime);

    const startTime = baseTime + (idx * 0.03);
    const stopTime = startTime + durationSec;

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc.connect(gain);
    const dest = getMasterSynthBus();
    if (dest) gain.connect(dest);

    osc.start(startTime);
    osc.stop(stopTime);

    osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { } };
  });
}

function playMetronomeClick(accentLevel, time = (audioCtx ? audioCtx.currentTime : 0)) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  // accentLevel: true/2 = Downbeat (강박), 1 = Sub-accent (중강박, e.g. 4th pulse in 6/8 or 3rd beat in 4/4), false/0 = Weak pulse (약박)
  const level = (accentLevel === true) ? 2 : (accentLevel === false ? 0 : (accentLevel || 0));
  const freq = level === 2 ? 1320 : (level === 1 ? 980 : 740);
  const peakGain = level === 2 ? 0.35 : (level === 1 ? 0.25 : 0.16);
  const clickTime = Math.max(audioCtx.currentTime, time);
  osc.frequency.setValueAtTime(freq, clickTime);

  gain.gain.setValueAtTime(peakGain, clickTime);
  gain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.05);

  osc.connect(gain);
  const dest = getMasterSynthBus();
  if (dest) gain.connect(dest);

  osc.start(clickTime);
  osc.stop(clickTime + 0.05);

  osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) { } };
}

function startScan() {
  if (isScanning) return;
  isScanning = true;
  scanTimeElapsed = 0;
  scanChromaHistory = Array(12).fill(0);

  $("btnScanStart").style.display = "none";
  $("btnScanStop").style.display = "inline-block";
  $("scanProgress").style.display = "block";
  $("scanBar").style.width = "0%";
  $("scanResults").innerHTML = `<div style="text-align:center; padding:12px; color:var(--sub);">${t("scanListening")}</div>`;

  scanInterval = setInterval(() => {
    scanTimeElapsed += 200;
    const pct = Math.min(100, (scanTimeElapsed / scanDuration) * 100);
    $("scanBar").style.width = pct + "%";

    if (scanTimeElapsed >= scanDuration) {
      finishScan();
    }
  }, 200);
}

function stopScan() {
  if (!isScanning) return;
  isScanning = false;
  if (scanInterval) clearInterval(scanInterval);
  scanInterval = null;
  $("btnScanStart").style.display = "inline-block";
  $("btnScanStop").style.display = "none";
  $("scanProgress").style.display = "none";
}

function finishScan() {
  stopScan();
  const sumHist = scanChromaHistory.reduce((a, b) => a + b, 0);
  if (sumHist === 0) {
    $("scanResults").innerHTML = `<div style="text-align:center; padding:12px; color:var(--sub);">${t("scanNoNotes")}</div>`;
    return;
  }

  const normHist = scanChromaHistory.map(v => v / sumHist);
  const candidates = [];

  SCALE_IDS.forEach(sId => {
    const scaleTmpl = SCALES[sId];
    for (let r = 0; r < 12; r++) {
      const vec = Array(12).fill(0);
      scaleTmpl.forEach(interval => { vec[(r + interval) % 12] = 1.0; });

      let dot = 0, normVec = 0, normHistSq = 0;
      for (let i = 0; i < 12; i++) {
        dot += normHist[i] * vec[i];
        normVec += vec[i] * vec[i];
        normHistSq += normHist[i] * normHist[i];
      }

      const sim = (normVec > 0 && normHistSq > 0) ? (dot / (Math.sqrt(normVec) * Math.sqrt(normHistSq))) : 0;
      candidates.push({ rootPc: r, scaleId: sId, score: sim });
    }
  });

  candidates.sort((a, b) => b.score - a.score);
  const topResults = candidates.slice(0, 5);

  let html = `<div style="margin-bottom:8px; font-weight:bold; font-size:12px; color:var(--tone);">${t("scanTopMatches")}:</div>`;
  topResults.forEach((res, idx) => {
    const rootName = NOTE[res.rootPc];
    const scaleName = t("scale_" + res.scaleId);
    const scorePct = Math.round(res.score * 100);
    html += `
      <div class="scan-result-item" data-root="${res.rootPc}" data-scale="${res.scaleId}" style="display:flex; justify-content: space-between; align-items:center; padding:8px 12px; margin-bottom:6px; background:var(--bg); border:1px solid #334155; border-radius:6px; cursor:pointer;">
        <div><span style="font-weight:bold; font-size:13px; color:#ffffff;">${idx + 1}. ${rootName} ${scaleName}</span></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:12px; color:var(--ok); font-weight:bold;">${scorePct}%</span>
          <span style="font-size:11px; padding:2px 6px; background:var(--tone); color:#0f172a; border-radius:4px; font-weight:bold;">${t("scanApply")}</span>
        </div>
      </div>
    `;
  });

  $("scanResults").innerHTML = html;

  document.querySelectorAll(".scan-result-item").forEach(el => {
    el.onclick = () => {
      const r = parseInt(el.getAttribute("data-root"), 10);
      const s = el.getAttribute("data-scale");
      rootPc = r; scaleId = s;
      $("keySel").value = r; $("scaleSel").value = s;
      drawFB();
      if (quizMode) newQuiz();
    };
  });
}

let nextJamTime = 0;

function startJamTrack() {
  if (isJamPlaying) return;
  ensureAudioCtx();
  isJamPlaying = true;
  jamBarIndex = 0;
  nextJamTime = audioCtx.currentTime + 0.05;
  $("btnJam").textContent = t("btnJamStop");
  $("btnJam").className = "btn-primary-action danger";
  stepJamTrack();
}

function stopJamTrack() {
  isJamPlaying = false;
  if (jamTimer) clearTimeout(jamTimer);
  jamTimer = null;
  jamTargetChordPcs = [];
  $("btnJam").textContent = t("btnJamPlay");
  $("btnJam").className = "btn-primary-action";
  $("jamCurrentChord").textContent = "––";
  const prog = JAM_PROGRESSIONS[jamProgressionKey] || JAM_PROGRESSIONS.pop;
  if ($("jamBarCounter")) $("jamBarCounter").textContent = `${t("lblBar")} 1/${prog.length}`;
  drawFB();
}

function stepJamTrack() {
  if (!isJamPlaying) return;
  ensureAudioCtx();

  const prog = JAM_PROGRESSIONS[jamProgressionKey] || JAM_PROGRESSIONS.pop;
  const barIdxInProg = jamBarIndex % prog.length;
  const chordItem = prog[barIdxInProg];
  const degreeOffset = chordItem.deg;
  const isMinorChord = chordItem.isMinor;

  const currentChordRootPc = pc(rootPc + degreeOffset);
  const thirdInterval = isMinorChord ? 3 : 4;
  jamTargetChordPcs = [currentChordRootPc, pc(currentChordRootPc + thirdInterval), pc(currentChordRootPc + 7)];

  const chordName = `${NOTE[currentChordRootPc]} ${isMinorChord ? "m" : "Maj"}`;
  $("jamCurrentChord").textContent = chordName;
  if ($("jamBarCounter")) $("jamBarCounter").textContent = `${t("lblBar")} ${barIdxInProg + 1}/${prog.length}`;

  const barDurationSec = (60 / jamBpm) * 4;
  playJamSynthChord(currentChordRootPc, isMinorChord, barDurationSec, nextJamTime);
  drawFB();

  jamBarIndex++;
  nextJamTime += barDurationSec;
  const delayMs = Math.max(25, (nextJamTime - audioCtx.currentTime - 0.05) * 1000);
  jamTimer = setTimeout(stepJamTrack, delayMs);
}

let nextMetroTime = 0;

function startMetronome() {
  if (isMetroPlaying) return;
  ensureAudioCtx();
  isMetroPlaying = true;
  metroBeatCount = 0;
  metroBarCount = 0;
  nextMetroTime = audioCtx.currentTime + 0.05;
  $("btnMetro").textContent = t("btnMetroStop");
  $("btnMetro").className = "btn-primary-action danger";
  stepMetronome();
}

function stopMetronome() {
  isMetroPlaying = false;
  if (metroTimer) clearTimeout(metroTimer);
  metroTimer = null;
  $("btnMetro").textContent = t("btnMetroStart");
  $("btnMetro").className = "btn-primary-action";
  document.querySelectorAll(".metro-dot").forEach(d => d.className = "metro-dot");
}

function stepMetronome() {
  if (!isMetroPlaying) return;
  ensureAudioCtx();

  const currentBeatInBar = metroBeatCount % 4;
  const isDownbeat = (currentBeatInBar === 0);

  playMetronomeClick(isDownbeat, nextMetroTime);

  const dots = document.querySelectorAll(".metro-dot");
  dots.forEach((d, idx) => {
    if (idx === currentBeatInBar) {
      d.className = isDownbeat ? "metro-dot active downbeat" : "metro-dot active";
    } else {
      d.className = "metro-dot";
    }
  });

  metroBeatCount++;
  if (currentBeatInBar === 3) {
    metroBarCount++;
    if (isAutoSpeedUp && metroBarCount % 4 === 0) {
      metroBpm = Math.min(240, metroBpm + 5);
      $("metroBpm").value = metroBpm;
      $("metroBpmVal").textContent = metroBpm;
    }
  }

  const intervalSec = 60 / metroBpm;
  nextMetroTime += intervalSec;
  const delayMs = Math.max(15, (nextMetroTime - audioCtx.currentTime - 0.02) * 1000);
  metroTimer = setTimeout(stepMetronome, delayMs);
}

function rebuildScaleSel() {
  const sel = $("scaleSel"); if (!sel) return;
  sel.innerHTML = "";
  SCALE_IDS.forEach(id => {
    const o = document.createElement("option");
    o.value = id; o.textContent = t("scale_" + id);
    sel.appendChild(o);
  });
  sel.value = scaleId;
}

function rebuildTuningSel() {
  const sel = $("tuningSel"); if (!sel) return;
  sel.innerHTML = "";
  const tDict = getTuningsForInstrument();
  Object.keys(tDict).forEach(id => {
    const o = document.createElement("option");
    o.value = id; o.textContent = t("tuning_" + id);
    sel.appendChild(o);
  });
  if (!tDict[currentTuningId]) {
    currentTuningId = Object.keys(tDict)[0];
  }
  sel.value = currentTuningId;
}

function setInstrument(instr) {
  currentInstrument = instr;
  const tDict = getTuningsForInstrument();
  currentTuningId = Object.keys(tDict)[0];
  strings = [...tDict[currentTuningId]];

  if (analyser) {
    analyser.fftSize = (currentInstrument === "bass") ? 4096 : 2048;
    buf = new Float32Array(analyser.fftSize);
  }

  const accTunerTitle = document.querySelector("#accItemTuner .acc-title");
  if (accTunerTitle) {
    accTunerTitle.textContent = (currentInstrument === "bass") ? t("accTunerBass") : t("accTuner");
  }

  const bassBox = $("bassGrooveHintBox");
  if (bassBox) {
    bassBox.style.display = (currentInstrument === "bass") ? "block" : "none";
  }

  rebuildTuningSel();
  rebuildCustomTuningUI();
  rebuildTunerUI();
  drawFB();
}

// ---------- 3-Tier Recording Studio & Smart Replay Engine ----------
let isRecording = false;
let recStartTime = 0;
let recTimerInterval = null;
let mediaRecorder = null;
let recDestNode = null;
let recordedAudioChunks = [];
let recordedAudioBlob = null;
let recordedAudioUrl = null;
let recordingTimeline = [];
let replayRaf = null;

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = buffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

let activeRecMode = "browser";

function startRecording() {
  activeRecMode = $("recModeSel") ? $("recModeSel").value : "browser";
  const shouldMix = $("recMixCheck") ? $("recMixCheck").checked : true;

  isRecording = true;
  recStartTime = Date.now();
  recordingTimeline = [];

  const btn = $("btnRecordToggle");
  if (btn) btn.classList.add("recording");
  if ($("btnRecordTxt")) $("btnRecordTxt").textContent = t("btnRecStop");
  const timerBadge = $("recTimerBadge");
  if (timerBadge) timerBadge.style.display = "inline-flex";
  if ($("recTimerTxt")) $("recTimerTxt").textContent = "00:00";
  if ($("asioRecNotice")) $("asioRecNotice").style.display = "none";
  if ($("recResultsSection")) $("recResultsSection").style.display = "none";

  recTimerInterval = setInterval(() => {
    const elapsedSec = Math.floor((Date.now() - recStartTime) / 1000);
    const mins = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
    const secs = String(elapsedSec % 60).padStart(2, "0");
    if ($("recTimerTxt")) $("recTimerTxt").textContent = `${mins}:${secs}`;
  }, 500);

  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "set_browser_recording", enabled: true }));
      if (activeRecMode === "asio") {
        ws.send(JSON.stringify({ type: "start_asio_recording" }));
      }
    } catch (e) { }
  }

  try {
    ensureAudioCtx();
    recDestNode = audioCtx.createMediaStreamDestination();

    if (source) {
      try { source.connect(recDestNode); } catch (e) { }
    }
    if (shouldMix) {
      const bus = getMasterSynthBus();
      if (bus) {
        try { bus.connect(recDestNode); } catch (e) { }
      }
    }

    recordedAudioChunks = [];
    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : {};
    mediaRecorder = new MediaRecorder(recDestNode.stream, options);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedAudioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (recordedAudioChunks.length === 0) {
        finishRecordingAnalysis();
        return;
      }
      const rawBlob = new Blob(recordedAudioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      try {
        const arrayBuf = await rawBlob.arrayBuffer();
        const audioBuf = await audioCtx.decodeAudioData(arrayBuf);
        recordedAudioBlob = audioBufferToWav(audioBuf);
      } catch (e) {
        recordedAudioBlob = rawBlob;
      }

      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
      recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);

      const player = $("recAudioPlayer");
      if (player) {
        player.src = recordedAudioUrl;
        player.load();
      }

      finishRecordingAnalysis();
    };

    mediaRecorder.start(200);
  } catch (err) {
    console.error("Failed to start MediaRecorder:", err);
    $("err").textContent = `${t("errRecStartFailed")}${err.message}`;
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  if (recTimerInterval) {
    clearInterval(recTimerInterval);
    recTimerInterval = null;
  }

  const btn = $("btnRecordToggle");
  if (btn) btn.classList.remove("recording");
  if ($("btnRecordTxt")) $("btnRecordTxt").textContent = t("btnRecStart");
  const timerBadge = $("recTimerBadge");
  if (timerBadge) timerBadge.style.display = "none";

  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "set_browser_recording", enabled: false }));
      if (activeRecMode === "asio") {
        ws.send(JSON.stringify({ type: "stop_asio_recording" }));
      }
    } catch (e) { }
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch (e) { finishRecordingAnalysis(); }
  } else {
    finishRecordingAnalysis();
  }
  if (recDestNode) {
    if (source) { try { source.disconnect(recDestNode); } catch (e) { } }
    const bus = getMasterSynthBus();
    if (bus) { try { bus.disconnect(recDestNode); } catch (e) { } }
    recDestNode = null;
  }
}

function finishRecordingAnalysis() {
  if ($("recResultsSection")) $("recResultsSection").style.display = "flex";

  let totalNotes = 0;
  let inScaleCount = 0;
  let totalCentsAbs = 0;

  let lastMidi = null;
  for (let i = 0; i < recordingTimeline.length; i++) {
    const ev = recordingTimeline[i];
    if (ev.midi !== lastMidi) {
      totalNotes++;
      if (ev.inScale) inScaleCount++;
      totalCentsAbs += Math.abs(ev.cents);
      lastMidi = ev.midi;
    }
  }

  const accuracyPct = totalNotes > 0 ? Math.round((inScaleCount / totalNotes) * 100) : 100;
  const avgCents = totalNotes > 0 ? (totalCentsAbs / totalNotes) : 0;
  const stabilityPct = Math.max(0, Math.min(100, Math.round(100 - avgCents * 2.5)));

  if ($("repTotalNotes")) $("repTotalNotes").textContent = totalNotes;
  if ($("repAccuracy")) {
    $("repAccuracy").textContent = `${accuracyPct}%`;
    $("repAccuracy").className = `stat-val ${accuracyPct >= 80 ? "ok" : "tone"}`;
  }
  if ($("repStability")) {
    $("repStability").textContent = `${stabilityPct}%`;
    $("repStability").className = `stat-val ${stabilityPct >= 80 ? "ok" : "tone"}`;
  }
}

function startSyncReplay() {
  const player = $("recAudioPlayer");
  if (!player || !player.src) return;

  if (replayRaf) {
    cancelAnimationFrame(replayRaf);
    replayRaf = null;
  }

  player.currentTime = 0;
  player.play();

  const v = $("verdict");
  function syncTick() {
    if (player.paused || player.ended) {
      litPcs = [];
      updateFretboardLit();
      $("needle").style.left = "50%";
      return;
    }

    const currentT = player.currentTime;
    let currentEvent = null;
    let lo = 0, hi = recordingTimeline.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (recordingTimeline[mid].t <= currentT) {
        currentEvent = recordingTimeline[mid];
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (currentEvent && (currentT - currentEvent.t >= 0.25)) {
      currentEvent = null;
    }

    if (currentEvent) {
      litPcs = currentEvent.midis ? currentEvent.midis.map(m => pc(m)) : [pc(currentEvent.midi)];
      updateFretboardLit();
      $("bigNote").textContent = currentEvent.note;
      $("degTxt").textContent = currentEvent.deg ? `${t("degPrefix")}${currentEvent.deg}` : "";
      $("needle").style.left = `${50 + Math.max(-50, Math.min(50, currentEvent.cents))}%`;
      if (v) {
        v.textContent = currentEvent.inScale ? t("verdictInScale") : t("verdictOutScale");
        v.className = `verdict ${currentEvent.inScale ? "ok" : "no"}`;
      }
    } else {
      litPcs = [];
      updateFretboardLit();
      $("needle").style.left = "50%";
    }

    replayRaf = requestAnimationFrame(syncTick);
  }

  player.onended = () => {
    litPcs = [];
    updateFretboardLit();
    if ($("bigNote")) $("bigNote").textContent = "––";
    if ($("degTxt")) $("degTxt").textContent = "";
    if ($("needle")) $("needle").style.left = "50%";
    if (v) {
      v.textContent = t("verdictIdle");
      v.className = "verdict idle";
    }
  };

  syncTick();
}

function buildKeySel() {
  const sel = $("keySel"); if (!sel) return;
  sel.innerHTML = "";
  NOTE.forEach((n, i) => {
    const o = document.createElement("option");
    o.value = i; o.textContent = n;
    sel.appendChild(o);
  });
  sel.value = rootPc;
}

function updateToggleVisuals(toggleEl, isRightActive, leftLabelId, rightLabelId) {
  if (!toggleEl) return;
  toggleEl.classList.toggle("active-right", isRightActive);
  const leftL = $(leftLabelId);
  const rightL = $(rightLabelId);
  if (leftL) leftL.classList.toggle("active", !isRightActive);
  if (rightL) rightL.classList.toggle("active", isRightActive);
}

function updateThreeWayToggleVisuals(toggleEl, posIdx, btnIds) {
  if (!toggleEl) return;
  toggleEl.classList.remove("pos-0", "pos-1", "pos-2");
  toggleEl.classList.add(`pos-${posIdx}`);
  btnIds.forEach((id, idx) => {
    const el = $(id);
    if (el) el.classList.toggle("active", idx === posIdx);
  });
}

function setAppMode(nextMode) {
  appMode = nextMode;
  quizMode = (appMode === "quiz");
  const modeT = $("modeToggle");
  const modeIdx = appMode === "practice" ? 0 : (appMode === "quiz" ? 1 : 2);
  updateThreeWayToggleVisuals(modeT, modeIdx, ["togglePractice", "toggleQuiz", "toggleRhythm"]);

  const quizStatsPill = $("quizStatsPill");
  if (quizStatsPill) quizStatsPill.style.display = quizMode ? "flex" : "none";

  const rhythmPanel = $("rhythmGamePanel");
  if (rhythmPanel) rhythmPanel.style.display = (appMode === "rhythm") ? "flex" : "none";

  if (appMode !== "rhythm" && isRhythmPlaying) {
    stopRhythmGame();
  }

  refreshDynamic();
  drawFB();
  if (appMode === "rhythm") {
    drawRhythmHighway(0);
  }

  if (!running) return;
  if (quizMode) newQuiz();
  else if ($("prompt")) $("prompt").textContent = (guideMode === "chord") ? t("promptChordHover") : t("promptPlay");
}

function setLabelMode(nextLabelMode) {
  labelMode = nextLabelMode;
  const labelT = $("labelToggle");
  const lblIdx = labelMode === "name" ? 0 : (labelMode === "deg" ? 1 : 2);
  updateThreeWayToggleVisuals(labelT, lblIdx, ["toggleName", "toggleDeg", "toggleFinger"]);
  drawFB();
  if (appMode === "rhythm") {
    drawRhythmHighway(isRhythmPlaying && audioCtx ? (audioCtx.currentTime - rhythmStartTime) : 0);
  }
}

function initSlideToggles() {
  const modeT = $("modeToggle");
  if (modeT) {
    const modeIdx = appMode === "practice" ? 0 : (appMode === "quiz" ? 1 : 2);
    updateThreeWayToggleVisuals(modeT, modeIdx, ["togglePractice", "toggleQuiz", "toggleRhythm"]);
    const quizStatsPill = $("quizStatsPill");
    if (quizStatsPill) quizStatsPill.style.display = quizMode ? "flex" : "none";

    modeT.onclick = (e) => {
      const btn = e.target.closest(".chip-btn");
      if (btn && btn.id === "togglePractice") setAppMode("practice");
      else if (btn && btn.id === "toggleQuiz") setAppMode("quiz");
      else if (btn && btn.id === "toggleRhythm") setAppMode("rhythm");
      else {
        const next = appMode === "practice" ? "quiz" : (appMode === "quiz" ? "rhythm" : "practice");
        setAppMode(next);
      }
    };
  }

  const guideT = $("guideToggle");
  if (guideT) {
    updateToggleVisuals(guideT, guideMode === "chord", "toggleScale", "toggleChord");
    guideT.onclick = () => {
      guideMode = (guideMode === "scale") ? "chord" : "scale";
      updateToggleVisuals(guideT, guideMode === "chord", "toggleScale", "toggleChord");

      const scaleField = $("scaleField");
      if (scaleField) scaleField.style.display = (guideMode === "chord") ? "none" : "block";
      const chordTypeField = $("chordTypeField");
      if (chordTypeField) chordTypeField.style.display = (guideMode === "chord") ? "block" : "none";
      const voicingField = $("voicingField");
      if (voicingField) voicingField.style.display = (guideMode === "chord") ? "block" : "none";

      refreshDynamic();
      rebuildVoicingSel();
      drawFB();
      if (running && quizMode) newQuiz();
    };
  }

  const labelT = $("labelToggle");
  if (labelT) {
    const lblIdx = labelMode === "name" ? 0 : (labelMode === "deg" ? 1 : 2);
    updateThreeWayToggleVisuals(labelT, lblIdx, ["toggleName", "toggleDeg", "toggleFinger"]);
    labelT.onclick = (e) => {
      const btn = e.target.closest(".chip-btn");
      if (btn && btn.id === "toggleName") setLabelMode("name");
      else if (btn && btn.id === "toggleDeg") setLabelMode("deg");
      else if (btn && btn.id === "toggleFinger") setLabelMode("finger");
      else {
        const next = labelMode === "name" ? "deg" : (labelMode === "deg" ? "finger" : "name");
        setLabelMode(next);
      }
    };
  }

  const handT = $("handToggle");
  if (handT) {
    updateToggleVisuals(handT, isLeftHand, "toggleLeft", "toggleRight");
    handT.onclick = () => {
      isLeftHand = !isLeftHand;
      fbYawDeg = isLeftHand ? -Math.abs(fbYawDeg) : Math.abs(fbYawDeg);
      updateToggleVisuals(handT, isLeftHand, "toggleLeft", "toggleRight");
      updateCam3dUI();
      drawFB();
    };
  }
}

function initAccordions() {
  const btnToggleSettings = $("btnToggleSettings");
  const sideDrawer = $("sideDrawer");
  const sideDrawerBackdrop = $("sideDrawerBackdrop");
  const btnCloseDrawer = $("btnCloseDrawer");

  const openDrawer = () => {
    if (sideDrawer) sideDrawer.classList.add("open");
    if (sideDrawerBackdrop) sideDrawerBackdrop.classList.add("open");
  };

  const closeDrawer = () => {
    if (sideDrawer) sideDrawer.classList.remove("open");
    if (sideDrawerBackdrop) sideDrawerBackdrop.classList.remove("open");
  };

  if (btnToggleSettings) {
    btnToggleSettings.onclick = () => {
      if (sideDrawer && sideDrawer.classList.contains("open")) {
        closeDrawer();
      } else {
        openDrawer();
      }
    };
  }

  if (btnCloseDrawer) btnCloseDrawer.onclick = closeDrawer;
  if (sideDrawerBackdrop) sideDrawerBackdrop.onclick = closeDrawer;

  const headers = document.querySelectorAll(".accordion-header");
  headers.forEach(header => {
    header.onclick = () => {
      const item = header.closest(".accordion-item");
      if (item) {
        item.classList.toggle("expanded");
      }
    };
  });
}

function getChordPcs(rootPc, chordTypeVal) {
  const chordIntervalsMap = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dom7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10]
  };
  const intervals = chordIntervalsMap[chordTypeVal] || chordIntervalsMap.major;
  return intervals.map(i => pc(rootPc + i));
}

function getChordVoicings(rootPc, chordTypeVal) {
  const voicingsMap = {
    major: [
      { name: "CAGED - E Shape", baseRoot: 4, frets: [0, 0, 1, 2, 2, 0], openFingers: [0, 0, 1, 3, 2, 0], barreFingers: [1, 1, 2, 4, 3, 1] },
      { name: "CAGED - A Shape", baseRoot: 9, frets: [0, 2, 2, 2, 0, null], openFingers: [0, 3, 2, 1, 0, null], barreFingers: [1, 4, 3, 2, 1, null] },
      { name: "CAGED - C Shape", baseRoot: 0, frets: [0, 1, 0, 2, 3, null], openFingers: [0, 1, 0, 2, 3, null], barreFingers: [1, 2, 1, 3, 4, null] },
      { name: "CAGED - D Shape", baseRoot: 2, frets: [2, 3, 2, 0, null, null], openFingers: [2, 3, 1, 0, null, null], barreFingers: [3, 4, 2, 1, null, null] }
    ],
    minor: [
      { name: "E Minor Shape", baseRoot: 4, frets: [0, 0, 0, 2, 2, 0], openFingers: [0, 0, 0, 3, 2, 0], barreFingers: [1, 1, 1, 4, 3, 1] },
      { name: "A Minor Shape", baseRoot: 9, frets: [0, 1, 2, 2, 0, null], openFingers: [0, 1, 3, 2, 0, null], barreFingers: [1, 2, 4, 3, 1, null] },
      { name: "D Minor Shape", baseRoot: 2, frets: [1, 3, 2, 0, null, null], openFingers: [1, 3, 2, 0, null, null], barreFingers: [2, 4, 3, 1, null, null] }
    ],
    dom7: [
      { name: "E7 Shape", baseRoot: 4, frets: [0, 3, 1, 0, 2, 0], openFingers: [0, 4, 1, 0, 2, 0], barreFingers: [1, 4, 2, 1, 3, 1] },
      { name: "A7 Shape", baseRoot: 9, frets: [0, 2, 0, 2, 0, null], openFingers: [0, 3, 0, 2, 0, null], barreFingers: [1, 4, 1, 3, 1, null] }
    ],
    maj7: [
      { name: "EMaj7 Shape", baseRoot: 4, frets: [0, 0, 1, 1, 2, 0], openFingers: [0, 0, 2, 1, 3, 0], barreFingers: [1, 1, 3, 2, 4, 1] },
      { name: "AMaj7 Shape", baseRoot: 9, frets: [0, 2, 1, 2, 0, null], openFingers: [0, 3, 1, 2, 0, null], barreFingers: [1, 4, 2, 3, 1, null] }
    ],
    min7: [
      { name: "Em7 Shape", baseRoot: 4, frets: [0, 3, 0, 0, 2, 0], openFingers: [0, 4, 0, 0, 2, 0], barreFingers: [1, 4, 1, 1, 3, 1] },
      { name: "Am7 Shape", baseRoot: 9, frets: [0, 1, 0, 2, 0, null], openFingers: [0, 1, 0, 2, 0, null], barreFingers: [1, 2, 1, 3, 1, null] }
    ]
  };

  const list = voicingsMap[chordTypeVal] || voicingsMap.major;
  return list.map(v => {
    const offset = pc(rootPc - v.baseRoot);
    let shiftedFrets = v.frets.map(f => (f !== null ? f + offset : null));

    const validF = shiftedFrets.filter(f => f !== null);
    let finalMinF = 0;
    if (validF.length > 0) {
      const maxF = Math.max(...validF);
      const minF = Math.min(...validF);
      if (maxF > 14) {
        shiftedFrets = shiftedFrets.map(f => (f !== null ? f - 12 : null));
      } else if (minF < 0) {
        shiftedFrets = shiftedFrets.map(f => (f !== null ? f + 12 : null));
      }
      finalMinF = Math.min(...shiftedFrets.filter(f => f !== null));
    }

    const fingers = (finalMinF === 0 ? v.openFingers : v.barreFingers) || [];
    return { name: v.name, frets: shiftedFrets, fingers: [...fingers] };
  });
}

function rebuildVoicingSel() {
  const sel = $("voicingSel");
  if (!sel) return;
  sel.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = `⭐ ${t("optAllChordTones")}`;
  sel.appendChild(allOpt);

  if (currentInstrument === "bass") {
    sel.value = "all";
    voicingMode = false;
    currentVoicing = null;
    sel.disabled = true;
    return;
  }
  sel.disabled = false;

  currentVoicingsList = getChordVoicings(rootPc, chordTypeVal);
  currentVoicingsList.forEach((v, idx) => {
    const o = document.createElement("option");
    o.value = idx;
    o.textContent = v.name;
    sel.appendChild(o);
  });

  if (voicingMode && currentVoicingIdx < currentVoicingsList.length) {
    sel.value = currentVoicingIdx;
  } else {
    sel.value = "all";
    voicingMode = false;
    currentVoicing = null;
  }
}

function updateVoicingGuide() {
  currentVoicingsList = getChordVoicings(rootPc, chordTypeVal);
  if (currentVoicingsList.length === 0) return;
  if (currentVoicingIdx >= currentVoicingsList.length) currentVoicingIdx = 0;
  currentVoicing = currentVoicingsList[currentVoicingIdx];

  const rootName = NOTE[rootPc];
  const chordName = `${rootName} ${t("chord_" + chordTypeVal)}`;

  const titleEl = $("voicingTitle");
  const countEl = $("voicingCount");
  if (titleEl) titleEl.textContent = `${chordName} - ${currentVoicing.name}`;
  if (countEl) countEl.textContent = `(${currentVoicingIdx + 1} / ${currentVoicingsList.length})`;

  drawFB();
}

// ---------- Rhythm Game & Smart Fingering Trainer Engine ----------
function getRhythmMeterInfo(meterId = rhythmMeterId) {
  const qSec = 60 / rhythmBpm;
  switch (meterId) {
    case "3_4":
      return { num: 3, den: 4, pulsesPerBar: 3, countInPulses: 3, pulseSec: qSec, subAccents: [] };
    case "6_8":
      // 6 eighth-note pulses per bar (3 + 3: 강-약-약 중강-약-약)
      return { num: 6, den: 8, pulsesPerBar: 6, countInPulses: 6, pulseSec: qSec * 0.5, subAccents: [3] };
    case "12_8":
      // 12 eighth-note pulses per bar (3 + 3 + 3 + 3: 강-약-약 중강-약-약 중강-약-약 중강-약-약)
      return { num: 12, den: 8, pulsesPerBar: 12, countInPulses: 6, pulseSec: qSec * 0.5, subAccents: [3, 6, 9] };
    case "2_4":
      return { num: 2, den: 4, pulsesPerBar: 2, countInPulses: 4, pulseSec: qSec, subAccents: [] };
    case "5_4":
      return { num: 5, den: 4, pulsesPerBar: 5, countInPulses: 5, pulseSec: qSec, subAccents: [3] };
    case "7_8":
      return { num: 7, den: 8, pulsesPerBar: 7, countInPulses: 7, pulseSec: qSec * 0.5, subAccents: [2, 4] };
    case "4_4":
    default:
      return { num: 4, den: 4, pulsesPerBar: 4, countInPulses: 4, pulseSec: qSec, subAccents: [2] };
  }
}

function setActiveFingerPill(fingerIdx) {
  document.querySelectorAll("#fingerGuideBar .finger-pill").forEach(pill => {
    const f = parseInt(pill.getAttribute("data-finger"), 10);
    pill.classList.toggle("active", fingerIdx === f);
  });
}

function showRhythmJudgment(tier, offsetMs = null) {
  const banner = $("rhythmJudgeBanner");
  if (!banner) return;

  banner.classList.remove("perfect", "great", "good", "miss");
  if (!tier) {
    banner.textContent = t("rhythmReady");
    return;
  }

  banner.classList.add(tier);
  let label = "";
  if (tier === "perfect") label = t("judgePerfect");
  else if (tier === "great") label = t("judgeGreat");
  else if (tier === "good") label = t("judgeGood");
  else if (tier === "miss") label = t("judgeMiss");

  if (offsetMs !== null && tier !== "miss") {
    const sign = offsetMs > 0 ? "+" : "";
    const tag = offsetMs < -8 ? t("rhythmEarly") : (offsetMs > 8 ? t("rhythmLate") : "EXACT");
    banner.textContent = `${label}  ${sign}${offsetMs}ms (${tag})`;
  } else {
    banner.textContent = label;
  }
}

function buildRhythmCandidatePool() {
  const numStrings = strings.length;
  const isChordMode = (guideMode === "chord");
  const chordPcs = isChordMode ? getChordPcs(rootPc, chordTypeVal) : [rootPc, pc(rootPc + ( isCurrentModeMinor() ? 3 : 4 )), pc(rootPc + 7)];

  // 1. If an explicit CAGED Chord Voicing is selected, use its exact fretted strings (from lowest pitch string to highest)
  if (isChordMode && voicingMode && currentVoicing && currentInstrument !== "bass") {
    const vPool = [];
    for (let s = numStrings - 1; s >= 0; s--) {
      const f = currentVoicing.frets[s];
      if (f !== null && f !== undefined) {
        const midi = strings[s] + f;
        const notePc = pc(midi);
        const interval = pc(midi - rootPc);
        const finger = (currentVoicing.fingers && currentVoicing.fingers[s] !== null)
          ? currentVoicing.fingers[s]
          : getRecommendedFinger(s, f, rhythmBoxId);
        vPool.push({
          s, fret: f, midi, pc: notePc, deg: DEG[interval],
          finger, isRoot: notePc === rootPc, isChordTone: true
        });
      }
    }
    if (vPool.length > 0) return vPool;
  }

  // 2. Build pool inside the selected Fret Box [minF, maxF] from lowest string (6th/4th) to highest string (1st)
  let [minF, maxF] = getFretBoxRange(rhythmBoxId);
  const collectInRange = (lo, hi) => {
    const pool = [];
    for (let s = numStrings - 1; s >= 0; s--) {
      const openMidi = strings[s];
      for (let f = lo; f <= hi; f++) {
        const midi = openMidi + f;
        const notePc = pc(midi);
        const ok = isChordMode ? chordPcs.includes(notePc) : inScale(midi);
        if (!ok) continue;
        const interval = pc(midi - rootPc);
        const finger = getRecommendedFinger(s, f, rhythmBoxId);
        pool.push({
          s, fret: f, midi, pc: notePc, deg: DEG[interval],
          finger, isRoot: notePc === rootPc, isChordTone: chordPcs.includes(notePc)
        });
      }
    }
    return pool;
  };

  let pool = collectInRange(minF, maxF);
  if (pool.length < 3) {
    pool = collectInRange(0, 12);
  }
  return pool;
}

function generateRhythmChart() {
  const pool = buildRhythmCandidatePool();
  if (pool.length === 0) return [];

  const chosenNotes = [];
  const N = pool.length;

  if (rhythmDrillId === "run") {
    // Ascending & Descending Scale/Voicing Walk
    let idx = 0;
    let dir = 1;
    for (let i = 0; i < rhythmNoteCount; i++) {
      chosenNotes.push(pool[idx]);
      if (N > 1) {
        if (idx + dir >= N) dir = -1;
        else if (idx + dir < 0) dir = 1;
        idx += dir;
      }
    }
  } else if (rhythmDrillId === "seq") {
    // 3-Note / Interval Sequence (1-2-3, 2-3-4, 3-4-5...)
    const pattern = [];
    if (N >= 3) {
      for (let base = 0; base <= N - 3; base++) {
        pattern.push(pool[base], pool[base + 1], pool[base + 2]);
      }
      for (let base = N - 1; base >= 2; base--) {
        pattern.push(pool[base], pool[base - 1], pool[base - 2]);
      }
    } else {
      pattern.push(...pool);
    }
    for (let i = 0; i < rhythmNoteCount; i++) {
      chosenNotes.push(pattern[i % pattern.length]);
    }
  } else if (rhythmDrillId === "chord") {
    // Root & Chord-Tone Arpeggio Target
    const chordPool = pool.filter(item => item.isChordTone);
    const activePool = chordPool.length >= 2 ? chordPool : pool;
    const roots = activePool.filter(item => item.isRoot);
    let idx = 0;
    let dir = 1;
    for (let i = 0; i < rhythmNoteCount; i++) {
      if (i % 4 === 0 && roots.length > 0) {
        chosenNotes.push(roots[(i / 4) % roots.length]);
      } else {
        chosenNotes.push(activePool[idx]);
        if (activePool.length > 1) {
          if (idx + dir >= activePool.length) dir = -1;
          else if (idx + dir < 0) dir = 1;
          idx += dir;
        }
      }
    }
  } else {
    // Random Fret Sight-Reading with ergonomic string-jump limit (<= 2 strings)
    let prev = pool[Math.floor(Math.random() * N)];
    for (let i = 0; i < rhythmNoteCount; i++) {
      chosenNotes.push(prev);
      const neighbors = pool.filter(c => Math.abs(c.s - prev.s) <= 2 && (c.s !== prev.s || c.fret !== prev.fret));
      const nextCandidates = neighbors.length > 0 ? neighbors : pool;
      prev = nextCandidates[Math.floor(Math.random() * nextCandidates.length)];
    }
  }

  // Assign beat positions according to subdivision grid
  const beatSec = 60 / rhythmBpm;
  const chart = [];
  let beatPos = 0;
  const SUBDIV_STEPS = {
    quarter: [1.0],
    eighth: [0.5],
    triplet: [1 / 3, 1 / 3, 1 / 3],
    sixteenth: [0.25],
    shuffle: [2 / 3, 1 / 3],
    dotted: [0.75, 0.25],
    gallop: [0.5, 0.25, 0.25],
    rev_gallop: [0.25, 0.25, 0.5],
    tresillo: [0.75, 0.75, 0.5],
    funk16: [0.25, 0.5, 0.25, 0.5, 0.5],
    riff: [1.0, 0.5, 0.5, 0.5, 1.0, 0.5],
    waltz: [1.0, 0.5, 0.5, 1.0]
  };
  const steps = SUBDIV_STEPS[rhythmSubdivId] || SUBDIV_STEPS.quarter;

  for (let i = 0; i < chosenNotes.length; i++) {
    const item = chosenNotes[i];
    chart.push({
      idx: i,
      beat: beatPos,
      t: beatPos * beatSec,
      s: item.s,
      fret: item.fret,
      midi: item.midi,
      pc: item.pc,
      deg: item.deg,
      finger: item.finger,
      isRoot: item.isRoot,
      status: "pending", // "pending" | "perfect" | "great" | "good" | "miss"
      hitOffsetMs: null
    });

    beatPos += steps[i % steps.length];
  }

  const meter = getRhythmMeterInfo();
  const totalSec = beatPos * beatSec;
  rhythmTotalBeats = Math.ceil(totalSec / meter.pulseSec) + 2;
  return chart;
}

function updateRhythmLiveStatsUI() {
  if ($("rhythmScoreVal")) $("rhythmScoreVal").textContent = rhythmScore;
  if ($("rhythmComboVal")) $("rhythmComboVal").textContent = rhythmCombo;

  const judgedCount = rhythmCounts.perfect + rhythmCounts.great + rhythmCounts.good + rhythmCounts.miss;
  let accPct = 100;
  if (judgedCount > 0) {
    const weighted = rhythmCounts.perfect * 1.0 + rhythmCounts.great * 0.8 + rhythmCounts.good * 0.5;
    accPct = Math.round((weighted / judgedCount) * 100);
  }
  if ($("rhythmAccVal")) $("rhythmAccVal").textContent = `${accPct}%`;

  const progressFill = $("rhythmProgressBar");
  if (progressFill && rhythmChart.length > 0) {
    const pct = Math.min(100, Math.round((judgedCount / rhythmChart.length) * 100));
    progressFill.style.width = `${pct}%`;
  }
}

function updateRhythmApproachRing(nowRel) {
  const ring = $("rhythmApproachRing");
  if (!ring) return;

  if (!isRhythmPlaying || !rhythmCurrentTarget) {
    ring.style.display = "none";
    return;
  }

  // Find corresponding SVG note dot coordinates
  const targetDot = fretboardNoteElements.find(g =>
    parseInt(g.getAttribute("data-str"), 10) === rhythmCurrentTarget.s &&
    parseInt(g.getAttribute("data-fret"), 10) === rhythmCurrentTarget.fret
  );

  if (!targetDot) {
    ring.style.display = "none";
    return;
  }

  const cx = parseFloat(targetDot.getAttribute("data-cx"));
  const cy = parseFloat(targetDot.getAttribute("data-cy"));
  const timeUntilHit = rhythmCurrentTarget.t - nowRel;
  const lookahead = 1.6;
  const clampedRatio = Math.max(0, Math.min(1, timeUntilHit / lookahead));
  const ryScale = (fretboardGeom && fretboardGeom.is3D)
    ? Math.max(0.45, Math.cos(fretboardGeom.tiltRad) * 0.84)
    : 1.0;
  const radius = 12 + clampedRatio * 20; // shrinks from 32px down to 12px at Hit time

  ring.setAttribute("cx", cx.toFixed(1));
  ring.setAttribute("cy", cy.toFixed(1));
  ring.setAttribute("rx", radius.toFixed(1));
  ring.setAttribute("ry", (radius * ryScale).toFixed(1));
  ring.setAttribute("stroke", FINGER_COLORS[rhythmCurrentTarget.finger] || "#38bdf8");
  ring.style.display = "block";
}

async function startRhythmGame() {
  ensureAudioCtx();
  if (!running) {
    try { await start(); } catch (e) { }
  }

  rhythmChart = generateRhythmChart();
  if (rhythmChart.length === 0) return;

  rhythmScore = 0;
  rhythmCombo = 0;
  rhythmMaxCombo = 0;
  rhythmCounts = { perfect: 0, great: 0, good: 0, miss: 0 };
  rhythmOffsets = [];
  rhythmParticles = [];
  rhythmLastHitTime = 0;
  rhythmLastHitMidi = -1;

  if ($("rhythmResultBox")) $("rhythmResultBox").style.display = "none";
  if ($("rhythmProgressBar")) $("rhythmProgressBar").style.width = "0%";

  const meter = getRhythmMeterInfo();
  rhythmStartTime = audioCtx.currentTime + (meter.countInPulses * meter.pulseSec);
  rhythmScheduledClickBeat = -meter.countInPulses;
  isRhythmPlaying = true;

  rhythmCurrentTarget = rhythmChart[0] || null;
  rhythmNextTarget = rhythmChart[1] || null;
  setActiveFingerPill(rhythmCurrentTarget ? rhythmCurrentTarget.finger : null);
  showRhythmJudgment(null);
  updateRhythmLiveStatsUI();
  refreshDynamic();
  updateFretboardLit();

  if (rhythmRaf) cancelAnimationFrame(rhythmRaf);
  stepRhythmGame();
}

function stopRhythmGame() {
  isRhythmPlaying = false;
  if (rhythmRaf) {
    cancelAnimationFrame(rhythmRaf);
    rhythmRaf = null;
  }
  rhythmCurrentTarget = null;
  rhythmNextTarget = null;
  setActiveFingerPill(null);
  const ring = $("rhythmApproachRing");
  if (ring) ring.style.display = "none";
  refreshDynamic();
  updateFretboardLit();
  drawRhythmHighway(0);
}

function stepRhythmGame() {
  if (!isRhythmPlaying || !audioCtx) return;

  const nowAudio = audioCtx.currentTime;
  const nowRel = nowAudio - rhythmStartTime;
  const beatSec = 60 / rhythmBpm;

  // 1. Schedule metronome clicks slightly ahead (70ms lookahead) with meter-aware 강·중강·약 accents
  const meter = getRhythmMeterInfo();
  while (rhythmScheduledClickBeat <= rhythmTotalBeats) {
    const clickAudioTime = rhythmStartTime + (rhythmScheduledClickBeat * meter.pulseSec);
    if (clickAudioTime <= nowAudio + 0.07) {
      if (clickAudioTime >= nowAudio - 0.03) {
        const pulseInBar = ((rhythmScheduledClickBeat % meter.pulsesPerBar) + meter.pulsesPerBar) % meter.pulsesPerBar;
        const accentLevel = (pulseInBar === 0) ? 2 : (meter.subAccents.includes(pulseInBar) ? 1 : 0);
        playMetronomeClick(accentLevel, clickAudioTime);
      }
      rhythmScheduledClickBeat++;
    } else {
      break;
    }
  }

  // 2. Check for missed notes past the hit window (+165ms after latency compensation)
  const effectiveNow = nowRel - (rhythmLatencyMs / 1000);
  let targetChanged = false;
  for (let i = 0; i < rhythmChart.length; i++) {
    const note = rhythmChart[i];
    if (note.status === "pending" && effectiveNow > note.t + 0.165) {
      note.status = "miss";
      rhythmCounts.miss++;
      rhythmCombo = 0;
      spawnRhythmHitParticles(note.s, "miss", note.finger, note.fret, null);
      showRhythmJudgment("miss");
      updateRhythmLiveStatsUI();
      targetChanged = true;
    }
  }

  // 3. Identify current & next pending targets for finger bar and SVG fretboard sync
  let nextPendingIdx = -1;
  for (let i = 0; i < rhythmChart.length; i++) {
    if (rhythmChart[i].status === "pending") {
      nextPendingIdx = i;
      break;
    }
  }

  const newCurrent = nextPendingIdx !== -1 ? rhythmChart[nextPendingIdx] : null;
  const newNext = (nextPendingIdx !== -1 && nextPendingIdx + 1 < rhythmChart.length) ? rhythmChart[nextPendingIdx + 1] : null;

  if (newCurrent !== rhythmCurrentTarget || newNext !== rhythmNextTarget || targetChanged) {
    rhythmCurrentTarget = newCurrent;
    rhythmNextTarget = newNext;
    setActiveFingerPill(rhythmCurrentTarget ? rhythmCurrentTarget.finger : null);
    updateFretboardLit();
  }

  updateRhythmApproachRing(effectiveNow);
  renderFretboardHandOverlay(effectiveNow);
  drawRhythmHighway(effectiveNow);

  // 4. Finish session when all notes are judged and 0.6s tail has elapsed
  const lastNote = rhythmChart[rhythmChart.length - 1];
  if (nextPendingIdx === -1 && lastNote && effectiveNow > lastNote.t + 0.5) {
    finishRhythmGame();
    return;
  }

  rhythmRaf = requestAnimationFrame(stepRhythmGame);
}

function checkRhythmHit(detectedNotes, primaryF, primaryMidi, cents = 0) {
  if (!isRhythmPlaying || !audioCtx || rhythmChart.length === 0) return;

  const nowAudio = audioCtx.currentTime;
  const effectiveNow = (nowAudio - rhythmStartTime) - (rhythmLatencyMs / 1000);

  // Find earliest pending note within hit window [-165ms, +165ms]
  let candidate = null;
  for (let i = 0; i < rhythmChart.length; i++) {
    const n = rhythmChart[i];
    if (n.status !== "pending") continue;
    const diff = effectiveNow - n.t;
    if (diff < -0.165) break; // future notes are even further ahead
    if (Math.abs(diff) <= 0.165) {
      candidate = n;
      break;
    }
  }

  if (!candidate) return;

  // Prevent a single sustained note frame from immediately consuming two identical consecutive MIDI targets within 110ms
  if (candidate.midi === rhythmLastHitMidi && (nowAudio - rhythmLastHitTime) < 0.11) {
    return;
  }

  // Check if any detected note matches target MIDI (or matching pitch class if harmonic octave jump)
  const notesList = (detectedNotes && detectedNotes.length > 0) ? detectedNotes : [{ f: primaryF, midi: primaryMidi }];
  const matched = notesList.some(n => n && n.midi !== undefined && (n.midi === candidate.midi || pc(n.midi) === candidate.pc));
  if (!matched) return;

  const offsetMs = Math.round((effectiveNow - candidate.t) * 1000);
  const absMs = Math.abs(offsetMs);

  let tier = "good";
  let basePts = 400;
  if (absMs <= 55) {
    tier = "perfect";
    basePts = 1000;
    rhythmCounts.perfect++;
  } else if (absMs <= 105) {
    tier = "great";
    basePts = 700;
    rhythmCounts.great++;
  } else {
    tier = "good";
    basePts = 400;
    rhythmCounts.good++;
  }

  candidate.status = tier;
  candidate.hitOffsetMs = offsetMs;
  rhythmOffsets.push(offsetMs);
  rhythmCombo++;
  if (rhythmCombo > rhythmMaxCombo) rhythmMaxCombo = rhythmCombo;
  rhythmScore += Math.round(basePts * (1 + Math.min(1.5, rhythmCombo * 0.05)));

  rhythmLastHitTime = nowAudio;
  rhythmLastHitMidi = candidate.midi;

  // Spawn burst particles & floating judgement popup directly on the Fretboard SVG
  spawnRhythmHitParticles(candidate.s, tier, candidate.finger, candidate.fret, offsetMs);
  showRhythmJudgment(tier, offsetMs);
  updateRhythmLiveStatsUI();
}

let cachedPreviewKey = "";
let cachedPreviewChart = [];
let rhythmPopups = [];

function getCachedRhythmPreviewChart() {
  const vKey = (guideMode === "chord" && voicingMode && currentVoicing) ? currentVoicing.name : "none";
  const key = `${currentInstrument}_${rootPc}_${scaleId}_${guideMode}_${chordTypeVal}_${vKey}_${rhythmBoxId}_${rhythmDrillId}_${rhythmMeterId}_${rhythmSubdivId}_${rhythmNoteCount}`;
  if (key !== cachedPreviewKey || cachedPreviewChart.length === 0) {
    cachedPreviewKey = key;
    cachedPreviewChart = generateRhythmChart();
  }
  return cachedPreviewChart;
}

function getFretNoteCoords(sIdx, fretNum) {
  if (!fretboardGeom) return { cx: 100, cy: 100, scale: 1 };
  if (fretboardGeom.projectNote) {
    return fretboardGeom.projectNote(sIdx, fretNum, fretboardGeom.is3D ? 7.2 : 0);
  }
  const cx = fretboardGeom.fretCenterX(fretNum);
  const cy = fretboardGeom.stringY(sIdx, fretNum);
  return { cx, cy, scale: 1 };
}

function spawnRhythmHitParticles(sIdx, tier, fingerIdx, fretNum = 5, offsetMs = null) {
  if (!fretboardGeom) return;
  const { cx, cy } = getFretNoteCoords(sIdx, fretNum);
  const color = tier === "perfect" ? "#38bdf8" : (tier === "great" ? "#22c55e" : (tier === "miss" ? "#ef4444" : (FINGER_COLORS[fingerIdx] || "#facc15")));

  for (let i = 0; i < 14; i++) {
    const angle = (Math.PI * 2 * i) / 14;
    const speed = 1.6 + Math.random() * 2.6;
    rhythmParticles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      color
    });
  }

  let label = "GOOD";
  if (tier === "perfect") label = "PERFECT!";
  else if (tier === "great") label = "GREAT!";
  else if (tier === "miss") label = "MISS";

  const sub = (offsetMs !== null && tier !== "miss")
    ? `${offsetMs > 0 ? "+" : ""}${offsetMs}ms${rhythmCombo >= 2 ? ` · ${rhythmCombo} COMBO` : ""}`
    : (rhythmCombo >= 2 && tier !== "miss" ? `${rhythmCombo} COMBO` : "");

  rhythmPopups.push({
    x: cx,
    y: cy - 18,
    vy: -0.9,
    life: 1.0,
    label,
    sub,
    color
  });
}

let lastBeatStripKey = "";
function updateRhythmBeatStripUI(nowRel = 0) {
  const meter = getRhythmMeterInfo();
  if ($("rhythmMeterNum")) $("rhythmMeterNum").textContent = String(meter.num);
  if ($("rhythmMeterDen")) $("rhythmMeterDen").textContent = String(meter.den);

  const ledsWrap = $("rhythmBeatLeds");
  if (!ledsWrap) return;

  const stripKey = `${rhythmMeterId}_${meter.pulsesPerBar}`;
  if (stripKey !== lastBeatStripKey || ledsWrap.children.length === 0) {
    lastBeatStripKey = stripKey;
    ledsWrap.innerHTML = "";
    for (let p = 0; p < meter.pulsesPerBar; p++) {
      if (p > 0 && meter.subAccents.includes(p)) {
        const sep = document.createElement("span");
        sep.className = "beat-group-sep";
        ledsWrap.appendChild(sep);
      }
      const led = document.createElement("span");
      const isStrong = (p === 0);
      const isSub = meter.subAccents.includes(p);
      led.className = `beat-led ${isStrong ? "accent-strong" : (isSub ? "accent-sub" : "accent-weak")}`;
      led.setAttribute("data-pulse", p);
      led.textContent = String(p + 1);
      ledsWrap.appendChild(led);
    }
  }

  let activePulse = 0;
  let barText = "BAR 1";
  if (isRhythmPlaying) {
    const pIdx = Math.floor(nowRel / meter.pulseSec);
    activePulse = ((pIdx % meter.pulsesPerBar) + meter.pulsesPerBar) % meter.pulsesPerBar;
    if (nowRel < 0) {
      const beatsLeft = Math.ceil(Math.abs(nowRel) / meter.pulseSec);
      barText = `READY -${beatsLeft}`;
    } else {
      barText = `BAR ${Math.floor(pIdx / meter.pulsesPerBar) + 1}`;
    }
  }

  if ($("rhythmBarCounter")) $("rhythmBarCounter").textContent = barText;
  const leds = ledsWrap.querySelectorAll(".beat-led");
  leds.forEach(led => {
    const p = parseInt(led.getAttribute("data-pulse"), 10);
    led.classList.toggle("active", p === activePulse);
  });
}

function drawRhythmHighway(nowRel = 0) {
  updateRhythmBeatStripUI(nowRel);

  const backLayer = $("fretboardRhythmBackLayer");
  const frontLayer = $("fretboardRhythmFrontLayer");
  if (!backLayer || !frontLayer || !fretboardGeom) return;

  backLayer.innerHTML = "";
  frontLayer.innerHTML = "";

  if (appMode !== "rhythm") return;

  const {
    fretRatio, project3D, projectNote, noteWorldCoord,
    wxAtRatio, halfNeckAt, strYWorld,
    is3D, tiltRad, frets
  } = fretboardGeom;
  const ns = "http://www.w3.org/2000/svg";
  const meter = getRhythmMeterInfo();
  const pulseSec = meter.pulseSec;
  const ryScale = is3D ? Math.max(0.45, Math.abs(Math.cos(tiltRad)) * 0.84) : 1.0;

  // Pulse the Fret Box Zone border in sync with the current beat
  const boxRect = $("rhythmBoxZoneRect");
  if (boxRect) {
    const beatFrac = isRhythmPlaying
      ? 1.0 - (((nowRel / pulseSec) % 1 + 1) % 1)
      : 0.65;
    const strokeAlpha = (0.28 + beatFrac * 0.45).toFixed(2);
    boxRect.setAttribute("stroke", `rgba(56, 189, 248, ${strokeAlpha})`);
    boxRect.setAttribute("stroke-width", (1.2 + beatFrac * 1.4).toFixed(1));
  }

  // Determine active sequence notes on the Fretboard: n0 (NOW), n1 (NEXT +1), n2 (+2), and prevNote
  const activeChart = (isRhythmPlaying && rhythmChart.length > 0) ? rhythmChart : getCachedRhythmPreviewChart();
  let idx0 = 0;
  if (isRhythmPlaying) {
    idx0 = activeChart.findIndex(n => n.status === "pending");
  }

  const n0 = (idx0 !== -1 && idx0 < activeChart.length) ? activeChart[idx0] : null;
  let repeatCount = 1;
  if (n0 && idx0 !== -1) {
    for (let k = idx0 + 1; k < activeChart.length; k++) {
      if (activeChart[k].s === n0.s && activeChart[k].fret === n0.fret) repeatCount++;
      else break;
    }
  }

  const prevNote = (isRhythmPlaying && idx0 > 0) ? activeChart[idx0 - 1] : null;
  if (!isRhythmPlaying && n0) {
    setActiveFingerPill(n0.finger);
  }

  const idx1 = (idx0 !== -1 && idx0 + repeatCount < activeChart.length) ? (idx0 + repeatCount) : -1;
  const n1 = idx1 !== -1 ? activeChart[idx1] : null;
  let idx2 = -1;
  if (idx1 !== -1) {
    for (let k = idx1 + 1; k < activeChart.length; k++) {
      if (activeChart[k].s !== n1.s || activeChart[k].fret !== n1.fret) {
        idx2 = k;
        break;
      }
    }
  }
  const n2 = idx2 !== -1 ? activeChart[idx2] : null;

  // Helper to build a 3D/2D projected quad polygon in world coordinates
  const makeQuadPoly = (pts, fill, fillOpacity, stroke, strokeWidth, dash = null) => {
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "));
    if (fill) poly.setAttribute("fill", fill);
    if (fillOpacity !== null && fillOpacity !== undefined) poly.setAttribute("fill-opacity", String(fillOpacity));
    if (stroke) {
      poly.setAttribute("stroke", stroke);
      poly.setAttribute("stroke-width", String(strokeWidth || 1.4));
    }
    if (dash) poly.setAttribute("stroke-dasharray", dash);
    return poly;
  };

  const getFretRatioSpan = (fretNum) => {
    if (fretNum <= 0) {
      const wc0 = noteWorldCoord(0, 0);
      return { isOpen: true, xA: wc0.wx - 11, xB: wc0.wx + 11, tA: 0, tB: 0 };
    }
    const fC = Math.min(frets, fretNum);
    const tA = fretRatio[fC - 1];
    const tB = fretRatio[fC];
    return { isOpen: false, xA: wxAtRatio(tA), xB: wxAtRatio(tB), tA, tB };
  };

  // 1. BACK LAYER: 3D-Projected Fret Column Glow & Fret Cell Energy Fill Gauge
  if (n0) {
    const span0 = getFretRatioSpan(n0.fret);
    const fColor = FINGER_COLORS[n0.finger] || "#38bdf8";
    const zBack = is3D ? 0.8 : 0;
    const zCell = is3D ? 1.5 : 0;

    let fillRatio = 0.72;
    if (isRhythmPlaying) {
      const tStart = prevNote ? prevNote.t : (n0.t - pulseSec * 2);
      const span = Math.max(0.15, n0.t - tStart);
      fillRatio = Math.max(0.05, Math.min(1.0, 1.0 - (n0.t - nowRel) / span));
    }

    // Subtle full-column vertical highlight projected onto wood surface
    const colPts = [
      project3D(span0.xA, -halfNeckAt(span0.tA) + 2, zBack),
      project3D(span0.xB, -halfNeckAt(span0.tB) + 2, zBack),
      project3D(span0.xB, halfNeckAt(span0.tB) - 2, zBack),
      project3D(span0.xA, halfNeckAt(span0.tA) - 2, zBack)
    ];
    backLayer.appendChild(makeQuadPoly(colPts, fColor, "0.10", null, 0));

    // Target Fret Cell Container around (n0.fret, n0.s)
    const cTA = span0.isOpen ? 0 : span0.tA + (span0.tB - span0.tA) * 0.06;
    const cTB = span0.isOpen ? 0 : span0.tB - (span0.tB - span0.tA) * 0.06;
    const cXA = span0.isOpen ? span0.xA + 1 : wxAtRatio(cTA);
    const cXB = span0.isOpen ? span0.xB - 1 : wxAtRatio(cTB);
    const cyMidA = strYWorld(n0.s, cTA);
    const cyMidB = strYWorld(n0.s, cTB);
    const cellPts = [
      project3D(cXA, cyMidA - 10.5, zCell),
      project3D(cXB, cyMidB - 10.5, zCell),
      project3D(cXB, cyMidB + 10.5, zCell),
      project3D(cXA, cyMidA + 10.5, zCell)
    ];
    const cellPoly = makeQuadPoly(cellPts, "rgba(15, 23, 42, 0.58)", "1", fColor, "1.8");
    cellPoly.setAttribute("stroke-opacity", "0.88");
    backLayer.appendChild(cellPoly);

    // Rising Energy Fill Bar inside the 3D Fret Cell
    const cXFill = cXA + (cXB - cXA) * fillRatio;
    const cyMidF = cyMidA + (cyMidB - cyMidA) * fillRatio;
    const fillPts = [
      project3D(cXA, cyMidA - 9.5, zCell),
      project3D(cXFill, cyMidF - 9.5, zCell),
      project3D(cXFill, cyMidF + 9.5, zCell),
      project3D(cXA, cyMidA + 9.5, zCell)
    ];
    backLayer.appendChild(makeQuadPoly(fillPts, fColor, (0.20 + fillRatio * 0.25).toFixed(2), null, 0));
  }

  // Also prime the NEXT (+1) fret cell in the back layer
  if (n1 && (!n0 || n1.s !== n0.s || n1.fret !== n0.fret)) {
    const span1 = getFretRatioSpan(n1.fret);
    const nextColor = FINGER_COLORS[n1.finger] || "#38bdf8";
    const zNext = is3D ? 1.4 : 0;
    const nTA = span1.isOpen ? 0 : span1.tA + (span1.tB - span1.tA) * 0.08;
    const nTB = span1.isOpen ? 0 : span1.tB - (span1.tB - span1.tA) * 0.08;
    const nXA = span1.isOpen ? span1.xA + 2 : wxAtRatio(nTA);
    const nXB = span1.isOpen ? span1.xB - 2 : wxAtRatio(nTB);
    const nyMidA = strYWorld(n1.s, nTA);
    const nyMidB = strYWorld(n1.s, nTB);
    const nextPts = [
      project3D(nXA, nyMidA - 9.5, zNext),
      project3D(nXB, nyMidB - 9.5, zNext),
      project3D(nXB, nyMidB + 9.5, zNext),
      project3D(nXA, nyMidA + 9.5, zNext)
    ];
    const nextPoly = makeQuadPoly(nextPts, nextColor, "0.08", nextColor, "1.3", "4 3");
    nextPoly.setAttribute("stroke-opacity", "0.68");
    backLayer.appendChild(nextPoly);
  }

  // 2. FRONT LAYER (3D ONLY): Z-Axis Hologram Light Pillar & Floating Rings above NOW Target
  if (n0 && is3D) {
    const wc0 = noteWorldCoord(n0.s, n0.fret);
    const pPBaseL = project3D(wc0.wx - 11, wc0.wy, 7);
    const pPBaseR = project3D(wc0.wx + 11, wc0.wy, 7);
    const pPTopR = project3D(wc0.wx + 6.5, wc0.wy, 86);
    const pPTopL = project3D(wc0.wx - 6.5, wc0.wy, 86);
    const pillarPoly = document.createElementNS(ns, "polygon");
    pillarPoly.setAttribute(
      "points",
      [pPBaseL, pPBaseR, pPTopR, pPTopL].map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
    );
    pillarPoly.setAttribute("fill", "url(#rhythmPillarGrad)");
    pillarPoly.setAttribute("filter", "url(#glow3dSoft)");
    frontLayer.appendChild(pillarPoly);

    // Floating Z-rings along light beam
    [
      { z: 26, r: 10.5, op: "0.45" },
      { z: 54, r: 8.5, op: "0.26" }
    ].forEach(zr => {
      const pz = project3D(wc0.wx, wc0.wy, zr.z);
      const zRing = document.createElementNS(ns, "ellipse");
      zRing.setAttribute("cx", pz.x.toFixed(1));
      zRing.setAttribute("cy", pz.y.toFixed(1));
      zRing.setAttribute("rx", (zr.r * pz.scale).toFixed(1));
      zRing.setAttribute("ry", (zr.r * ryScale * pz.scale).toFixed(1));
      zRing.setAttribute("fill", "none");
      zRing.setAttribute("stroke", "#facc15");
      zRing.setAttribute("stroke-width", "1.4");
      zRing.setAttribute("opacity", zr.op);
      frontLayer.appendChild(zRing);
    });
  }

  // Helper to evaluate 3D Z-space elevated trajectory arc & ground shadow curve
  const buildArcGeometry = (fromNote, toNote, liftSign = -1) => {
    const wcA = noteWorldCoord(fromNote.s, fromNote.fret);
    const wcB = noteWorldCoord(toNote.s, toNote.fret);
    const worldDist = Math.hypot(wcB.wx - wcA.wx, wcB.wy - wcA.wy);
    const maxLiftZ = is3D ? Math.min(54, Math.max(24, worldDist * 0.28)) : 0;
    const ctrlWy2D = Math.min(wcA.wy, wcB.wy) + liftSign * Math.min(44, Math.max(20, worldDist * 0.34));

    const evalPt = (t) => {
      const wx = wcA.wx + (wcB.wx - wcA.wx) * t;
      if (is3D) {
        const wy = wcA.wy + (wcB.wy - wcA.wy) * t;
        const wz = 8 + Math.sin(t * Math.PI) * maxLiftZ;
        const pAir = project3D(wx, wy, wz);
        const pGnd = project3D(wx, wy, 1.4);
        return { x: pAir.x, y: pAir.y, scale: pAir.scale, gx: pGnd.x, gy: pGnd.y, gScale: pGnd.scale };
      }
      const u = 1 - t;
      const wyPara = u * u * wcA.wy + 2 * u * t * ctrlWy2D + t * t * wcB.wy;
      const p2D = project3D(wx, wyPara, 0);
      return { x: p2D.x, y: p2D.y, scale: 1, gx: p2D.x, gy: p2D.y, gScale: 1 };
    };

    const samplePaths = (samples = 22) => {
      let dAir = "";
      let dGnd = "";
      for (let i = 0; i <= samples; i++) {
        const pt = evalPt(i / samples);
        dAir += (i === 0 ? "M " : "L ") + `${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
        dGnd += (i === 0 ? "M " : "L ") + `${pt.gx.toFixed(1)} ${pt.gy.toFixed(1)} `;
      }
      return { dAir, dGnd };
    };

    return { wcA, wcB, worldDist, evalPt, samplePaths };
  };

  // 3. 3-Note Parabolic 3D Trajectory Chain (NOW -> NEXT +1 -> +2) + Ground Shadow
  if (n1 && n2 && (n1.s !== n2.s || n1.fret !== n2.fret)) {
    const arc12 = buildArcGeometry(n1, n2, -1);
    const { dAir, dGnd } = arc12.samplePaths(20);
    if (is3D) {
      const sh12 = document.createElementNS(ns, "path");
      sh12.setAttribute("d", dGnd);
      sh12.setAttribute("fill", "none");
      sh12.setAttribute("stroke", "rgba(0,0,0,0.34)");
      sh12.setAttribute("stroke-width", "2.6");
      sh12.setAttribute("stroke-dasharray", "3 4");
      frontLayer.appendChild(sh12);
    }
    const path12 = document.createElementNS(ns, "path");
    path12.setAttribute("d", dAir);
    path12.setAttribute("fill", "none");
    path12.setAttribute("stroke", "#c084fc");
    path12.setAttribute("stroke-width", "1.9");
    path12.setAttribute("stroke-dasharray", "3 4");
    path12.setAttribute("opacity", "0.78");
    frontLayer.appendChild(path12);
  }

  let arc01 = null;
  if (n0 && n1 && (n0.s !== n1.s || n0.fret !== n1.fret)) {
    arc01 = buildArcGeometry(n0, n1, -1);
    const { dAir, dGnd } = arc01.samplePaths(24);
    if (is3D) {
      const sh01 = document.createElementNS(ns, "path");
      sh01.setAttribute("d", dGnd);
      sh01.setAttribute("fill", "none");
      sh01.setAttribute("stroke", "rgba(0,0,0,0.45)");
      sh01.setAttribute("stroke-width", "3.8");
      sh01.setAttribute("stroke-dasharray", "4 3");
      frontLayer.appendChild(sh01);
    }
    const path01 = document.createElementNS(ns, "path");
    path01.setAttribute("d", dAir);
    path01.setAttribute("fill", "none");
    path01.setAttribute("stroke", "url(#rhythmLaserGrad)");
    path01.setAttribute("stroke-width", "3.2");
    path01.setAttribute("stroke-linecap", "round");
    path01.setAttribute("opacity", "0.95");
    if (is3D) path01.setAttribute("filter", "url(#glow3dSoft)");
    frontLayer.appendChild(path01);
  }

  // 4. Bouncing Rhythm Orb (탄도 바운싱 리듬 구슬 + 3D 지면 그림자 + 혜성 잔상)
  let orbArc = null;
  let orbProgress = 0.48;
  if (isRhythmPlaying && n0) {
    if (prevNote && (prevNote.s !== n0.s || prevNote.fret !== n0.fret)) {
      orbArc = buildArcGeometry(prevNote, n0, -1);
      const span = Math.max(0.12, n0.t - prevNote.t);
      orbProgress = Math.max(0, Math.min(1, (nowRel - prevNote.t) / span));
    } else if (arc01) {
      const timeUntil = n0.t - nowRel;
      if (timeUntil > 0) {
        const launchNote = { s: n0.s, fret: Math.max(0, n0.fret - 2) };
        orbArc = buildArcGeometry(launchNote, n0, -1);
        orbProgress = Math.max(0, Math.min(1, 1.0 - timeUntil / (pulseSec * 2)));
      }
    }
  } else if (!isRhythmPlaying && arc01) {
    orbArc = arc01;
    orbProgress = 0.46;
  }

  if (orbArc) {
    // Draw 3 comet trail afterimages behind the Bouncing Orb
    [0.16, 0.10, 0.05].forEach((lag, idx) => {
      const tp = Math.max(0, orbProgress - lag);
      const pt = orbArc.evalPt(tp);
      const trailDot = document.createElementNS(ns, "circle");
      trailDot.setAttribute("cx", pt.x.toFixed(1));
      trailDot.setAttribute("cy", pt.y.toFixed(1));
      trailDot.setAttribute("r", ((2.4 + idx * 1.1) * pt.scale).toFixed(1));
      trailDot.setAttribute("fill", "#38bdf8");
      trailDot.setAttribute("fill-opacity", (0.22 + idx * 0.16).toFixed(2));
      frontLayer.appendChild(trailDot);
    });

    const orbPt = orbArc.evalPt(orbProgress);
    if (is3D) {
      const orbGndShadow = document.createElementNS(ns, "ellipse");
      orbGndShadow.setAttribute("cx", orbPt.gx.toFixed(1));
      orbGndShadow.setAttribute("cy", orbPt.gy.toFixed(1));
      orbGndShadow.setAttribute("rx", (8.5 * orbPt.gScale).toFixed(1));
      orbGndShadow.setAttribute("ry", (8.5 * ryScale * orbPt.gScale).toFixed(1));
      orbGndShadow.setAttribute("fill", "rgba(0,0,0,0.52)");
      frontLayer.appendChild(orbGndShadow);
    }

    const orbHalo = document.createElementNS(ns, "circle");
    orbHalo.setAttribute("cx", orbPt.x.toFixed(1));
    orbHalo.setAttribute("cy", orbPt.y.toFixed(1));
    orbHalo.setAttribute("r", (11 * orbPt.scale).toFixed(1));
    orbHalo.setAttribute("fill", "rgba(250, 204, 21, 0.25)");
    orbHalo.setAttribute("stroke", "#38bdf8");
    orbHalo.setAttribute("stroke-width", "1.4");
    frontLayer.appendChild(orbHalo);

    const orbCore = document.createElementNS(ns, "circle");
    orbCore.setAttribute("cx", orbPt.x.toFixed(1));
    orbCore.setAttribute("cy", orbPt.y.toFixed(1));
    orbCore.setAttribute("r", (6 * orbPt.scale).toFixed(1));
    orbCore.setAttribute("fill", "#facc15");
    orbCore.setAttribute("stroke", "#ffffff");
    orbCore.setAttribute("stroke-width", "1.8");
    frontLayer.appendChild(orbCore);
  }

  // 5. Shrinking Precision Reticle & Non-Overlapping Corner Superscript Badges
  const drawCornerStepBadge = (cx, cy, labelText, badgeBg, badgeStroke, textCol, dx = 11, dy = -10) => {
    const bx = cx + dx;
    const by = cy + dy;
    const isWide = labelText.length > 1;
    if (isWide) {
      const w = Math.max(20, labelText.length * 6 + 8);
      const h = 14;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", (bx - w / 2).toFixed(1));
      rect.setAttribute("y", (by - h / 2).toFixed(1));
      rect.setAttribute("width", w.toFixed(1));
      rect.setAttribute("height", h);
      rect.setAttribute("rx", "7");
      rect.setAttribute("fill", badgeBg);
      rect.setAttribute("stroke", badgeStroke);
      rect.setAttribute("stroke-width", "1.3");
      frontLayer.appendChild(rect);
    } else {
      const circ = document.createElementNS(ns, "circle");
      circ.setAttribute("cx", bx.toFixed(1));
      circ.setAttribute("cy", by.toFixed(1));
      circ.setAttribute("r", "7.5");
      circ.setAttribute("fill", badgeBg);
      circ.setAttribute("stroke", badgeStroke);
      circ.setAttribute("stroke-width", "1.4");
      frontLayer.appendChild(circ);
    }

    const txt = document.createElementNS(ns, "text");
    txt.setAttribute("x", bx.toFixed(1));
    txt.setAttribute("y", (by + 3.4).toFixed(1));
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("fill", textCol);
    txt.setAttribute("font-size", isWide ? "8.5px" : "9.5px");
    txt.setAttribute("font-weight", "800");
    txt.setAttribute("font-family", "'IBM Plex Mono', monospace");
    txt.textContent = labelText;
    frontLayer.appendChild(txt);
  };

  if (n2 && (!n0 || n2.s !== n0.s || n2.fret !== n0.fret) && (!n1 || n2.s !== n1.s || n2.fret !== n1.fret)) {
    const { cx, cy } = getFretNoteCoords(n2.s, n2.fret);
    drawCornerStepBadge(cx, cy, "2", "#7e22ce", "#f3e8ff", "#ffffff", 11, -10);
  }

  if (n1 && (!n0 || n1.s !== n0.s || n1.fret !== n0.fret)) {
    const { cx, cy } = getFretNoteCoords(n1.s, n1.fret);
    drawCornerStepBadge(cx, cy, "1", "#0284c7", "#bae6fd", "#ffffff", 11, -10);
  }

  if (n0) {
    const { cx, cy, scale } = getFretNoteCoords(n0.s, n0.fret);
    const fColor = FINGER_COLORS[n0.finger] || "#facc15";

    let ringR = 20 * (scale || 1);
    if (isRhythmPlaying) {
      const timeUntil = n0.t - nowRel;
      const ratio = Math.max(0, Math.min(1, timeUntil / 1.5));
      ringR = (12 + ratio * 22) * (scale || 1);
    } else {
      const ringEl = $("rhythmApproachRing");
      if (ringEl) {
        ringEl.setAttribute("cx", cx.toFixed(1));
        ringEl.setAttribute("cy", cy.toFixed(1));
        ringEl.setAttribute("rx", ringR.toFixed(1));
        ringEl.setAttribute("ry", (ringR * ryScale).toFixed(1));
        ringEl.setAttribute("stroke", fColor);
        ringEl.style.display = "block";
      }
    }

    // 4 Cardinal Reticle Ticks foreshortened to match 3D ellipse ring
    [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].forEach(ang => {
      const rIn = ringR + 1;
      const rOut = ringR + 5.5;
      const tick = document.createElementNS(ns, "line");
      tick.setAttribute("x1", (cx + Math.cos(ang) * rIn).toFixed(1));
      tick.setAttribute("y1", (cy + Math.sin(ang) * rIn * ryScale).toFixed(1));
      tick.setAttribute("x2", (cx + Math.cos(ang) * rOut).toFixed(1));
      tick.setAttribute("y2", (cy + Math.sin(ang) * rOut * ryScale).toFixed(1));
      tick.setAttribute("stroke", "#facc15");
      tick.setAttribute("stroke-width", "2");
      tick.setAttribute("stroke-linecap", "round");
      frontLayer.appendChild(tick);
    });

    if (repeatCount > 1) {
      drawCornerStepBadge(cx, cy, `×${repeatCount}`, "#18181b", "#facc15", "#fde047", -12, -11);
    }
  }

  // 5. Render On-Fretboard Burst Particles & Floating Judgement Popups (PERFECT!, GREAT!, COMBO)
  for (let i = rhythmParticles.length - 1; i >= 0; i--) {
    const p = rhythmParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.055;
    if (p.life <= 0) {
      rhythmParticles.splice(i, 1);
      continue;
    }
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", p.x.toFixed(1));
    dot.setAttribute("cy", p.y.toFixed(1));
    dot.setAttribute("r", (3.6 * p.life).toFixed(1));
    dot.setAttribute("fill", p.color);
    dot.setAttribute("fill-opacity", p.life.toFixed(2));
    frontLayer.appendChild(dot);
  }

  for (let i = rhythmPopups.length - 1; i >= 0; i--) {
    const pop = rhythmPopups[i];
    pop.y += pop.vy;
    pop.life -= 0.035;
    if (pop.life <= 0) {
      rhythmPopups.splice(i, 1);
      continue;
    }
    const gPop = document.createElementNS(ns, "g");
    gPop.setAttribute("opacity", Math.min(1, pop.life * 1.4).toFixed(2));

    const mainTxt = document.createElementNS(ns, "text");
    mainTxt.setAttribute("x", pop.x.toFixed(1));
    mainTxt.setAttribute("y", pop.y.toFixed(1));
    mainTxt.setAttribute("text-anchor", "middle");
    mainTxt.setAttribute("fill", pop.color);
    mainTxt.setAttribute("stroke", "#090c10");
    mainTxt.setAttribute("stroke-width", "3");
    mainTxt.setAttribute("paint-order", "stroke");
    mainTxt.setAttribute("font-size", "14px");
    mainTxt.setAttribute("font-weight", "900");
    mainTxt.setAttribute("font-family", "'Oswald', sans-serif");
    mainTxt.textContent = pop.label;
    gPop.appendChild(mainTxt);

    if (pop.sub) {
      const subTxt = document.createElementNS(ns, "text");
      subTxt.setAttribute("x", pop.x.toFixed(1));
      subTxt.setAttribute("y", (pop.y + 12).toFixed(1));
      subTxt.setAttribute("text-anchor", "middle");
      subTxt.setAttribute("fill", "#f8fafc");
      subTxt.setAttribute("stroke", "#090c10");
      subTxt.setAttribute("stroke-width", "2.5");
      subTxt.setAttribute("paint-order", "stroke");
      subTxt.setAttribute("font-size", "9.5px");
      subTxt.setAttribute("font-weight", "700");
      subTxt.setAttribute("font-family", "'IBM Plex Mono', monospace");
      subTxt.textContent = pop.sub;
      gPop.appendChild(subTxt);
    }
    frontLayer.appendChild(gPop);
  }

  // 6. On-Fretboard Count-In Glass Banner when nowRel < 0
  if (isRhythmPlaying && nowRel < 0) {
    const beatsLeft = Math.ceil(Math.abs(nowRel) / pulseSec);
    const bannerW = 360, bannerH = 44;
    const bx = W / 2 - bannerW / 2, by = 6;

    const glass = document.createElementNS(ns, "rect");
    glass.setAttribute("x", bx);
    glass.setAttribute("y", by);
    glass.setAttribute("width", bannerW);
    glass.setAttribute("height", bannerH);
    glass.setAttribute("rx", "10");
    glass.setAttribute("fill", "rgba(9, 13, 22, 0.92)");
    glass.setAttribute("stroke", "#facc15");
    glass.setAttribute("stroke-width", "1.6");
    frontLayer.appendChild(glass);

    const countTxt = document.createElementNS(ns, "text");
    countTxt.setAttribute("x", W / 2);
    countTxt.setAttribute("y", by + 20);
    countTxt.setAttribute("text-anchor", "middle");
    countTxt.setAttribute("fill", "#facc15");
    countTxt.setAttribute("font-size", "15px");
    countTxt.setAttribute("font-weight", "800");
    countTxt.setAttribute("font-family", "'Oswald', sans-serif");
    countTxt.textContent = `[${meter.num}/${meter.den}] ${t("rhythmCountIn")} ${beatsLeft}`;
    frontLayer.appendChild(countTxt);

    if (n0) {
      const fName = t("finger_" + n0.finger);
      const hintTxt = document.createElementNS(ns, "text");
      hintTxt.setAttribute("x", W / 2);
      hintTxt.setAttribute("y", by + 36);
      hintTxt.setAttribute("text-anchor", "middle");
      hintTxt.setAttribute("fill", "#38bdf8");
      hintTxt.setAttribute("font-size", "10.5px");
      hintTxt.setAttribute("font-weight", "700");
      hintTxt.setAttribute("font-family", "'Inter', sans-serif");
      hintTxt.textContent = `START: ${n0.s + 1}st String · ${n0.fret}F (${NOTE[n0.pc]}) — ${FINGER_BADGES[n0.finger]} ${fName}`;
      frontLayer.appendChild(hintTxt);
    }
  }
}

function finishRhythmGame() {
  isRhythmPlaying = false;
  if (rhythmRaf) {
    cancelAnimationFrame(rhythmRaf);
    rhythmRaf = null;
  }
  rhythmCurrentTarget = null;
  rhythmNextTarget = null;
  setActiveFingerPill(null);
  const ring = $("rhythmApproachRing");
  if (ring) ring.style.display = "none";
  refreshDynamic();
  updateFretboardLit();
  drawRhythmHighway(0);

  const total = rhythmChart.length || 1;
  const weighted = rhythmCounts.perfect * 1.0 + rhythmCounts.great * 0.8 + rhythmCounts.good * 0.5;
  const accPct = Math.round((weighted / total) * 100);

  let rank = "C";
  let rankClass = "rank-c";
  if (accPct >= 92) { rank = "S"; rankClass = "rank-s"; }
  else if (accPct >= 82) { rank = "A"; rankClass = "rank-a"; }
  else if (accPct >= 70) { rank = "B"; rankClass = "rank-b"; }

  const avgOffset = rhythmOffsets.length > 0
    ? Math.round(rhythmOffsets.reduce((a, b) => a + b, 0) / rhythmOffsets.length)
    : 0;
  const avgStr = avgOffset > 0 ? `+${avgOffset}ms (${t("rhythmLate")})` : `${avgOffset}ms (${avgOffset < -5 ? t("rhythmEarly") : "OK"})`;

  // Weak-spot analysis (missed frets/fingers)
  const missedNotes = rhythmChart.filter(n => n.status === "miss");
  let weakSpotTxt = "";
  if (missedNotes.length > 0) {
    const sample = missedNotes[0];
    weakSpotTxt = ` · Weak: ${sample.s + 1}st ${sample.fret}F (${FINGER_BADGES[sample.finger]} ${t("fingerShort_" + sample.finger)})`;
  }

  const badge = $("rhythmRankBadge");
  if (badge) {
    badge.textContent = rank;
    badge.className = `rhythm-rank-badge ${rankClass}`;
  }
  if ($("resRhythmAcc")) $("resRhythmAcc").textContent = `${accPct}%`;
  if ($("resRhythmCombo")) $("resRhythmCombo").textContent = rhythmMaxCombo;
  if ($("resRhythmOffset")) $("resRhythmOffset").textContent = avgStr;
  if ($("resRhythmBreakdown")) {
    $("resRhythmBreakdown").textContent = `${rhythmCounts.perfect} / ${rhythmCounts.great} / ${rhythmCounts.good} / ${rhythmCounts.miss}`;
  }
  if ($("resRhythmWeakTxt")) {
    if (missedNotes.length > 0) {
      const sample = missedNotes[0];
      $("resRhythmWeakTxt").textContent = `${sample.s + 1}st String · ${sample.fret}F (${NOTE[sample.pc]}) — ${FINGER_BADGES[sample.finger]} ${t("finger_" + sample.finger)}`;
    } else {
      $("resRhythmWeakTxt").textContent = t("rhythmWeakNone");
    }
  }
  if ($("rhythmResultBox")) {
    $("rhythmResultBox").style.display = "flex";
  }
}

function bindEvents() {
  document.querySelectorAll(".neck-theme-btn").forEach(btn => {
    btn.onclick = () => setNeckWood(btn.getAttribute("data-wood"));
  });
  document.querySelectorAll(".v3d-preset-btn").forEach(btn => {
    btn.onclick = () => setFbViewMode(btn.getAttribute("data-view3d"));
  });
  if ($("btnResetCam3d")) {
    $("btnResetCam3d").onclick = () => setFbViewMode("studio");
  }
  if ($("btnZoomOut")) {
    $("btnZoomOut").onclick = () => setFbZoom(Math.round((fbZoom - 0.15) * 20) / 20);
  }
  if ($("btnZoomIn")) {
    $("btnZoomIn").onclick = () => setFbZoom(Math.round((fbZoom + 0.15) * 20) / 20);
  }
  if ($("fbZoomSlider")) {
    $("fbZoomSlider").oninput = e => setFbZoom(parseInt(e.target.value, 10) / 100);
  }
  if ($("startBtn")) $("startBtn").onclick = () => running ? stop() : start();
  if ($("keySel")) {
    $("keySel").onchange = e => {
      rootPc = parseInt(e.target.value, 10);
      rebuildVoicingSel();
      drawFB();
      renderCircleOfFifths();
      if (voicingMode) updateVoicingGuide();
      if (quizMode) newQuiz();
    };
  }
  if ($("scaleSel")) {
    $("scaleSel").onchange = e => {
      scaleId = e.target.value;
      drawFB();
      if (quizMode) newQuiz();
    };
  }
  if ($("instrSel")) {
    $("instrSel").onchange = e => {
      setInstrument(e.target.value);
    };
  }

  if ($("tuningSel")) {
    $("tuningSel").onchange = e => {
      currentTuningId = e.target.value;
      const tDict = getTuningsForInstrument();
      if (tDict[currentTuningId]) {
        strings = [...tDict[currentTuningId]];
        for (let s = 0; s < strings.length; s++) {
          if ($("strSel_" + s)) $("strSel_" + s).value = strings[s];
        }
        rebuildTunerUI();
        drawFB();
      }
    };
  }

  if ($("tuningModeSel")) {
    $("tuningModeSel").onchange = e => {
      tuningMode = e.target.value;
      if ($("tuningPresetField")) $("tuningPresetField").style.display = (tuningMode === "preset") ? "block" : "none";
      if ($("tuningCustomField")) $("tuningCustomField").style.display = (tuningMode === "custom") ? "block" : "none";
      const tDict = getTuningsForInstrument();
      if (tuningMode === "preset") {
        if (tDict[currentTuningId]) strings = [...tDict[currentTuningId]];
      } else {
        for (let s = 0; s < strings.length; s++) {
          if ($("strSel_" + s)) strings[s] = parseInt($("strSel_" + s).value, 10);
        }
      }
      rebuildTunerUI();
      drawFB();
    };
  }

  if ($("btnRecordToggle")) {
    $("btnRecordToggle").onclick = () => {
      if (isRecording) stopRecording();
      else startRecording();
    };
  }

  if ($("btnDownloadWav")) {
    $("btnDownloadWav").onclick = () => {
      if (!recordedAudioBlob) return;
      const a = document.createElement("a");
      a.href = recordedAudioUrl;
      a.download = `Recording_${currentInstrument}_${new Date().toISOString().replace(/[:.]/g, "-")}.wav`;
      a.click();
    };
  }

  if ($("btnSyncReplay")) {
    $("btnSyncReplay").onclick = () => {
      startSyncReplay();
    };
  }

  if ($("voicingSel")) {
    $("voicingSel").onchange = e => {
      const val = e.target.value;
      if (val === "all") {
        voicingMode = false;
        currentVoicing = null;
      } else {
        currentVoicingIdx = parseInt(val, 10);
        if (currentVoicingsList[currentVoicingIdx]) {
          currentVoicing = currentVoicingsList[currentVoicingIdx];
          voicingMode = true;
        }
      }
      drawFB();
    };
  }

  if ($("sens")) {
    $("sens").oninput = e => {
      sensitivity = parseFloat(e.target.value);
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "set_sensitivity", value: sensitivity }));
        } catch (err) { }
      }
    };
  }
  if ($("stab")) {
    $("stab").oninput = e => {
      stabNeeded = parseInt(e.target.value, 10);
      if ($("stabVal")) $("stabVal").textContent = stabNeeded;
    };
  }
  if ($("refPitch")) {
    $("refPitch").oninput = e => {
      refPitch = parseInt(e.target.value, 10);
      if ($("refPitchVal")) $("refPitchVal").textContent = refPitch;
      sendRefPitch();
    };
  }
  if ($("chordTypeSel")) {
    $("chordTypeSel").onchange = e => {
      chordTypeVal = e.target.value;
      rebuildVoicingSel();
      if (voicingMode) updateVoicingGuide();
      drawFB();
      if (quizMode) newQuiz();
    };
  }

  if ($("btnScanStart")) $("btnScanStart").onclick = startScan;
  if ($("btnScanStop")) $("btnScanStop").onclick = stopScan;

  if ($("btnCircleOfFifths")) {
    $("btnCircleOfFifths").onclick = () => {
      renderCircleOfFifths();
      if ($("circleModal")) $("circleModal").style.display = "flex";
    };
  }
  if ($("btnCloseCircle")) {
    $("btnCloseCircle").onclick = () => {
      if ($("circleModal")) $("circleModal").style.display = "none";
    };
  }
  if ($("circleSvg")) {
    $("circleSvg").onclick = e => {
      const sector = e.target.closest(".circle-sector");
      if (sector) {
        const pcVal = parseInt(sector.getAttribute("data-pc"), 10);
        const clickedMinor = sector.getAttribute("data-minor") === "1";
        if (!isNaN(pcVal)) {
          rootPc = pcVal;
          if ($("keySel")) $("keySel").value = pcVal;
          if (guideMode === "chord") {
            if (clickedMinor && (chordTypeVal === "major" || chordTypeVal === "maj7")) {
              chordTypeVal = (chordTypeVal === "maj7") ? "min7" : "minor";
              if ($("chordTypeSel")) $("chordTypeSel").value = chordTypeVal;
            } else if (!clickedMinor && (chordTypeVal === "minor" || chordTypeVal === "min7")) {
              chordTypeVal = (chordTypeVal === "min7") ? "maj7" : "major";
              if ($("chordTypeSel")) $("chordTypeSel").value = chordTypeVal;
            }
          } else {
            if (clickedMinor && (scaleId === "major" || scaleId === "major_pent")) {
              scaleId = (scaleId === "major_pent") ? "minor_pent" : "natural_minor";
              if ($("scaleSel")) $("scaleSel").value = scaleId;
            } else if (!clickedMinor && (scaleId === "natural_minor" || scaleId === "minor_pent")) {
              scaleId = (scaleId === "minor_pent") ? "major_pent" : "major";
              if ($("scaleSel")) $("scaleSel").value = scaleId;
            }
          }
          rebuildVoicingSel();
          drawFB();
          renderCircleOfFifths();
          if (voicingMode) updateVoicingGuide();
          if (quizMode) newQuiz();
        }
      }
    };
  }

  if ($("btnJam")) $("btnJam").onclick = () => isJamPlaying ? stopJamTrack() : startJamTrack();
  if ($("jamProgSel")) {
    $("jamProgSel").onchange = e => {
      jamProgressionKey = e.target.value;
      if (isJamPlaying) {
        stopJamTrack();
        startJamTrack();
      } else if ($("jamBarCounter")) {
        const prog = JAM_PROGRESSIONS[jamProgressionKey] || JAM_PROGRESSIONS.pop;
        $("jamBarCounter").textContent = `${t("lblBar")} 1/${prog.length}`;
      }
    };
  }
  if ($("jamBpm")) {
    $("jamBpm").oninput = e => {
      jamBpm = parseInt(e.target.value, 10);
      if ($("jamBpmVal")) $("jamBpmVal").textContent = jamBpm;
    };
  }

  if ($("btnMetro")) $("btnMetro").onclick = () => isMetroPlaying ? stopMetronome() : startMetronome();
  if ($("metroBpm")) {
    $("metroBpm").oninput = e => {
      metroBpm = parseInt(e.target.value, 10);
      if ($("metroBpmVal")) $("metroBpmVal").textContent = metroBpm;
    };
  }
  if ($("metroAutoSpeed")) {
    isAutoSpeedUp = $("metroAutoSpeed").checked;
    $("metroAutoSpeed").onchange = e => {
      isAutoSpeedUp = e.target.checked;
    };
  }

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

  if ($("outputDeviceSel")) {
    $("outputDeviceSel").onchange = e => {
      setAudioOutputDevice(e.target.value);
    };
  }

  if ($("deviceSel")) {
    $("deviceSel").onchange = async (e) => {
      const val = e.target.value;
      if (val.startsWith("asio_dev_") || val === "asio_ws") {
        const ok = await probeAsioBridgeSilent(650);
        if (!ok) {
          updateAsioStatusBadge("warn");
          openAsioSmartPopover();
          return;
        }
        updateAsioStatusBadge("ok");
        closeAsioSmartPopover();
        if (val.startsWith("asio_dev_")) {
          const devId = parseInt(val.replace("asio_dev_", ""), 10);
          currentAsioDeviceId = devId;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "select_asio_device", device_id: devId }));
          } else if (running) {
            await connect(val);
          }
        } else if (running) {
          await connect(val);
        }
      } else {
        updateAsioStatusBadge("web");
        closeAsioSmartPopover();
        if (running) {
          await connect(val);
        }
      }
    };
  }

  if ($("asioStatusBadge")) {
    $("asioStatusBadge").onclick = () => toggleAsioSmartPopover();
  }
  if ($("btnCloseAsioPopover")) {
    $("btnCloseAsioPopover").onclick = () => closeAsioSmartPopover();
  }
  if ($("btnAsioUseWebMic")) {
    $("btnAsioUseWebMic").onclick = () => switchToBrowserMicAndStart(true);
  }
  if ($("btnAsioRescan")) {
    $("btnAsioRescan").onclick = async () => {
      const btn = $("btnAsioRescan");
      if (btn) btn.textContent = "🔄 스캔 중...";
      const ok = await probeAsioBridgeSilent(800);
      refreshAsioDiagnosticView(ok);
      if (ok) {
        updateAsioStatusBadge("ok");
        if (btn) btn.textContent = "✓ 연결 완료!";
        if (running) {
          try { await connect($("deviceSel") ? $("deviceSel").value : "asio_ws"); } catch (e) { }
        }
      } else {
        updateAsioStatusBadge("warn");
        if (btn) btn.textContent = "⚡ 다시 스캔";
      }
    };
  }
  if ($("chkAsioAutoFallback")) {
    $("chkAsioAutoFallback").onchange = e => {
      try { localStorage.setItem("asioAutoFallback", e.target.checked ? "1" : "0"); } catch (err) { }
    };
  }
  window.addEventListener("resize", positionAsioSmartPopover);
  window.addEventListener("scroll", positionAsioSmartPopover, true);
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && asioPopoverOpen) closeAsioSmartPopover();
  });

  if ($("fb")) {
    const fbEl = $("fb");
    fbEl.onpointerdown = e => {
      const wantPan = e.shiftKey || e.button === 1 || e.button === 2;
      if (e.button === 1) e.preventDefault();
      if (!wantPan && e.button !== 0 && e.pointerType === "mouse") return;
      wasDragged3d = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      if (wantPan) {
        isPanningCam = true;
        dragStartPanX = fbPanX;
        dragStartPanY = fbPanY;
        fbEl.classList.add("panning");
      } else {
        isDragging3dCam = true;
        dragStartTilt = fbTiltDeg;
        dragStartYaw = fbYawDeg;
        fbEl.classList.add("dragging");
      }
    };
    window.addEventListener("pointermove", e => {
      if (!isDragging3dCam && !isPanningCam) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 4) {
        wasDragged3d = true;
        if (isPanningCam) {
          const rect = fbEl.getBoundingClientRect();
          const scaleX = rect.width > 0 ? 1060 / rect.width : 1;
          const scaleY = rect.height > 0 ? 430 / rect.height : 1;
          fbPanX = Math.max(-340, Math.min(340, dragStartPanX + dx * scaleX));
          fbPanY = Math.max(-190, Math.min(190, dragStartPanY + dy * scaleY));
          drawFB();
        } else if (isDragging3dCam) {
          fbYawDeg = Math.max(FB_YAW_MIN, Math.min(FB_YAW_MAX, dragStartYaw + dx * 0.24));
          fbTiltDeg = Math.max(FB_TILT_MIN, Math.min(FB_TILT_MAX, dragStartTilt + dy * 0.26));
          fbViewMode = (Math.abs(fbTiltDeg) <= 1.5 && Math.abs(fbYawDeg) <= 1.5) ? "2d" : "custom";
          drawFB();
        }
      }
    });
    const endCamDrag = () => {
      if (!isDragging3dCam && !isPanningCam) return;
      isDragging3dCam = false;
      isPanningCam = false;
      fbEl.classList.remove("dragging", "panning");
      if (wasDragged3d) {
        setTimeout(() => { wasDragged3d = false; }, 60);
      }
    };
    window.addEventListener("pointerup", endCamDrag);
    window.addEventListener("pointercancel", () => {
      isDragging3dCam = false;
      isPanningCam = false;
      wasDragged3d = false;
      fbEl.classList.remove("dragging", "panning");
    });
    fbEl.addEventListener("contextmenu", e => e.preventDefault());
    fbEl.addEventListener("wheel", e => {
      e.preventDefault();
      const rect = fbEl.getBoundingClientRect();
      let svgX = null, svgY = null;
      if (rect.width > 0 && rect.height > 0) {
        const scale = Math.min(rect.width / 1060, rect.height / 430) || 1;
        const padX = (rect.width - 1060 * scale) * 0.5;
        const padY = (rect.height - 430 * scale) * 0.5;
        svgX = (e.clientX - rect.left - padX) / scale;
        svgY = (e.clientY - rect.top - padY) / scale;
      }
      const nextZ = Math.round((e.deltaY < 0 ? fbZoom * 1.10 : fbZoom * 0.91) * 100) / 100;
      setFbZoom(nextZ, svgX, svgY);
    }, { passive: false });

    $("fb").onclick = e => {
      if (wasDragged3d) {
        wasDragged3d = false;
        return;
      }
      const dot = e.target.closest(".note-dot");
      if (dot) {
        const midi = parseInt(dot.getAttribute("data-midi"), 10);
        playMidiNote(midi);
        if (isRhythmPlaying) {
          checkRhythmHit([{ f: midiToFreq(midi), midi }], midiToFreq(midi), midi, 0);
        }
      }
    };
    $("fb").onmousemove = e => {
      if (isDragging3dCam || isPanningCam) return;
      const dot = e.target.closest(".note-dot");
      if (dot) {
        const s = parseInt(dot.getAttribute("data-str"), 10);
        const fret = parseInt(dot.getAttribute("data-fret"), 10);
        const finger = parseInt(dot.getAttribute("data-finger"), 10);
        const notePc = parseInt(dot.getAttribute("data-pc"), 10);
        if (!hoveredFretNote || hoveredFretNote.s !== s || hoveredFretNote.fret !== fret) {
          hoveredFretNote = { s, fret, finger, pc: notePc };
          if (!isRhythmPlaying) renderFretboardHandOverlay(0);
        }
      } else if (hoveredFretNote !== null) {
        hoveredFretNote = null;
        if (!isRhythmPlaying) renderFretboardHandOverlay(0);
      }
    };
    $("fb").onmouseleave = () => {
      if (hoveredFretNote !== null) {
        hoveredFretNote = null;
        if (!isRhythmPlaying) renderFretboardHandOverlay(0);
      }
    };
  }

  // Rhythm Game Controls
  if ($("btnRhythmToggle")) {
    $("btnRhythmToggle").onclick = () => {
      if (isRhythmPlaying) stopRhythmGame();
      else startRhythmGame();
    };
  }
  if ($("btnRhythmRetry")) {
    $("btnRhythmRetry").onclick = () => {
      startRhythmGame();
    };
  }
  if ($("rhythmBoxSel")) {
    $("rhythmBoxSel").onchange = e => {
      rhythmBoxId = e.target.value;
      drawFB();
    };
  }
  if ($("rhythmDrillSel")) {
    $("rhythmDrillSel").onchange = e => {
      rhythmDrillId = e.target.value;
      if (!isRhythmPlaying) updateFretboardLit();
    };
  }
  if ($("rhythmMeterSel")) {
    $("rhythmMeterSel").onchange = e => {
      rhythmMeterId = e.target.value;
      // For /8 meters (6/8, 12/8, 7/8), default subdivision to eighth notes so 1 note per pulse aligns naturally
      if (["6_8", "12_8", "7_8"].includes(rhythmMeterId) && rhythmSubdivId === "quarter") {
        rhythmSubdivId = "eighth";
        if ($("rhythmSubdivSel")) $("rhythmSubdivSel").value = "eighth";
      } else if (["4_4", "3_4", "2_4", "5_4"].includes(rhythmMeterId) && rhythmSubdivId === "eighth") {
        rhythmSubdivId = "quarter";
        if ($("rhythmSubdivSel")) $("rhythmSubdivSel").value = "quarter";
      }
      if (!isRhythmPlaying) updateFretboardLit();
    };
  }
  if ($("rhythmSubdivSel")) {
    $("rhythmSubdivSel").onchange = e => {
      rhythmSubdivId = e.target.value;
      if (!isRhythmPlaying) updateFretboardLit();
    };
  }
  if ($("rhythmBpm")) {
    $("rhythmBpm").oninput = e => {
      rhythmBpm = parseInt(e.target.value, 10);
      if ($("rhythmBpmVal")) $("rhythmBpmVal").textContent = rhythmBpm;
      if (!isRhythmPlaying) updateFretboardLit();
    };
  }
  if ($("rhythmLenSel")) {
    $("rhythmLenSel").onchange = e => {
      rhythmNoteCount = parseInt(e.target.value, 10);
      if (!isRhythmPlaying) updateFretboardLit();
    };
  }
  if ($("rhythmLatency")) {
    $("rhythmLatency").oninput = e => {
      rhythmLatencyMs = parseInt(e.target.value, 10);
      if ($("rhythmLatVal")) $("rhythmLatVal").textContent = rhythmLatencyMs;
    };
  }
}

function rebuildCustomTuningUI() {
  const bar = $("customStringsBar");
  if (!bar) return;
  bar.innerHTML = "";
  const numStrings = strings.length;
  const minMidi = (currentInstrument === "bass") ? 23 : 36;
  const maxMidi = (currentInstrument === "bass") ? 55 : 72;

  for (let s = 0; s < numStrings; s++) {
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.style.gap = "2px";

    const lbl = document.createElement("small");
    lbl.style.fontSize = "10px";
    lbl.style.color = "var(--sub)";
    lbl.textContent = `${s + 1}st`;

    const sel = document.createElement("select");
    sel.id = "strSel_" + s;
    sel.className = "select-styled";
    for (let m = minMidi; m <= maxMidi; m++) {
      const o = document.createElement("option");
      o.value = m;
      const octave = Math.floor(m / 12) - 1;
      o.textContent = `${NOTE[pc(m)]}${octave}`;
      sel.appendChild(o);
    }
    sel.value = strings[s];
    sel.onchange = () => {
      strings[s] = parseInt(sel.value, 10);
      rebuildTunerUI();
      drawFB();
    };
    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    bar.appendChild(wrap);
  }
}

async function initDeviceSel() {
  const chk = $("chkAsioAutoFallback");
  let autoFallbackPref = false;
  try {
    autoFallbackPref = localStorage.getItem("asioAutoFallback") === "1";
  } catch (e) { }
  if (chk) chk.checked = autoFallbackPref;

  await rebuildDeviceDropdown();
  const isRemoteWeb = window.location.protocol === "https:";
  if ((autoFallbackPref || isRemoteWeb) && $("deviceSel")) {
    $("deviceSel").value = "mic_default";
    updateAsioStatusBadge("web");
  }

  const ok = await probeAsioBridgeSilent(550);
  if (ok) {
    updateAsioStatusBadge("ok");
  } else if (!(autoFallbackPref || isRemoteWeb)) {
    updateAsioStatusBadge("warn");
  }
}

// ---------- Init ----------
initLang();
applyStaticI18n();
buildKeySel();
rebuildScaleSel();
rebuildTuningSel();
rebuildCustomTuningUI();
rebuildTunerUI();
rebuildVoicingSel();
initSlideToggles();
initAccordions();
bindEvents();
initDeviceSel();
listOutputDevices();
drawFB();

// URL hash handler for direct views & deep-linking (#bass, #drawer, #recording)
function handleHashRoute() {
  const hash = window.location.hash.toLowerCase();
  if (hash.includes("2d")) setFbViewMode("2d");
  else if (hash.includes("deep")) setFbViewMode("deep");
  else if (hash.includes("3d")) setFbViewMode("studio");
  if (hash.includes("rosewood")) setNeckWood("rosewood");
  else if (hash.includes("maple")) setNeckWood("maple");
  else if (hash.includes("cyber")) setNeckWood("cyber");
  else if (hash.includes("ebony")) setNeckWood("ebony");
  if (hash.includes("bass")) {
    const sel = $("instrSel");
    if (sel && sel.value !== "bass") {
      sel.value = "bass";
      sel.dispatchEvent(new Event("change"));
    }
  }
  if (hash.includes("rhythm")) {
    setAppMode("rhythm");
  }
  if (hash.includes("finger")) {
    setLabelMode("finger");
  }
  if (hash.includes("68")) {
    const mSel = $("rhythmMeterSel");
    if (mSel) {
      mSel.value = "6_8";
      mSel.dispatchEvent(new Event("change"));
    }
  }
  if (hash.includes("chord")) {
    const guideT = $("guideToggle");
    if (guideT && guideMode !== "chord") guideT.click();
    const vSel = $("voicingSel");
    if (vSel && vSel.options.length > 1) {
      vSel.selectedIndex = 1; // E-Shape Barre (5th fret for A)
      vSel.dispatchEvent(new Event("change"));
    }
    const dSel = $("rhythmDrillSel");
    if (dSel) {
      dSel.value = "chord";
      dSel.dispatchEvent(new Event("change"));
    }
  }
  if (hash.includes("asio")) {
    setTimeout(() => { openAsioSmartPopover(); }, 80);
  }
  if (hash.includes("drawer") || hash.includes("rec") || hash.includes("recording")) {
    const drawer = $("sideDrawer");
    const backdrop = $("sideDrawerBackdrop");
    if (drawer) drawer.classList.add("open");
    if (backdrop) backdrop.classList.add("open");
    if (hash.includes("rec") || hash.includes("recording")) {
      const accHeaders = document.querySelectorAll(".accordion-header");
      if (accHeaders && accHeaders[2]) {
        const item = accHeaders[2].closest(".accordion-item");
        if (item) item.classList.add("expanded");
      }
    }
  }
}
handleHashRoute();
window.addEventListener("hashchange", handleHashRoute);
