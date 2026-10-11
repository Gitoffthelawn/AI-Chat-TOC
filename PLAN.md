# 📋 AI Chat TOC v1.9.0 — Virtualization Fix Implementation Plan

> ⚠️ **SUPERSEDED — READ [`FINDINGS.md`](FINDINGS.md) FIRST.**
> ChatGPT shipped a redesigned conversation UI that invalidates the selector/scroll assumptions below. `FINDINGS.md` now contains the current DOM contract, the reverse-scroll (`column-reverse`) discovery, the shipped v1.9.2 fix, the open chat-switch leak bug, and the working browser-automation recipe. Treat this file as historical context for the C1/C3/C6/C7 architecture only.

> **Goal:** Fix the extension so it works with ChatGPT's (and Claude's) virtualized DOM, where only 2-3 messages are rendered at a time.

> **Status:** Research & testing complete. Live-verified 2026-08-30 on shared chat `6a0cc811` (18 prompts, 36 msgs, 86k scrollHeight). Ready for implementation.

---

## Test Results Summary

| Strategy             | Score  | Messages            | Full Text    | UUIDs     | Nav          | Works On                        |
| -------------------- | ------ | ------------------- | ------------ | --------- | ------------ | ------------------------------- |
| **C1: Prompt Bars**  | 75/100 | 18 (user only)      | ❌ Truncated | ❌        | ✅ Click bar | ChatGPT only                    |
| **C3: Backend API**  | 95/100 | 36 (user+assistant) | ✅ Full      | ✅ Stable | ⚠️ Needs nav | ChatGPT (all views) ✅ VERIFIED |
| **C6: DOM Store**    | 55/100 | 5 (current render)  | ✅ Full      | ✅ Yes    | ✅ Offset    | All platforms                   |
| **C7: Scroll Scan**  | 80/100 | ~36 (est.)          | ✅ Full      | ✅ Yes    | ✅ Offset    | All platforms                   |
| **C4: Fiber Bridge** | 10/100 | 0                   | ❌           | ❌        | ❌           | ❌ Not exposed                  |

---

## Architecture: Core + Conditional + Experimental (v1.9.0) — Updated 2026-08-31

### Tier 1: Core Always-On (All Platforms)

- **C6: DOM Store** — Accumulates full text as user scrolls (0ms) — handles small chats perfectly (all turns in DOM)
- **C7: Scroll Scan** — **Replaces Refresh universally** — single capture for small chats (instant, no scroll), scroll scan for virtualized (`behavior:'instant'` + double `rAF`, 12.2ms/step, ~3s). Threshold varies per platform (ChatGPT ~5 turns, Claude/Gemini unknown) so conditional Refresh/Scan is fragile — single Scan handles both.

### Tier 2: Conditional (ChatGPT Long Chats Only)

- **C1: Prompt Bars** — Instant index (0.1ms for 18 bars) via `[data-toc-item-index]` — **only if `bars.length > 0`**; if `0` → small chat (bars not rendered), skip C1, rely on C6. **2026-08-31:** `aria-label` is now `"Prompt N"` (not truncated text), so C1 creates stubs as `Prompt 1,2...` — real text comes from C6 (visible DOM) or C7 Scan (all 18). After Scan, 18 real texts.

### Tier 3: Experimental Opt-in (Default OFF, ChatGPT Only) — Updated 2026-08-31 (Refinement #4)

- **C3: Backend API** — Settings toggle (default OFF for `/c/{id}`; **auto-enable for `/share/{id}`** — no auth, `200 in 3.3s`, reliable). Logged-in `/c/{id}`: needs Bearer token (fragile, keep opt-in). Merge by index+text prefix, filter `system:26` hidden nodes. Fallback to C1+C6 on failure.

---

## Implementation Traps & Fixes

### Trap 1: Reconciling C1 (Prompt Bars) with C3 (API Data)

**The Problem:** C1 gives 18 user turns (truncated, indexed 0..17, no UUIDs). C3 returns 36 turns (18 user + 18 assistant, with UUIDs and tree mappings). Wiping the TOC and re-rendering when C3 resolves causes flicker and resets user interaction.

**Fix:** Treat C1 items as "stubs" / "placeholders" in the store. When C3 arrives, **merge by index + text prefix**: map User Turn N from C1 to User Message N in C3's linear branch, preserving scroll position and UI state. **Live 2026-08-31:** `aria-label` is now `"Prompt N"` (not truncated text), so C1 stubs are `Prompt 1,2...` (0.1ms for 18 bars) — real text comes from C6 (visible DOM, 2-5 turns) or C7 Scan (all 18, ~6s). After Scan, 18 real texts in correct order. Validate merge by comparing first 30 chars of C6 text vs C3 text; log mismatch telemetry if index desyncs (see Trap 14).

### Trap 2: Navigation Divergence (Assistant Messages) — Two-Step Process ✅ LIVE-VERIFIED 2026-08-30

**The Problem:** C1 navigation works via prompt bars — but assistant messages don't have prompt bars. When C3 adds assistant messages to the TOC, clicking them can't use the bar-click method. Additionally, if the assistant response is very long, clicking the user prompt bar only brings the _top_ of that chunk into view — not a specific heading deep inside.

**Live finding:** Selector `button[aria-label^="Prompt"]` is **stale** (0 results). ChatGPT now renders `aria-label="truncated text..."` (e.g., `"so these pentest..."`) and `data-toc-item-index="N"` is the stable index. Correct selector is `[data-toc-item-index="N"]`.

**Fix:** Two-step navigation process with adaptive wait (not fixed 300ms):

1. **Step 1 — Force mount:** Click `[data-toc-item-index="N"]` to trigger the virtualizer to mount the user+assistant chunk
2. **Step 2 — Wait for DOM:** Poll via `requestAnimationFrame` / `MutationObserver` until target appears (max 600ms) — **live:** bar 9 click `0→44828` in 583ms, last bar `81071` delta, first bar `-81444` delta all succeeded; `scrollIntoView` without wait scrolled to wrong element (`44828→524`). Fixed 300ms is too slow on fast devices and too short on slow laptops.

```javascript
async function waitForElement(selector, timeout = 600) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return document.querySelector(selector);
}
// usage: const el = await waitForElement(`[data-message-id="${id}"]`); el?.scrollIntoView({ behavior: 'instant', block: 'start' });
```

3. **Step 3 — Precise scroll:** Once the target heading/message node appears, fire `element.scrollIntoView({ behavior: 'instant', block: 'start' })` then `rAF→rAF` settle.

**Edge case — Long responses spanning multiple chunks:**

- If the target heading is NOT found after step 2, the response may span multiple virtualizer chunks
- Scroll down within the mounted chunk to trigger the next chunk to mount
- Repeat until found or timeout (5s max)

**Navigation routing:**

- **User messages:** Click `[data-toc-item-index="N"]` (instant, native virtualizer — 0.1ms for 18 bars)
- **Assistant messages:** Click preceding user prompt bar → wait 300ms for DOM → scroll to target
- **Other platforms:** Offset-based scroll (no prompt bars available)

### Trap 3: Token Extraction Reliability (C3)

**The Problem:** Extracting `accessToken` via regex on `<script>` tags works today, but React Server Components builds change frequently.

**Fix:** Add fallback:

```javascript
// Primary: Regex on script tags (fastest, no network)
let token = extractTokenFromScripts();

// Secondary: Fetch session endpoint (authenticated via cookies)
if (!token) {
  const sessionRes = await fetch("/api/auth/session", {
    credentials: "include",
  });
  if (sessionRes.ok) {
    const sessionData = await sessionRes.json();
    token = sessionData.accessToken;
  }
}
```

### Trap 4: Shared Chats — C3 Works! ✅ VERIFIED

**The Problem (RESOLVED):** We initially thought C3 returns 404 for `/share/{id}` URLs. This is **incorrect**. ChatGPT exposes a dedicated, **unauthenticated** endpoint for shared links.

**Verified Endpoint:** `GET /backend-api/share/{shareId}`

**Test Results:**

- Returns **200 OK** with full conversation data
- **No authentication required** (works without login)
- Response includes `linear_conversation` (75 nodes) + `mapping` tree
- **36 messages with content** (18 user + 18 assistant)

**Updated Routing:**

- `/c/{id}` → `GET /backend-api/conversation/{id}` (with Bearer token)
- `/share/{id}` → `GET /backend-api/share/{id}` (no auth needed)

**Fix:** In `ChatGPBAPIFetcher`, check URL structure:

```javascript
if (url.includes("/share/")) {
  return fetch(`/backend-api/share/${shareId}`);
} else {
  return fetch(`/backend-api/conversation/${convId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

### Trap 5: Scroll Scan — Virtualization Illusion Bugs ✅ LIVE-VERIFIED 2026-08-30

**Live finding:** Real scroll container is `div.@w-sm/main:[scrollbar-gutter]` (`overflow:auto`, 86093px, 568px viewport) — **not** `main` (`overflow:visible`, 86041px). `main` selector in plan is wrong. Use `Array.from(div).find(d=>d.scrollHeight>5000 && d.clientHeight<2000 && getComputedStyle(d).overflowY==='auto')` or `div[class*="scrollbar-gutter"]`.

**Bug 1: Reverse Scroll Illusion — CONFIRMED LIVE**
When the script scrolls down, the virtualizer unmounts large text blocks above and replaces them with smaller placeholders. This causes `scrollHeight` to shrink, making `scrollTop` appear to move backwards or stall. **Live:** step 3 `height -16`, turns `7→6` at `scrollTop 1800`.

**Fix:** Track `scrollHeight` changes and tolerate non-advancing scroll steps. Use `scrollTo({top, behavior:'instant'})` + double `rAF` (12.2ms/step) instead of `scrollTop += step`:

```javascript
let staleCount = 0;
const MAX_STALE = 5; // Allow 5 non-advancing steps

while (scrollTop < scrollHeight) {
  const prevScrollHeight = scrollHeight;
  scrollContainer.scrollTo({
    top: scrollTop + scrollStep,
    behavior: "instant",
  });
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  await new Promise((r) => setTimeout(r, 50));

  scrollHeight = scrollContainer.scrollHeight;
  if (scrollHeight >= prevScrollHeight) {
    staleCount = 0; // Progress made
  } else {
    staleCount++;
    if (staleCount > MAX_STALE) break; // True bottom reached
  }
}
```

**Bug 2: Out-of-Order Mounting**
When a script forces a rapid scroll jump, virtualizers don't always unmount previous nodes instantly. The DOM scanner may read messages out of chronological order.

**Fix:** Always sort by absolute offset before storing:

```javascript
// Sort by offsetTop to ensure correct order
messages.sort((a, b) => a.offsetTop - b.offsetTop);

// Or use data-testid index as authoritative order
messages.sort((a, b) => (a.turnNum || 0) - (b.turnNum || 0));
```

### Trap 6: SPA Navigation — Chat Switching Without Reload

**The Problem:** ChatGPT and Claude are Single Page Applications. When a user clicks a different chat in the sidebar, the page does NOT reload — only the URL changes via `pushState`. If `ConversationIdentity` and `ChatGPBAPIFetcher` only trigger on initial script injection, switching chats will leave stale TOC data from the previous conversation.

**Fix:** Implement a URL change watcher:

```javascript
// Hook pushState/replaceState
const originalPushState = history.pushState;
history.pushState = function (...args) {
  originalPushState.apply(this, args);
  onUrlChange();
};

// Listen for popstate (back/forward)
window.addEventListener("popstate", onUrlChange);

// MutationObserver on document.title as fallback
const titleObserver = new MutationObserver(() => onUrlChange());
titleObserver.observe(document.querySelector("title"), { childList: true });

function onUrlChange() {
  const newConvId = extractConversationId();
  if (newConvId !== currentConvId) {
    currentConvId = newConvId;
    MessageStore.reset(); // Clear all data
    triggerStrategies(); // Re-run C1 + C3 for new conversation
  }
}
```

### Trap 8: UUID-Anchor Position Restore After C7 Scan

**The Problem:** In PLAN.md, C7 saves `const savedPosition = scrollContainer.scrollTop` and restores it after scanning. Because virtualized placeholders dynamically mount/expand/unmount during the scan, the total `scrollHeight` shifts by thousands of pixels. Restoring the raw numeric `scrollTop` lands the user in the wrong part of the chat.

**Fix:** Use a message UUID as anchor instead of numeric position:

```javascript
// BEFORE scanning: find the message closest to viewport center
const viewportCenter =
  scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
const allTurns = document.querySelectorAll(
  '[data-testid^="conversation-turn-"]',
);
let closestTurn = null;
let closestDistance = Infinity;

for (const turn of allTurns) {
  const turnCenter = turn.offsetTop + turn.offsetHeight / 2;
  const distance = Math.abs(turnCenter - viewportCenter);
  if (distance < closestDistance) {
    closestDistance = distance;
    closestTurn = turn;
  }
}

const savedAnchorId = closestTurn?.getAttribute("data-turn-id");

// ... perform scroll scan ...

// AFTER scanning: restore by UUID
if (savedAnchorId) {
  const anchorTurn = document.querySelector(
    `[data-turn-id="${savedAnchorId}"]`,
  );
  if (anchorTurn) {
    anchorTurn.scrollIntoView({ behavior: "instant", block: "center" });
  } else {
    // Anchor not in DOM (virtualized away) — use prompt bar (LIVE 2026-08-30: selector is [data-toc-item-index], not aria-label)
    const anchorIndex = findIndexByTurnId(savedAnchorId);
    if (anchorIndex >= 0) {
      const bar = document.querySelector(
        `[data-toc-item-index="${anchorIndex}"]`,
      );
      bar?.click();
    }
  }
}
```

### Trap 10: Multimodal Content Crashes (C3 Parser)

**The Problem:** C3 parser expects `message.content.parts[0]` to be a string. But if the user uploads an image or document, `content_type` becomes `multimodal_text` and `parts` may contain objects (`{ asset_pointer: "..." }`) instead of strings. Doing `parts.join('')` crashes the parser.

**Fix:** Filter parts by type before joining:

```javascript
const textParts = message.content.parts.filter(
  (part) => typeof part === "string",
);
const textContent = textParts.join("\n");
```

### Trap 11: Selector Centralization (Anti-Rot) ⚠️ LIVE-VERIFIED 2026-08-30 — SELECTOR ROT CONFIRMED

**The Problem:** ChatGPT updates its UI weekly. Relying on selectors like `button[aria-label^="Prompt"]` or `data-message-author-role` is fragile. If OpenAI changes an aria-label, C1 breaks until the next extension update. **Live 2026-08-30:** `button[aria-label^="Prompt"]` already returns **0 results** — ChatGPT now renders `aria-label="truncated text..."` (e.g., `"so these pentest..."`) and `data-toc-item-index="N"` is the stable index. `main` has `overflow:visible` (not scrollable); real scroll container is `div[class*="scrollbar-gutter"]` (`overflow:auto`, 86093px).

**Fix:** Extract ALL selectors into a centralized config object at the top of `main.js` with fallbacks:

```javascript
const CHATGPT_SELECTORS = {
  promptBar: "[data-toc-item-index]", // LIVE 2026-08-30: 18/18 in 0.1ms; aria-label holds truncated text, not "Prompt N"
  promptBarFallback: 'button[aria-label^="Prompt"]', // legacy — 0 results as of 2026-08-30
  promptBarTextAttr: "aria-label", // truncated text without hover (287ms hover unnecessary)
  userMessage: '[data-message-author-role="user"]',
  assistantMessage: '[data-message-author-role="assistant"]',
  turnContainer: '[data-testid^="conversation-turn-"]',
  stopButton: '[data-testid="stop-button"]',
  scrollContainer: 'div[class*="scrollbar-gutter"]', // LIVE: overflow:auto, 86093px; NOT main (overflow:visible)
  scrollContainerFallback: "main",
};
```

This makes it trivial to update all selectors in one place when ChatGPT changes their UI.

### Trap 12: MutationObserver Targeting & Throttling (C6) ✅ LIVE-VERIFIED 2026-08-30

**The Problem:** ChatGPT's React app does massive DOM manipulation. If the observer watches `document.body` with `subtree: true` and parses synchronously on every change, it blocks the main thread and causes typing lag. **Live 2026-08-30:** `main` has `overflow:visible` (not scrollable); real scroll container is `div[class*="scrollbar-gutter"]` (`overflow:auto`, 86093px, 568px viewport). Attaching to `main` misses scroll events and observes too broadly (sidebar).

**Fix:**

1. Only attach observer to the **exact scroll container** (not body, not `main`) — `div[class*="scrollbar-gutter"]` with fallback to `main`
2. Debounce callback (max once every 200ms)
3. Use `requestIdleCallback()` for DOM parsing (with `setTimeout` fallback for Safari/Firefox)

```javascript
const scrollRoot =
  document.querySelector(CHATGPT_SELECTORS.scrollContainer) ||
  document.querySelector(CHATGPT_SELECTORS.scrollContainerFallback) ||
  document.querySelector("main");
const observer = new MutationObserver(
  TOC_PERF.debounce(() => {
    (window.requestIdleCallback || ((cb) => setTimeout(cb, 1)))(() => {
      // Parse messages here — only runs when browser is idle
      updateStore();
    });
  }, 200),
);
observer.observe(scrollRoot, { childList: true, subtree: true });
```

### Trap 13: Extension Context Invalidation (MV3)

**The Problem:** Because ChatGPT is an SPA, users keep the tab open for days. If Chrome updates the extension in the background, the old content script is invalidated. The next `chrome.runtime.sendMessage` or `chrome.storage.local.get` call throws `"Extension context invalidated"` and crashes the TOC.

**Fix:** Wrap Chrome API calls in try-catch:

```javascript
function safeChromeCall(fn) {
  try {
    return fn();
  } catch (e) {
    if (e.message?.includes("Extension context invalidated")) {
      // Show refresh prompt
      const overlay = document.createElement("div");
      overlay.textContent = "Extension updated. Please refresh the page.";
      overlay.style.cssText =
        "position:fixed;top:10px;right:10px;z-index:99999;background:#ff4444;color:white;padding:12px;border-radius:8px;font-size:14px;";
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 10000);
    }
    return null;
  }
}
```

### Trap 14: C3 Index Desync — Hidden Tool/System Turns

**The Problem:** C3's `mapping` tree contains nodes that are NOT visible chat turns: system messages, tool calls, DALL-E steps, reasoning blocks. C1 has 18 prompt bars, but C3 may have 75+ nodes. Naive index mapping (`c3UserMessages[i] = c1PromptBars[i]`) will attach wrong text to wrong bars.

**Fix:** Filter C3 nodes strictly for visible conversational turns before indexing:

```javascript
const isVisibleUserTurn = (msg) =>
  msg.author?.role === "user" &&
  msg.metadata?.is_user_system_message !== true &&
  msg.content?.content_type === "text";

const visibleUserMessages = allMessages.filter((m) => isVisibleUserTurn(m));
// Now visibleUserMessages.length === 18 (matches C1 prompt bars)
```

### Trap 15: Detached DOM References — Memory Leak

**The Problem:** Storing `answerElement` (a direct DOM node reference) in MessageStore creates a memory leak. In a virtualized environment, when the user scrolls away, ChatGPT physically destroys DOM nodes — but your extension holds a reference, preventing garbage collection. Also, calling `answerElement.scrollIntoView()` on a detached node silently fails.

**Fix:** Never store DOM element references. Store only the UUID:

```javascript
// REMOVE from MessageStore:
// answerElement: element  ← causes memory leak

// INSTEAD: query DOM at navigation time
const el = document.querySelector(`[data-message-id="${id}"]`);
if (el) {
  el.scrollIntoView({ behavior: "smooth", block: "start" });
} else {
  // Element not in DOM (virtualized away) — use prompt bar
  clickPromptBarForMessage(id);
}
```

### Trap 16: Observer Memory Leaks on Chat Switch

**The Problem:** If you create a new `MutationObserver` on every URL change without disconnecting the old one, multiple overlapping observers accumulate, grinding the main thread to a halt after switching chats a few times.

**Fix:** Disconnect old observer before creating new one:

```javascript
let currentObserver = null;

function onUrlChange() {
  // Disconnect old observer
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  // Reset store
  MessageStore.reset();
  // Create new observer for new conversation
  currentObserver = new MutationObserver(debouncedCallback);
  currentObserver.observe(scrollRoot, { childList: true, subtree: true });
}
```

### Trap 17: Background Tab Throttling During C7 Scan

**The Problem:** If the user clicks "Scan Full Chat" and switches to another tab, Chrome throttles `requestAnimationFrame` and `setTimeout` in background tabs. The scan freezes or takes minutes.

**Fix:** Check `document.visibilityState` and pause/warn:

```javascript
document.addEventListener("visibilitychange", () => {
  if (document.hidden && scanInProgress) {
    pauseScan();
    showToast("Scan paused — keep tab active for full scan");
  } else if (!document.hidden && scanPaused) {
    resumeScan();
  }
});
```

---

## Execution Checklist

### Phase 1: Store & State Model

- [ ] Create unified `MessageStore` class
  - Properties: `{ id, role, text, isTruncated, promptBarIndex, answerText }` ← NO `answerElement` (Trap 15)
  - Methods: `add()`, `update()`, `merge()`, `getAll()`, `getRendered()`, `reset()`
  - Scoped by conversation URL/ID
- [ ] Create `ConversationIdentity` utility
  - Extract conversation ID from URL (`/c/{id}` or `/share/{id}`)
  - Detect logged-in state
  - Detect shared vs own conversation
  - **SPA URL watcher** — hook `pushState`/`replaceState` + `popstate` to detect chat switching (Trap 6)
  - Reset `MessageStore` when conversation ID changes
  - **Disconnect old MutationObserver** before creating new one (Trap 16)
- [ ] Centralize all selectors in `CHATGPT_SELECTORS` config object (Trap 11)
- [ ] Add `safeChromeCall()` wrapper for MV3 context invalidation (Trap 13)

### Phase 2: C1 — Prompt Bars (Instant) ✅ LIVE-VERIFIED 2026-08-30

- [ ] Create `ChatGPTPromptBarScanner` module
  - Query `[data-toc-item-index]` for count + index (LIVE: 18/18 in 0.1ms; `button[aria-label^="Prompt"]` is stale — 0 results)
  - Read truncated text directly from `aria-label` (no hover needed — hover takes 287ms, aria-label already holds `"so these pentest..."`)
  - Map bar index → user message position
  - Store as stubs in MessageStore: `{ promptBarIndex, isTruncated: true, stubText: ariaLabel }`
- [ ] Update TOC to render from MessageStore
  - Show all items from store (including stubs)
  - Stubs show truncated text from `aria-label` (instant, no popover)
  - Full items show complete text (upgraded when C3 resolves — `updateText()` not re-render to avoid flicker)

### Phase 3: C3 — Backend API (Experimental Opt-in, Default OFF) ⚠️ Updated 2026-08-31

- [ ] Create `ChatGTPTokenExtractor` module (only when setting enabled)
  - Primary: Regex extraction from `<script>` tags
  - Secondary: Fetch `/api/auth/session` endpoint
  - Cache token for session duration (chrome.storage.session, 10min)
- [ ] Create `ChatGPBAPIFetcher` module (gated by setting + auto for `/share/`)
  - **Routing (VERIFIED 2026-08-30, Refinement #4):**
    - `/c/{id}` → `GET /backend-api/conversation/{id}` (with Bearer token) — fragile, keep opt-in (default OFF)
    - `/share/{id}` → `GET /backend-api/share/{id}` (no auth needed, 200 in 3.3s, 75 nodes → 36 msgs) ✅ — **auto-enable for `/share/*` even when toggle OFF** (reliable, no token)
  - Parse `mapping` tree → walk `current_node` → `parent` → root, reverse to get active branch (Refinement #3 — handles regenerated/edited branches), then filter `is_visible`
  - **Multimodal-safe parsing** (Trap 10): Filter `parts` by `typeof === 'string'` before joining
  - Return ordered array: `{ id, role, content, createTime }`
- [ ] Create merge logic (only when C3 enabled)
  - **Filter for visible turns only** (Trap 14): Ignore system/tool/DALL-E/reasoning — LIVE: 75 nodes → 26 system + 18 user + 30 assistant + 1 no-role
  - Map C3 visible user messages → C1 stubs by index + text prefix (first 30 chars of `aria-label` vs C3 text) — log mismatch telemetry
  - Add assistant messages to store
  - Update truncated text → full text via `updateText()` (no flicker)
- [ ] Handle errors gracefully
  - 404 → check URL routing (shared vs logged-in)
  - 401 → retry with fresh token
  - Network error → fall back to C1 + C6 (C3 is optional, never block TOC)
  - Add Settings toggle: `Enable experimental API fetch (ChatGPT)` — default OFF; hint: auto-on for `/share/`

### Phase 4: C6 — DOM Store (Continuous) ✅ LIVE-VERIFIED 2026-08-30

- [ ] Create `DOMMessageAccumulator` module
  - **Targeted observer** (Trap 12): Attach to `div[class*="scrollbar-gutter"]` (`overflow:auto`, 86093px) — NOT `main` (`overflow:visible`) or `document.body` — LIVE verified
  - **Throttled callback** (Trap 12): Debounce 200ms, use `requestIdleCallback()` with `setTimeout` fallback for Safari/Firefox
  - On each trigger, scan rendered messages
  - Extract: UUID (`data-message-id`), role, full text, answer text
  - Merge into MessageStore (add new, update existing)
- [ ] Update existing `createSharedMonitor` to use UUID-set change detection
  - Instead of `querySelectorAll(...).length`, track `Set<UUID>` changes
  - Rebuild TOC only when the UUID set changes

### Phase 5: C7 — Scroll Scan (Replaces Refresh Universally) ✅ LIVE-VERIFIED 2026-08-30 — Updated 2026-08-31

- [ ] Create `ScrollScanner` module
  - **UUID-anchor restore** (Trap 8): Save closest message UUID before scan, restore by UUID after (not numeric scrollTop) — fallback to `[data-toc-item-index]` click
  - Handle reverse scroll illusion (Trap 5): Tolerate non-advancing scroll steps — **LIVE:** step 3 `height -16`, turns `7→6` at `scrollTop 1800` confirmed
  - Handle out-of-order mounting (Trap 5): Sort by `offsetTop` before storing — **LIVE:** `isOffsetSorted: true` verified
  - Scroll via `scrollTo({top, behavior:'instant'})` + double `rAF` + 50ms delay (12.2ms/step) — NOT `scrollTop += step`
  - Real scroll container: `div[class*="scrollbar-gutter"]` (`overflow:auto`, 86093px) — NOT `main` (`overflow:visible`)
  - Capture at each stop with UUID dedup
  - **Small chat path:** single capture, no scroll (instant, no disruption) — same as old Refresh
  - **Large chat path:** incremental scroll scan (~3s)
- [ ] **Replace `#toc-refresh-btn` universally with `#toc-scan-btn`** — header becomes `Export | Scan | Toggle` (no conditional Refresh/Scan — threshold varies per platform, fragile)
  - `C6` MutationObserver already auto-updates TOC as user scrolls/types, so manual Refresh is redundant
  - Scan handles both: small chat = single capture (no scroll), large chat = full scan
  - Show progress indicator during scan (scanning/paused), toast `Keep tab active` on `visibilitychange` (Trap 17)
  - Remove old Refresh logic; Scan is the only manual action
- [ ] Add idle/total timeouts (from obsidian-AI-exporter)
  - Idle timeout: 15s (no new messages = done)
  - Total timeout: 300s (5min safety net)
- [ ] Handle background tab throttling (Trap 17): Check `document.visibilityState`, pause scan if tab hidden, show "Keep tab active" warning

### Phase 6: Navigation ✅ LIVE-VERIFIED 2026-08-30 — Updated 2026-08-31 (Refinement #2)

- [ ] Create `VirtualNavigator` class
  - **User messages:** Click `[data-toc-item-index="N"]` (ChatGPT only — LIVE: `button[aria-label^="Prompt"]` is stale, 0 results; `aria-label` now holds truncated text)
  - **Assistant messages:** Two-step process with adaptive wait (Refinement #2 — not fixed 300ms):
    1. Click preceding user prompt bar `[data-toc-item-index="N"]` (force virtualizer mount — LIVE: bar 9 `0→44828` in 583ms verified)
    2. `await waitForElement(`[data-message-id="${id}"]`, 600)` via `rAF` poll / `MutationObserver` (LIVE: `scrollIntoView` without wait scrolled to wrong element `44828→524`; fixed 300ms too slow on fast devices, too short on slow laptops), then `el.scrollIntoView({ behavior: 'instant', block: 'start' })` + `rAF→rAF`
  - **Long responses:** If target not found, scroll down to trigger next chunk mount, repeat
  - **Fallback (other platforms):** Offset-based scroll → wait for render → fine-tune
  - **Cross-platform:** Compute target Y from store metadata, scroll container, MutationObserver for settle
- [ ] Handle edge cases
  - Target not found after scroll → show toast "Message not in view"
  - Multiple scroll attempts → increase step size
  - Conversation changed → reset navigator

### Phase 7: Other Platforms (Claude, Gemini, Perplexity, Grok)

- [ ] For each platform, implement:
  - C6: DOM Store (update selectors for platform-specific attributes)
  - C7: Scroll Scan (platform-specific scroll container detection)
  - Navigation: Offset-based (no prompt bars available)
- [ ] Platform-specific selector configs:
  - Claude: `[data-testid="user-message"]`, `[data-testid="ai-message"]`
  - Gemini: `.query-text-line`, `.model-response-text`
  - Perplexity: `h1.group\/query`, `.prose`
  - Grok: `.message-bubble.bg-surface-l1`

### Phase 8: UI Updates — Updated 2026-08-31

- [ ] Add TOC items for assistant messages (with role indicator)
- [ ] Show "rendered" vs "cached" badge on items (debug mode)
- [ ] **Replace `#toc-refresh-btn` with `#toc-scan-btn`** — header `Export | Scan | Toggle` (Scan replaces Refresh universally; see Phase 5)
- [ ] Add scan progress indicator (scanning/paused) + `Keep tab active` toast
- [ ] Update compact mode to handle more items
- [ ] Update export to include assistant responses

---

## File Changes — Updated 2026-08-31 (2-file optimized)

| File                | Change                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------- |
| `src/store.js`      | **NEW** — MessageStore + ConversationIdentity + CHATGPT_SELECTORS + safeChromeCall (Trap 11, 13, 14, 15)                         |
| `src/virtual.js`    | **NEW** — C1 + C6 + C7 + Navigator + C3 experimental (Trap 1, 2, 5, 8, 10, 12, 16, 17) — 300 steps, turnNum→idx, user-only count |
| `src/main.js`       | **EDIT** — Wire store/virtual, ChatGPT chatContainer `scrollbar-gutter`, getQueries prefers store, safety net + chat switch      |
| `src/ui.js`         | **EDIT** — Render from store, **replace `#toc-refresh-btn` with `#toc-scan-btn`** (`Export                                       | Scan | Toggle`), data-store-id, handleScanClick |
| `src/style.css`     | **EDIT** — Assistant message styling, scan progress, `#toc-scan-btn` (replaces `#toc-refresh-btn`) + pulse                       |
| `src/themes.js`     | **EDIT** — Add `experimentalAPI: false`                                                                                          |
| `src/popup.html/js` | **EDIT** — Experimental API toggle                                                                                               |
| `manifests/*.json`  | **EDIT** — Add `store.js`, `virtual.js` before `ui.js`                                                                           |

**Live 2026-08-31:** Initial 18 Prompt N (C1 stubs, 0.1ms) → After Scan 18 real texts, no duplicates, correct order, nav works (120, 55379, 98122).

---

## Risks & Mitigations

| Risk                                      | Mitigation                                                            |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Token extraction breaks on ChatGPT update | Secondary fallback (session endpoint) + graceful degradation to C1+C6 |
| API response format changes               | Validate response structure, fallback to DOM store                    |
| C1 prompt bars removed/renamed            | Centralized selectors (Trap 11) + fallback to DOM store               |
| Performance on very long conversations    | Throttle store updates, lazy-render TOC                               |
| Shared chat API endpoint changes          | Monitor `/backend-api/share/{id}` response, fallback to C1+C6+C7      |
| Scroll scan reverse illusion              | Track scrollHeight changes, tolerate non-advancing steps              |
| Out-of-order mounting during scan         | Sort by offsetTop or turnNum before storing                           |
| SPA chat switching leaves stale data      | URL change watcher resets MessageStore (Trap 6)                       |
| Position restore lands in wrong spot      | UUID-anchor restore instead of numeric scrollTop (Trap 8)             |
| Multimodal content crashes C3 parser      | Filter parts by `typeof === 'string'` (Trap 10)                       |
| Observer blocks main thread               | Targeted observer + throttle + `requestIdleCallback` (Trap 12)        |
| MV3 context invalidated                   | `safeChromeCall()` wrapper + refresh prompt (Trap 13)                 |
| C3 index desync from hidden turns         | Filter for visible user turns only before indexing (Trap 14)          |
| Memory leak from DOM references           | Never store `answerElement` — query DOM at navigation time (Trap 15)  |
| Observer leak on chat switch              | `observer.disconnect()` before creating new one (Trap 16)             |
| Scan freezes in background tab            | Check `visibilityState`, pause/warn user (Trap 17)                    |

---

## Success Criteria

- [ ] TOC shows **all 18 user messages** on ChatGPT (even with virtualization)
- [ ] TOC shows **assistant responses** when available
- [ ] Clicking a TOC item **navigates to that message** (even if not rendered)
- [ ] Works on **shared chats** (`/share/{id}` URLs)
- [ ] Works on **logged-in chats** (`/c/{id}` URLs)
- [ ] **No flicker** when C3 data arrives after C1 stubs
- [ ] **No visual disruption** during background operations
- [ ] Extension size increase < 20KB
- [ ] No CSP violations
- [ ] Works on Chrome, Edge, and Firefox

---

## Future / v2 Enhancements

These are real issues identified during review but deferred to v2 to keep v1 focused:

### Deferred Trap 7: Smooth Scroll Collision

**Problem:** ChatGPT's native smooth scroll animation fights with our `scrollIntoView()` call during 2-step navigation.

**Fix (v2):** Wait for scroll velocity to reach zero before fine-tuning:

```javascript
async function waitForScrollIdle(container, opts) {
  const { timeout = 2000, stableFrames = 3 } = opts;
  let lastScrollTop = container.scrollTop;
  let stableCount = 0;
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    await new Promise((r) => requestAnimationFrame(r));
    if (container.scrollTop === lastScrollTop) {
      stableCount++;
      if (stableCount >= stableFrames) return true;
    } else {
      stableCount = 0;
      lastScrollTop = container.scrollTop;
    }
  }
  return false;
}
```

### Deferred Trap 9: Streaming & Live Generation

**Problem:** During active streaming, C1 adds a new bar, C3 doesn't know about the new message, and C6 sees partial markdown.

**Fix (v2):** Add `isStreaming` state to MessageStore:

```javascript
const isStreaming = !!document.querySelector('[data-testid="stop-button"]');
// During streaming: only update last item's text, don't refetch C3
// When streaming ends: trigger C3 refetch for complete data
```

### Deferred Refinement #1: Dynamic Scan Step Sizing for Mega-Chats

**Concern:** C7 at `clientHeight * 0.8` + ~60ms/step needs ~300 steps for 200-turn chat (150kpx / 600px viewport) → 18–20s, not 3s.

**Deferred fix (needs live mega-chat testing):** Increase to `clientHeight * 1.8–2.0` — virtualizer mounts 1.5–2× viewport buffer, so safe to jump further. Cuts scan to ~150 steps (~9s). Keep `0.8×` for v1.9.0; validate buffer size on 100+ turn chat before enabling.

### Future: Remote Selector Config (Issue #8 part 2)

Fetch selector config from a remote URL (GitHub Gist) every 24 hours. If ChatGPT changes a class name, update the remote JSON — all extensions fix themselves without an update.
