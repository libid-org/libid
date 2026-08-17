# Agent instructions

## Commit attribution

- When an AI model materially assists with a commit, append an `Assisted-by:`
  trailer naming the model and version reported by the runtime, for example
  `Assisted-by: GPT-5` or `Assisted-by: Claude Opus 5`.
- Do not name the agent harness or product, such as Codex or Claude Code.
- Do not use `Co-authored-by:` for AI assistance; keep the human author and
  committer unchanged.
- Preserve any required `Signed-off-by:` trailer alongside the attribution.

## Developer Certificate of Origin

- Every commit you create or amend must include a DCO `Signed-off-by:` trailer
  matching the commit author's real name and email. Use `git commit -s` or
  `git commit --amend -s`.
- Before committing, verify that `git config user.name` and `git config
  user.email` identify the intended human author. Never invent an identity or
  sign off on another person's behalf.
- Preserve existing sign-offs during rebases, amendments, and cherry-picks.
- Before pushing, verify every outgoing commit contains the required matching
  trailer.
