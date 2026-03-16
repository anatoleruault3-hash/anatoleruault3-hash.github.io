# Site Evaluation Framework

This folder contains a lightweight local evaluation framework for the portfolio site.

## Goal

Provide a repeatable baseline audit for:
- HTML structure quality
- Accessibility basics
- Link and asset integrity
- Navigation consistency
- Basic SEO hygiene

## Files

- `site-evaluation.config.json`: scoring weights, thresholds, and enabled rules
- `run-site-eval.mjs`: evaluator script (Node.js, no external dependency)
- `reports/`: generated JSON reports

## Run

From `Workspace claude`:

```bash
node evaluation/run-site-eval.mjs
```

Optional flags:

```bash
node evaluation/run-site-eval.mjs --json evaluation/reports/site-evaluation.latest.json
node evaluation/run-site-eval.mjs --strict
```

## Output

The script generates a JSON report with:
- per-page score
- per-page findings (error, warning, info)
- global score and severity counts
- nav consistency analysis

## Suggested workflow

1. Run evaluation before content or UI changes.
2. Apply fixes.
3. Re-run and compare scores.
4. Keep report history in `evaluation/reports` if you want trend tracking.
