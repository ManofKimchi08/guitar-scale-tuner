/* ============================================================
   hmm-decoder.js - 25-State HMM Viterbi Chord Decoder
   ============================================================ */

export const HMM_STATES = 25; // 0..11: Major, 12..23: minor, 24: No Chord
export let hmmLogProbs = Array(HMM_STATES).fill(-Math.log(HMM_STATES));
export let HMM_TEMPLATES = [];

export function initHMMTemplates() {
  HMM_TEMPLATES = [];
  // 0..11: Major
  for (let r = 0; r < 12; r++) {
    const t = Array(12).fill(0.02);
    t[r] = 1.0;
    t[(r + 4) % 12] = 0.8;
    t[(r + 7) % 12] = 0.8;
    const sum = t.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(t.map(v => v / sum));
  }
  // 12..23: minor
  for (let r = 0; r < 12; r++) {
    const t = Array(12).fill(0.02);
    t[r] = 1.0;
    t[(r + 3) % 12] = 0.8;
    t[(r + 7) % 12] = 0.8;
    const sum = t.reduce((a, b) => a + b, 0);
    HMM_TEMPLATES.push(t.map(v => v / sum));
  }
  // 24: No Chord
  HMM_TEMPLATES.push(Array(12).fill(1 / 12));
}

initHMMTemplates();

export function runHMM(chroma, rms) {
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
      for (let i = 0; i < 12; i++) {
        dot += normChroma[i] * tmpl[i];
      }
      logEmissions[s] = Math.log(Math.max(1e-6, dot));
    }
  }

  const maxPrev = Math.max(...hmmLogProbs);
  const newLogProbs = Array(HMM_STATES);

  for (let j = 0; j < HMM_STATES; j++) {
    let maxTrans = -Infinity;
    for (let i = 0; i < HMM_STATES; i++) {
      const trans = (i === j) ? logP_SELF : logP_OTHER;
      const score = hmmLogProbs[i] + trans;
      if (score > maxTrans) {
        maxTrans = score;
      }
    }
    newLogProbs[j] = maxTrans + logEmissions[j];
  }

  const normMax = Math.max(...newLogProbs);
  for (let s = 0; s < HMM_STATES; s++) {
    hmmLogProbs[s] = newLogProbs[s] - normMax;
  }

  let bestState = 24;
  let bestScore = -Infinity;
  for (let s = 0; s < HMM_STATES; s++) {
    if (hmmLogProbs[s] > bestScore) {
      bestScore = hmmLogProbs[s];
      bestState = s;
    }
  }

  return bestState;
}

export function resetHMM() {
  hmmLogProbs.fill(-Math.log(HMM_STATES));
}
