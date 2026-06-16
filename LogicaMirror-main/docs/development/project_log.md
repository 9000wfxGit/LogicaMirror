# Project Log

## 2026-06-16

- Files changed: scan normalization, app shell, checkpoint gating, document model, server scan prompt, core tests.
- What changed: removed local fallback checkpoint generation and replaced AI scan normalization with exact `anchorQuote`/`hiddenQuote` semantic spans.
- Why it changed: checkpoint selection should be anchored to visible terms or concepts, with only the actual definition or explanation blurred.
- Open tasks or risks: remote scan quality still depends on provider compliance with exact quote output; UI upload auto-scan should be tested with a real configured DeepSeek provider.
