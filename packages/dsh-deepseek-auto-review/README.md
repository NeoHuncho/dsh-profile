# DSH Auto Review

A locally authored DeepSeek Harness second-model reviewer for approval requests. It is inspired by OpenAI Codex Guardian, but is an independent implementation and does not copy Codex source code. Its default reviewer route is the user's Codex subscription running GPT-5.6-Luna at `low` reasoning effort — the same model and effort Codex itself uses for approval review.

The package directory is still `dsh-deepseek-auto-review` (renaming it would break the pnpm workspace link and the profile patch id); every user-visible surface reads **DSH Auto Review**: the plugin name `dsh-auto-review`, the `/dsh-review` command, and the session-header panel.

## Behavior

- Hooks the `approval/request` waterfall, reviewing only configured `ai` requests that already reached DSH's approval boundary.
- Uses a one-shot, bounded `fork` reviewer with `read`, `glob`, and `grep` only; it cannot mutate, delegate, or recurse into approval review.
- Routes the reviewer explicitly through `codex`, using `gpt-5.6-luna` and `low` reasoning by default.
- Provides the exact planned tool, reason, workspace, redacted arguments, and a bounded recent transcript as evidence.
- Applies Codex-style evidence handling, authorization levels, risk levels, outcome thresholds, and configurable hard rules.
- Fails closed on timeout, unavailable reviewer, malformed output, or schema failure. Failures are reported distinctly as technical failures in the model-visible result.
- Uses a short-lived tool+arguments verdict cache and strips inherited injected context from reviewer steps.
- Adds a session-header status panel and a `/dsh-review status` command.

## Why the reviewer is allowed one delegation level

`subagents.start({ maxDepth })` caps the **child's** absolute depth, and the child's depth is the parent's plus one. Passing the parent's own depth therefore rejects every reviewer before it starts (`subagent depth 1 exceeds maxDepth 0`). The plugin passes `parentDepth + 1`: exactly one reviewer level, no recursion. The reviewer additionally cannot delegate because its tool filter grants only `read`, `glob`, and `grep`.

## Projection scope (deliberately narrow)

`ctx.sessionProjections` states are **pure folds over committed session events**, and `stateOf()` returns the registry's live cell. This plugin logs no session event of its own, so its projection carries only the policy in force (enabled, reviewer route, model, effort), which is constant for the session's life.

Per-turn counters and the recent verdict ring are host runtime state in the plugin's own `WeakMap`s. Publishing them through the projection would require mutating the registry's live cell — a change the feed never observes and a replay never reproduces. Each verdict is instead reported inline on the tool call it governs, via `tools/post-execute` feedback.

The projection schemas are **Zod**, not Schemastery: the registry calls `.parse()` on `stateSchema` and `wire.viewSchema`, which a callable Schemastery schema does not implement. Schemastery remains correct for the plugin `Config`, which the loader validates by calling the schema.

## Profile setup

This package is intentionally a local profile package. The profile adds it via `cordis.patch.yml`, rather than placing it in the shipped install. There must be exactly **one** `deepseek-auto-review` entry: the loader rejects duplicate entry ids (`duplicate loader entry id`), and `config` must be a YAML **mapping**, not a block scalar.

```yaml
- insert:
    - id: deepseek-auto-review
      name: dsh-deepseek-auto-review
      config:
        toolsPolicy:
          default: human
          overrides:
            bash: ai
            write: ai
            edit: ai
        reviewerProvider: fork
        reviewerProviderRoute: codex
        reviewerModel: gpt-5.6-luna
        reviewerReasoningEffort: low
        fallbackPolicy: rejected
```

Recognized config keys are the ones in `Config` (`src/index.js`): `reviewerProviderRoute` (not `reviewerLlmProvider`), `contextTurns`/`contextMaxChars` (not `contextBudget`), and `maxAutoAllow`/`onHighRisk` (not `riskPolicy`). Unknown keys are silently ignored, so a misspelled key reverts that setting to its default.

## Requires approval policy `ask`

`ApprovalService` short-circuits to `rejected` **before** the `approval/request` waterfall whenever the session's effective policy is `never`, so no request reaches this answerer. Automatic review therefore requires the session to run under approval policy `ask` (permission preset `workspace-write` or `read-only`); under `danger-full-access` the policy is `never` and this plugin is inert by design. It never raises the policy itself.

## References

- [OpenAI Codex Guardian policy template](https://github.com/openai/codex/blob/main/codex-rs/core/src/guardian/policy_template.md)
- [OpenAI Codex approval/security overview](https://github.com/llms-txt-archive/openai-platform/blob/main/codex/agent-approvals-security.md)
