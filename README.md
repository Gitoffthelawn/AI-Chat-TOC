# AI Chat TOC

> 🧭 Navigate long AI conversations with ease

A browser extension that adds a **Table of Contents** sidebar to AI chat interfaces. Never lose track of your conversation again!

<p align="center">
  <img src="https://img.shields.io/badge/version-1.9.2-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/platforms-5-orange" alt="Platforms">
  <a href="https://github.com/sponsors/harshmann10"><img src="https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=githubsponsors" alt="Sponsor"></a>
</p>

---

## 🌐 Supported Platforms

| Platform   | Status | Accent Color |
| ---------- | ------ | ------------ |
| ChatGPT    | ✅     | Green        |
| Gemini     | ✅     | Blue         |
| Perplexity | ✅     | Teal         |
| Claude     | ✅     | Orange       |
| Grok       | ✅     | Black        |

---

## ✨ Features

| Feature                      | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| 📋 **TOC Sidebar**           | Lists all your queries in a navigable list                                                        |
| 🍱 **Compact Mode**          | Adaptive multi-column grid of pill badges with zero-jitter hover preview cards                    |
| ⚡ **Virtualization Engine** | Full outline capture for massive conversations without missing messages due to DOM virtualization |
| 🚀 **Instant Outline Cache** | Stores chat outlines locally for sub-second TOC loading on revisited chats                        |
| 🧹 **TOC Cache Manager**     | Live cache storage inspector (chat count & KB size) with one-click cleanup                        |
| 🔍 **Search**                | Filter queries by keyword and AI answer text                                                      |
| 🤖 **Show AI Answers**       | Toggle inline AI response previews                                                                |
| 🌗 **Theme Mode**            | Light / Dark / System modes                                                                       |
| 🖱️ **Drag & Drop**           | Reposition anywhere on screen                                                                     |
| 📐 **Bidirectional Resize**  | Smoothly resize width and height from bottom-left corner with dynamic text reflow                 |
| 🔄 **Instant Updates**       | TOC updates instantly with near-zero lag as you send or receive messages                          |
| 🔄 **Layout Reset**          | Easily restore default layout & position from Settings with one click                             |
| 📱 **Mobile Friendly**       | Touch support & responsive design                                                                 |
| 💾 **Position Memory**       | Remembers position per-site                                                                       |
| 📤 **Export**                | Copy/download as text or markdown                                                                 |
| ⚡ **Highly Optimized**      | Intelligent throttling (300ms/500ms) & idle safety checks                                         |

---

## 📥 Installation

[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox)](https://addons.mozilla.org/firefox/addon/ai-chat-toc/)

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome)](https://chromewebstore.google.com/detail/ai-chat-toc/ainbhafdpkbgbkcomkhkilokelolnnpn)

[![Edge Web Store](https://img.shields.io/badge/Edge-Web%20Store-4285F4?logo=googlechrome)](https://microsoftedge.microsoft.com/addons/detail/ai-chat-toc/ciclciocehhjmkknjhnpaaligmffmpcb)

### Manual Installation

Download the latest zip files from **[GitHub Releases](https://github.com/harshmann10/AI-Chat-TOC/releases)**. If you want to build locally, use the **Build Scripts** section below:

#### Using Pre-built Releases

1. Go to [Releases](https://github.com/harshmann10/AI-Chat-TOC/releases)
2. Download `chrome.zip` or `firefox.zip`
3. Extract the zip file
4. Load in your browser (see instructions below)

#### Loading the Extension

**Firefox:**

- Open `about:debugging#/runtime/this-firefox`
- Click **Load Temporary Add-on**
- Select the `manifest.json` from the extracted folder

**Chrome/Edge:**

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select the extracted folder

---

## 📤 Export Options

Click the **↓** button in the header:

- 📋 Copy as Text
- 📝 Copy as Markdown
- 💾 Download as .txt
- 💾 Download as .md

---

## ⚡ What's New in v1.9 (Virtualization & Modern Polish)

Long AI conversations (especially on ChatGPT) use **DOM virtualization**, where messages scrolled out of view are dynamically unmounted from the DOM. Version 1.9 introduces a multi-strategy virtualization and outline caching architecture, accompanied by UI/UX refinements.

### 🚀 Core Architecture (v1.9.0)

- 🔄 **Dual-Source Hybrid Scanning:** Combines ChatGPT's background API tree (`/c/<id>`, `/share/<id>`) with live DOM prompt bars and mutation observers to build a complete outline immediately with zero manual scrolling required.
- ⚡ **Instant Outline Cache (`store.js`, `storage.js`):** Visited outlines are stored locally with LRU eviction, rendering instantly on revisit with background live sync.
- 🧹 **TOC Cache Manager:** Storage inspector in the popup displays saved chat count and KB size with a one-click **Clear Cache** action.
- 🎯 **Precision Scroll Navigation:** Virtualized message mounting ensures clicking any TOC query smoothly scrolls directly to the target response without jumping.

### ✨ Refinements & Polish (v1.9.1)

- 🎨 **Modern Glassmorphic Export Menu:** Redesigned with frosted glass backdrop blur, clean SVG icons (Text, Markdown, File downloads), and instant <kbd>Escape</kbd> dismissal.
- 💫 **Reactive Ambient Glow:** Soft radial feedback on settings changes and chat scans that reliably re-triggers even on rapid successive clicks without visual stutter.
- 🔍 **Live Search Count & Empty States:** Real-time `X of Y queries` counter, centered _"No matching queries"_ placeholder, and instant <kbd>Escape</kbd> search clearing.
- 🔄 **GPU-Accelerated Morphing:** Smooth panel collapse/expand powered by GPU `transform` and `opacity` with zero layout thrashing or scroll stutter.
- 🪟 **Cross-Browser Scrollbars:** Standardized thin custom scrollbars (`scrollbar-width: thin`) across sidebar lists, compact popovers, and answer previews on Firefox and Chromium.
- 🏷️ **Dynamic Shortcut Tooltips:** Context-aware toggle titles update dynamically between _"Collapse Table of Contents"_ and _"Expand Table of Contents"_.
- 🚀 **Automated GitHub Release Pipeline:** Integrated GitHub Actions workflow to build, verify, and publish releases with production-ready `chrome.zip` and `firefox.zip` bundles.

### 🩹 ChatGPT New UI Compatibility (v1.9.2)

ChatGPT rolled out a redesigned conversation view that changed the DOM contract, the scroll model, **and removed its own prompt-navigation UI**. This release restores the TOC and upgrades how outlines are built and navigated.

- 🧩 **New DOM Contract Support:** Turns are now keyed by a stable UUID wrapper with dedicated user-bubble and assistant-markdown containers, replacing the old `conversation-turn` markup. Both layouts are supported so a staged rollout or rollback keeps working.
- 🔃 **Reverse-Scroll Handling:** The new thread is a `column-reverse` scroller whose `scrollTop` runs from `0` (newest) down to `-maxTop` (oldest). Positive offsets are silently ignored by the browser — which made every scroll, scan and jump silently do nothing. A direction-agnostic scroll layer now drives both layouts through one logical axis.
- 🛰️ **API-First Outlines:** The complete conversation is now loaded from ChatGPT's own conversation API — the same data the app itself uses. A full outline arrives in ~3 s instead of ~20 s of scrolling, and it includes messages the page has never mounted. **On by default** (toggle it off in Settings for a DOM-only outline); the scroll Scan stays as the automatic fallback.
- 🎯 **Smart Message Jump:** Clicking an item now jumps by exact API position, then searches using live feedback from the mounted window — stepping in the correct direction, overshooting when the virtualizer stalls, and verifying the target really mounted before centring it and flashing a highlight. Your own scrolling cancels the jump instantly.
- 🧭 **Prompt-Bar System Removed:** ChatGPT deleted its prompt bars and hover popover, so the bar-index scanner was deleted as well rather than left running against a dead UI.
- ⚡ **Faster, Safer Scan:** The scan waits on the virtualizer instead of fixed sleeps, and grows its step size only while consecutive mounted windows overlap — rewinding automatically if a coverage gap ever appears.
- 🔒 **Stable Cache Keys:** Outline entries keep using ChatGPT's own message UUIDs, so previously cached conversations upgrade in place instead of duplicating.

---

## 🗂️ Project Structure

```
AI Chat TOC/
├── .github/                       # GitHub workflows & configuration
│   └── workflows/
│       └── release.yml            # Automated build & release pipeline
├── src/                           # Shared source code
│   ├── main.js                    # Router & lifecycle orchestration
│   ├── popup.html                 # Settings popup UI
│   ├── popup.css                  # Modern popup styling
│   ├── popup.js                   # Settings state & cache management
│   ├── storage.js                 # Cross-browser storage adapter (MV2 / MV3)
│   ├── store.js                   # Persistent TOC outline store & LRU cache
│   ├── style.css                  # TOC sidebar & compact mode styles
│   ├── themes.js                  # Theme definitions & platform defaults
│   ├── ui.js                      # TOC DOM building, drag, resize & interactions
│   ├── virtual.js                 # Multi-strategy virtualization & navigation engine
│   └── test/                      # Strategy test harness & diagnostic metrics
├── icons/                         # Extension icons
├── manifests/                     # Manifest files
│   ├── chrome_manifest.json       # Manifest V3 (Chrome/Edge)
│   └── firefox_manifest.json      # Manifest V2 (Firefox)
├── dev.ps1                        # Development script (generates dist/)
├── build.ps1                      # Production build script (strips tests & console logs)
├── LICENSE
├── AGENTS.md                  # AI agent guidelines, invariants & release procedures
└── README.md
```

**Build Process:** The `build.ps1` script combines the `src/` folder with the appropriate manifest file to generate ready-to-use zip files for each platform.

---

## ⌨️ Keyboard Shortcuts

| Shortcut       | Action                                                   |
| -------------- | -------------------------------------------------------- |
| `Ctrl+Shift+F` | Toggle TOC visibility (Customizable in browser)          |
| `Alt+Shift+C`  | Toggle Compact Navigation Mode (Customizable in browser) |
| 📋 Copy button | Hover over item to see copy button                       |

### How to Customize the Shortcuts

You can change the `Ctrl+Shift+F` or `Alt+Shift+C` shortcuts natively in your browser:

- **Chrome / Edge**: Go to `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`), find "AI Chat TOC", and type your preferred key combinations.
- **Firefox**: Go to `about:addons`, click the **Gear** icon ⚙️ in the top right, select **Manage Extension Shortcuts**, and update "AI Chat TOC".

---

## 🚀 Roadmap

- [x] ~~Keyboard shortcut (Ctrl+Shift+F, Customizable)~~
- [x] ~~Copy button on each query~~
- [x] ~~Grok support~~
- [x] ~~Settings page (Theme Customization)~~
- [x] ~~Show Answers in TOC~~
- [x] ~~Bidirectional Layout Resizing~~
- [x] ~~Compact Navigation Mode (Adaptive Grid & Hover Previews)~~
- [x] ~~Virtualization resilience for long conversations (v1.9.0)~~
- [x] ~~Instant outline persistent caching & LRU eviction (v1.9.0)~~
- [x] ~~TOC Cache management & storage inspector in Settings (v1.9.0)~~
- [x] ~~Precision virtualized message scroll navigation (v1.9.0)~~
- [x] ~~UI polish, soft ambient glow & modern export dropdown (v1.9.1)~~
- [x] ~~Automated GitHub Actions release workflow (v1.9.1)~~
- [ ] Additional AI platforms (DeepSeek, etc.)

---

## 🛠️ Development

### Build Scripts

#### Local Testing (Development)

```powershell
./dev.ps1
```

Generates a `dist/` folder with:

- `dist/chrome_test/` - Chrome/Edge version ready to load unpacked
- `dist/firefox_test/` - Firefox version ready to load temporarily

Use this when developing and testing locally.

#### Production Build

```powershell
./build.ps1
```

Generates clean, production-ready `chrome.zip` and `firefox.zip` for store distribution. Automatically strips development test harnesses (`test/*`) and verbose debugging logs.

### Adding a New Site

1. Add config to `SITES` in `main.js`
2. Add URL patterns to both manifests in `manifests/`
3. Add theme/accent color class to `style.css`
4. Test with `dev.ps1` before building with `build.ps1`

---

## 📄 License

[MIT License](LICENSE) - Feel free to use, modify, and distribute.

---

## 💖 Support & Sponsor

If you find **AI Chat TOC** useful and it saves you time navigating conversations, consider supporting ongoing development:

<p align="center">
  <a href="https://github.com/sponsors/harshmann10">
    <img src="https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="GitHub Sponsors" />
  </a>
</p>

- **International:** Support via [GitHub Sponsors](https://github.com/sponsors/harshmann10)
- **India:** UPI QR code support coming soon!

---

## 🙏 Acknowledgments

This extension was inspired by and built upon [chatgpt_toc](https://github.com/sk5268/chatgpt_toc) by [@sk5268](https://github.com/sk5268). The original project provided the foundation and core concept for this multi-platform extension.

---

<p align="center">
  <strong>⭐ Star this repo if you find it useful!</strong>
</p>
