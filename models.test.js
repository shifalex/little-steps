const assert = require('node:assert/strict');
const { Simulator, defaults, rng } = require('./engine');
const { ActivationMemory, NeuralMemory } = require('./models');
const fact = { a: 3, b: 4, op: '+' };
const actr = new ActivationMemory({ ...defaults, forgetting: .5 });
assert.equal(actr.predict(fact, 1), null);
actr.learn(fact, 7, 1);
assert.equal(actr.predict(fact, 2).activation, 0);
assert(Math.abs(actr.predict(fact, 5).activation - Math.log(.5)) < 1e-12);
assert(actr.predict(fact, 20).strength < actr.predict(fact, 2).strength);
actr.learn(fact, 7, 19);
assert(actr.predict(fact, 20).activation > 0);
const noDecay = new ActivationMemory({ ...defaults, forgetting: 0 });
for (let i = 1; i <= 3; i++) noDecay.learn(fact, 7, i);
assert(Math.abs(noDecay.predict(fact, 100).activation - Math.log(3)) < 1e-12);

// Numerical derivative checks both layers against backpropagation.
const net = new NeuralMemory({ ...defaults, learning: .01 }, rng(4));
const loss = () => -Math.log(net.forward(fact).p[7]);
const derivatives = [];
for (const [array, index] of [[net.w1,3], [net.w2,7 * net.hidden], [net.b1,0], [net.b2,7]]) {
  const old = array[index], epsilon = 1e-5;
  array[index] = old + epsilon; const plus = loss();
  array[index] = old - epsilon; const minus = loss(); array[index] = old;
  derivatives.push({ array, index, old, gradient: (plus - minus) / (2 * epsilon) });
}
net.train(fact, 7);
for (const d of derivatives) assert(Math.abs((d.old - d.array[d.index]) / .01 - d.gradient) < 1e-6);
for (let i = 0; i < 100; i++) net.learn(fact, 7);
assert.equal(net.predict(fact).value, 7);
assert(net.predict(fact).strength > .95);
assert(Math.abs(net.predict(fact).probabilities.reduce((a,b) => a+b,0) - 1) < 1e-12);
const wrong = new NeuralMemory({ ...defaults, learning: .2 }, rng(7));
for (let i = 0; i < 60; i++) wrong.learn(fact, 2);
assert.equal(wrong.predict(fact).value, 2, 'Network must learn supplied feedback, not oracle answers');
const frozen = new NeuralMemory({ ...defaults, learning: 0 }, rng(7));
const weights = [...frozen.w1]; frozen.learn(fact, 7);
assert.equal(frozen.updates, 0); assert.deepEqual(frozen.w1, weights);

const sequences = [];
for (const model of ['associative', 'actr', 'neural']) {
  const config = { model, steps: 180, seed: 99, lessons: [] };
  const a = new Simulator(config).run(), b = new Simulator(config).run();
  assert.deepEqual(a.export(), b.export(), `${model}: reproducibility`);
  const state = JSON.stringify(a.export()); a.assess(); a.assess();
  assert.equal(JSON.stringify(a.export()), state, `${model}: assessment cannot train`);
  assert.deepEqual(a.next(), b.next(), `${model}: assessments cannot consume training RNG`);
  sequences.push(a.history.map(r => [r.a,r.b,r.op]));
  assert(a.history.every(r => Number.isFinite(r.cost) && r.recallConfidence >= 0 && r.recallConfidence <= 1));
  if (model === 'neural') assert.equal(a.recallModel.updates, 181 * 8);
  if (model !== 'associative') {
    const adaptive = new Simulator({ ...config, order: 'deliberate' }).run(100);
    assert(adaptive.history.some(r => r.op === '+') && adaptive.history.some(r => r.op === '-'));
  }
}
assert.deepEqual(sequences[0], sequences[1]); assert.deepEqual(sequences[0], sequences[2]);
console.log('Passed: ACT-R activation/recency, neural finite-difference gradients, feedback learning, frozen weights, model reproducibility, matched curricula, non-training assessment, and adaptive schedules.');
