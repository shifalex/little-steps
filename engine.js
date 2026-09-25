(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./models') : root.LearningModels);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeuralLab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (models) {
  'use strict';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const key = f => `${f.a}${f.op}${f.b}`;
  const answer = f => f.op === '+' ? f.a + f.b : f.a - f.b;
  const equation = f => `${f.a} ${f.op === '-' ? '−' : '+'} ${f.b} = ${answer(f)}`;
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function domain(max = 10) {
    const facts = [];
    for (let a = 0; a <= max; a++) for (let b = 0; b <= max; b++) {
      if (a + b <= max) facts.push({ a, b, op: '+' });
      if (b <= a) facts.push({ a, b, op: '-' });
    }
    return facts;
  }
  const ruleDefs = {
    zero: { name: 'Zero leaves a number unchanged', statement: 'If the second operand is zero, the result is the first operand.' },
    self: { name: 'Subtracting itself gives zero', statement: 'If both subtraction operands are equal, the result is zero.' },
    commutative: { name: 'Reverse an addition', statement: 'If a + b = c, then b + a = c.' },
    inverse: { name: 'Undo addition', statement: 'If a + b = c, then c − b = a (or c − a = b).' },
    neighbor: { name: 'Use a neighboring sum', statement: 'If a + b = c, then a + (b + 1) = c + 1, within the exercise range.' },
    countOn: { name: 'Count on from an operand', statement: 'For a + b, start at a and take b forward counting steps.' },
    countUp: { name: 'Count up to subtract', statement: 'For a − b, count forward from b to a; the number of steps is the answer.' }
  };
  const defaults = { model: 'associative', hidden: 32, replayUpdates: 8, actrThreshold: 0, actrNoise: 0.4, seed: 42, steps: 800, forgetting: 0.15, comparison: 0.65, learning: 0.24, confidence: 0.65, exploration: 0.08, slip: 0.015, order: 'mixed', feedback: 'answer', weights: { draw: 1, count: 1, remove: 1, retrieve: 1, rule: 1, compare: 1 }, lessons: [{ step: 180, rule: 'countOn' }, { step: 400, rule: 'countUp' }] };
  class Simulator {
    constructor(config = {}) {
      this.config = { ...defaults, ...config, weights: { ...defaults.weights, ...(config.weights || {}) }, lessons: (config.lessons || defaults.lessons).map(x => ({ ...x })) };
      this.random = rng(this.config.seed);
      this.exerciseRandom = rng((this.config.seed + 48109) >>> 0);
      this.recallModel = this.config.model === 'actr' ? new models.ActivationMemory(this.config) : this.config.model === 'neural' ? new models.NeuralMemory(this.config, rng((this.config.seed + 7717) >>> 0)) : null;
      this.recallCache = new Map();
      this.facts = domain(); this.memory = new Map(); this.rules = {}; this.history = []; this.diagnostics = []; this.events = []; this.step = 0;
      for (const id of Object.keys(ruleDefs)) this.rules[id] = { id, ...ruleDefs[id], evidence: [], evidenceKeys: new Set(), strength: 0, origin: null, learnedAt: null, uses: 0, successes: 0 };
      this.diagnostics.push(this.assess());
    }
    teach(id) {
      const r = this.rules[id];
      if (!r) return;
      const already = r.origin;
      r.origin = already === 'implicit' ? 'implicit + taught' : 'taught'; r.learnedAt ??= this.step; r.strength = 1;
      this.events.push({ step: this.step, rule: id, name: r.name, previouslyDiscovered: !!already });
    }
    chooseExercise() {
      const r = this.exerciseRandom; const i = this.step - 1;
      if (this.config.order === 'families') {
        // Three consecutive related exercises, then another randomly chosen family.
        if (i % 3 === 0) { const adds = this.facts.filter(f => f.op === '+'); this.family = adds[Math.floor(r() * adds.length)]; }
        const { a, b } = this.family;
        return i % 3 === 0 ? { a, b, op: '+' } : i % 3 === 1 ? { a: a + b, b: a, op: '-' } : { a: a + b, b, op: '-' };
      }
      let pool = this.facts;
      if (this.config.order === 'deliberate') {
        // External practice scheduler: unseen and incorrectly stored facts have
        // zero correct-recall strength. Include cutoff ties to avoid operand bias.
        const scored = pool.map(fact => {
          const memory = this.recallState(fact);
          return { fact, strength: memory && memory.value === answer(fact) ? memory.strength : 0 };
        });
        const strengths = scored.map(item => item.strength).sort((a, b) => a - b);
        const cutoff = strengths[Math.ceil(strengths.length * 0.2) - 1];
        pool = scored.filter(item => item.strength <= cutoff).map(item => item.fact);
      }
      if (this.config.order === 'alternating') pool = pool.filter(f => f.op === (i % 2 ? '-' : '+'));
      if (this.config.order === 'blocked') pool = pool.filter(f => f.op === (Math.floor(i / 50) % 2 ? '-' : '+'));
      if (this.config.order === 'small') { const limit = Math.min(10, 3 + Math.floor(i / Math.max(1, this.config.steps / 8))); pool = pool.filter(f => Math.max(f.a, f.b, answer(f)) <= limit); }
      return { ...pool[Math.floor(r() * pool.length)] };
    }
    decay() {
      this.recallCache.clear();
      if (this.recallModel) this.recallModel.decay();
      const f = this.config.forgetting;
      for (const m of this.memory.values()) {
        m.strength *= 1 - f * 0.002;
        if (this.random() < f * 0.006) m.strength *= 0.45;
      }
      for (const r of Object.values(this.rules)) if (r.origin) {
        r.strength *= 1 - f * 0.0005;
        if (this.random() < f * 0.001) r.strength *= 0.7;
      }
    }
    recallState(f) {
      if (!this.recallModel) return this.memory.get(key(f)) || null;
      if (!this.recallCache.has(key(f))) {
        const prediction = this.recallModel.predict(f, this.step);
        this.recallCache.set(key(f), prediction ? { ...prediction, lastSeen: this.memory.get(key(f))?.lastSeen ?? null } : null);
      }
      return this.recallCache.get(key(f));
    }
    availableMemory(f) { const m = this.recallState(f); return m && m.strength >= this.config.confidence ? m : null; }
    availableRule(id) { const r = this.rules[id]; return r.origin && r.strength >= this.config.confidence; }
    solve(f, random, diagnostic = false) {
      const w = this.config.weights; const plans = [];
      const baseActions = f.op === '+' ? { draw: f.a + f.b, count: f.a + f.b } : { draw: f.a + f.b, remove: f.b, count: f.a - f.b };
      const costOf = actions => Object.entries(actions).reduce((sum, [id, n]) => sum + w[id] * n, 0);
      const add = (strategy, value, actions, trace, rule = null, anchor = null) => plans.push({ strategy, value, actions, trace, rule, anchor, cost: costOf(actions) });
      add('draw', answer(f), baseActions, f.op === '+' ? [`Draw ${f.a} and ${f.b} marks in two arrays.`, `Join the arrays; count all ${f.a + f.b} marks from 1.`] : [`Draw ${f.a} marks and ${f.b} removal markers.`, `Remove ${f.b} marks; count ${f.a - f.b} remaining marks from 1.`]);
      const memory = this.availableMemory(f);
      if (memory) add('recall', memory.value, { retrieve: 1 }, [this.config.model === 'neural' ? `Neural prediction: ${memory.value}, confidence ${(memory.strength * 100).toFixed(1)}%.` : this.config.model === 'actr' ? `Retrieve a chunk: activation ${memory.activation.toFixed(2)}, availability ${(memory.strength * 100).toFixed(1)}%.` : 'Retrieve the stored answer.']);
      if (this.availableRule('zero') && f.b === 0) add('rule', f.a, { rule: 1 }, ['Apply the zero rule.'], 'zero');
      if (this.availableRule('self') && f.op === '-' && f.a === f.b) add('rule', 0, { rule: 1 }, ['Apply the subtract-itself rule.'], 'self');
      if (this.availableRule('countOn') && f.op === '+') add('count', answer(f), { rule: 1, count: f.b }, [`Start at ${f.a}; count forward ${f.b} steps.`], 'countOn');
      if (this.availableRule('countUp') && f.op === '-') add('count', answer(f), { rule: 1, count: f.a - f.b }, [`Count forward from ${f.b} to ${f.a}; report the ${f.a - f.b} steps.`], 'countUp');
      if (this.availableRule('commutative') && f.op === '+' && f.a !== f.b) {
        const source = { a: f.b, b: f.a, op: '+' }; const m = this.availableMemory(source);
        if (m) add('compare', m.value, { compare: 1, retrieve: 1, rule: 1 }, [`Recall ${key(source)} = ${m.value}; reverse its operands.`], 'commutative', key(source));
      }
      if (this.availableRule('neighbor') && f.op === '+' && f.b > 0) {
        const source = { a: f.a, b: f.b - 1, op: '+' }; const m = this.availableMemory(source);
        if (m) add('compare', m.value + 1, { compare: 1, retrieve: 1, rule: 1, count: 1 }, [`Recall ${key(source)} = ${m.value}; add one to its answer.`], 'neighbor', key(source));
      }
      if (this.availableRule('inverse') && f.op === '-') {
        // Search stored additions, not an oracle-computed missing operand.
        for (const seen of this.memory.values()) {
          if (seen.fact.op !== '+' || (seen.fact.a !== f.b && seen.fact.b !== f.b)) continue;
          const m = this.availableMemory(seen.fact);
          if (m && m.value === f.a) {
          const value = m.fact.a === f.b ? m.fact.b : m.fact.a;
          add('compare', value, { compare: 1, retrieve: 1, rule: 1 }, [`Recall ${key(m.fact)} = ${m.value}; use the inverse relationship.`], 'inverse', key(m.fact)); break;
          }
        }
      }
      // Comparison ability controls whether analogous solutions are considered.
      const eligible = plans.filter(p => p.strategy !== 'compare' || random() < this.config.comparison);
      eligible.sort((a, b) => a.cost - b.cost || (a.strategy === 'recall' ? -1 : 1));
      let selected = random() < this.config.exploration ? eligible[Math.floor(random() * eligible.length)] : eligible[0];
      const failedActivation = this.config.model === 'actr' && selected.strategy === 'recall' && random() >= memory.strength;
      if (failedActivation) selected = eligible.find(plan => plan.strategy !== 'recall');
      const p = { ...selected, actions: { ...selected.actions }, trace: [...selected.trace] };
      // An unsuccessful memory attempt incurs effort before the fallback route.
      const weak = this.recallState(f);
      p.sequence = [p.strategy];
      if (failedActivation || (!memory && weak && random() < weak.strength)) {
        p.actions.retrieve = (p.actions.retrieve || 0) + 1; p.cost += w.retrieve;
        p.trace.unshift(failedActivation ? 'ACT-R-inspired retrieval fails stochastically; use a fallback.' : 'Try recall; confidence is too low. Use a fallback.'); p.sequence.unshift('failed-recall');
      }
      p.recallConfidence = weak?.strength ?? 0;
      p.recallPrediction = weak?.value ?? null;
      p.activation = weak?.activation ?? null;
      p.retrievalLatency = this.config.model === 'actr' && (p.strategy === 'recall' || p.sequence.includes('failed-recall')) ? (failedActivation ? Math.exp(-this.config.actrThreshold) : weak?.retrievalLatency ?? null) : null;
      const operations = (p.actions.count || 0) + (p.actions.remove || 0);
      if (operations && random() < 1 - (1 - this.config.slip) ** operations) {
        p.value = clamp(p.value + (random() < 0.5 ? -1 : 1), 0, 10);
        p.trace.push('An execution slip changes the answer.');
      }
      p.correct = p.value === answer(f);
      return p;
    }
    remember(f, value) {
      const k = key(f), previous = this.memory.get(k);
      const strength = previous && previous.value === value ? previous.strength : 0;
      this.memory.set(k, { fact: { ...f }, value, strength: strength + this.config.learning * (1 - strength), lastSeen: this.step });
      if (this.recallModel) this.recallModel.learn(f, value, this.step);
      this.recallCache.clear();
    }
    discover(f) {
      const k = key(f); const current = this.memory.get(k);
      if (!current) return;
      const candidates = [];
      const observedEquation = fact => `${fact.a} ${fact.op === '-' ? '−' : '+'} ${fact.b} = ${this.memory.get(key(fact)).value}`;
      if (f.b === 0 && current.value === f.a) candidates.push(['zero', k, observedEquation(f)]);
      if (f.op === '-' && f.a === f.b && current.value === 0) candidates.push(['self', k, observedEquation(f)]);
      const observed = this.memory;
      if (f.op === '+' && f.a !== f.b) {
        const reverse = { a: f.b, b: f.a, op: '+' };
        if (observed.get(key(reverse))?.value === current.value) candidates.push(['commutative', [k, key(reverse)].sort().join('|'), `${observedEquation(reverse)} → ${observedEquation(f)}`]);
      }
      if (f.op === '+') {
        for (const delta of [-1, 1]) {
          const near = { a: f.a, b: f.b + delta, op: '+' };
          if (near.b >= 0 && answer(near) <= 10 && observed.get(key(near))?.value === current.value + delta) {
            const lower = delta === -1 ? near : f, upper = delta === -1 ? f : near;
            candidates.push(['neighbor', [k, key(near)].sort().join('|'), `${observedEquation(lower)} → ${observedEquation(upper)}`]);
          }
        }
      }
      // Discover links regardless of which operation was encountered last.
      for (const m of observed.values()) {
        const a = m.fact;
        if (a.op !== '+') continue;
        for (const b of [a.a, a.b]) {
          const sub = { a: m.value, b, op: '-' };
          const otherOperand = a.a === b ? a.b : a.a;
          if ((key(a) === k || key(sub) === k) && observed.get(key(sub))?.value === otherOperand) candidates.push(['inverse', `${key(a)}|${key(sub)}`, `${observedEquation(a)} → ${observedEquation(sub)}`]);
        }
      }
      let checks = 0;
      for (const [id, evidenceKey, example] of candidates) {
        const rule = this.rules[id];
        if (rule.evidenceKeys.has(evidenceKey) || this.random() >= this.config.comparison) continue;
        checks++; rule.evidenceKeys.add(evidenceKey); rule.evidence.push(example);
        if (!rule.origin && rule.evidence.length >= 3) { rule.origin = 'implicit'; rule.learnedAt = this.step; rule.strength = 0.8; }
        else if (rule.origin) rule.strength = Math.min(1, rule.strength + this.config.learning * 0.2);
      }
      return checks;
    }
    next(forcedFact) {
      this.step++; this.decay();
      for (const lesson of this.config.lessons) if (lesson.step === this.step) this.teach(lesson.rule);
      const fact = forcedFact ? { ...forcedFact } : this.chooseExercise();
      const result = this.solve(fact, this.random);
      let feedbackCost = 0;
      if (this.config.feedback === 'answer') this.remember(fact, answer(fact));
      else if (this.config.feedback === 'retry' && !result.correct) {
        // Corrective, teacher-guided draw/count replay; separate from initial answer.
        const w = this.config.weights;
        feedbackCost = (fact.a + fact.b) * w.draw + (fact.op === '+' ? fact.a + fact.b : fact.a - fact.b) * w.count + (fact.op === '-' ? fact.b * w.remove : 0);
        this.remember(fact, answer(fact));
      } else this.remember(fact, result.value);
      const discoveryChecks = this.discover(fact) || 0;
      const learningCost = discoveryChecks * this.config.weights.compare;
      if (result.rule) { const r = this.rules[result.rule]; r.uses++; if (result.correct) r.successes++; r.strength = Math.min(1, r.strength + this.config.learning * 0.1); }
      const record = { step: this.step, ...fact, expected: answer(fact), ...result, feedbackCost, learningCost, totalCost: result.cost + feedbackCost + learningCost, lessons: this.events.map(e => e.rule) };
      this.history.push(record);
      if (this.step % 50 === 0) this.diagnostics.push(this.assess());
      return record;
    }
    assess() {
      // Independent deterministic RNG; diagnostics never train or alter the practice stream.
      const random = rng((this.config.seed + 99173) >>> 0);
      const rows = this.facts.map(f => ({ ...f, ...this.solve(f, random, true) }));
      const summarize = list => ({ n: list.length, accuracy: list.filter(r => r.correct).length / list.length, cost: list.reduce((s, r) => s + r.cost, 0) / list.length, recall: list.filter(r => r.strategy === 'recall').length / list.length });
      const unaided = this.facts.map(f => { const m = this.recallState(f); return { correct: !!m && m.value === answer(f), ready: !!m && m.strength >= this.config.confidence, confidence: m?.strength ?? 0 }; });
      return { step: this.step, ...summarize(rows), addition: summarize(rows.filter(r => r.op === '+')), subtraction: summarize(rows.filter(r => r.op === '-')), unaided: { accuracy: unaided.filter(r => r.correct).length / unaided.length, coverage: unaided.filter(r => r.ready).length / unaided.length, confidentAccuracy: unaided.filter(r => r.ready).length ? unaided.filter(r => r.ready && r.correct).length / unaided.filter(r => r.ready).length : null } };
    }
    run(n = this.config.steps) { for (let i = 0; i < n; i++) this.next(); if (this.diagnostics.at(-1).step !== this.step) this.diagnostics.push(this.assess()); return this; }
    export() { return { version: 2, model: models.labels[this.config.model], modelState: this.recallModel?.snapshot() ?? null, finalRecall: this.facts.map(fact => ({ fact, state: this.recallState(fact) })), config: this.config, domain: { maxTotal: 10, includesZero: true }, history: this.history, diagnostics: this.diagnostics, events: this.events, rules: Object.values(this.rules).map(({ evidenceKeys, ...r }) => r) }; }
  }
  return { Simulator, domain, defaults, ruleDefs, equation, key, answer, rng };
});
