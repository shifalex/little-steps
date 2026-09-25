# Little Steps — arithmetic learning lab

**[Open the live simulator](https://shifalex.github.io/little-steps/)**

A browser-based experiment in learning addition and subtraction facts through counting, memory, comparison, and teacher lessons. Adjust learner settings, compare practice schedules (including deliberate practice), inspect strategy and cost curves, and explore the final addition-memory heatmap.

See [ROADMAP.md](ROADMAP.md) for designed features that are not yet implemented.

Open **index.html** in a modern browser. No installation or build is required. The app runs locally; no learner data is uploaded. Fonts are optional web fonts with local fallbacks.

Choose among **associative memory**, **ACT-R-inspired declarative memory**, and a real **neural network (MLP)**. All share the same strategy-based solver and explicit candidate-rule system. These are experimental models, not validated models of children. Use **Compare all 3 models** for a final assessment table; keep a baseline and change models for curve comparisons.

## Learning models

### Associative memory

The original per-fact answer and strength table. Learning rate strengthens each observed answer; random forgetting weakens accessibility. This remains the default.

### ACT-R-inspired memory (simplified)

Each exercise-answer chunk retains its encoding timestamps. At trial t its activation is B = ln(Σ max(1, t−timestamp)^−d), with the Forgetfulness slider used as decay exponent d. Availability is p = 1 / (1 + exp(−(B−τ)/s)), where τ is the activation threshold and s is retrieval noise. The highest-activation answer chunk is the candidate. The shared confidence threshold gates p. When direct recall is selected, a seeded Bernoulli draw with probability p determines retrieval success; failure costs a retrieval action and falls back to a non-recall strategy. Distinct wrong-answer chunks can persist and compete with correct ones. One feedback encoding is recorded per practice attempt; the Learning rate slider affects the shared rule mechanism but not ACT-R encoding frequency.

The heatmap also exposes exp(−B) as an arbitrary-unit retrieval-latency proxy. It is not calibrated seconds and is not added to the shared action-cost curve. This implementation does not reproduce ACT-R buffers, production compilation, utility learning, spreading activation, partial matching, or motor/perceptual modules. Analogical anchor lookups use deterministic confidence gating, not stochastic ACT-R retrieval. Shared rule strengths retain the original random forgetting model. Trial indices substitute for elapsed time; these simplifications must be considered before comparisons to child data.

The activation, probability, and latency ideas are based on [Anderson et al. (2004), An Integrated Theory of the Mind](https://www.cs.utexas.edu/~dana/ACT-R.pdf). We implement a small declarative-memory component, not the full cognitive architecture.

### Neural network (MLP)

Input: 24 features (11-way one-hot first operand, 11-way second operand, and 2-way operation). There are 16, 32, or 64 tanh hidden units, then 11 softmax answer classes (0–10). Training uses actual backpropagation and stochastic gradient descent on cross-entropy. It receives only the feedback selected by the experiment; it has no pretrained arithmetic weights or answer-table lookup for predictions.

Each trial trains once on the current feedback and optionally performs extra updates on uniformly sampled examples from the most recent 256 feedback events. Updates per attempt is adjustable; 1 disables replay. Default 8 means 800 exercises produce 6,400 gradient updates, not 800. Learning rate is the SGD step size. Forgetfulness multiplies weights and biases by 1−forgetting×0.0005 per trial; this is a toy regularization/forgetting assumption, not a biological claim. New examples can also cause interference. Initialization and replay have their own seeded RNG, independent from exercise ordering and assessment.

The top softmax class is the proposed answer and its probability is the confidence score. Generalization can occur for facts not directly practiced. The UI groups a direct neural response with recall for cost comparison; that does not establish literal memorization. The rule notebook remains an explicit pattern checker over received examples and does not decode rules from neural weights. See [cross-entropy documentation](https://docs.pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html) for the objective; this implementation is dependency-free JavaScript, not PyTorch.

### Fair comparisons and inspection

All models receive the same seeded non-adaptive exercise sequence, same feedback policy, and same lessons. Deliberate practice adapts to each model's scores and therefore produces different sequences. Equal exercise counts are not equal computation budgets. Equal numeric confidence scores also have different meanings: association strength, activation-derived availability, or softmax probability; none is empirically calibrated to child accuracy.

Full-solver accuracy includes counting and rules. Unaided accuracy compares each model's top answer to the correct answer without confidence gating, counting, rule help, or ACT-R failure sampling; absent answers count as wrong. Coverage reports the fraction above confidence threshold. Correctness among those responses is reported separately. These quantities prevent counting fallbacks from concealing a weak prediction model. Fixed assessments never train or consume the practice/replay RNG streams.

JSON exports include model configuration, final per-fact predictions, training update counts, ACT-R chunks/timestamps or neural weights/replay examples, and any three-model comparison runs. Exported runs are snapshots for analysis, not a supported import/resume format.

## Initial domain

All nonnegative integer fact families a + b = c with c ≤ 10: 66 ordered addition exercises and 66 subtraction exercises. Both operations coexist, with zero included. No negative answers.

The learner recognizes numbers and can draw arrays and count from one. Addition draws a+b marks and counts a+b marks. Subtraction draws a marks plus b removal markers, removes b marks, and counts a−b marks. Reading and writing have no modeled cost. Empty arrays require zero mark operations.

## Shared strategy layer and original associative-model assumptions

- Each fact stores one answer and a strength. After an encounter its strength increases by learningRate × (1−strength). A different answer replaces the stored answer. With answer feedback the correct answer is stored; without correction the produced answer is stored.
- Per practice step, fact strengths decay by 1−forgetting×0.002. Each independently has forgetting×0.006 probability of losing 55% of its remaining strength. Rules decay more slowly (factor 1−forgetting×0.0005; shock probability forgetting×0.001; shock retains 70%). These constants are assumptions, not fitted psychological estimates.
- Memory and rules require strength at least the confidence threshold. The cheapest eligible route is chosen, with an exploration probability of choosing a random eligible route. Approximate cost selection is assumed; decision overhead and indexed memory lookup are not modeled.
- Comparison is the probability of comparing the just-completed attempt with its immediate predecessor, after feedback. Discovery never searches older facts or sees future exercises. It also gates whether an already learned analogous solution is considered. Analogies need an available stored anchor and a learned rule. Execution slips occur independently per count/removal action in aggregate, perturbing the answer by one.
- Three distinct supporting adjacent pairs activate one of five declared relationship templates: zero, self-subtraction, reversed addition, inverse operations, or neighboring additions. This is constrained induction, **not open-ended rule invention**. The rule strength starts at 0.8. Zero and self-subtraction also require two consecutive matching examples. Repeating the same unordered pair does not add evidence. Evidence patterns can share facts; three patterns do not mean three independent experiments or a proof.
- Count-on and count-up procedures can be taught. Lessons make their rule available immediately at strength 1, before the specified attempt. The lesson event remains in the history if the rule later weakens. Starting draw/count skills do not decay.
- Previously noticed pair evidence remains in the evidence archive even when accessibility weakens. Each attempted pair comparison costs one comparison action, including attempts that find no new pattern. The log records the previous/current attempt numbers, received answer, whether comparison occurred, evidence added, and newly acquired rules. Acquired rules become available on subsequent attempts subject to rule strength; taught rules are available from their lesson. Working memory, spontaneous procedural invention, elapsed-day spacing, learned strategy speeds, and time-calibrated costs are not implemented.

## Measurements

Practice logs record exercise, expected and produced answer, correctness, primary strategy and strategy sequence, action counts, solving cost, corrective feedback cost, post-answer comparison cost, rule/anchor used, and lessons received. The curve uses **solving cost**, with a rolling 25-observation mean for the selected operation.

Every 50 attempts (plus start and end), assess all eligible facts using an independent, reset deterministic random generator. Assessments do not strengthen memories, discover rules, decay knowledge, or consume practice randomness. They still include exploration and execution noise. They are fixed-set evaluations, not held-out transfer tests. The three rule examples are actual observed supporting patterns; successful uses are not a substitute for independent transfer validation.

Keep a baseline, change settings, and run again. Both curves are visible under Fixed assessment. The curriculum has a separate seeded random stream, so changing learner parameters preserves the exercise sequence for non-adaptive schedules. The baseline remains in browser memory until refresh. JSON export contains current and baseline configurations, logs, assessments, rules, and interventions. It does not yet import runs or child datasets.

**Deliberate practice** is adaptive: before each attempt, after forgetting, rank all 132 facts by correct stored-answer strength. Unseen facts and incorrect stored answers score zero. Choose uniformly from the weakest 20% (27 facts), including all ties at the cutoff. When everything is tied, every fact is eligible. Ranking uses direct fact memory, not rule-assisted solving ability. This external teaching scheduler inspects the true answer to identify incorrect memories; it does not give the learner the answer. Learner settings can therefore change the practice sequence even with the same seed. Identical settings and seed still reproduce a run. Compare adaptive schedules using the fixed assessment.

To compare with children, match the study's exercise domain, presentation, permitted aids, feedback, instruction history, and strategy coding. Abstract effort units cannot be interpreted as seconds without calibration. Fit multiple outcomes (accuracy, strategy frequencies, error patterns, reaction times) and validate on unused observations. Parameter values are model controls, not diagnoses or age equivalents.

Research starting points:
- [Siegler & Shrager (1984), strategy choices in addition and subtraction](https://siegler.tc.columbia.edu/wp-content/uploads/2019/11/1984-Siegler-Shrager.pdf)
- [Geary, Brown, & Samaranayake (1991), longitudinal strategy choice and speed](https://scholarsmine.mst.edu/math_stat_facwork/176/)
- [Geary et al. (2012), working memory and addition strategy development](https://pmc.ncbi.nlm.nih.gov/articles/PMC3392437/)

## Verification

Run `node engine.test.js` and `node models.test.js`. The latter checks activation math, neural gradients against numerical derivatives, feedback-only learning, deterministic matched curricula, and diagnostic non-interference. Engine exports work in both Node and the browser. There are no external JavaScript dependencies.

Files: `engine.js` (learner and experiment), `models.js` (activation memory and neural network), `app.js` (controls, charts, exports), `index.html`, `styles.css`, `engine.test.js`, and `models.test.js`.
