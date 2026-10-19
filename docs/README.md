# Docs

Guides for working on this repo, written for both people and LLM coding assistants.
Read the relevant file before changing the area it describes, and update it in the same commit as the code.

| File                                 | Read it when                                                          |
| ------------------------------------ | --------------------------------------------------------------------- |
| [architecture.md](architecture.md)   | You need the big picture: apps, packages, how `hl` reaches the server |
| [conventions.md](conventions.md)     | You are about to write code, run scripts, commit or release           |
| [menu-manifest.md](menu-manifest.md) | You are adding a service to the menu or touching menu rendering       |

## Rules for keeping docs useful

- One topic per file, file name = topic. Link between files instead of repeating content.
- Mark unfinished designs with `Status: proposed` at the top and change it to `Status: implemented` when the code lands.
- Describe decisions and the reason for them. The code already says what it does.
- Prefer exact commands and paths over prose.
