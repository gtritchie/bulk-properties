# How to release

## Prerequisites

In the GitHub repo settings, go to **Settings → Actions → General → Workflow permissions** and select **Read and write permissions**.

This only needs to be done once.

## Steps

1. **Make sure you're on `main` with a clean working tree.**

   ```bash
   git checkout main
   git pull
   git status  # should show nothing to commit
   ```

2. **Bump the version.** Use `patch`, `minor`, or `major` as appropriate.

   ```bash
   npm version patch
   ```

   This runs `version-bump.mjs`, which updates `manifest.json` and `versions.json` to match `package.json`, stages those files, and creates a git commit and tag automatically.

3. **Push the commit and tag.**

   ```bash
   git push origin main --follow-tags
   ```

4. **Wait for the workflow.** Go to the **Actions** tab in the GitHub repo. The "Release Obsidian plugin" workflow will:
   - Validate the tag matches `manifest.json` version
   - Build the plugin
   - Create a **draft** release with `main.js`, `manifest.json`, and `styles.css` attached

5. **Publish the release.** Go to the **Releases** page in the GitHub repo. Open the draft, add release notes describing what changed, and click **Publish release**.

   For an already-published plugin, users will see the update in Obsidian. For a first release, proceed to [submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## Troubleshooting

**Workflow fails with "Tag does not match manifest.json version"** — the tag you pushed doesn't match the version in `manifest.json`. This happens if you create a tag manually without running `npm version`. Delete the tag and start over:

```bash
git tag -d 1.0.1
git push origin :refs/tags/1.0.1
```

Then follow the steps above from step 2.

**Workflow doesn't trigger** — tags must match the pattern `X.Y.Z` (digits and dots only). Tags like `v1.0.1` or `beta-1` won't trigger the release workflow.
