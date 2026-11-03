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

async function rebuildDeviceDropdown() {
  const sel = $("deviceSel");
  if (!sel) return;

  const prevValue = sel.value;
  sel.innerHTML = "";

  // 1. ASIO & Audio Interfaces (Python Server)
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

  // 2. Web Audio Direct Microphones (Browser)
  let micDevices = [];
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      micDevices = d.filter(x => x.kind === "audioinput");
    } catch (e) { }
  }

  if (micDevices.length > 0) {
    const micGroup = document.createElement("optgroup");
    micGroup.label = t("optMicDeviceGroup");

    micDevices.forEach((x, i) => {
      const o = document.createElement("option");
      o.value = "mic_dev_" + x.deviceId;
      o.textContent = `🎙️ ${x.label || ("Microphone " + (i + 1))}`;
      micGroup.appendChild(o);
    });
    sel.appendChild(micGroup);
  }

  if (currentAsioDeviceId !== null && currentAsioDeviceId !== undefined && (!prevValue || prevValue === "asio_ws" || prevValue.startsWith("asio_dev_"))) {
    sel.value = "asio_dev_" + currentAsioDeviceId;
  } else if (prevValue && Array.from(sel.options).some(o => o.value === prevValue)) {
    sel.value = prevValue;
  } else if (sel.options.length > 0) {
    sel.value = sel.options[0].value;
  }
  sel.disabled = false;
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

function renderStaticFretboard() {
  const fb = $("fb"); if (!fb) return;
  fb.innerHTML = "";
  fretboardNoteElements = [];

  const frets = 15;
  const numStrings = strings.length;
  const W = 840, H = 240, marginX = 40, marginY = 24;
  const usableW = W - marginX * 2, usableH = H - marginY * 2;

  const fretX = [];
  if (isLeftHand) {
    for (let i = 0; i <= frets; i++) {
      fretX.push(W - marginX - (usableW * (i / frets)));
    }
  } else {
    for (let i = 0; i <= frets; i++) {
      fretX.push(marginX + (usableW * (i / frets)));
    }
  }

  for (let i = 0; i <= frets; i++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", fretX[i]); line.setAttribute("y1", marginY);
    line.setAttribute("x2", fretX[i]); line.setAttribute("y2", H - marginY);
    line.setAttribute("stroke", i === 0 ? "#cbd5e1" : "#475569");
    line.setAttribute("stroke-width", i === 0 ? "5" : "2");
    fb.appendChild(line);

    if (i > 0) {
      const num = document.createElementNS("http://www.w3.org/2000/svg", "text");
      num.setAttribute("x", (fretX[i - 1] + fretX[i]) / 2);
      num.setAttribute("y", H - 6);
      num.setAttribute("class", "fret-num");
      num.setAttribute("data-fret", i);
      num.textContent = i;
      fb.appendChild(num);
    }
  }

  const singleMarkers = [3, 5, 7, 9, 15];
  const doubleMarkers = [12];

  singleMarkers.forEach(f => {
    if (f <= frets) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", (fretX[f - 1] + fretX[f]) / 2);
      circle.setAttribute("cy", H / 2);
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", "#334155");
      fb.appendChild(circle);
    }
  });

  doubleMarkers.forEach(f => {
    if (f <= frets) {
      const cx = (fretX[f - 1] + fretX[f]) / 2;
      const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c1.setAttribute("cx", cx); c1.setAttribute("cy", marginY + usableH * 0.25);
      c1.setAttribute("r", "5"); c1.setAttribute("fill", "#334155");
      fb.appendChild(c1);

      const c2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c2.setAttribute("cx", cx); c2.setAttribute("cy", marginY + usableH * 0.75);
      c2.setAttribute("r", "5"); c2.setAttribute("fill", "#334155");
      fb.appendChild(c2);
    }
  });

  const stringY = (sIdx) => marginY + (sIdx * (usableH / Math.max(1, numStrings - 1)));
  const fretCenterX = (fNum) => {
    const clamped = Math.max(0, Math.min(frets, fNum));
    if (clamped === 0) return isLeftHand ? (W - marginX + 15) : (marginX - 15);
    const lo = Math.floor(clamped);
    const hi = Math.min(frets, lo + 1);
    const frac = clamped - lo;
    const cLo = lo === 0 ? (isLeftHand ? W - marginX + 15 : marginX - 15) : (fretX[lo - 1] + fretX[lo]) / 2;
    const cHi = (fretX[hi - 1] + fretX[hi]) / 2;
    return cLo + (cHi - cLo) * frac;
  };

  fretboardGeom = { fretX, stringY, fretCenterX, marginX, marginY, W, neckH: H, fullH: 302, frets, numStrings };

  // Highlight active Fret Box Zone when in Rhythm Mode
  if (appMode === "rhythm") {
    const [bMin, bMax] = getFretBoxRange(rhythmBoxId);
    const xStart = bMin === 0 ? fretX[0] : fretX[bMin - 1];
    const xEnd = fretX[Math.min(frets, bMax)];
    const rectX = Math.min(xStart, xEnd);
    const rectW = Math.abs(xEnd - xStart);
    const boxRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    boxRect.setAttribute("x", rectX);
    boxRect.setAttribute("y", marginY - 8);
    boxRect.setAttribute("width", rectW);
    boxRect.setAttribute("height", usableH + 16);
    boxRect.setAttribute("rx", "6");
    boxRect.setAttribute("fill", "rgba(56, 189, 248, 0.07)");
    boxRect.setAttribute("stroke", "rgba(56, 189, 248, 0.35)");
    boxRect.setAttribute("stroke-dasharray", "4 3");
    fb.appendChild(boxRect);
  }

  for (let s = 0; s < numStrings; s++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = stringY(s);
    line.setAttribute("x1", marginX); line.setAttribute("y1", y);
    line.setAttribute("x2", W - marginX); line.setAttribute("y2", y);
    line.setAttribute("stroke", "#94a3b8");
    const strokeW = (currentInstrument === "bass") ? (2.0 + s * 1.2) : (1.0 + s * 0.5);
    line.setAttribute("stroke-width", strokeW);
    fb.appendChild(line);
  }

  // Hybrid Hand Back Layer (Palm, Knuckles, and 2-Segment Finger Bones rendered UNDER note dots so text is never occluded)
  const handBackLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  handBackLayer.setAttribute("id", "fretboardHandBackLayer");
  handBackLayer.style.pointerEvents = "none";
  fb.appendChild(handBackLayer);

  const isChordMode = (guideMode === "chord");
  if (!isChordMode) {
    voicingMode = false;
    currentVoicing = null;
  }
  currentChordPcs = isChordMode ? getChordPcs(rootPc, chordTypeVal) : [];

  for (let s = 0; s < numStrings; s++) {
    const openMidi = strings[s];
    const y = stringY(s);

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
        if (targetFret !== null && targetFret === f) {
          isVoicingNote = true;
        }
      }

      if (voicingMode && !isVoicingNote) continue;
      if (!isVisibleTone && !voicingMode) continue;

      const cx = f === 0 ? (isLeftHand ? W - marginX + 15 : marginX - 15) : (fretX[f - 1] + fretX[f]) / 2;
      const fingerNum = getRecommendedFinger(s, f);

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      let classes = "note-dot";
      if (isRoot) classes += " is-root";
      const interval = pc(midi - rootPc);
      if (currentInstrument === "bass" && interval === 7) {
        classes += " is-fifth"; // 5th degree groove accent for bass
      }
      g.setAttribute("class", classes);
      g.setAttribute("data-midi", midi);
      g.setAttribute("data-pc", notePc);
      g.setAttribute("data-str", s);
      g.setAttribute("data-fret", f);
      g.setAttribute("data-cx", cx);
      g.setAttribute("data-cy", y);
      g.setAttribute("data-finger", fingerNum);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", cx); circle.setAttribute("cy", y);
      circle.setAttribute("r", "11");

      let fill = "var(--tone)";
      if (isRoot) fill = "var(--root)";
      circle.setAttribute("fill", fill);
      if (labelMode === "finger") {
        circle.setAttribute("stroke", FINGER_COLORS[fingerNum] || "#ffffff");
        circle.setAttribute("stroke-width", "2.2");
      }
      g.appendChild(circle);

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", cx); text.setAttribute("y", y + 4);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", labelMode === "finger" ? "12px" : "11px");
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

  // Hybrid Hand Tip Layer (Fingertip Pads, Nail Crescents, Barre Bars, and Motion Trajectory Arcs)
  const handTipLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  handTipLayer.setAttribute("id", "fretboardHandTipLayer");
  handTipLayer.style.pointerEvents = "none";
  fb.appendChild(handTipLayer);

  const approachRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  approachRing.setAttribute("id", "rhythmApproachRing");
  approachRing.setAttribute("class", "rhythm-approach-ring");
  approachRing.style.display = "none";
  fb.appendChild(approachRing);
}

function renderFretboardHandOverlay(nowRel = 0) {
  const backLayer = $("fretboardHandBackLayer");
  const tipLayer = $("fretboardHandTipLayer");
  if (!backLayer || !tipLayer || !fretboardGeom) return;

  backLayer.innerHTML = "";
  tipLayer.innerHTML = "";

  const isChordVoicingActive = (guideMode === "chord" && voicingMode && currentVoicing && currentInstrument !== "bass");
  const shouldShowHand = (appMode === "rhythm") || (labelMode === "finger") || isChordVoicingActive || (hoveredFretNote !== null);
  if (!shouldShowHand) return;

  const { fretCenterX, stringY, neckH, frets, numStrings } = fretboardGeom;
  const ns = "http://www.w3.org/2000/svg";

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
      if (primaryActive.fret === 0) {
        openStringTarget = primaryActive;
      } else if (primaryActive.finger >= 1 && primaryActive.finger <= 4) {
        activeByFinger[primaryActive.finger] = primaryActive;
      }
    }
  } else if (isChordVoicingActive) {
    // Show all fingers of the selected CAGED Chord Voicing simultaneously (including Barre on Finger 1!)
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
        // Keep the lowest-pitched string (highest s index) as the primary tip target for each finger
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
    // Idle Rhythm Mode Preview: show 1st note (ACTIVE) and 2nd note (NEXT) of preview chart
    const previewChart = generateRhythmChart();
    primaryActive = hoveredFretNote || previewChart[0] || null;
    nextTarget = hoveredFretNote ? null : (previewChart[1] || null);
    if (primaryActive) {
      if (primaryActive.fret === 0) openStringTarget = primaryActive;
      else if (primaryActive.finger >= 1 && primaryActive.finger <= 4) {
        activeByFinger[primaryActive.finger] = primaryActive;
      }
    }
  } else if (hoveredFretNote) {
    primaryActive = hoveredFretNote;
    if (primaryActive.fret === 0) openStringTarget = primaryActive;
    else if (primaryActive.finger >= 1 && primaryActive.finger <= 4) {
      activeByFinger[primaryActive.finger] = primaryActive;
    }
  } else if (litPcs && litPcs.length > 0) {
    // In Finger Guide mode when playing a note into mic, find matching fret dot
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

  // 2. Compute Target 4-Fret Hand Anchor (Fret of Index Finger 1)
  let [boxMin, boxMax] = getFretBoxRange(appMode === "rhythm" ? rhythmBoxId : "box1");
  let targetAnchorFret = Math.max(1, boxMin === 0 ? 1 : boxMin);

  if (isChordVoicingActive) {
    const validFrets = currentVoicing.frets.filter(f => f !== null && f > 0);
    if (validFrets.length > 0) {
      targetAnchorFret = Math.max(1, Math.min(frets - 3, Math.min(...validFrets)));
    }
  } else if (primaryActive && primaryActive.fret > 0 && primaryActive.finger >= 1) {
    // Align palm so Finger `primaryActive.finger` naturally lines up with `primaryActive.fret`
    targetAnchorFret = Math.max(1, Math.min(frets - 3, primaryActive.fret - (primaryActive.finger - 1)));
  }

  if (handAnchorFretSmoothed === null || !isRhythmPlaying) {
    handAnchorFretSmoothed = targetAnchorFret;
  } else {
    handAnchorFretSmoothed += (targetAnchorFret - handAnchorFretSmoothed) * 0.25;
  }

  const anchorF = handAnchorFretSmoothed;
  const knuckleX = {};
  for (let fIdx = 1; fIdx <= 4; fIdx++) {
    knuckleX[fIdx] = fretCenterX(anchorF + (fIdx - 1));
  }
  const knuckleY = neckH + 14; // y = 254
  const palmBottomY = neckH + 56; // y = 296

  // 3. Draw Translucent Ghost Palm & Thumb Silhouette in backLayer
  const leftEdgeX = Math.min(knuckleX[1], knuckleX[4]) - 18;
  const rightEdgeX = Math.max(knuckleX[1], knuckleX[4]) + 18;
  const palmW = Math.max(90, rightEdgeX - leftEdgeX);
  const palmCenterX = (leftEdgeX + rightEdgeX) / 2;
  const thumbSideX = isLeftHand ? (rightEdgeX + 14) : (leftEdgeX - 14);

  const palmPath = document.createElementNS(ns, "path");
  const dPalm = `
    M ${leftEdgeX + 8} ${knuckleY - 4}
    Q ${palmCenterX} ${knuckleY - 10} ${rightEdgeX - 8} ${knuckleY - 4}
    Q ${rightEdgeX + 6} ${knuckleY + 12} ${rightEdgeX - 4} ${palmBottomY - 6}
    Q ${palmCenterX} ${palmBottomY + 4} ${leftEdgeX + 4} ${palmBottomY - 6}
    Q ${leftEdgeX - 6} ${knuckleY + 12} ${leftEdgeX + 8} ${knuckleY - 4}
    Z
  `;
  palmPath.setAttribute("d", dPalm);
  palmPath.setAttribute("fill", "rgba(15, 23, 42, 0.82)");
  palmPath.setAttribute("stroke", "rgba(56, 189, 248, 0.45)");
  palmPath.setAttribute("stroke-width", "1.6");
  backLayer.appendChild(palmPath);

  // Thumb silhouette peeking on the index-finger side of the palm
  const thumbBaseX = isLeftHand ? rightEdgeX - 4 : leftEdgeX + 4;
  const thumbPath = document.createElementNS(ns, "path");
  thumbPath.setAttribute(
    "d",
    `M ${thumbBaseX} ${knuckleY + 18} Q ${thumbSideX} ${knuckleY - 6} ${thumbBaseX + (isLeftHand ? -4 : 4)} ${knuckleY - 12}`
  );
  thumbPath.setAttribute("fill", "none");
  thumbPath.setAttribute("stroke", "rgba(148, 163, 184, 0.45)");
  thumbPath.setAttribute("stroke-width", "9");
  thumbPath.setAttribute("stroke-linecap", "round");
  backLayer.appendChild(thumbPath);

  // Palm Position Label (e.g., "🖐️ POS 5F~8F")
  const minDispF = Math.round(anchorF);
  const maxDispF = Math.min(frets, minDispF + 3);
  const palmLbl = document.createElementNS(ns, "text");
  palmLbl.setAttribute("x", palmCenterX);
  palmLbl.setAttribute("y", palmBottomY - 8);
  palmLbl.setAttribute("text-anchor", "middle");
  palmLbl.setAttribute("fill", "#94a3b8");
  palmLbl.setAttribute("font-size", "10px");
  palmLbl.setAttribute("font-family", "var(--mono)");
  palmLbl.setAttribute("font-weight", "600");
  palmLbl.textContent = barreInfo
    ? `🖐️ BARRE ${barreInfo.fret}F (${currentVoicing ? currentVoicing.name : ""})`
    : `🖐️ HAND POS: ${minDispF}F ~ ${maxDispF}F`;
  backLayer.appendChild(palmLbl);

  // Helper to compute 2-segment IK middle joint (PIP joint) between knuckle (kx, ky) and fingertip (tx, ty)
  const computeJoint = (fIdx, kx, ky, tx, ty) => {
    const midX = kx + (tx - kx) * 0.52;
    const midY = ky + (ty - ky) * 0.48;
    // Natural anatomical finger splay bow
    const splayDir = isLeftHand ? -1 : 1;
    const bowOffset = (fIdx - 2.5) * 3.5 * splayDir;
    return { jx: midX + bowOffset, jy: midY };
  };

  // 4. Render Next-Note Ghost Finger & Motion Trajectory Arc (if in Rhythm Mode)
  if (nextTarget && nextTarget.fret > 0 && nextTarget.finger >= 1 && nextTarget.finger <= 4) {
    const nf = nextTarget.finger;
    const isSameAsActive = activeByFinger[nf] && activeByFinger[nf].s === nextTarget.s && activeByFinger[nf].fret === nextTarget.fret;
    if (!isSameAsActive) {
      const kx = knuckleX[nf];
      const ky = knuckleY;
      const ntx = fretCenterX(nextTarget.fret);
      const nty = stringY(nextTarget.s);
      const { jx, jy } = computeJoint(nf, kx, ky, ntx, nty);
      const fColor = FINGER_COLORS[nf] || "#38bdf8";

      const ghostBone = document.createElementNS(ns, "path");
      ghostBone.setAttribute("d", `M ${kx} ${ky} L ${jx} ${jy} L ${ntx} ${nty}`);
      ghostBone.setAttribute("fill", "none");
      ghostBone.setAttribute("stroke", fColor);
      ghostBone.setAttribute("stroke-width", "6");
      ghostBone.setAttribute("stroke-linecap", "round");
      ghostBone.setAttribute("stroke-linejoin", "round");
      ghostBone.setAttribute("stroke-dasharray", "5 4");
      ghostBone.setAttribute("opacity", "0.45");
      backLayer.appendChild(ghostBone);

      // Motion Trajectory Arc from primaryActive to nextTarget
      if (primaryActive && (primaryActive.s !== nextTarget.s || primaryActive.fret !== nextTarget.fret)) {
        const curX = fretCenterX(primaryActive.fret);
        const curY = stringY(primaryActive.s);
        const ctrlX = (curX + ntx) / 2;
        const ctrlY = Math.min(curY, nty) - 22;
        const arc = document.createElementNS(ns, "path");
        arc.setAttribute("d", `M ${curX} ${curY} Q ${ctrlX} ${ctrlY} ${ntx} ${nty}`);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", fColor);
        arc.setAttribute("stroke-width", "1.8");
        arc.setAttribute("stroke-dasharray", "3 3");
        arc.setAttribute("opacity", "0.75");
        tipLayer.appendChild(arc);
      }
    }
  }

  // 5. Render 4 Fingers (Standby or Active 2-Segment Articulated Bone + Fingertip Pad + Barre Bar)
  for (let fIdx = 1; fIdx <= 4; fIdx++) {
    const kx = knuckleX[fIdx];
    const ky = knuckleY;
    const fColor = FINGER_COLORS[fIdx] || "#38bdf8";
    const activeTarget = activeByFinger[fIdx];

    if (activeTarget && activeTarget.fret > 0) {
      const tx = fretCenterX(activeTarget.fret);
      const ty = stringY(activeTarget.s);
      const { jx, jy } = computeJoint(fIdx, kx, ky, tx, ty);

      // 5a. Outer Translucent Finger Flesh Silhouette (in backLayer, behind note dots)
      const fleshPath = document.createElementNS(ns, "path");
      fleshPath.setAttribute("d", `M ${kx} ${ky} L ${jx} ${jy} L ${tx} ${ty}`);
      fleshPath.setAttribute("fill", "none");
      fleshPath.setAttribute("stroke", fColor);
      fleshPath.setAttribute("stroke-width", "15");
      fleshPath.setAttribute("stroke-linecap", "round");
      fleshPath.setAttribute("stroke-linejoin", "round");
      fleshPath.setAttribute("opacity", "0.28");
      backLayer.appendChild(fleshPath);

      // 5b. Inner Articulated Bone Line (in backLayer)
      const bonePath = document.createElementNS(ns, "path");
      bonePath.setAttribute("d", `M ${kx} ${ky} L ${jx} ${jy} L ${tx} ${ty}`);
      bonePath.setAttribute("fill", "none");
      bonePath.setAttribute("stroke", fColor);
      bonePath.setAttribute("stroke-width", "3.8");
      bonePath.setAttribute("stroke-linecap", "round");
      bonePath.setAttribute("stroke-linejoin", "round");
      bonePath.setAttribute("opacity", "0.9");
      backLayer.appendChild(bonePath);

      // Middle Knuckle Joint (PIP Joint) Dot
      const jointDot = document.createElementNS(ns, "circle");
      jointDot.setAttribute("cx", jx);
      jointDot.setAttribute("cy", jy);
      jointDot.setAttribute("r", "4.5");
      jointDot.setAttribute("fill", "#0f172a");
      jointDot.setAttribute("stroke", fColor);
      jointDot.setAttribute("stroke-width", "2");
      backLayer.appendChild(jointDot);

      // 5c. If Finger 1 is in Barre Chord Mode, draw the full Index Barre Bar in tipLayer
      if (fIdx === 1 && barreInfo) {
        const bx = fretCenterX(barreInfo.fret);
        const yTop = stringY(barreInfo.minS) - 13;
        const yBot = stringY(barreInfo.maxS) + 13;
        const barreRect = document.createElementNS(ns, "rect");
        barreRect.setAttribute("x", bx - 13);
        barreRect.setAttribute("y", yTop);
        barreRect.setAttribute("width", "26");
        barreRect.setAttribute("height", Math.max(26, yBot - yTop));
        barreRect.setAttribute("rx", "13");
        barreRect.setAttribute("fill", "rgba(56, 189, 248, 0.18)");
        barreRect.setAttribute("stroke", "#38bdf8");
        barreRect.setAttribute("stroke-width", "2.4");
        tipLayer.appendChild(barreRect);
      } else {
        // 5d. Anatomical Fingertip Pad + Nail Crescent around target fret (in tipLayer)
        const padRing = document.createElementNS(ns, "ellipse");
        padRing.setAttribute("cx", tx);
        padRing.setAttribute("cy", ty);
        padRing.setAttribute("rx", "15");
        padRing.setAttribute("ry", "13.5");
        padRing.setAttribute("fill", "none");
        padRing.setAttribute("stroke", fColor);
        padRing.setAttribute("stroke-width", "2.2");
        padRing.setAttribute("opacity", "0.95");
        tipLayer.appendChild(padRing);

        // Fingertip Nail Crescent at top of pad
        const nailArc = document.createElementNS(ns, "path");
        nailArc.setAttribute("d", `M ${tx - 5.5} ${ty - 9.5} Q ${tx} ${ty - 13.5} ${tx + 5.5} ${ty - 9.5}`);
        nailArc.setAttribute("fill", "none");
        nailArc.setAttribute("stroke", "#ffffff");
        nailArc.setAttribute("stroke-width", "1.6");
        nailArc.setAttribute("stroke-linecap", "round");
        tipLayer.appendChild(nailArc);
      }
    } else {
      // Standby / Idle Finger resting just below the lowest string at its home fret column
      const idleTipX = kx;
      const idleTipY = neckH - 17; // y = 223, just below 6th string
      const idleJointY = (ky + idleTipY) / 2;

      const idleBone = document.createElementNS(ns, "path");
      idleBone.setAttribute("d", `M ${kx} ${ky} L ${idleTipX} ${idleJointY} L ${idleTipX} ${idleTipY}`);
      idleBone.setAttribute("fill", "none");
      idleBone.setAttribute("stroke", fColor);
      idleBone.setAttribute("stroke-width", "9");
      idleBone.setAttribute("stroke-linecap", "round");
      idleBone.setAttribute("opacity", "0.24");
      backLayer.appendChild(idleBone);
    }

    // 5e. Draw Knuckle Base Badge (①, ②, ③, ④) on the Palm
    const isFingerActive = !!(activeTarget && activeTarget.fret > 0);
    const kCircle = document.createElementNS(ns, "circle");
    kCircle.setAttribute("cx", kx);
    kCircle.setAttribute("cy", ky);
    kCircle.setAttribute("r", isFingerActive ? "10.5" : "8.5");
    kCircle.setAttribute("fill", isFingerActive ? fColor : "#0f172a");
    kCircle.setAttribute("stroke", fColor);
    kCircle.setAttribute("stroke-width", isFingerActive ? "2.5" : "1.8");
    backLayer.appendChild(kCircle);

    const kText = document.createElementNS(ns, "text");
    kText.setAttribute("x", kx);
    kText.setAttribute("y", ky + 3.8);
    kText.setAttribute("text-anchor", "middle");
    kText.setAttribute("fill", isFingerActive ? "#090c10" : fColor);
    kText.setAttribute("font-size", "10.5px");
    kText.setAttribute("font-weight", "800");
    kText.textContent = String(fIdx);
    backLayer.appendChild(kText);

    // Short finger name below knuckle when active
    const kSub = document.createElementNS(ns, "text");
    kSub.setAttribute("x", kx);
    kSub.setAttribute("y", ky + 20);
    kSub.setAttribute("text-anchor", "middle");
    kSub.setAttribute("fill", isFingerActive ? "#ffffff" : "#64748b");
    kSub.setAttribute("font-size", "9.5px");
    kSub.setAttribute("font-weight", isFingerActive ? "700" : "500");
    kSub.textContent = t("fingerShort_" + fIdx);
    backLayer.appendChild(kSub);
  }

  // 6. Open String (⓪ 개방현) Nut Highlight Banner
  if (openStringTarget && openStringTarget.fret === 0) {
    const ox = fretCenterX(0);
    const oy = stringY(openStringTarget.s);
    const openHalo = document.createElementNS(ns, "circle");
    openHalo.setAttribute("cx", ox);
    openHalo.setAttribute("cy", oy);
    openHalo.setAttribute("r", "15");
    openHalo.setAttribute("fill", "none");
    openHalo.setAttribute("stroke", "#cbd5e1");
    openHalo.setAttribute("stroke-width", "2.2");
    openHalo.setAttribute("stroke-dasharray", "4 2");
    tipLayer.appendChild(openHalo);
  }
}

function updateFretboardLit() {
  for (let i = 0; i < fretboardNoteElements.length; i++) {
    const g = fretboardNoteElements[i];
    const notePc = parseInt(g.getAttribute("data-pc"), 10);
    const sIdx = parseInt(g.getAttribute("data-str"), 10);
    const fret = parseInt(g.getAttribute("data-fret"), 10);
    const isLit = litPcs.includes(notePc);
    const isJamTarget = isJamPlaying && jamTargetChordPcs.includes(notePc);
    const isRhythmNow = isRhythmPlaying && rhythmCurrentTarget && rhythmCurrentTarget.s === sIdx && rhythmCurrentTarget.fret === fret;
    const isRhythmNext = isRhythmPlaying && rhythmNextTarget && rhythmNextTarget.s === sIdx && rhythmNextTarget.fret === fret && !isRhythmNow;

    g.classList.toggle("is-lit", isLit);
    g.classList.toggle("is-jam", isJamTarget && !isLit);
    g.classList.toggle("is-rhythm-target", !!isRhythmNow);
    g.classList.toggle("is-rhythm-next", !!isRhythmNext);
  }
  renderFretboardHandOverlay(isRhythmPlaying && audioCtx ? (audioCtx.currentTime - rhythmStartTime) : 0);
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
  try {
    const devId = $("deviceSel").value;
    await connect(devId);
    if (devId && !devId.startsWith("asio_")) {
      await listDevices();
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
    $("err").textContent = e.message;
    stop();
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
      updateToggleVisuals(handT, isLeftHand, "toggleLeft", "toggleRight");
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
  const radius = 12 + clampedRatio * 20; // shrinks from 32px down to 12px at Hit time

  ring.setAttribute("cx", cx);
  ring.setAttribute("cy", cy);
  ring.setAttribute("r", radius.toFixed(1));
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

  // Spawn burst particles on Highway Hit Line
  spawnRhythmHitParticles(candidate.s, tier, candidate.finger);
  showRhythmJudgment(tier, offsetMs);
  updateRhythmLiveStatsUI();
}

function spawnRhythmHitParticles(sIdx, tier, fingerIdx) {
  const canvas = $("rhythmCanvas");
  if (!canvas) return;
  const H = canvas.height;
  const numStrings = strings.length;
  const topPad = 28, botPad = 24;
  const usableH = H - topPad - botPad;
  const y = topPad + sIdx * (usableH / Math.max(1, numStrings - 1));
  const hitX = 115;
  const color = tier === "perfect" ? "#38bdf8" : (tier === "great" ? "#22c55e" : (FINGER_COLORS[fingerIdx] || "#facc15"));

  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const speed = 1.8 + Math.random() * 2.5;
    rhythmParticles.push({
      x: hitX,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.0,
      color
    });
  }
}

function drawRhythmHighway(nowRel = 0) {
  const canvas = $("rhythmCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, W, 0);
  bgGrad.addColorStop(0, "#0b111c");
  bgGrad.addColorStop(0.16, "#090e17");
  bgGrad.addColorStop(1, "#06090f");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const numStrings = strings.length;
  const topPad = 28, botPad = 24;
  const usableH = H - topPad - botPad;
  const hitX = 115;
  const lookaheadSec = 2.6;
  const pxPerSec = (W - hitX - 30) / lookaheadSec;
  const laneY = (sIdx) => topPad + sIdx * (usableH / Math.max(1, numStrings - 1));

  // 1. Draw vertical pulse, sub-accent, & bar lines according to Time Signature (4/4, 3/4, 6/8, 12/8, etc.)
  const meter = getRhythmMeterInfo();
  const pulseSec = meter.pulseSec;
  const pulsesPerBar = meter.pulsesPerBar;
  const firstPulse = Math.floor((nowRel - 0.3) / pulseSec);
  const lastPulse = Math.ceil((nowRel + lookaheadSec) / pulseSec);

  for (let pIdx = firstPulse; pIdx <= lastPulse; pIdx++) {
    if (pIdx < 0) continue;
    const pTime = pIdx * pulseSec;
    const x = hitX + (pTime - nowRel) * pxPerSec;
    if (x < 65 || x > W) continue;

    const pulseInBar = pIdx % pulsesPerBar;
    const isBar = (pulseInBar === 0);
    const isSubAccent = meter.subAccents.includes(pulseInBar);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, topPad - 12);
    ctx.lineTo(x, H - botPad + 10);
    if (isBar) {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.42)";
      ctx.lineWidth = 2.0;
    } else if (isSubAccent) {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.32)";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
    } else {
      ctx.strokeStyle = "rgba(71, 85, 105, 0.22)";
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.restore();

    if (isBar) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "700 10px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`BAR ${Math.floor(pIdx / pulsesPerBar) + 1}`, x, 13);
    } else {
      ctx.fillStyle = isSubAccent ? "#38bdf8" : "#475569";
      ctx.font = "600 9.5px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${pulseInBar + 1}`, x, 13);
    }
  }

  // Draw Time Signature Emblem (e.g., 4/4, 3/4, 6/8, 12/8) at top-left of Highway
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(8, 6, 30, 34, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#38bdf8";
  ctx.font = "800 13px 'Oswald', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(String(meter.num), 23, 20);
  ctx.beginPath();
  ctx.moveTo(13, 23);
  ctx.lineTo(33, 23);
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(String(meter.den), 23, 36);
  ctx.restore();

  // 2. Draw string lanes and left string labels
  for (let s = 0; s < numStrings; s++) {
    const y = laneY(s);
    const isTargetLane = isRhythmPlaying && rhythmCurrentTarget && rhythmCurrentTarget.s === s;

    if (isTargetLane) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.06)";
      ctx.fillRect(65, y - 13, W - 65, 26);
    }

    ctx.beginPath();
    ctx.moveTo(65, y);
    ctx.lineTo(W, y);
    ctx.strokeStyle = isTargetLane ? "#38bdf8" : "#334155";
    ctx.lineWidth = (currentInstrument === "bass") ? (1.6 + s * 0.7) : (1.0 + s * 0.4);
    ctx.stroke();

    // Left string badge (e.g., 1E, 2B, 3G...)
    const strNote = NOTE[pc(strings[s])];
    ctx.fillStyle = isTargetLane ? "#38bdf8" : "#94a3b8";
    ctx.font = "700 11px 'IBM Plex Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${s + 1}${strNote}`, 54, y + 4);
  }

  // 3. Draw Hit Zone Line & Target Receptors
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(hitX, topPad - 14);
  ctx.lineTo(hitX, H - botPad + 14);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.restore();

  for (let s = 0; s < numStrings; s++) {
    const y = laneY(s);
    ctx.beginPath();
    ctx.arc(hitX, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0e12";
    ctx.fill();
    ctx.strokeStyle = (isRhythmPlaying && rhythmCurrentTarget && rhythmCurrentTarget.s === s) ? "#facc15" : "#475569";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 4. If idle preview, generate a preview chart so user sees the current box & finger badges immediately
  const activeChart = (isRhythmPlaying && rhythmChart.length > 0) ? rhythmChart : generateRhythmChart();

  // 5. Draw scrolling note capsules with Fret + Note/Degree + Finger Badge
  for (let i = 0; i < activeChart.length; i++) {
    const note = activeChart[i];
    if (note.status === "perfect" || note.status === "great" || note.status === "good") continue;

    const x = hitX + (note.t - nowRel) * pxPerSec;
    if (x < 55 || x > W + 45) continue;

    const y = laneY(note.s);
    const isMiss = (note.status === "miss");
    const isCurrent = (isRhythmPlaying && rhythmCurrentTarget && rhythmCurrentTarget.idx === note.idx);
    const fingerColor = FINGER_COLORS[note.finger] || "#38bdf8";

    const capW = 68;
    const capH = 22;
    const rx = x - capW / 2;
    const ry = y - capH / 2;

    ctx.save();
    if (isMiss) ctx.globalAlpha = 0.35;

    // Capsule body
    ctx.beginPath();
    ctx.roundRect(rx, ry, capW, capH, 11);
    ctx.fillStyle = isMiss ? "#334155" : (note.isRoot ? "#dc2626" : "#0f172a");
    ctx.fill();
    ctx.lineWidth = isCurrent ? 2.5 : 1.8;
    ctx.strokeStyle = isCurrent ? "#facc15" : (note.isRoot ? "#f87171" : fingerColor);
    if (isCurrent) {
      ctx.shadowColor = "#facc15";
      ctx.shadowBlur = 10;
    }
    ctx.stroke();

    // Left text inside capsule: Fret + Note/Deg (e.g., "5F·A" or "5F·1")
    const subLabel = (labelMode === "deg") ? note.deg : NOTE[note.pc];
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 11px 'IBM Plex Mono', monospace";
    ctx.textAlign = "left";
    ctx.shadowBlur = 0;
    ctx.fillText(`${note.fret}F·${subLabel}`, rx + 7, y + 4);

    // Right Finger Badge circle inside capsule (⓪~④)
    const badgeX = rx + capW - 12;
    ctx.beginPath();
    ctx.arc(badgeX, y, 8.5, 0, Math.PI * 2);
    ctx.fillStyle = fingerColor;
    ctx.fill();

    ctx.fillStyle = "#090c10";
    ctx.font = "800 10.5px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(note.finger), badgeX, y + 3.8);

    ctx.restore();
  }

  // 6. Update & draw hit burst particles
  for (let i = rhythmParticles.length - 1; i >= 0; i--) {
    const p = rhythmParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.06;
    if (p.life <= 0) {
      rhythmParticles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 7. Count-in overlay when nowRel < 0
  if (isRhythmPlaying && nowRel < 0) {
    const beatsLeft = Math.ceil(Math.abs(nowRel) / pulseSec);
    ctx.save();
    ctx.fillStyle = "rgba(9, 12, 18, 0.55)";
    ctx.fillRect(hitX + 10, 0, W - hitX - 10, H);

    ctx.fillStyle = "#facc15";
    ctx.font = "700 28px 'Oswald', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`[${meter.num}/${meter.den}] ${t("rhythmCountIn")} ${beatsLeft}`, W / 2 + 30, H / 2 - 4);

    if (rhythmCurrentTarget) {
      const fName = t("finger_" + rhythmCurrentTarget.finger);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "600 13px 'Inter', sans-serif";
      ctx.fillText(
        `NEXT: ${rhythmCurrentTarget.s + 1}st String · ${rhythmCurrentTarget.fret}F (${NOTE[rhythmCurrentTarget.pc]}) — ${FINGER_BADGES[rhythmCurrentTarget.finger]} ${fName}`,
        W / 2 + 30,
        H / 2 + 22
      );
    }
    ctx.restore();
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
      if (val.startsWith("asio_dev_")) {
        const devId = parseInt(val.replace("asio_dev_", ""), 10);
        currentAsioDeviceId = devId;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "select_asio_device", device_id: devId }));
        } else if (running) {
          await connect(val);
        }
      } else if (val === "asio_ws") {
        if (running) await connect(val);
      } else {
        if (running) {
          await connect(val);
        }
      }
    };
  }

  if ($("fb")) {
    $("fb").onclick = e => {
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
      if (!isRhythmPlaying) drawRhythmHighway(0);
    };
  }
  if ($("rhythmDrillSel")) {
    $("rhythmDrillSel").onchange = e => {
      rhythmDrillId = e.target.value;
      if (!isRhythmPlaying) drawRhythmHighway(0);
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
      if (!isRhythmPlaying) drawRhythmHighway(0);
    };
  }
  if ($("rhythmSubdivSel")) {
    $("rhythmSubdivSel").onchange = e => {
      rhythmSubdivId = e.target.value;
      if (!isRhythmPlaying) drawRhythmHighway(0);
    };
  }
  if ($("rhythmBpm")) {
    $("rhythmBpm").oninput = e => {
      rhythmBpm = parseInt(e.target.value, 10);
      if ($("rhythmBpmVal")) $("rhythmBpmVal").textContent = rhythmBpm;
      if (!isRhythmPlaying) drawRhythmHighway(0);
    };
  }
  if ($("rhythmLenSel")) {
    $("rhythmLenSel").onchange = e => {
      rhythmNoteCount = parseInt(e.target.value, 10);
      if (!isRhythmPlaying) drawRhythmHighway(0);
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

function initDeviceSel() {
  rebuildDeviceDropdown();
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
