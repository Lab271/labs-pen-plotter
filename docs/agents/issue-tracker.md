# Issue tracker: GitHub

Issues for this project are managed as GitHub issues.

The issues live in the same remote as the source code (the GitHub default):
[`LAB271/labs-pen-plotter`](https://github.com/LAB271/labs-pen-plotter/issues).

Use the `gh` CLI for all operations. Learn about it with `gh issue --help`.

```bash
gh issue list --label needs-triage
gh issue view <number>
gh issue create --title "..." --body "..." --label needs-triage
gh issue edit <number> --add-label ready-for-agent --remove-label needs-triage
```

Do not report security issues here — see [SECURITY.md](../../SECURITY.md) for the
private disclosure route.

## Labels

The following issue labels are used:

```
NAME              COLOR     DESCRIPTION
bug               #d73a4a   Something isn't working
documentation     #0075ca   Improvements or additions to documentation
duplicate         #cfd3d7   This issue or pull request already exists
enhancement       #a2eeef   New feature or request
good first issue  #7057ff   Good for newcomers
help wanted       #008672   Extra attention is needed
invalid           #e4e669   This doesn't seem right
question          #d876e3   Further information is requested
needs-triage      #e6e6fa   Maintainer needs to evaluate this issue
needs-info        #e6e6fa   Waiting on reporter for more information
ready-for-agent   #e6e6fa   Fully specified, ready for an autonomous agent
ready-for-human   #e6e6fa   Requires human implementation
wontfix           #ffffff   This will not be worked on
```

Dependabot also applies `dependencies` (#0366d6), `javascript` (#168700) and
`github_actions` (#000000) to the pull requests it opens. Those are set by
Dependabot, not by hand.

## Triage flow

1. A new issue gets `needs-triage`.
2. The maintainer evaluates it and either closes it (`wontfix`, `duplicate`,
   `invalid`) or classifies it (`bug`, `enhancement`, `documentation`).
3. If the report is incomplete, apply `needs-info` and ask the reporter. 
4. Once the work is fully specified, replace `needs-triage` with either
   `ready-for-agent` (an autonomous agent can implement it from the issue text
   alone) or `ready-for-human`.

Prefer `ready-for-human` for anything that needs the physical machine. Hardware
behaviour on this project cannot be verified from code review — see the hardware
verification note in [AGENTS.md](../../AGENTS.md).

## Relationship to OpenSpec

Substantial features are tracked as OpenSpec changes under `openspec/changes/`,
not as issues. Use issues for bug reports, small enhancements, and anything
incoming from outside the team; use `/opsx:propose` when the work needs a spec.
