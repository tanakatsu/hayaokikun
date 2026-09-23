# gstack

Use the `/gstack-browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
`/gstack-office-hours`, `/gstack-plan-ceo-review`, `/gstack-plan-eng-review`, `/gstack-plan-design-review`, `/gstack-design-consultation`, `/gstack-design-shotgun`, `/gstack-design-html`, `/gstack-review`, `/gstack-ship`, `/gstack-land-and-deploy`, `/gstack-canary`, `/gstack-benchmark`, `/gstack-browse`, `/gstack-connect-chrome`, `/gstack-qa`, `/gstack-qa-only`, `/gstack-design-review`, `/gstack-scrape`, `/gstack-setup-browser-cookies`, `/gstack-setup-deploy`, `/gstack-setup-gbrain`, `/gstack-retro`, `/gstack-investigate`, `/gstack-document-release`, `/gstack-document-generate`, `/gstack-codex`, `/gstack-cso`, `/gstack-autoplan`, `/gstack-plan-devex-review`, `/gstack-devex-review`, `/gstack-careful`, `/gstack-freeze`, `/gstack-guard`, `/gstack-unfreeze`, `/gstack-upgrade`, `/gstack-learn`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /gstack-office-hours
- Strategy/scope → invoke /gstack-plan-ceo-review
- Architecture → invoke /gstack-plan-eng-review
- Design system/plan review → invoke /gstack-design-consultation or /gstack-plan-design-review
- Full review pipeline → invoke /gstack-autoplan
- Bugs/errors → invoke /gstack-investigate
- QA/testing site behavior → invoke /gstack-qa or /gstack-qa-only
- Code review/diff check → invoke /gstack-review
- Visual polish → invoke /gstack-design-review
- Ship/deploy/PR → invoke /gstack-ship or /gstack-land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
