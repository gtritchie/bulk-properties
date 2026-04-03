# Release Notes Generator

Generate release notes by gathering merged PRs since the last GitHub release, categorizing them by impact, and writing a concise markdown summary focused on what matters to plugin users.

## Process

### 1. Find the latest release tag

```bash
gh release view --latest --json tagName
```

Then get the commit date of that tag (not the release publish date, which can differ if the release was drafted first and published later):

```bash
git log -1 --format=%aI TAG_NAME
```

### 2. Gather merged PRs since that tag

```bash
gh pr list --state merged --search "merged:>TAG_COMMIT_DATE" --json number,title,body,mergedAt --limit 100
```

Replace `TAG_COMMIT_DATE` with the commit date from step 1 (ISO date format).

### 3. Analyze each PR

For each PR, read its title and body to understand the change. If the title and body don't make the user-facing impact clear, check the diff:

```bash
gh pr diff NUMBER
```

**Classify each PR into one of these categories:**

- **New Features** — entirely new capabilities that didn't exist before
- **Enhancements** — improvements to existing features (better UX, new options, performance gains)
- **Bug Fixes** — corrections to broken behavior
- **Other** — notable changes that don't fit the categories above but users might still care about

**Skip entirely** any PR that falls into these categories:
- No user-facing impact: CI changes, internal refactors, dependency bumps, code cleanup, README-only updates
- Accessibility improvements: Obsidian itself has limited accessibility support, so plugin accessibility work is not meaningful to highlight in release notes

When in doubt about whether something is user-facing, lean toward including it in "Other" rather than omitting it — the user can always trim later.

If multiple PRs together form a single user-visible change (e.g., a feature PR + a follow-up fix), combine them into one bullet.

### 4. Write the release notes

Generate the filename using the current date and time:

```bash
date +%Y-%m-%d-%H%M
```

Save to: `/Users/gary/Documents/Notes/0-Inbox/bulk-properties-release-notes-YYYY-MM-DD-HHmm.md`

For example: `bulk-properties-release-notes-2026-04-03-1435.md`

## Output format

```markdown
# Bulk Properties Release Notes

## New Features
- **Feature name** — One sentence describing what's new.

## Enhancements
- **Enhancement name** — One sentence on what improved.

## Bug Fixes
- **Fix description** — One sentence on what was broken and how it's fixed.

## Other
- **Change name** — One sentence on what changed.
```

## Writing guidelines

- Write for plugin users, not developers. Describe what they can now do, not how it was implemented.
- **Keep each bullet to one sentence.** Give a high-level overview of the change — don't describe every detail of how it works. For example, write "Tags and list properties now use a pill-style input matching Obsidian's native editor" rather than also explaining what happens on Enter, comma, paste, the validation behavior, etc.
- Omit any section that has no entries — don't include empty sections.
- Do not include PR numbers. End-users don't track PRs.
- Do not include a version number in the heading. These notes are for unreleased work — the actual version will be decided later.
- Use sentence case for descriptions.
- Avoid jargon like "frontmatter," "processFrontMatter," "serialization," "copy-on-write" — translate into plain language (e.g., "property values" instead of "frontmatter fields").
