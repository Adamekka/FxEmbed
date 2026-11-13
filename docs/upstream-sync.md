# Upstream synchronization

This fork rebases `Adamekka/FxEmbed`'s `main` onto `FxEmbed/FxEmbed`'s `main` daily at
04:17 UTC. The workflow can also be started manually from GitHub Actions.

Fork-specific commits are replayed on top of upstream history. Rebase conflicts,
build failures, ESLint failures, or test failures stop publication. A Git lease
also stops publication if someone changes `main` while validation is running.

The workflow creates an automated PR for the validated result, then publishes
that exact rebased commit onto `main`. Moving `main` to the PR head includes the
PR's changes without adding a merge commit. This rewrites fork commit IDs.
Validation runs without the publishing credential in a separate job.

## Required configuration

Enable GitHub Actions in the fork. Add a repository Actions secret named
`UPSTREAM_SYNC_TOKEN` containing a fine-grained personal access token restricted
to `Adamekka/FxEmbed` with **Contents**, **Pull requests**, and **Workflows** read
and write permissions. Workflows permission lets upstream changes to CI files
be published as well. The token must remain valid for scheduled runs.

The publishing identity must be allowed to force-push `main`. The workflow
preserves concurrent commits with an explicit lease and never bypasses branch
protection. Missing credentials and rejected pushes fail the run.

After an automatic rebase, fetch the fork and rebase local work onto the updated
`origin/main` before pushing. Resolve upstream conflicts manually and rerun the
workflow when ready.
