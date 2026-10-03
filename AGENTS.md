# AGENTS.md — AI Chat TOC

This document provides architectural context, critical invariants, build commands, and the standard release procedure for any AI assistant working on the **AI Chat TOC** extension codebase.

---

## 1. Project Overview

**AI Chat TOC** is a high-performance browser extension that injects a draggable, resizable Table of Contents sidebar into major AI chat platforms:
- **ChatGPT** (`chatgpt.com`)
- **Claude** (`claude.ai`)
- **Gemini** (`gemini.google.com`)
- **Perplexity** (`perplexity.ai`)
- **Grok** (`grok.com`)

### Dual-Manifest Packaging
- **Chrome / Edge**: Manifest V3 ([`manifests/chrome_manifest.json`](manifests/chrome_manifest.json))
- **Firefox**: Manifest V2 ([`manifests/firefox_manifest.json`](manifests/firefox_manifest.json))

---

## 2. Directory & Component Structure

```text
AI Chat TOC/
├── .github/workflows/
│   └── release.yml            # GitHub Actions automated build & release pipeline
├── src/
│   ├── main.js                # Router, platform configuration & lifecycle orchestration
│   ├── ui.js                  # TOC DOM construction, drag & resize, animations, events
│   ├── themes.js              # Theme manager, platform colors, settings persistence
│   ├── virtual.js             # ChatGPT multi-strategy virtualization & precision navigator
│   ├── store.js               # Persistent outline cache with LRU eviction
│   ├── storage.js             # Cross-browser storage adapter (MV2 / MV3 compat)
│   ├── popup.html             # Extension settings popup UI
│   ├── popup.css              # Settings popup styling
│   ├── popup.js               # Settings interactions & cache management
│   ├── style.css              # TOC sidebar, compact mode, animations & scrollbar styles
│   └── test/                  # Test harness & metrics (stripped in production builds)
├── icons/                     # Extension branding icons
├── manifests/                 # Platform manifest definitions
│   ├── chrome_manifest.json   # MV3 manifest
│   └── firefox_manifest.json  # MV2 manifest
├── dev.ps1                    # Local dev unpack script (outputs to dist/)
├── build.ps1                  # Production zip packaging script (cross-platform pwsh)
├── AGENTS.md                  # AI agent guidelines, invariants & release procedures (this file)
└── README.md                  # User-facing features & documentation
```

---

## 3. Critical Architectural Invariants

Whenever modifying code in `src/`, preserve these core rules:

1. **Performance is Priority #1**:
   - Animations must strictly touch GPU-composited properties only (`transform`, `opacity`).
   - Never animate `width`, `height`, `left`, `top`, or `margin` during panel collapse/expand. Layout thrashing causes severe frame drops in long conversations.
2. **Never Store Stale DOM Elements Across Virtualization**:
   - In virtualized chats (ChatGPT, Claude), off-screen DOM nodes are continually unmounted and re-mounted.
   - Store stable message IDs / indices (`_storeId`, `data-store-id`), never direct DOM node references.
3. **In-Place DOM Patching**:
   - `createTOC()` uses DocumentFragments and updates existing `<li>` items in-place where possible to avoid full list rebuilds and visual flickering.
4. **CSS Animation Restarts Must Force Reflow**:
   - When restarting a CSS keyframe animation dynamically (e.g. [`pulseContainer()`](src/ui.js)), always read `void element.offsetWidth` between class removal and re-addition. Without this, browsers batch the style recalculation and skip restarting the animation.
5. **Preserve Cross-Browser Compatibility**:
   - Custom scrollbars must include both standard CSS (`scrollbar-width: thin; scrollbar-color: ...`) for Firefox and `::-webkit-scrollbar` for Chromium.
   - Storage operations must use the safe storage adapter (`storage.js`) supporting Chrome callback and Firefox Promise APIs.
6. **Git Safety & Permission Policy (CRITICAL)**:
   - **NEVER** run `git commit`, `git tag`, or `git push` without an explicit request or permission from the user.
   - Always prepare changes, run verification checks, and show the proposed commit message or tag command to the user. Wait for user confirmation before executing any Git write operations.

---

## 4. Verification & Build Commands

Before creating a release or finishing changes:

```powershell
# 1. Syntax check all JS files
node --check src/ui.js
node --check src/themes.js
node --check src/main.js
node --check src/virtual.js
node --check src/store.js
node --check src/storage.js
node --check src/popup.js

# 2. Build production zip archives
# (Strips dev test harnesses and debug console.log lines automatically)
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

---

## 5. Release & Tagging Procedure (How to Publish)

The repository has an automated GitHub Actions pipeline ([`.github/workflows/release.yml`](.github/workflows/release.yml)) that builds, packages, and attaches `chrome.zip` and `firefox.zip` to a new GitHub Release.

> [!CAUTION]
> **EXPLICIT USER PERMISSION REQUIRED FOR GIT WRITE OPERATIONS**:
> AI assistants must **never** run `git commit`, `git tag`, or `git push` autonomously.
> Always prepare the file changes, run verification, show the proposed commit/tag message to the user, and wait for their explicit permission before running any Git write commands.

### Step-by-Step Release Flow for Agents:

1. **Bump Manifest Versions**:
   Update `"version"` in both:
   - [`manifests/chrome_manifest.json`](manifests/chrome_manifest.json)
   - [`manifests/firefox_manifest.json`](manifests/firefox_manifest.json)

2. **Update README.md**:
   - Ensure the version badge (`img.shields.io/badge/version-X.Y.Z-blue`) matches the new version.
   - Update `What's New in vX.Y` with concise highlights of changes.

3. **Verify Build**:
   Run `node --check` and `powershell -ExecutionPolicy Bypass -File .\build.ps1` to ensure archives build cleanly.

4. **Commit & Push to Main**:
   ```bash
   git add manifests/ README.md src/ build.ps1
   git commit -m "chore: bump version to vX.Y.Z"
   git push origin main
   ```

5. **Tag and Push the Git Release Tag**:
   Create an annotated tag containing the release summary in `-m`:
   ```bash
   git tag -a vX.Y.Z -m "### Highlights
   - Summary of feature 1
   - Summary of feature 2"
   git push origin vX.Y.Z
   ```

6. **Automated Pipeline Takes Over**:
   - GitHub Actions detects the `v*` tag.
   - It runs syntax validation and `./build.ps1`.
   - It extracts the tag message from `-m` as the release body.
   - It creates the GitHub Release **Release vX.Y.Z** and attaches `chrome.zip` and `firefox.zip`.
