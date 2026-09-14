# Documentation guide

Start with [current status](status.md) for what is available and qualified.
For a new task, read the [continuity brief](handoff.md), then recheck live Git
and runtime state. A dated evidence report or old plan is not a new instruction
to resume its unfinished work.

## Using the Mac preview

| Need | Read |
| --- | --- |
| Understand the product and its value | [Product](product.md), [English README](../README.md), [日本語README](../README.ja.md) |
| Install the published package | [Mac installation](mac-installation.md) |
| Open the local workbench or connect the public site | [Local workbench](local-workbench.md), [public workbench](public-workbench.md), [connection approval](domain-connection.md) |
| Save Normal, prepare modes, use favorites and compare work | [User-source workbench](user-source-gui.md), [AI commands](ai-commands.md) |
| Recover without the site or AI | [Independent plugin recovery](plugin-recovery.md) |
| Create, import and reuse an appearance | [Appearance rules](personalization.md), [layer import](layered-appearances.md), [twelve-frame guide contract](spec-entity-poses.md) |
| Interpret a comparison or prepare a sharing card | [Comparison metrics](comparison-metrics.md), [cards](build-cards.md) |

## Changing the product

Read [AGENTS.md](../AGENTS.md) and [CONTRIBUTING.md](../CONTRIBUTING.md) first.
The canonical contracts are split by responsibility:

| Change | Contract |
| --- | --- |
| Product behavior and acceptance | [Specification](spec.md) |
| Ordinary Skill states, retained plugins and inheritance | [Current mode contract](spec-mode-inheritance.md) |
| Source registration, writes and independent recovery | [User sources](spec-user-sources.md), [retained settings](spec-retained-settings.md) |
| General startup, language and update discovery | [Guided entry](guided-product-entry.md), [plugin updates](plugin-update.md) |
| Model-aware setup and version preservation | [Guided setup](spec-guided-setup.md) |
| Public origin, pairing and local authority | [Domain entry](spec-domain-entry.md), [connection protocol](domain-connection.md) |
| Artwork, motion and immutable asset versions | [Entity poses](spec-entity-poses.md), [appearance rules](personalization.md), [design](design.md) |
| Module ownership and dependencies | [Architecture](architecture.md) |
| Distribution and platform claims | [Plugin distribution](spec-plugin-distribution.md), [assembly](plugin-package.md), [compatibility](compatibility.md) |
| Deferred platform work and handoffs | [Delivery](delivery.md) |

## Evidence and history

- [0.0.9 workbench release](evidence/2026-09-14-workbench-release.md): simplified screen/chat entry points, current archive and publication checks.

- [0.0.6 Mac qualification](evidence/2026-09-13-mac-codex-completion.md):
  native/public mode preparation, Normal restoration and independent recovery;
  links the dated [0.0.4 fresh-model/setup/artwork journey](evidence/2026-09-11-mac-codex-0.0.4.md).
- [0.0.7 artwork](evidence/2026-09-13-entity-awakening.md) and
  [0.0.8 motion](evidence/2026-09-13-awakening-motion.md): distinct immutable
  packages, installed authoring and public appearance checks. The latter also
  records the subsequent public-only three-column introduction.
- [Remote-plugin control limit](evidence/2026-09-11-remote-plugin-control-limit.md):
  why individual plugin OFF is excluded from the initial Mac release.
- [Feature candidates](feature-candidates.md): unadopted possibilities, not a backlog
  that a new task should automatically execute.

Files under `evidence/` describe their stated date, revision and scope. Files
under `plans/`, `superpowers/plans/` and `superpowers/specs/` preserve design and
execution history; later canonical contracts can supersede them. In particular,
[the old v2 mode contract](spec-mode-inheritance-v2.md) and
[the old appearance lifecycle](spec-appearances.md) explain historical records,
not the current new-setup or free-creation rules.
