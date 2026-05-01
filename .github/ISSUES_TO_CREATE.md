# Issues To Create

GitHub app issue creation permission is not available in this session. Create these issues manually from the GitHub UI.

## 1. Enable protected main branch and required pull request reviews

Labels: `security`, `enhancement`

Goal: Make the public repo safer before accepting outside contributions.

Tasks:

- Enable branch protection on `main`.
- Require pull requests before merging.
- Require at least 1 approving review.
- Dismiss stale approvals when new commits are pushed.
- Require status checks to pass when checks exist.
- Block force pushes and branch deletion on `main`.
- Keep CODEOWNERS review enabled for `@Sahilarora83`.

Notes: This prevents random direct pushes and makes every code change reviewable.

## 2. Add Supabase analytics dashboard improvements

Labels: `enhancement`, `analytics`

Goal: Make DB analytics easier to inspect.

Tasks:

- Show total synced results and predictions.
- Show Fast vs Groq range accuracy.
- Show action-wise accuracy for WATCH, STRONG, and SKIP.
- Show exact number accuracy.
- Add latest 500 records trend summary.

## 3. Stabilize next-issue prediction lock

Labels: `bug`, `prediction`

Goal: Keep the displayed prediction locked for only the next issue.

Tasks:

- Verify prediction does not change while the same next issue is pending.
- Verify Groq can update the AI card without replacing the locked main signal.
- Verify pending rows are graded when the matching issue appears.
- Add a visible 30-second countdown.

## 4. Improve backtest optimizer and Strategy Lab

Labels: `enhancement`, `prediction`

Goal: Use the best currently performing strategy instead of one fixed strategy.

Tasks:

- Compare strategies over 30, 60, 120, and all available records.
- Compare streak break thresholds 2, 3, 4, and 5.
- Compare majority/minority windows 5, 10, 20, and 50.
- Auto-select the hot strategy for live signals.
- Track strategy performance in Supabase.

## 5. Security review for public open-source release

Labels: `security`, `good first issue`

Goal: Confirm the repo is safe for public contributors.

Tasks:

- Check that no API keys are committed.
- Check that Supabase service-role keys are server-only.
- Check that browser JavaScript never includes private tokens.
- Check that docs say predictions are statistical and not guaranteed.
- Check that no hacking/bypass/automation code is accepted.
