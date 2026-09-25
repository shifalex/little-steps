(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearningModels = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const labels = { associative: 'Associative memory', actr: 'ACT-R-inspired memory', neural: 'Neural network (MLP)' };
  const key = f => `${f.a}${f.op}${f.b}`;
  class ActivationMemory {
    constructor(config) { this.config = config; this.chunks = new Map(); this.updates = 0; }
    learn(fact, value, step) {
      const id = `${key(fact)}=${value}`;
      if (!this.chunks.has(id)) this.chunks.set(id, { fact: { ...fact }, value, visits: [] });
      this.chunks.get(id).visits.push(step); this.updates++;
    }
    predict(fact, step) {
      let best = null;
      for (const chunk of this.chunks.values()) {
        if (key(chunk.fact) !== key(fact)) continue;
        const activation = Math.log(chunk.visits.reduce((sum, t) => sum + Math.max(1, step - t) ** -this.config.forgetting, 0));
        if (!best || activation > best.activation) {
          const strength = 1 / (1 + Math.exp(-(activation - this.config.actrThreshold) / this.config.actrNoise));
          best = { fact: { ...fact }, value: chunk.value, strength, activation, retrievalLatency: Math.exp(-activation), exposures: chunk.visits.length };
        }
      }
      return best;
    }
    decay() { /* Recency decay is evaluated from timestamps at prediction time. */ }
    snapshot() { return { type: 'actr', updates: this.updates, chunks: [...this.chunks.values()].map(c => ({ ...c, visits: [...c.visits] })) }; }
  }
  class NeuralMemory {
    constructor(config, random) {
      this.config = config; this.random = random; this.hidden = config.hidden;
      this.inputs = 24; this.outputs = 11; this.updates = 0; this.lastLoss = null; this.buffer = [];
      const initialize = (size, scale) => Array.from({ length: size }, () => (random() * 2 - 1) * scale);
      this.w1 = initialize(this.inputs * this.hidden, Math.sqrt(6 / (this.inputs + this.hidden)));
      this.w2 = initialize(this.hidden * this.outputs, Math.sqrt(6 / (this.hidden + this.outputs)));
      this.b1 = Array(this.hidden).fill(0); this.b2 = Array(this.outputs).fill(0);
    }
    encode(f) { const x = Array(24).fill(0); x[f.a] = 1; x[11 + f.b] = 1; x[f.op === '+' ? 22 : 23] = 1; return x; }
    forward(fact) {
      const x = this.encode(fact), h = Array(this.hidden);
      for (let j = 0; j < this.hidden; j++) {
        let z = this.b1[j]; for (let i = 0; i < this.inputs; i++) z += x[i] * this.w1[j * this.inputs + i];
        h[j] = Math.tanh(z);
      }
      const z = Array(this.outputs);
      for (let k = 0; k < this.outputs; k++) { z[k] = this.b2[k]; for (let j = 0; j < this.hidden; j++) z[k] += h[j] * this.w2[k * this.hidden + j]; }
      const max = Math.max(...z), p = z.map(v => Math.exp(v - max)), sum = p.reduce((a, b) => a + b, 0);
      return { x, h, p: p.map(v => v / sum) };
    }
    predict(fact) {
      if (!this.updates) return null;
      const { p } = this.forward(fact); let value = 0;
      for (let k = 1; k < this.outputs; k++) if (p[k] > p[value]) value = k;
      return { fact: { ...fact }, value, strength: p[value], probabilities: p };
    }
    train(fact, target) {
      const rate = this.config.learning;
      if (rate === 0) return;
      const { x, h, p } = this.forward(fact), dz = [...p]; dz[target] -= 1;
      const dh = Array(this.hidden).fill(0);
      for (let j = 0; j < this.hidden; j++) {
        for (let k = 0; k < this.outputs; k++) dh[j] += dz[k] * this.w2[k * this.hidden + j];
        dh[j] *= 1 - h[j] * h[j];
      }
      for (let k = 0; k < this.outputs; k++) {
        for (let j = 0; j < this.hidden; j++) this.w2[k * this.hidden + j] -= rate * dz[k] * h[j];
        this.b2[k] -= rate * dz[k];
      }
      for (let j = 0; j < this.hidden; j++) {
        for (let i = 0; i < this.inputs; i++) this.w1[j * this.inputs + i] -= rate * dh[j] * x[i];
        this.b1[j] -= rate * dh[j];
      }
      this.updates++; this.lastLoss = -Math.log(Math.max(1e-15, p[target]));
    }
    learn(fact, value) {
      this.buffer.push({ fact: { ...fact }, value }); if (this.buffer.length > 256) this.buffer.shift();
      this.train(fact, value);
      for (let i = 1; i < this.config.replayUpdates; i++) {
        const previous = this.buffer[Math.floor(this.random() * this.buffer.length)];
        this.train(previous.fact, previous.value);
      }
    }
    decay() {
      // Toy weight decay; online SGD also produces interference.
      const retention = 1 - this.config.forgetting * .0005;
      for (const array of [this.w1, this.w2, this.b1, this.b2]) for (let i = 0; i < array.length; i++) array[i] *= retention;
    }
    snapshot() { return { type: 'neural', shape: [24, this.hidden, 11], updates: this.updates, lastLoss: this.lastLoss, w1: [...this.w1], w2: [...this.w2], b1: [...this.b1], b2: [...this.b2], replay: this.buffer.map(x => ({ fact: { ...x.fact }, value: x.value })) }; }
  }
  return { labels, ActivationMemory, NeuralMemory };
});
