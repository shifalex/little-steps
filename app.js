'use strict';
const { Simulator, defaults, ruleDefs } = NeuralLab;
const modelLabels = LearningModels.labels;
const $ = id => document.getElementById(id);
const colors = { draw: '#9da8ac', count: '#4d8bd6', compare: '#ab79cf', rule: '#d89c35', recall: '#278b70' };
const names = { draw: 'Draw & count', count: 'Count shortcut', compare: 'Compare facts', rule: 'Apply a rule', recall: 'Direct recall' };
const sliderDefs = [
  ['forgetting', 'Random forgetfulness', 'Weakens learned answers and rules between attempts.'],
  ['comparison', 'Comparison ability', 'Notices and uses relationships between facts.'],
  ['learning', 'Learning rate', 'Strength gained from each encounter.'],
  ['confidence', 'Recall confidence', 'Strength required to trust an answer or rule.'],
  ['exploration', 'Strategy exploration', 'Chance of trying another available route.'],
  ['slip', 'Execution slip rate', 'Error probability per count or removal step.']
];
for (const [id, label, description] of sliderDefs) {
  const el = document.createElement('label'); el.className = 'slider-field';
  el.innerHTML = `<span class="slider-top">${label}<output id="${id}-value" for="${id}">${defaults[id].toFixed(id === 'slip' ? 3 : 2)}</output></span><input id="${id}" type="range" min="0" max="${id === 'slip' ? '.1' : '1'}" step="${id === 'slip' ? '.005' : '.01'}" value="${defaults[id]}"><small>${description}</small>`;
  $('sliders').append(el);
  $(id).addEventListener('input', () => { $(`${id}-value`).value = Number($(id).value).toFixed(id === 'slip' ? 3 : 2); });
}
for (const [id, value] of Object.entries(defaults.weights)) {
  const label = document.createElement('label'); label.className = 'weight';
  label.innerHTML = `${({draw:'Draw a mark',count:'Count one step',remove:'Remove a mark',retrieve:'Try retrieval',rule:'Apply a rule',compare:'Compare a relationship'})[id]}<input id="weight-${id}" type="number" min="0" max="100" step=".1" value="${value}" required>`;
  $('weights').append(label);
}
function addLesson(step = 300, rule = 'commutative') {
  const el = document.createElement('div'); el.className = 'lesson';
  el.innerHTML = `<div class="lesson-line"><label>Attempt <input aria-label="Lesson attempt" type="number" min="1" max="10000" step="1" value="${step}" required></label><button type="button" aria-label="Remove lesson">×</button></div><select aria-label="Lesson rule">${Object.entries(ruleDefs).map(([id, r]) => `<option value="${id}">${r.name}</option>`).join('')}</select>`;
  el.querySelector('select').value = rule;
  el.querySelector('button').addEventListener('click', () => { el.remove(); dirty(); });
  $('lessons').append(el);
}
defaults.lessons.forEach(l => addLesson(l.step, l.rule));
$('add-lesson').addEventListener('click', () => { addLesson(); dirty(); });
let simulation, baseline = null, modelComparison = null, view = 'practice', operation = 'all';
function updateModelControls() {
  const model = $('learning-model').value;
  $('actr-settings').hidden = model !== 'actr';
  $('neural-settings').hidden = model !== 'neural';
  $('model-description').textContent = {
    associative: 'Original fact-strength table with random forgetting. Each practice encounter strengthens its answer.',
    actr: 'Simplified declarative memory, inspired by ACT-R. Repetition and recency set activation; retrieval can fail. Forgetfulness is the power-law decay exponent. Not the full ACT-R architecture.',
    neural: 'A real 24 → hidden → 11 neural network. Learns online using backpropagation and replay. Forgetfulness controls weight shrinkage; new learning can also interfere with old learning.'
  }[model];
  $('learning').disabled = false;
  $('learning').closest('label').querySelector('small').textContent = model === 'actr' ? 'Not used for ACT-R fact activation; still governs shared rule strengthening.' : model === 'neural' ? 'Gradient-descent step size (SGD).' : 'Strength gained from each encounter.';
  $('forgetting').closest('label').querySelector('small').textContent = model === 'actr' ? 'Decay exponent d; 0 means no time decay. Shared rules retain random forgetting.' : model === 'neural' ? 'Weight shrinkage; shared rules retain random forgetting.' : 'Weakens learned answers and rules between attempts.';
}
$('learning-model').addEventListener('change', updateModelControls);
updateModelControls();
function configFromForm() {
  return { ...Object.fromEntries(sliderDefs.map(([id]) => [id, +$(id).value])), steps: +$('steps').value, seed: +$('seed').value,
    model: $('learning-model').value, hidden: +$('hidden-neurons').value, replayUpdates: +$('replay-updates').value, actrThreshold: +$('actr-threshold').value, actrNoise: +$('actr-noise').value,
    order: $('order').value, feedback: $('feedback').value,
    weights: Object.fromEntries(Object.keys(defaults.weights).map(id => [id, +$(`weight-${id}`).value])),
    lessons: [...$('lessons').children].map(el => ({ step: +el.querySelector('input').value, rule: el.querySelector('select').value })) };
}
function dirty() { $('settings-status').textContent = 'Settings changed · run to update the results.'; }
$('settings').addEventListener('input', dirty);
$('order').addEventListener('change', () => { $('order-description').hidden = $('order').value !== 'deliberate'; });
function run() {
  const scrollPosition = { left: window.scrollX, top: window.scrollY, behavior: 'instant' };
  simulation = new Simulator(configFromForm()).run();
  modelComparison = null;
  $('settings-status').textContent = `Run complete · seed ${simulation.config.seed}.`;
  $('run-title').textContent = `A learner, ${simulation.step.toLocaleString()} little steps.`;
  $('attempt').max = simulation.step; $('attempt').value = simulation.step;
  render();
  window.scrollTo(scrollPosition);
  requestAnimationFrame(() => window.scrollTo(scrollPosition));
}
$('settings').addEventListener('submit', event => { event.preventDefault(); run(); });
function selectedMetric(d) { return operation === '+' ? d.addition : operation === '-' ? d.subtraction : d; }
const percent = n => `${Math.round(n * 100)}%`;
function renderMetrics() {
  const first = selectedMetric(simulation.diagnostics[0]), last = selectedMetric(simulation.diagnostics.at(-1));
  const rules = Object.values(simulation.rules).filter(r => r.origin);
  const delta = baseline ? selectedMetric(baseline.diagnostics.at(-1)) : null;
  const items = [
    ['Assessment accuracy', percent(last.accuracy), delta ? `${((last.accuracy - delta.accuracy) * 100).toFixed(1)} pp vs baseline end` : `${last.n} facts · no learning during assessment`],
    ['Mean solving cost', last.cost.toFixed(1), delta ? `${(last.cost - delta.cost).toFixed(1)} units vs baseline end` : `Started at ${first.cost.toFixed(1)} effort units`],
    ['Recall / model response', percent(last.recall), 'Share of final assessment solutions'],
    ['Rules learned', rules.length, `${rules.filter(r => r.origin.includes('implicit')).length} inferred · ${rules.filter(r => r.origin.includes('taught')).length} taught`]
  ];
  $('metrics').innerHTML = items.map(([label, value, detail]) => `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></div>`).join('');
}
function drawCurve() {
  const canvas = $('curve'); const width = canvas.clientWidth, height = canvas.clientHeight, ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio; canvas.height = height * ratio;
  const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio);
  const pad = { l: 39, r: 15, t: 25, b: 32 }; const pw = width - pad.l - pad.r, ph = height - pad.t - pad.b;
  const rows = simulation.history.filter(r => operation === 'all' || r.op === operation);
  const maxSteps = Math.max(simulation.step, baseline ? baseline.step : 0);
  const values = view === 'practice' ? rows.map(r => r.cost) : simulation.diagnostics.map(d => selectedMetric(d).cost);
  if (baseline && view === 'assessment') values.push(...baseline.diagnostics.map(d => selectedMetric(d).cost));
  const ymax = Math.max(5, Math.ceil(Math.max(...values) / 5) * 5);
  const x = step => pad.l + step / maxSteps * pw;
  const y = value => pad.t + ph - value / ymax * ph;
  ctx.font = '10px Segoe UI'; ctx.fillStyle = '#869288';
  for (let i = 0; i <= 4; i++) {
    const value = ymax * i / 4;
    ctx.strokeStyle = '#ecf0e9'; ctx.beginPath(); ctx.moveTo(pad.l, y(value)); ctx.lineTo(width - pad.r, y(value)); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(value.toFixed(value % 1 ? 1 : 0), pad.l - 9, y(value) + 3);
  }
  for (let i = 0; i <= 4; i++) { ctx.textAlign = 'center'; ctx.fillText(Math.round(maxSteps * i / 4).toLocaleString(), x(maxSteps * i / 4), height - 12); }
  ctx.textAlign = 'left'; ctx.fillText('effort units', pad.l, 12);
  for (const [eventIndex, e] of simulation.events.entries()) {
    ctx.strokeStyle = '#bdc8ad'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x(e.step), pad.t); ctx.lineTo(x(e.step), y(0)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#7e8a70'; ctx.textAlign = 'center'; ctx.fillText(`L${eventIndex + 1}`, x(e.step), pad.t - 5);
  }
  const line = (points, color, dashed = false) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [6, 4] : []); ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(x(p.step), y(p.cost)) : ctx.moveTo(x(p.step), y(p.cost))); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  };
  if (view === 'practice') {
    for (const r of rows) {
      ctx.globalAlpha = 0.5; ctx.fillStyle = colors[r.strategy]; ctx.beginPath(); ctx.arc(x(r.step), y(r.cost), 2.3, 0, Math.PI * 2); ctx.fill();
      if (!r.correct) { ctx.globalAlpha = 0.8; ctx.strokeStyle = '#bd624d'; ctx.beginPath(); ctx.moveTo(x(r.step)-3,y(r.cost)-3); ctx.lineTo(x(r.step)+3,y(r.cost)+3); ctx.moveTo(x(r.step)+3,y(r.cost)-3); ctx.lineTo(x(r.step)-3,y(r.cost)+3); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    let sum = 0; const moving = rows.map((r, i) => { sum += r.cost; if (i >= 25) sum -= rows[i - 25].cost; return { step: r.step, cost: sum / Math.min(i + 1, 25) }; });
    line(moving, '#294d3d');
    $('curve-subtitle').textContent = 'Solving cost per attempt · color shows the chosen strategy';
    $('chart-note').textContent = 'Dark line: rolling mean of the last 25 displayed attempts. Click the plot to inspect an attempt. Lesson details appear in the rule notebook. Practice difficulty can change; use the fixed assessment for comparison.';
  } else {
    if (baseline) line(baseline.diagnostics.map(d => ({ step: d.step, cost: selectedMetric(d).cost })), '#a2aaa3', true);
    line(simulation.diagnostics.map(d => ({ step: d.step, cost: selectedMetric(d).cost })), '#278b70');
    for (const d of simulation.diagnostics) { ctx.fillStyle = '#278b70'; ctx.beginPath(); ctx.arc(x(d.step), y(selectedMetric(d).cost), 3, 0, Math.PI * 2); ctx.fill(); }
    $('curve-subtitle').textContent = 'Mean solving cost on the same exercise set · assessed every 50 attempts';
    $('chart-note').textContent = 'Green: current run. Dashed gray: saved baseline, when present. Each assessment uses all eligible facts for this filter and does not train the learner. These are simulated action costs, not seconds.';
  }
  $('baseline-status').textContent = baseline ? `${modelLabels[baseline.config.model] || 'Associative memory'} · ${baseline.step} attempts · seed ${baseline.config.seed}${view === 'practice' ? ' · view in assessment' : ''}` : 'No baseline saved';
  let lessonKey = $('lesson-key');
  if (!lessonKey) { lessonKey = document.createElement('p'); lessonKey.id = 'lesson-key'; lessonKey.className = 'chart-footnote'; $('chart-note').before(lessonKey); }
  lessonKey.textContent = simulation.events.map((e, i) => `L${i + 1} · ${e.step}: ${e.name}`).join('  /  ') || 'No lessons in this run.';
}
function renderAttempt() {
  const row = simulation.history[+$('attempt').value - 1]; if (!row) return;
  $('exercise').textContent = `${row.a} ${row.op === '+' ? '+' : '−'} ${row.b} = ${row.value}`;
  $('strategy-badge').textContent = names[row.strategy];
  const array = (n, remove = 0) => `<div class="mark-array">${n ? Array.from({ length: n }, (_, i) => `<i class="mark ${i >= n - remove ? 'removed' : ''}"></i>`).join('') : '<span class="micro">empty</span>'}</div>`;
  $('arrays').innerHTML = row.strategy === 'draw' ? `${array(row.a, row.op === '-' ? row.b : 0)}<span>${row.op === '+' ? '+' : '−'}</span>${array(row.b)}<span class="array-label">${row.op === '+' ? 'Join, then count all marks.' : 'Second array supplies removal markers; count those left in the first.'}</span>` : `<span class="micro">No arrays needed for this solution.</span>`;
  $('trace').innerHTML = row.trace.map(t => `<li>${t}</li>`).join('');
  const actionText = Object.entries(row.actions).map(([id, n]) => `${n} ${id}`).join(' + ');
  $('attempt-cost').textContent = `${row.cost.toFixed(1)} solving units · ${actionText}`;
  $('attempt-number').textContent = `${row.step} / ${simulation.step}`;
  $('attempt-meta').textContent = `${row.correct ? 'Correct' : `Incorrect · correct answer: ${row.expected}`} · Feedback cost ${row.feedbackCost.toFixed(1)} · Learning comparisons ${row.learningCost.toFixed(1)} · Total ${row.totalCost.toFixed(1)} · Model confidence ${percent(row.recallConfidence)}${row.activation !== null ? ` · Activation ${row.activation.toFixed(2)}` : ''}`;
}
function renderMix() {
  $('strategy-mix').innerHTML = Array.from({ length: 4 }, (_, i) => {
    const from = Math.floor(simulation.step * i / 4), to = Math.floor(simulation.step * (i + 1) / 4);
    const rows = simulation.history.slice(from, to).filter(r => operation === 'all' || r.op === operation);
    return `<div class="mix-row"><div class="mix-label"><span>Attempts ${from + 1}–${to}</span><span>${rows.length} exercises</span></div><div class="mix-bar">${Object.entries(colors).map(([id, color]) => { const count = rows.filter(r => r.strategy === id).length; return `<span title="${names[id]}: ${count} (${rows.length ? percent(count / rows.length) : '0%'})" style="width:${rows.length ? count / rows.length * 100 : 0}%;background:${color}"></span>`; }).join('')}</div></div>`;
  }).join('');
}
function renderRules() {
  const rules = Object.values(simulation.rules).filter(r => r.origin || r.evidence.length).sort((a, b) => (a.learnedAt ?? Infinity) - (b.learnedAt ?? Infinity));
  $('rule-count').textContent = `${rules.filter(r => r.origin).length} learned · ${rules.filter(r => !r.origin).length} candidates`;
  $('rules').innerHTML = rules.length ? rules.map(r => {
    const origin = r.origin || 'candidate';
    const status = !r.origin ? 'Not available yet' : r.strength >= simulation.config.confidence ? 'Available' : 'Below confidence threshold';
    return `<article class="rule-card"><div class="rule-top"><h3>${r.name}</h3><span class="rule-tag ${origin.includes('taught') ? 'taught' : ''}">${origin}</span></div><p class="rule-statement">${r.statement}</p><div class="rule-examples">${r.evidence.length ? r.evidence.slice(0, 3).join('<br>') : 'Teacher-provided procedure.<br>No observed discovery examples yet.'}</div><p class="micro">${r.learnedAt ? `First learned at attempt ${r.learnedAt} · ` : ''}${r.evidence.length} distinct supporting patterns<br>${status} · strength ${r.strength.toFixed(2)}<br>Used ${r.uses} times · ${r.successes} correct · transfer not tested</p></article>`;
  }).join('') : '<p class="empty">No rules discovered yet. More varied practice or a lesson may give the learner something to build on.</p>';
}
let selectedAddition = null;
function renderHeatmap() {
  const counts = new Map();
  for (const row of simulation.history) if (row.op === '+') {
    const k = `${row.a}+${row.b}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let readyCount = 0;
  const head = `<thead><tr><th scope="col" aria-label="First operand plus second operand">+</th>${Array.from({ length: 11 }, (_, b) => `<th scope="col">${b}</th>`).join('')}</tr></thead>`;
  const body = Array.from({ length: 11 }, (_, a) => `<tr><th scope="row">${a}</th>${Array.from({ length: 11 }, (_, b) => {
    if (a + b > 10) return '<td class="heatmap-excluded" aria-label="Outside range">·</td>';
    const k = `${a}+${b}`, m = simulation.recallState({a, b, op:'+'});
    const correct = m && m.value === a + b;
    const ready = correct && m.strength >= simulation.config.confidence;
    if (ready) readyCount++;
    const strength = m ? m.strength : 0;
    const background = !m ? '#f6f7f3' : !correct ? '#fae4d9' : `hsl(154, 35%, ${96 - strength * 64}%)`;
    const foreground = correct && strength > .6 ? '#fff' : '#21362f';
    const label = `${a} + ${b} = ${a + b}. ${m ? `Model answer ${m.value}, score ${percent(strength)}${correct ? '' : ', incorrect'}.` : 'No learned response.'} ${counts.get(k) || 0} practice encounters.${ready ? ' Correct model response above threshold.' : ''}`;
    return `<td><button type="button" data-addition="${k}" style="background:${background};color:${foreground}" title="${label}" aria-label="${label}" aria-pressed="${selectedAddition === k}"><strong>${a + b}</strong><small>${!m ? '—' : `${!correct ? '× ' : ready ? '✓ ' : ''}${percent(strength)}`}</small></button></td>`;
  }).join('')}</tr>`).join('');
  $('addition-heatmap').innerHTML = `<caption>Addition facts with sums ≤ 10 · after ${simulation.step} attempts</caption>${head}<tbody>${body}</tbody>`;
  $('heatmap-summary').textContent = `${readyCount} / 66 correct above threshold`;
  const showDetail = k => {
    const [a, b] = k.split('+').map(Number), m = simulation.recallState({a,b,op:'+'});
    $('heatmap-detail').textContent = `${a} + ${b} = ${a + b} · ${counts.get(k) || 0} practice encounters. ${m ? `Model answer: ${m.value}${m.value !== a + b ? ' (incorrect)' : ''}. Score: ${m.strength.toFixed(3)}; confidence threshold: ${simulation.config.confidence.toFixed(2)}. ${m.strength >= simulation.config.confidence ? 'Eligible for a direct response; another strategy or stochastic retrieval failure may intervene.' : 'Below the confidence threshold.'} ${m.lastSeen === null ? 'Not encountered directly: this is a neural generalization.' : `Last encountered at attempt ${m.lastSeen}.`}${m.activation !== undefined ? ` Activation: ${m.activation.toFixed(3)}; retrieval latency proxy: ${m.retrievalLatency.toFixed(3)} (arbitrary units, not seconds).` : ''}` : 'No learned response yet; counting or a learned rule may still solve it.'}`;
  };
  $('addition-heatmap').onclick = event => {
    const button = event.target.closest('button[data-addition]'); if (!button) return;
    selectedAddition = button.dataset.addition;
    $('addition-heatmap').querySelectorAll('button').forEach(el => el.setAttribute('aria-pressed', el === button));
    showDetail(selectedAddition);
  };
  if (selectedAddition) showDetail(selectedAddition);
}
function renderModelReport() {
  const id = simulation.config.model, unaided = simulation.diagnostics.at(-1).unaided;
  $('active-model').textContent = modelLabels[id];
  const work = simulation.recallModel ? `${simulation.recallModel.updates.toLocaleString()} ${id === 'neural' ? 'gradient updates' : 'encoding events'}` : `${simulation.step} fact updates`;
  $('model-measurements').textContent = `Unaided answer accuracy: ${percent(unaided.accuracy)} · Responses above confidence threshold: ${percent(unaided.coverage)} · Accuracy among those responses: ${unaided.confidentAccuracy === null ? 'not available' : percent(unaided.confidentAccuracy)} · ${work}. Unaided accuracy scores the model’s top answer before confidence gating; missing responses count as incorrect. No counting, rule help, or ACT-R retrieval-failure sampling in this measure.`;
  $('model-comparison').innerHTML = modelComparison ? `<div class="heatmap-scroll"><table class="comparison-table"><thead><tr><th>Model</th><th>Full accuracy</th><th>Mean cost</th><th>Unaided accuracy</th><th>Above threshold</th><th>Training updates</th></tr></thead><tbody>${modelComparison.map(s => { const d = s.diagnostics.at(-1); return `<tr><th>${modelLabels[s.config.model]}</th><td>${percent(d.accuracy)}</td><td>${d.cost.toFixed(1)}</td><td>${percent(d.unaided.accuracy)}</td><td>${percent(d.unaided.coverage)}</td><td>${s.recallModel?.updates ?? s.step}</td></tr>`; }).join('')}</tbody></table></div><p class="micro">Compared using the current completed run’s settings, ${simulation.step} attempts, seed ${simulation.config.seed}. ${simulation.config.order === 'deliberate' ? 'Adaptive schedules differ between learners.' : 'Identical exercise order for all learners.'} Heatmap and curves still show ${modelLabels[id]}.</p>` : '';
  $('heatmap-title').textContent = id === 'neural' ? 'Addition prediction map' : 'Addition memory map';
}
function render() { renderMetrics(); drawCurve(); renderAttempt(); renderMix(); renderRules(); renderHeatmap(); renderModelReport(); }
$('compare-models').addEventListener('click', async () => {
  const button = $('compare-models'); button.disabled = true; button.textContent = 'Comparing…';
  document.querySelector('.run-button').disabled = true;
  try {
    await new Promise(resolve => setTimeout(resolve, 25));
    modelComparison = Object.keys(modelLabels).map(model => model === simulation.config.model ? simulation : new Simulator({ ...simulation.config, model }).run());
    renderModelReport();
  } finally { button.disabled = false; button.textContent = 'Compare all 3 models'; document.querySelector('.run-button').disabled = false; }
});
$('attempt').addEventListener('input', renderAttempt);
$('op-filter').addEventListener('change', () => { operation = $('op-filter').value; render(); });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('selected', b === button)); drawCurve(); }));
$('pin').addEventListener('click', () => { baseline = simulation.export(); baseline.step = simulation.step; $('pin').textContent = 'Replace baseline'; view = 'assessment'; document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('selected', b.dataset.view === view)); render(); });
$('curve').addEventListener('click', event => {
  const rect = $('curve').getBoundingClientRect(); const maxSteps = Math.max(simulation.step, baseline ? baseline.step : 0);
  const index = Math.round((event.clientX - rect.left - 39) / (rect.width - 54) * maxSteps);
  const rows = simulation.history.filter(r => operation === 'all' || r.op === operation);
  if (!rows.length) return;
  const nearest = rows.reduce((best, r) => Math.abs(r.step - index) < Math.abs(best.step - index) ? r : best);
  $('attempt').value = nearest.step; renderAttempt();
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ current: simulation.export(), baseline, modelComparison: modelComparison?.map(s => s.export()) ?? null }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `little-steps-seed-${simulation.config.seed}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('resize', () => simulation && drawCurve());
run();
