# Applause Competitive Intelligence site

Published at https://dpnation.github.io/competitive-intel/ by GitHub Actions.

- `digests/` and `discovery/`: dated markdown reports (`YYYY-MM-DD_*.md`). Add a file and push; that is the only manual step.
- `index.html`: page template. Its `REPORTS` and `DISCOVERY` arrays are regenerated at build time, so edits to those arrays are overwritten. Edit the rest of the file (layout, chips, `AI_EVAL_NAMES`) freely.
- `scripts/build-site.mjs`: builds `dist/` from the template and the markdown folders, and syntax-checks the page script.
- `.github/workflows/publish.yml`: runs the build and deploys on any push to `main` that touches the files above, or manually from the Actions tab.
- Requires Settings > Pages > Source = GitHub Actions.
- When a new AI Evaluation competitor is added, add its lowercase name to `AI_EVAL_NAMES` and a chip in `index.html`.
- Preview locally: `node scripts/build-site.mjs`, then open `dist/index.html`.
