/* ============================================================
   audio-engine.js - Web Audio, ASIO WebSocket & Audio I/O
   ============================================================ */

import { midiToFreq, pc } from "./music-theory.js";

export let audioCtx = null;
export let stream = null;
export let source = null;
export let analyser = null;
export let buf = null;
export let ws = null;

export let monitorGainNode = null;
export let isMonitoringEnabled = false;
export let monitorVolume = 0.7;

let nextAsioPcmTime = 0;

export function setMonitoringState(enabled, volume) {
  isMonitoringEnabled = enabled;
  monitorVolume = volume;
  updateMonitoring();
}

export function updateMonitoring() {
  if (monitorGainNode && audioCtx) {
    monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
  }
  sendMonitoringState();
}

export function sendMonitoringState() {
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

export function ensureAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

export async function getStream(id) {
  const isSpecificId = id && id !== "mic_default" && id !== "asio_ws";
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      ...(isSpecificId ? { deviceId: { exact: id } } : {})
    }
  });
}

export async function listDevices(selEl, translateFn) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  const d = await navigator.mediaDevices.enumerateDevices();
  const ins = d.filter(x => x.kind === "audioinput");
  if (!selEl) return;
  const curVal = selEl.value;
  selEl.innerHTML = "";

  const asioOpt = document.createElement("option");
  asioOpt.value = "asio_ws";
  asioOpt.textContent = `⚡ ${translateFn("optAsioWebsocket")}`;
  selEl.appendChild(asioOpt);

  ins.forEach((x, i) => {
    const o = document.createElement("option");
    o.value = x.deviceId;
    o.textContent = x.label || ("Input " + (i + 1));
    selEl.appendChild(o);
  });

  if (curVal && Array.from(selEl.options).some(o => o.value === curVal)) {
    selEl.value = curVal;
  } else if (ins.length > 0) {
    selEl.value = ins[0].deviceId;
  } else {
    selEl.value = "asio_ws";
  }
  selEl.disabled = false;
}

export async function listOutputDevices(selEl, translateFn) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter(d => d.kind === "audiooutput");
    if (!selEl) return;
    const curVal = selEl.value;
    selEl.innerHTML = "";

    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = translateFn("optDefaultOutput");
    selEl.appendChild(defOpt);

    outputs.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || (`Output ${i + 1}`);
      selEl.appendChild(opt);
    });

    if (curVal && Array.from(selEl.options).some(o => o.value === curVal)) {
      selEl.value = curVal;
    }
  } catch (e) {
    console.warn("Error listing output devices:", e);
  }
}

export async function setAudioOutputDevice(deviceId) {
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

export function playAsioPcmChunk(pcmData, sampleRate = 44100) {
  if (!isMonitoringEnabled || !pcmData || pcmData.length === 0) return;
  ensureAudioCtx();

  const buffer = audioCtx.createBuffer(1, pcmData.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < pcmData.length; i++) {
    channelData[i] = pcmData[i];
  }

  const sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = buffer;

  // Cleanup resource immediately on completion
  sourceNode.onended = () => {
    try { sourceNode.disconnect(); } catch (e) {}
  };

  if (monitorGainNode) {
    sourceNode.connect(monitorGainNode);
  } else {
    sourceNode.connect(audioCtx.destination);
  }

  const now = audioCtx.currentTime;
  if (nextAsioPcmTime < now) {
    nextAsioPcmTime = now + 0.005;
  }
  sourceNode.start(nextAsioPcmTime);
  nextAsioPcmTime += buffer.duration;
}

export function connectAsioWs(onMessageCallback, translateFn, refPitch) {
  return new Promise((resolve, reject) => {
    if (ws) {
      try { ws.close(); } catch (e) { }
    }

    ws = new WebSocket("ws://127.0.0.1:8765");
    let resolved = false;

    ws.onopen = () => {
      resolved = true;
      sendRefPitch(refPitch);
      sendMonitoringState();
      resolve();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.pcm) {
          playAsioPcmChunk(data.pcm);
        }
        onMessageCallback(data);
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onerror = (error) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(translateFn("verdictAsioError")));
      }
    };
  });
}

export function sendRefPitch(refPitch) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set_ref_pitch", value: refPitch }));
  }
}

export function setupWebAudioConnection(streamObj) {
  ensureAudioCtx();
  stream = streamObj;
  source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  buf = new Float32Array(analyser.fftSize);
  source.connect(analyser);

  monitorGainNode = audioCtx.createGain();
  monitorGainNode.gain.setValueAtTime(isMonitoringEnabled ? monitorVolume : 0, audioCtx.currentTime);
  source.connect(monitorGainNode);
  monitorGainNode.connect(audioCtx.destination);
}

export function cleanupAudioConnections() {
  if (source) {
    try { source.disconnect(); } catch (e) {}
    source = null;
  }
  if (stream) {
    try { stream.getTracks().forEach(tk => tk.stop()); } catch (e) {}
    stream = null;
  }
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
}

export function playMidiNote(midi, refPitch = 440) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const freq = midiToFreq(midi, refPitch);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.2);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 1.2);

  osc.onended = () => {
    try { osc.disconnect(); gain.disconnect(); } catch (e) {}
  };
}

export function playJamSynthChord(rootPcVal, isMinor, durationSec = 2.0, refPitch = 440) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const thirdInterval = isMinor ? 3 : 4;
  const chordNotes = [
    rootPcVal + 48,
    rootPcVal + thirdInterval + 48,
    rootPcVal + 7 + 48
  ];

  chordNotes.forEach((midi, idx) => {
    const freq = midiToFreq(midi, refPitch);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

    const startTime = audioCtx.currentTime + (idx * 0.03);
    const stopTime = startTime + durationSec;

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(startTime);
    osc.stop(stopTime);

    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch (e) {}
    };
  });
}

export function playMetronomeClick(isDownbeat) {
  try { ensureAudioCtx(); } catch (e) { return; }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  const freq = isDownbeat ? 1200 : 800;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.05);

  osc.onended = () => {
    try { osc.disconnect(); gain.disconnect(); } catch (e) {}
  };
}
