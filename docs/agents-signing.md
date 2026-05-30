# Signed commits — one-time machine setup

Commits in this repo are signed with a dedicated **"Claude Code" SSH key**, so they land with the
green **Verified** badge on GitHub. After this one-time-per-machine setup, signing is automatic:
the `SessionStart` hook in [`.claude/settings.json`](../.claude/settings.json) keeps the repo
configured (via [`scripts/setup-signing.sh`](../scripts/setup-signing.sh)) and git signs every
commit. See [AGENTS.md › Commit signing](../AGENTS.md) for how that automation works.

**If your commits already show Verified, you're done — skip this.**

## Why a dedicated key

- A separate, revocable SSH key for agent/automated commits, kept apart from your personal GPG key.
- Passwordless, so non-interactive shells (agents, CI) can sign without a passphrase prompt.

## Setup

Substitute `<your-name>` (e.g. your GitHub handle) below.

1. **Generate a passwordless ed25519 signing key:**

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/git_signing_claude -C "Claude Code (<your-name>)" -N ""
   ```

2. **Trust it locally** so `git log --show-signature` verifies your own commits:

   ```bash
   mkdir -p ~/.config/git
   echo "$(git config --global user.email) namespaces=\"git\" $(cat ~/.ssh/git_signing_claude.pub)" \
     >> ~/.config/git/allowed_signers
   ```

3. **Register the public key on GitHub** as a **Signing Key** — _not_ an Authentication key; it's
   the same form with a different **Key type** dropdown — at <https://github.com/settings/keys>.
   Use your existing verified commit email; no new email needed. This is what produces the
   Verified badge.

4. **Apply it to this repo** (also runs automatically every agent session — idempotent):

   ```bash
   bash scripts/setup-signing.sh
   ```

## Verify

```bash
git config --get commit.gpgsign    # → true
git config --get user.signingkey   # → ~/.ssh/git_signing_claude.pub
```

Your next commit will be signed; confirm the **Verified** badge on its PR.

## Notes

- projitect signs **every** commit on **every** branch (repo-local config) and keeps your normal
  authorship. Unlike StoryCut, it does **not** rewrite the author to `Claude Code (<name>)` — see
  the divergence note in [AGENTS.md › Commit signing](../AGENTS.md).
- Optional: store the signing settings in `~/.gitconfig.claude` (shared with StoryCut) and
  `setup-signing.sh` reads them from there instead of the conventional key path.
