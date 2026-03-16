# Evaluation Plan (Planner-Aligned)

This evaluation plan follows the required structure: metrics, queries, responses, and runtime.

## 1) Evaluation Metrics

1. Structural quality
- Validate semantic baseline: `lang`, `title`, `meta description`, `h1`, `main`.

2. Reliability and integrity
- Detect broken internal links and missing local assets (images, stylesheets, scripts).

3. Accessibility and safe linking
- Require `alt` on images.
- Validate `target="_blank"` links include `rel="noopener noreferrer"`.

## 2) Queries (Test Inputs)

Queries are the local HTML pages discovered at runtime in the site root:
- `index.html`
- `parcours.html`
- `recommandations.html`
- `contact.html`

Note: pages are auto-discovered from the filesystem when running the evaluator.

## 3) Responses (Evaluation Outputs)

Responses are generated in JSON report format:
- `evaluation/reports/site-evaluation.latest.json`

The report includes per-page scores, findings, and global summary.

## 4) Runtime

- Runtime: local
- Engine: Node.js script (`evaluation/run-site-eval.mjs`)
- Command:

```bash
node evaluation/run-site-eval.mjs
```
