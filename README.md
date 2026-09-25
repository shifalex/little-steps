# Little Steps — arithmetic learning lab

**[Open the live simulator](https://shifalex.github.io/little-steps/)**

A browser-based experiment in learning addition and subtraction facts through counting, memory, comparison, and teacher lessons. Adjust learner settings, compare practice schedules (including deliberate practice), inspect strategy and cost curves, and explore the final addition-memory heatmap.

See [ROADMAP.md](ROADMAP.md) for designed features that are not yet implemented.

Open **index.html** in a modern browser. No installation or build is required. The app runs locally; no learner data is uploaded. Fonts are optional web fonts with local fallbacks.

This is the first runnable **strategy-based algorithm**, not a neural network and not a validated model of a child. It implements the shared experiment interface that future learners can reproduce.

## Initial domain

All nonnegative integer fact families a + b = c with c ≤ 10: 66 ordered addition exercises and 66 subtraction exercises. Both operations coexist, with zero included. No negative answers.

The learner recognizes numbers and can draw arrays and count from one. Addition draws a+b marks and counts a+b marks. Subtraction draws a marks plus b removal markers, removes b marks, and counts a−b marks. Reading and writing have no modeled cost. Empty arrays require zero mark operations.

## Learning assumptions

- Each fact stores one answer and a strength. After an encounter its strength increases by learningRate × (1−strength). A different answer replaces the stored answer. With answer feedback the correct answer is stored; without correction the produced answer is stored.
- Per practice step, fact strengths decay by 1−forgetting×0.002. Each independently has forgetting×0.006 probability of losing 55% of its remaining strength. Rules decay more slowly (factor 1−forgetting×0.0005; shock probability forgetting×0.001; shock retains 70%). These constants are assumptions, not fitted psychological estimates.
- Memory and rules require strength at least the confidence threshold. The cheapest eligible route is chosen, with an exploration probability of choosing a random eligible route. Approximate cost selection is assumed; decision overhead and indexed memory lookup are not modeled.
- Comparison controls evidence noticing and whether an analogous solution is considered. Analogies need an available stored anchor and a learned rule. Execution slips occur independently per count/removal action in aggregate, perturbing the answer by one.
- Three distinct supporting patterns activate one of five declared relationship templates: zero, self-subtraction, reversed addition, inverse operations, or neighboring additions. This is constrained induction, **not open-ended rule invention**. The rule strength starts at 0.8. Evidence patterns can share facts; three patterns do not mean three independent experiments or a proof.
- Count-on and count-up procedures can be taught. Lessons make their rule available immediately at strength 1, before the specified attempt. The lesson event remains in the history if the rule later weakens. Starting draw/count skills do not decay.
- Counts for past observations remain in the evidence archive even when accessibility weakens. Working memory, spontaneous procedural invention, elapsed-day spacing, learned strategy speeds, and time-calibrated costs are not implemented.

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

Run `node engine.test.js`. Engine exports work in both Node and the browser. There are no external JavaScript dependencies.

Files: `engine.js` (learner and experiment), `app.js` (controls, charts, exports), `index.html`, `styles.css`, and `engine.test.js`.
