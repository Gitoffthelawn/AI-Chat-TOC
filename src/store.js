/**
 * AI Chat TOC - Store Module (v1.9.0)
 * Unified MessageStore + ConversationIdentity + Selectors + safeChromeCall
 * Optimized 2-file architecture: store.js + virtual.js
 * Live-verified 2026-08-30 on share/6a0cc811 (18 prompts, 36 msgs, 86k height)
 */

window.TOC = window.TOC || {};

// =============================================================================
// Centralized Selectors (Trap 11) — LIVE-VERIFIED 2026-08-30
// =============================================================================
window.TOC.SELECTORS = {
    chatgpt: {
        // ---------------------------------------------------------------------
        // NEW UI (LIVE-VERIFIED 2026-10-10) — the thread is a column-reverse
        // scroller and turns are keyed by a stable UUID instead of data-testid.
        // ---------------------------------------------------------------------
        turnContainerNew: '[data-turn-key]',
        turnKeyAttr: 'data-turn-key',
        userMessageNew: '[data-user-message-bubble]',
        assistantMessageNew: '[data-markdown-text-style="assistant-message"]',
        unitKeyAttr: 'data-chatgpt-search-unit-key',      // e.g. "fallback-turn-2:0:user"
        unitMsgIdsAttr: 'data-chatgpt-search-message-ids', // space-separated UUIDs
        selectionMsgIdAttr: 'data-chatgpt-selection-message-id',
        convIdAttr: 'data-chatgpt-selection-conversation-id',
        scrollContainerNew: '.thread-scroll-container',

        // ---------------------------------------------------------------------
        // LEGACY UI — kept as a fallback so a staged rollout or rollback still
        // resolves. The prompt-bar selectors were REMOVED in v1.9.2: ChatGPT's
        // 2026-10 redesign deleted that UI entirely, so nothing can match them
        // (live probes: [data-toc-item-index] → 0, `Prompt N` aria-labels → 0).
        // ---------------------------------------------------------------------
        userMessage: '[data-message-author-role="user"]',
        assistantMessage: '[data-message-author-role="assistant"]',
        turnContainer: '[data-testid^="conversation-turn-"]',
        turnIdAttr: 'data-turn-id',
        messageIdAttr: 'data-message-id',
        stopButton: '[data-testid="stop-button"]',
        // LEGACY: real scroll container was div[class*="scrollbar-gutter"]
        scrollContainer: 'div[class*="scrollbar-gutter"]',
        scrollContainerFallback: 'main',
        scrollContainerAlt: 'div.\\@w-sm\\/main\\:\\[scrollbar-gutter\\:var\\(--stage-scroll-gutter\\)\\]',
    },
    gemini: {
        userMessage: '.query-text-line, .user-message, .query, user-query',
        assistantMessage: '.model-response-text, .model-response, [class*="response"]',
        turnContainer: '.conversation-turn, [class*="turn"]',
        scrollContainer: 'main, [role="main"]',
    },
    perplexity: {
        userMessage: 'h1.group\\/query, div.group\\/query, .flex.flex-col.gap-1.pb-2',
        assistantMessage: '.prose, [class*="prose"]',
        turnContainer: '[class*="group/query"]',
        scrollContainer: 'main',
    },
    claude: {
        userMessage: '[data-testid="user-message"], .human-message, [class*="human"], [class*="font-user-message"], .flex-wrap.justify-end',
        assistantMessage: '[data-testid="ai-message"], .font-claude-response, .font-claude-response-body',
        turnContainer: '.mb-1.mt-6.group',
        scrollContainer: '[data-testid="conversation-turn-list"], main',
    },
    grok: {
        userMessage: ".message-bubble.bg-surface-l1, .user-message, [data-testid='user-message'], .message-user",
        assistantMessage: '.message-bubble:not(.bg-surface-l1), [class*="assistant"]',
        turnContainer: '[class*="message"], [class*="bubble"]',
        scrollContainer: 'main',
    }
};

// Legacy alias for main.js compatibility
window.CHATGPT_SELECTORS = window.TOC.SELECTORS.chatgpt;

// =============================================================================
// safeChromeCall (Trap 13) — MV3 context invalidation
// =============================================================================
window.TOC.safeChromeCall = function safeChromeCall(fn) {
    try {
        return fn();
    } catch (e) {
        if (e && e.message && e.message.includes('Extension context invalidated')) {
            const overlay = document.createElement('div');
            overlay.textContent = 'Extension updated. Please refresh the page.';
            overlay.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;background:#ff4444;color:white;padding:12px;border-radius:8px;font-size:14px;';
            document.body.appendChild(overlay);
            setTimeout(() => overlay.remove(), 10000);
        }
        return null;
    }
};

// =============================================================================
// Reverse-scroll helpers (new ChatGPT UI) — LIVE-VERIFIED 2026-10-10
//
// The new thread container is a `column-reverse` flex scroller. There the
// native scrollTop range is [-maxTop, 0]: 0 = newest message, -maxTop = oldest.
// Assigning a positive value (or scrollTo({top: >0})) is silently clamped and
// does nothing — which is why every absolute-offset scroll, scan step and jump
// in the legacy code became a no-op on the new UI.
//
// These helpers expose one logical axis — 0 = oldest, maxTop = newest — that
// behaves identically in both layouts, so callers never branch on layout.
// =============================================================================
window.TOC.scroll = {
    isReverse(el) {
        try { return getComputedStyle(el).flexDirection === 'column-reverse'; } catch (e) { return false; }
    },
    maxTop(el) {
        if (!el) return 0;
        return Math.max(0, el.scrollHeight - el.clientHeight);
    },
    /** Logical offset of the current scroll position: 0 = oldest, maxTop = newest. */
    getLogical(el) {
        if (!el) return 0;
        if (this.isReverse(el)) return el.scrollTop + this.maxTop(el);
        return Math.max(0, el.scrollTop);
    },
    /** Scroll to a logical offset: 0 = oldest, maxTop = newest. */
    setLogical(el, value) {
        if (!el) return false;
        const max = this.maxTop(el);
        const clamped = Math.max(0, Math.min(max, value));
        const top = this.isReverse(el) ? clamped - max : clamped;
        el.scrollTo({ top, behavior: 'instant' });
        return true;
    },
    /**
     * Direction-agnostic nudge that centres `target` inside `el`.
     * A viewport delta stays correct while the virtualizer rewrites scrollHeight,
     * and — unlike absolute math — it moves the content the same way in normal
     * and column-reverse containers (increasing scrollTop always scrolls toward
     * newer content).
     */
    scrollByElement(el, target, block) {
        if (!el || !target) return false;
        try {
            const cr = el.getBoundingClientRect();
            const tr = target.getBoundingClientRect();
            const delta = block === 'center'
                ? (tr.top + tr.height / 2) - (cr.top + cr.height / 2)
                : (tr.top - cr.top);
            el.scrollTop += delta;
            return true;
        } catch (e) {
            return false;
        }
    },
};

// =============================================================================
// Active-thread DOM helpers (new ChatGPT UI) — see FINDINGS §4
//
// Turns live inside a single .thread-scroll-container, and each turn carries its
// conversation id on a DESCENDANT [data-chatgpt-selection-conversation-id].
// Every consumer must query turns through HERE: a document-wide
// querySelectorAll('[data-turn-key]') also matches the OUTGOING thread while an
// SPA swap is in flight, which is how the previous chat's turns leaked into the
// new chat's store.
//
// NOTE: values in SELECTORS.chatgpt are a MIX of bare attribute names
// (convIdAttr, turnKeyAttr, unitKeyAttr) and full selectors (turnContainerNew,
// scrollContainerNew). Attribute names go inside [brackets]; full selectors must
// NOT be wrapped again — doing so (`[[data-turn-key]]`) throws a SyntaxError that
// aborts the whole script.
// =============================================================================
window.TOC.dom = {
    /** The active conversation's id (URL-derived, never stale). */
    convId() {
        try {
            return (window.TOC.ConversationIdentity && window.TOC.ConversationIdentity.getCurrentId()) || null;
        } catch (e) {
            return null;
        }
    },
    /** Conversation ids owned by one container (used for matching). */
    _containerConvIds(container) {
        const sel = window.TOC.SELECTORS.chatgpt;
        const out = new Set();
        try {
            container.querySelectorAll(`[${sel.convIdAttr}]`).forEach((el) => {
                const v = el.getAttribute(sel.convIdAttr);
                if (v) out.add(v);
            });
        } catch (e) { /* ignore */ }
        return out;
    },
    /**
     * The ACTIVE thread scroller.
     *
     * ChatGPT keeps the OUTGOING thread mounted (hidden, clientHeight 0) while
     * the incoming one renders — so during a swap there are TWO
     * .thread-scroll-container elements, and a plain querySelector returns the
     * OLD one. Resolve by conversation id first, then visibility, then newest.
     */
    threadContainer() {
        const sel = window.TOC.SELECTORS.chatgpt;
        try {
            const all = Array.from(document.querySelectorAll(sel.scrollContainerNew));
            if (all.length === 0) return null;
            if (all.length === 1) return all[0];
            const convId = this.convId();
            if (convId) {
                const match = all.find((c) => this._containerConvIds(c).has(convId));
                if (match) return match;
            }
            const visible = all.filter((c) => c.clientHeight > 0 || c.offsetParent !== null);
            if (visible.length > 0) return visible[visible.length - 1];
            return all[all.length - 1];
        } catch (e) {
            return null;
        }
    },
    /**
     * Turns belonging to the ACTIVE conversation, in DOM order.
     * Returns [] when every mounted turn belongs to a DIFFERENT conversation:
     * that is the leak case, and falling back to the unfiltered set is exactly
     * how the outgoing chat's turns used to get merged into the new TOC.
     */
    activeTurns() {
        const sel = window.TOC.SELECTORS.chatgpt;
        try {
            const root = this.threadContainer() || document;
            const all = Array.from(root.querySelectorAll(sel.turnContainerNew));
            if (all.length === 0) return [];
            const convId = this.convId();
            if (!convId) return all;
            return all.filter((turn) => {
                try {
                    const el = turn.querySelector(`[${sel.convIdAttr}]`); // bare attr name — safe to wrap
                    return !el || el.getAttribute(sel.convIdAttr) === convId;
                } catch (e) {
                    return true;
                }
            });
        } catch (e) {
            return [];
        }
    },
};

// =============================================================================
// ConversationIdentity — SPA-aware (Trap 6, 16)
// =============================================================================
window.TOC.ConversationIdentity = (function () {
    let currentConvId = null;
    let currentUrl = location.href;
    let urlChangeCallbacks = [];
    let headObserver = null; // watches <head> for SPA route swaps (cross-world)
    let historyPatched = false;

    function extractConversationId(url) {
        url = url || location.href;
        // /c/{id} or /share/{id}
        try {
            let m = url.match(/\/c\/([a-f0-9-]+)/);
            if (m) return m[1];
            m = url.match(/\/share\/([a-f0-9-]+)/);
            if (m) return m[1];
        } catch (e) { /* fall through to null */ }
        // No id in the URL (brand-new chat, /gpts, settings, …) → return null and
        // let callers key the store on location.href.
        //
        // Do NOT fall back to the DOM. During an SPA swap the OUTGOING thread is
        // often still mounted, so a DOM-derived id is the PREVIOUS conversation's
        // id — getCurrentId() then never changes, the store is never reset, and
        // chat A's messages leak into chat B's TOC. The old DOM fallback also
        // built `[[data-turn-key]]` (a selector wrapped in brackets a second
        // time), which threw a SyntaxError on every no-id page load and aborted
        // all of store.js — that is what killed SPA chat switching entirely.
        return null;
    }

    function isShared(url) {
        url = url || location.href;
        return url.includes('/share/');
    }

    function isLoggedIn() {
        // Heuristic: check for login button absence or presence of user menu
        return !document.querySelector('button:has-text("Log in")') || !!document.querySelector('[data-testid="user-menu"], [aria-label*="profile"]');
    }

    function getCurrentId() {
        return currentConvId;
    }

    function getCurrentUrl() {
        return currentUrl;
    }

    function onUrlChange(callback) {
        if (typeof callback === 'function') urlChangeCallbacks.push(callback);
    }

    function emitUrlChange(newUrl, newId) {
        urlChangeCallbacks.forEach(cb => {
            try { cb(newId, newUrl); } catch (e) { console.debug('[TOC Identity] callback error', e); }
        });
    }

    function checkAndEmit() {
        const newUrl = location.href;
        const newId = extractConversationId(newUrl);
        if (newUrl !== currentUrl || newId !== currentConvId) {
            const oldId = currentConvId;
            currentUrl = newUrl;
            currentConvId = newId;
            if (oldId !== newId) {
                console.log(`[TOC Identity] Conversation changed: ${oldId} -> ${newId} (${newUrl})`);
            }
            emitUrlChange(newUrl, newId);
        }
    }

    function installHistoryHooks() {
        if (historyPatched) return;
        historyPatched = true;

        const emitLocationChange = () => {
            window.dispatchEvent(new Event('toc-locationchange'));
        };

        const patch = (method) => {
            const orig = history[method];
            if (typeof orig !== 'function' || orig.__tocPatched) return;
            const patched = function (...args) {
                const res = orig.apply(this, args);
                emitLocationChange();
                return res;
            };
            patched.__tocPatched = true;
            history[method] = patched;
        };
        patch('pushState');
        patch('replaceState');

        // --- Cross-world detection (the ONLY reliable channels) -----------------
        // DOM objects — including `history` — get a SEPARATE JS wrapper per world,
        // so the expando patches above are invisible to page scripts: a site
        // router calling its own history.pushState never reaches them. Verified
        // live 2026-10-10: a main-world probe caught the router's pushState while
        // the isolated-world patch never fired, so SPA chat switches went
        // completely unnoticed (TOC kept the previous chat's rows forever).

        // 1. DOM events are shared across worlds → back/forward works.
        window.addEventListener('popstate', emitLocationChange);
        window.addEventListener('hashchange', emitLocationChange);
        window.addEventListener('toc-locationchange', checkAndEmit);

        // 2. Poll location.href — it IS shared, so it always reflects router
        //    pushes. A string compare every 500 ms is effectively free.
        setInterval(() => {
            try { checkAndEmit(); } catch (e) { /* ignore */ }
        }, 500);

        // 3. The route change swaps <title> and the thread DOM; watching <head>
        //    gets us on the same frame as the navigation when possible.
        try {
            if (!headObserver) {
                headObserver = new MutationObserver(() => {
                    try { checkAndEmit(); } catch (e) { /* ignore */ }
                });
                headObserver.observe(document.head || document.documentElement, {
                    childList: true, subtree: true, characterData: true,
                });
            }
        } catch (e) { /* ignore */ }
    }

    // Init — never let id resolution or hook installation abort store.js: doing
    // so would take MessageStore + StoreManager + the main.js router down with
    // it, and the extension would stay dead for the whole page session.
    try { currentConvId = extractConversationId(location.href); } catch (e) { currentConvId = null; }
    try { installHistoryHooks(); } catch (e) { /* ignore */ }

    return {
        extractConversationId,
        isShared,
        isLoggedIn,
        getCurrentId,
        getCurrentUrl,
        onUrlChange,
        checkAndEmit,
        installHistoryHooks,
    };
})();

// =============================================================================
// MessageStore — Unified store (Trap 1, 14, 15)
// =============================================================================
window.TOC.MessageStore = class MessageStore {
    constructor(conversationId) {
        this.conversationId = conversationId || window.TOC.ConversationIdentity.getCurrentId() || location.href;
        this.messages = new Map(); // id -> message
        this.order = []; // ordered ids
        this.uuidSet = new Set(); // for change detection (Trap 12)
        this.promptBarIndexMap = new Map(); // promptBarIndex -> id
        this.isFullyScanned = false; // persistent-cache scan state (provisional C1/C6 vs full C3/C7)
        // NEW UI (v1.9.2): total messages in the API's linear branch. Together with
        // per-message apiIndex this gives the Navigator an exact ratio jump.
        this.apiTotal = null;
        // id → API branch position, published by C3 (see setChainIndex). Every
        // record added/updated afterwards is stamped automatically, so records that
        // C6/C7 discover AFTER the API merge still get an exact position. Without
        // this the sort comparator mixes positioned and position-less records and
        // the list order (and navigation) breaks.
        this.chainIndexById = null;
    }

    /** C3 publishes its id → branch-position map here (see fetchAndMerge). */
    setChainIndex(map) {
        this.chainIndexById = (map && typeof map.get === 'function') ? map : null;
    }

    /** Fill in apiIndex from the published chain map when it is still unknown. */
    _stampApiIndex(rec) {
        try {
            if (!rec || !this.chainIndexById) return rec;
            if (rec.apiIndex !== null && rec.apiIndex !== undefined) return rec;
            let idx = null;
            if (rec.id && this.chainIndexById.has(rec.id)) idx = this.chainIndexById.get(rec.id);
            else if (rec.messageId && this.chainIndexById.has(rec.messageId)) idx = this.chainIndexById.get(rec.messageId);
            if (idx !== null && idx !== undefined) rec.apiIndex = idx;
        } catch (e) { /* ignore */ }
        return rec;
    }

    /**
     * API branch position for a raw DOM message id (C3's published table).
     * The Navigator uses this to locate the MOUNTED window without needing a
     * store record — mounted turns are not always in the store (C6 only adds what
     * it has scanned), and the DOM's own turn numbers are LOCAL to the render
     * window (they restart at 0), so they cannot order the conversation.
     */
    positionOfId(id) {
        try {
            if (!id || !this.chainIndexById) return null;
            return this.chainIndexById.has(id) ? this.chainIndexById.get(id) : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Add or update a message. Never store DOM element (Trap 15).
     * @param {object} msg - { id, role, text, isTruncated, promptBarIndex, turnId, messageId, offsetTop, source, createTime }
     */
    add(msg) {
        if (!msg || !msg.id) return null;
        const existing = this.messages.get(msg.id);
        if (existing) {
            // Merge: prefer full text over truncated, keep earliest promptBarIndex
            const merged = { ...existing, ...msg };
            // Don't overwrite full text with truncated
            if (existing.text && !existing.isTruncated && msg.isTruncated) {
                merged.text = existing.text;
                merged.isTruncated = false;
            }
            // Keep original promptBarIndex if exists
            if (existing.promptBarIndex !== undefined && existing.promptBarIndex !== null) {
                merged.promptBarIndex = existing.promptBarIndex;
            }
            // Never downgrade an exact API position to null
            if ((merged.apiIndex === null || merged.apiIndex === undefined) &&
                existing.apiIndex !== undefined && existing.apiIndex !== null) {
                merged.apiIndex = existing.apiIndex;
            }
            this._stampApiIndex(merged);
            this.messages.set(msg.id, merged);
            return merged;
        }
        // New message
        const normalized = {
            id: msg.id,
            role: msg.role || 'user',
            // NEW UI (v1.9.2): position in the API's linear branch (0 = oldest).
            // null until C3 has merged the conversation.
            apiIndex: (msg.apiIndex !== undefined && msg.apiIndex !== null) ? msg.apiIndex : null,
            text: msg.text || '',
            isTruncated: !!msg.isTruncated,
            promptBarIndex: msg.promptBarIndex !== undefined ? msg.promptBarIndex : null,
            turnId: msg.turnId || null,
            messageId: msg.messageId || null,
            offsetTop: msg.offsetTop !== undefined ? msg.offsetTop : null,
            source: msg.source || 'c6',
            createTime: msg.createTime || null,
            turnNumber: msg.turnNumber !== undefined ? msg.turnNumber : null,
            answerText: msg.answerText || '', // for backward compat, but not element
        };
        this._stampApiIndex(normalized);
        this.messages.set(msg.id, normalized);
        this.order.push(msg.id);
        this.uuidSet.add(msg.id);
        if (normalized.promptBarIndex !== null) {
            this.promptBarIndexMap.set(normalized.promptBarIndex, msg.id);
        }
        // Keep the list chronological. Records added AFTER the C3 merge (C6/C7
        // findings, live messages) used to sit unsorted at the tail: the visual
        // order broke and the Navigator's position signals went with it
        // (live evidence: positions [0..142, 239, 222, 224, 226, 228]).
        this.sort();
        return normalized;
    }

    /**
     * Update fields of an existing record.
     * Never downgrades an exact API position (apiIndex) back to null.
     */
    update(id, data) {
        const existing = this.messages.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...data };
        if ((updated.apiIndex === null || updated.apiIndex === undefined) &&
            existing.apiIndex !== undefined && existing.apiIndex !== null) {
            updated.apiIndex = existing.apiIndex;
        }
        this._stampApiIndex(updated);
        this.messages.set(id, updated);
        return updated;
    }

    /**
     * Rename a record's id in place, keeping every index in sync (messages map,
     * order array, uuidSet, promptBarIndexMap). Used when C3 upgrades a record
     * that C6 had keyed under a different id — doing this wrongly is what turned
     * an upgrade into a duplicate row (and left the mounted record without the
     * apiIndex the Navigator needs).
     */
    _migrateId(oldId, newId) {
        if (!oldId || !newId || oldId === newId) return false;
        const rec = this.messages.get(oldId);
        if (!rec) return false;
        if (this.messages.has(newId)) {
            // Target id already exists (a previous partial merge) — drop the old
            // record rather than overwriting live data, and clear any map entries
            // still pointing at it so getByPromptBarIndex() can't return undefined.
            this.messages.delete(oldId);
            this.order = this.order.filter(id => id !== oldId);
            this.uuidSet.delete(oldId);
            try {
                for (const [k, v] of this.promptBarIndexMap) {
                    if (v === oldId) this.promptBarIndexMap.delete(k);
                }
            } catch (e) { /* ignore */ }
            return true;
        }
        this.messages.delete(oldId);
        this.messages.set(newId, { ...rec, id: newId });
        this.order = this.order.map(id => (id === oldId ? newId : id));
        this.uuidSet.delete(oldId);
        this.uuidSet.add(newId);
        try {
            for (const [k, v] of this.promptBarIndexMap) {
                if (v === oldId) this.promptBarIndexMap.set(k, newId);
            }
        } catch (e) { /* ignore */ }
        return true;
    }

    /**
     * Merge C3 API data with C1 stubs (Trap 1, 14)
     * Filter visible turns only, then map by index + text prefix
     */
    mergeC3Data(c3Messages, c1Stubs) {
        if (!Array.isArray(c3Messages) || c3Messages.length === 0) return;

        // Filter visible conversation turns only (Trap 14) — LIVE: 75 nodes
        // -> 26 system + 18 user + 30 assistant. System/tool/user-system and
        // hidden nodes must never become TOC messages.
        const isVisibleUserTurn = (m) =>
            m.role === 'user' &&
            m.isVisible !== false &&
            m.isUserSystemMessage !== true &&
            m.text &&
            m.text.trim().length > 0;

        const visibleUserMessages = c3Messages.filter(isVisibleUserTurn);
        // Assistant turns: same visibility rules, no prompt index.
        const assistantMessages = c3Messages.filter(m =>
            m.role === 'assistant' &&
            m.isVisible !== false &&
            m.isUserSystemMessage !== true &&
            m.text &&
            m.text.trim().length > 0);

        console.log(`[TOC Store] Merging C3: ${visibleUserMessages.length} user + ${assistantMessages.length} assistant (from ${c3Messages.length} total)`);

        // Upgrade user messages into existing records: exact UUID → legacy prompt-bar
        // stub → TEXT PREFIX.
        //
        // The text stage is essential on the new UI: C6 can key a message under a
        // different id than the API does (units carrying several ids, attachments),
        // and without it the merge ADDS a duplicate row while leaving the mounted
        // record without an apiIndex — which silently kills the ratio/direction
        // signal of the Navigator (live diagnostics: window=[?,?] target=142).
        visibleUserMessages.forEach((c3Msg, idx) => {
            const apiIndex = (c3Msg.apiIndex !== undefined) ? c3Msg.apiIndex : null;
            // 1. Exact UUID match — C6 keys most new-UI records by the API's own id.
            if (c3Msg.id && this.messages.has(c3Msg.id)) {
                this.update(c3Msg.id, {
                    text: c3Msg.text,
                    isTruncated: false,
                    apiIndex,
                    source: 'c3',
                });
                return;
            }
            // 2. Legacy prompt-bar stub for this index.
            const stubId = this.promptBarIndexMap.get(idx);
            const stub = stubId ? this.messages.get(stubId) : null;
            if (stub) {
                // Validate by text prefix (first 30 chars)
                const stubPrefix = (stub.text || '').slice(0, 30).toLowerCase();
                const c3Prefix = (c3Msg.text || '').slice(0, 30).toLowerCase();
                const isMatch = stubPrefix && c3Prefix && stubPrefix === c3Prefix;
                if (!isMatch && stub.text && c3Msg.text) {
                    console.warn(`[TOC Store] C1/C3 mismatch at index ${idx}: stub="${stubPrefix}" vs c3="${c3Prefix}"`);
                }
                // Upgrade stub with full data
                this.update(stubId, {
                    text: c3Msg.text,
                    isTruncated: false,
                    id: c3Msg.id || stubId, // prefer C3 stable UUID
                    messageId: c3Msg.messageId || c3Msg.id,
                    turnId: c3Msg.turnId || stub.turnId,
                    createTime: c3Msg.createTime,
                    apiIndex,
                    source: 'c3',
                });
                // If id changed, update maps
                if (c3Msg.id && c3Msg.id !== stubId) {
                    this._migrateId(stubId, c3Msg.id);
                    this.promptBarIndexMap.set(idx, c3Msg.id);
                }
                return;
            }
            // 3. Text-prefix match against a C6-accumulated record.
            const c3Prefix = (c3Msg.text || '').slice(0, 30).toLowerCase();
            let matched = null;
            if (c3Prefix && c3Prefix.length > 10) {
                for (const m of this.getAll()) {
                    if (m.role !== 'user') continue;
                    if (m.id.startsWith('c3-')) continue; // already a C3 record
                    const existingPrefix = (m.text || '').slice(0, 30).toLowerCase();
                    if (!existingPrefix || existingPrefix.length <= 10) continue;
                    if (existingPrefix === c3Prefix) {
                        matched = m;
                        break;
                    }
                    // Attachment/streaming case: C6 holds a shorter prefix.
                    if (!m.text.startsWith('[Attachment') &&
                        c3Msg.text.startsWith(m.text) && m.text.length > 10) {
                        matched = m;
                        break;
                    }
                }
            }
            if (matched) {
                const oldId = matched.id;
                this.update(oldId, {
                    text: c3Msg.text,
                    isTruncated: false,
                    messageId: c3Msg.messageId || c3Msg.id,
                    turnId: c3Msg.turnId || matched.turnId,
                    createTime: c3Msg.createTime,
                    apiIndex,
                    source: 'c3',
                });
                if (c3Msg.id && c3Msg.id !== oldId) this._migrateId(oldId, c3Msg.id);
                return;
            }
            // 4. Genuinely new message.
            this.add({
                id: c3Msg.id || `c3-user-${idx}`,
                role: 'user',
                text: c3Msg.text,
                isTruncated: false,
                promptBarIndex: idx,
                turnId: c3Msg.turnId,
                messageId: c3Msg.messageId || c3Msg.id,
                apiIndex,
                createTime: c3Msg.createTime,
                source: 'c3',
            });
        });

        // Add assistant messages: match by stable UUID first; otherwise match a
        // C6-accumulated entry for the same turn by text prefix (C6 may hold it
        // under a turn-based id while streaming) and upgrade it in place.
        // This avoids duplicates when C1, C6, and C3 saw the same message.
        // C6 geometry (offsetTop/turnNumber) is preserved — the API has none.
        assistantMessages.forEach((aMsg, idx) => {
            const targetId = aMsg.id || `c3-assistant-${idx}`;
            const apiIndex = (aMsg.apiIndex !== undefined) ? aMsg.apiIndex : null;
            if (this.messages.has(targetId)) {
                this.update(targetId, { text: aMsg.text, isTruncated: false, apiIndex, source: 'c3' });
                return;
            }
            const c3Prefix = (aMsg.text || '').slice(0, 30).toLowerCase();
            let matched = null;
            if (c3Prefix && c3Prefix.length > 10) {
                for (const m of this.getAll()) {
                    if (m.role !== 'assistant') continue;
                    if (m.id.startsWith('c3-')) continue; // already a C3 record
                    const existingPrefix = (m.text || '').slice(0, 30).toLowerCase();
                    if (!existingPrefix || existingPrefix.length <= 10) continue;
                    if (existingPrefix === c3Prefix) {
                        matched = m;
                        break;
                    }
                    // Streaming case: C6 holds a shorter prefix of the full C3 text.
                    // Guarded by length + attachment exclusion to avoid false merges.
                    if (!m.text.startsWith('[Attachment') &&
                        aMsg.text.startsWith(m.text) && m.text.length > 10) {
                        matched = m;
                        break;
                    }
                }
            }
            if (matched) {
                const oldId = matched.id;
                this.update(oldId, {
                    text: aMsg.text,
                    isTruncated: false,
                    messageId: aMsg.messageId || aMsg.id,
                    apiIndex,
                    createTime: aMsg.createTime,
                    source: 'c3',
                });
                if (targetId !== oldId && aMsg.id) {
                    const updated = this.messages.get(oldId);
                    if (updated) {
                        this.messages.delete(oldId);
                        this.messages.set(targetId, { ...updated, id: targetId });
                        this.order = this.order.map(id => id === oldId ? targetId : id);
                        this.uuidSet.delete(oldId);
                        this.uuidSet.add(targetId);
                    }
                }
            } else if (!this.messages.has(targetId)) {
                this.add({
                    id: targetId,
                    role: 'assistant',
                    text: aMsg.text,
                    isTruncated: false,
                    promptBarIndex: null,
                    turnId: aMsg.turnId,
                    messageId: aMsg.messageId || aMsg.id,
                    apiIndex,
                    source: 'c3',
                });
            } else {
                this.update(targetId, { text: aMsg.text, isTruncated: false, apiIndex, source: 'c3' });
            }
        });

        // Re-sort by createTime or promptBarIndex
        this.sort();
    }

    sort() {
        this.order.sort((a, b) => {
            const ma = this.messages.get(a);
            const mb = this.messages.get(b);
            if (!ma || !mb) return 0;

            // 0. NEW UI: exact API branch position (C3-merged records). This is the
            // authoritative conversation order — prefer it over every heuristic.
            if (ma.apiIndex !== null && ma.apiIndex !== undefined && mb.apiIndex !== null && mb.apiIndex !== undefined) {
                return ma.apiIndex - mb.apiIndex;
            }

            // 1. Sort by turnNumber if both have it (turn 1, 2, 3...)
            if (ma.turnNumber !== null && ma.turnNumber !== undefined && mb.turnNumber !== null && mb.turnNumber !== undefined) {
                return ma.turnNumber - mb.turnNumber;
            }

            // 2. Sort by createTime if both have it
            if (ma.createTime && mb.createTime) {
                return ma.createTime - mb.createTime;
            }

            // 3. If both are user messages with promptBarIndex
            const aHasIdx = ma.promptBarIndex !== null && ma.promptBarIndex !== undefined;
            const bHasIdx = mb.promptBarIndex !== null && mb.promptBarIndex !== undefined;
            if (aHasIdx && bHasIdx) {
                return ma.promptBarIndex - mb.promptBarIndex;
            }

            // 4. Sort by offsetTop if available
            if (ma.offsetTop !== null && ma.offsetTop !== undefined && mb.offsetTop !== null && mb.offsetTop !== undefined) {
                return ma.offsetTop - mb.offsetTop;
            }

            if (aHasIdx && !bHasIdx && mb.role !== 'assistant') return -1;
            if (!aHasIdx && bHasIdx && ma.role !== 'assistant') return 1;

            return 0;
        });
    }

    getAll() {
        return this.order.map(id => this.messages.get(id)).filter(Boolean);
    }

    getUserMessages() {
        return this.getAll().filter(m => m.role === 'user');
    }

    getAssistantMessages() {
        return this.getAll().filter(m => m.role === 'assistant');
    }

    getById(id) {
        return this.messages.get(id) || null;
    }

    getByPromptBarIndex(idx) {
        const id = this.promptBarIndexMap.get(idx);
        return id ? this.messages.get(id) : null;
    }

    has(id) {
        return this.messages.has(id);
    }

    size() {
        return this.messages.size;
    }

    getUuidSet() {
        return new Set(this.uuidSet);
    }

    hasChanged(newUuidSet) {
        if (newUuidSet.size !== this.uuidSet.size) return true;
        for (const id of newUuidSet) {
            if (!this.uuidSet.has(id)) return true;
        }
        return false;
    }

    reset() {
        this.messages.clear();
        this.order = [];
        this.uuidSet.clear();
        this.chainIndexById = null;
        this.promptBarIndexMap.clear();
        this.apiTotal = null;
        this.isFullyScanned = false;
        console.log(`[TOC Store] Reset for ${this.conversationId}`);
    }

    /**
     * Serialize an allowlisted JSON-safe snapshot for persistent cache.
     * Never includes DOM references. offsetTop is a navigation hint only.
     */
    serialize() {
        const messages = this.getAll().map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            isTruncated: !!m.isTruncated,
            promptBarIndex: (m.promptBarIndex !== undefined && m.promptBarIndex !== null) ? m.promptBarIndex : null,
            apiIndex: (m.apiIndex !== undefined && m.apiIndex !== null) ? m.apiIndex : null,
            turnId: m.turnId || null,
            messageId: m.messageId || null,
            turnNumber: (m.turnNumber !== undefined && m.turnNumber !== null) ? m.turnNumber : null,
            answerText: m.answerText || '',
            createTime: m.createTime || null,
            offsetTop: (m.offsetTop !== undefined && m.offsetTop !== null) ? m.offsetTop : null,
            source: m.source || 'c6',
        }));
        return {
            schemaVersion: 2, // v1.9.2: v1 records could hold duplicate message pairs
            convId: this.conversationId,
            apiTotal: (typeof this.apiTotal === 'number') ? this.apiTotal : null,
            isFullyScanned: !!this.isFullyScanned,
            userTurnCount: this.getUserMessages().length,
            messages,
            savedAt: Date.now(),
        };
    }

    static validateCachedMessage(m) {
        if (!m || typeof m.id !== 'string' || m.id.length === 0) return false;
        if (m.role !== 'user' && m.role !== 'assistant') return false;
        if (typeof m.text !== 'string') return false;
        return true;
    }

    /**
     * Hydrate from a cached snapshot. Clears current data, validates records,
     * rebuilds messages/order/uuidSet/promptBarIndexMap, then sorts.
     * Returns number of restored messages (0 on invalid input).
     */
    hydrate(cachedData) {
        if (!cachedData || cachedData.schemaVersion !== 2 || !Array.isArray(cachedData.messages)) return 0;
        this.messages.clear();
        this.order = [];
        this.uuidSet.clear();
        this.promptBarIndexMap.clear();
        if (cachedData.convId) this.conversationId = cachedData.convId;
        this.apiTotal = (typeof cachedData.apiTotal === 'number') ? cachedData.apiTotal : null;
        this.isFullyScanned = !!cachedData.isFullyScanned;
        let restored = 0;
        for (const raw of cachedData.messages) {
            if (!window.TOC.MessageStore.validateCachedMessage(raw)) continue;
            const normalized = {
                id: raw.id,
                role: raw.role,
                text: raw.text || '',
                isTruncated: !!raw.isTruncated,
                promptBarIndex: (raw.promptBarIndex !== undefined && raw.promptBarIndex !== null) ? raw.promptBarIndex : null,
                apiIndex: (raw.apiIndex !== undefined && raw.apiIndex !== null) ? raw.apiIndex : null,
                turnId: raw.turnId || null,
                messageId: raw.messageId || null,
                turnNumber: (raw.turnNumber !== undefined && raw.turnNumber !== null) ? raw.turnNumber : null,
                answerText: raw.answerText || '',
                createTime: raw.createTime || null,
                offsetTop: (raw.offsetTop !== undefined && raw.offsetTop !== null) ? raw.offsetTop : null,
                source: raw.source || 'cache',
            };
            this.messages.set(normalized.id, normalized);
            this.order.push(normalized.id);
            this.uuidSet.add(normalized.id);
            if (normalized.promptBarIndex !== null) {
                this.promptBarIndexMap.set(normalized.promptBarIndex, normalized.id);
            }
            restored++;
        }
        this.sort();
        return restored;
    }

    /**
     * Authoritative replacement for complete snapshots (used by C7 after
     * pruning stale placeholders). Resets the store, loads the full message
     * list, rebuilds all indexes, sorts.
     * C3 instead uses mergeC3Data (upgrade-in-place) to preserve C1 order
     * and C6 geometry.
     */
    replaceAll(messages, isFullyScanned) {
        this.messages.clear();
        this.order = [];
        this.uuidSet.clear();
        this.promptBarIndexMap.clear();
        if (isFullyScanned !== undefined) this.isFullyScanned = !!isFullyScanned;
        if (!Array.isArray(messages)) {
            this.sort();
            return 0;
        }
        let added = 0;
        for (const raw of messages) {
            const id = raw && (raw.id || raw.messageId);
            if (!id) continue;
            const role = raw.role === 'assistant' ? 'assistant' : 'user';
            const text = typeof raw.text === 'string' ? raw.text : '';
            if (!text) continue;
            const normalized = {
                id,
                role,
                text,
                isTruncated: !!raw.isTruncated,
                apiIndex: (raw.apiIndex !== undefined && raw.apiIndex !== null) ? raw.apiIndex : null,
                promptBarIndex: (raw.promptBarIndex !== undefined && raw.promptBarIndex !== null) ? raw.promptBarIndex : null,
                turnId: raw.turnId || null,
                messageId: raw.messageId || id,
                turnNumber: (raw.turnNumber !== undefined && raw.turnNumber !== null) ? raw.turnNumber : null,
                answerText: raw.answerText || '',
                createTime: raw.createTime || null,
                offsetTop: (raw.offsetTop !== undefined && raw.offsetTop !== null) ? raw.offsetTop : null,
                source: raw.source || 'c3',
            };
            this.messages.set(normalized.id, normalized);
            this.order.push(normalized.id);
            this.uuidSet.add(normalized.id);
            if (normalized.promptBarIndex !== null) {
                this.promptBarIndexMap.set(normalized.promptBarIndex, normalized.id);
            }
            added++;
        }
        this.sort();
        return added;
    }

    // For backward compat with ui.js — convert to {text, element, answer, answerElement} shape
    // But we never store element (Trap 15) — caller must query DOM at nav time
    toLegacyQueries() {
        return this.getUserMessages().map((msg, idx) => {
            // Find corresponding assistant message (next in order)
            const all = this.getAll();
            const msgIdx = all.findIndex(m => m.id === msg.id);
            let answer = '';
            let answerId = null;
            if (msgIdx >= 0 && msgIdx + 1 < all.length) {
                const next = all[msgIdx + 1];
                if (next.role === 'assistant') {
                    answer = next.text;
                    answerId = next.id;
                }
            }
            // Also check stored answerText
            if (!answer && msg.answerText) answer = msg.answerText;

            // Derive a usable bar index for records scanned before promptBarIndex
            // was persisted (null) or hydrated from older caches.
            let barIdx = msg.promptBarIndex;
            if ((barIdx === null || barIdx === undefined) && msg.turnNumber !== null && msg.turnNumber !== undefined && msg.turnNumber % 2 === 1) {
                barIdx = (msg.turnNumber - 1) / 2;
            }
            if (barIdx === null || barIdx === undefined) {
                barIdx = idx;
            }

            return {
                text: msg.text,
                element: null, // Never store element — query at nav time via [data-message-id] or [data-turn-id]
                answer: answer,
                answerElement: null, // Never store element
                id: msg.id,
                turnId: msg.turnId,
                messageId: msg.messageId,
                promptBarIndex: barIdx,
                isTruncated: msg.isTruncated,
                _storeId: msg.id,
                _answerId: answerId,
            };
        });
    }
};

// Singleton per conversation + persistent cache (StorageManager)
window.TOC.StoreManager = (function () {
    let currentStore = null;
    let currentConvId = null;

    const PREFIX = (window.TOC && window.TOC.CACHE_PREFIX) || 'toc_chat_';
    const INDEX_KEY = (window.TOC && window.TOC.CACHE_INDEX_KEY) || 'toc_chat_index';
    const CLEARED_KEY = (window.TOC && window.TOC.CACHE_CLEARED_AT_KEY) || 'toc_cache_last_cleared_at';
    const MAX_CHATS = (window.TOC && window.TOC.CACHE_MAX_CHATS) || 50;
    const SAVE_DEBOUNCE_MS = 1000;

    let cachedCacheEnabled = true;
    let sessionValidator = null;
    let pendingSave = null; // { timer, convId, snapshot, session, isFullyScanned, requestTime }

    function safeStorage() {
        return (window.TOC && window.TOC.safeStorage) || null;
    }

    async function isCacheEnabled() {
        try {
            const adapter = safeStorage();
            if (!adapter) return cachedCacheEnabled;
            const items = await adapter.get({ cacheEnabled: true });
            if (items && typeof items.cacheEnabled === 'boolean') {
                cachedCacheEnabled = items.cacheEnabled;
            }
        } catch (e) { /* default true */ }
        return cachedCacheEnabled;
    }

    function isCacheableConversation(convId) {
        try {
            if (!convId) return false;
            // Persistent caching is ChatGPT-only for v1 (/c/<id> and /share/<id>)
            const host = (location && location.host) || '';
            if (host.indexOf('chatgpt.com') === -1) return false;
            const url = (location && location.href) || '';
            if (url.indexOf('/c/') === -1 && url.indexOf('/share/') === -1) return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function recordKey(convId) {
        return PREFIX + convId;
    }

    function toSnapshot(storeOrSnapshot, isFullyScanned) {
        try {
            let snap = null;
            if (storeOrSnapshot && typeof storeOrSnapshot.serialize === 'function') {
                snap = storeOrSnapshot.serialize();
            } else {
                snap = storeOrSnapshot;
            }
            if (!snap || !Array.isArray(snap.messages)) return null;
            const messages = [];
            for (const m of snap.messages) {
                if (!window.TOC.MessageStore.validateCachedMessage(m)) continue;
                messages.push({
                    id: m.id,
                    role: m.role,
                    text: m.text || '',
                    isTruncated: !!m.isTruncated,
                    apiIndex: (m.apiIndex !== undefined && m.apiIndex !== null) ? m.apiIndex : null,
                    promptBarIndex: (m.promptBarIndex !== undefined && m.promptBarIndex !== null) ? m.promptBarIndex : null,
                    turnId: m.turnId || null,
                    messageId: m.messageId || null,
                    turnNumber: (m.turnNumber !== undefined && m.turnNumber !== null) ? m.turnNumber : null,
                    answerText: m.answerText || '',
                    createTime: m.createTime || null,
                    offsetTop: (m.offsetTop !== undefined && m.offsetTop !== null) ? m.offsetTop : null,
                    source: m.source || 'c6',
                });
            }
            // JSON-safe deep copy so later store mutations can't affect a queued save
            const safeMessages = JSON.parse(JSON.stringify(messages));
            return {
                schemaVersion: 2,
                convId: snap.convId || (storeOrSnapshot && storeOrSnapshot.conversationId) || null,
                apiTotal: (typeof snap.apiTotal === 'number') ? snap.apiTotal : null,
                isFullyScanned: !!(isFullyScanned !== undefined ? isFullyScanned : snap.isFullyScanned),
                userTurnCount: safeMessages.filter((m) => m.role === 'user').length,
                messages: safeMessages,
                savedAt: Date.now(),
            };
        } catch (e) {
            return null;
        }
    }

    function isSessionCurrent(session) {
        try {
            if (typeof sessionValidator === 'function') {
                return !!sessionValidator(session);
            }
            if (!session) return true;
            const currentId = window.TOC.ConversationIdentity.getCurrentId() || location.href;
            return session.convId === currentId;
        } catch (e) {
            return false;
        }
    }

    function getStore() {
        const convId = window.TOC.ConversationIdentity.getCurrentId() || location.href;
        if (!currentStore || currentConvId !== convId) {
            if (currentStore) currentStore.reset();
            currentStore = new window.TOC.MessageStore(convId);
            currentConvId = convId;
            console.log(`[TOC StoreManager] New store for ${convId}`);
        }
        return currentStore;
    }

    function resetStore() {
        if (currentStore) currentStore.reset();
        currentStore = null;
        currentConvId = null;
    }

    async function load(convId, session) {
        try {
            if (!convId) return null;
            if (session && session.convId && session.convId !== convId) return null;
            if (!(await isCacheEnabled())) return null;
            if (!isCacheableConversation(convId)) return null;
            const adapter = safeStorage();
            if (!adapter) return null;
            const items = await adapter.get([recordKey(convId), INDEX_KEY]);
            const record = items && items[recordKey(convId)];
            if (!record || record.schemaVersion !== 2) return null;
            if (record.convId !== convId) return null;
            if (!Array.isArray(record.messages)) return null;
            // Touch LRU on valid hit (fire-and-forget ordering: await to keep index consistent)
            try {
                const index = (items && items[INDEX_KEY]) || {};
                index[convId] = Date.now();
                await adapter.set({ [INDEX_KEY]: index });
            } catch (e) { /* non-fatal */ }
            return record;
        } catch (e) {
            return null;
        }
    }

    async function save(convId, storeOrSnapshot, isFullyScanned, session) {
        const saveStart = Date.now();
        try {
            if (!convId) return { skipped: 'no-conv' };
            if (session && session.convId && session.convId !== convId) return { skipped: 'stale-session' };
            if (!(await isCacheEnabled())) return { skipped: 'disabled' };
            if (!isCacheableConversation(convId)) return { skipped: 'not-cacheable' };
            const adapter = safeStorage();
            if (!adapter) return { skipped: 'no-storage' };
            const full = !!isFullyScanned;
            const snapshot = toSnapshot(storeOrSnapshot, full);
            if (!snapshot || !snapshot.convId || snapshot.convId !== convId) {
                return { skipped: 'bad-snapshot' };
            }
            if (snapshot.messages.length === 0) return { skipped: 'empty' };
            // A clear issued after this save started wins — never resurrect deleted records
            try {
                const clearedItems = await adapter.get([CLEARED_KEY]);
                const clearedAt = clearedItems && clearedItems[CLEARED_KEY];
                if (clearedAt && saveStart < clearedAt) return { skipped: 'cleared' };
            } catch (e) { /* proceed */ }
            // Provisional saves must never downgrade an existing full snapshot,
            // but new live data (new prompts, longer text) is merged into the
            // full snapshot so it persists instead of disappearing on reload.
            try {
                const existing = await adapter.get([recordKey(convId)]);
                const rec = existing && existing[recordKey(convId)];
                if (!full && rec && rec.isFullyScanned) {
                    const merged = mergeIntoFull(rec, snapshot);
                    if (merged) {
                        // Stale-generation check immediately before writing
                        if (session && !isSessionCurrent(session)) return { skipped: 'stale-generation' };
                        const record = {
                            schemaVersion: 2,
                            convId,
                            isFullyScanned: true,
                            // Keep the branch length: without it a reload loses the
                            // Navigator's ratio-jump denominator (invariant #10).
                            apiTotal: (typeof snapshot.apiTotal === 'number') ? snapshot.apiTotal
                                : (typeof rec.apiTotal === 'number' ? rec.apiTotal : null),
                            userTurnCount: merged.filter((m) => m.role === 'user').length,
                            messages: merged,
                            savedAt: Date.now(),
                        };
                        await adapter.set({ [recordKey(convId)]: record });
                        await touchLru(adapter, convId);
                        return { saved: true, full: true, merged: true };
                    }
                    await touchLru(adapter, convId);
                    return { skipped: 'full-preserved' };
                }
            } catch (e) {
                if (e && e.message === 'toc-stale-generation') return { skipped: 'stale-generation' };
                /* proceed to write */
            }
            const record = {
                schemaVersion: 2,
                convId,
                isFullyScanned: full,
                // Persist the API branch length so a reload keeps exact ratio jumps.
                apiTotal: (typeof snapshot.apiTotal === 'number') ? snapshot.apiTotal : null,
                userTurnCount: snapshot.userTurnCount,
                messages: snapshot.messages,
                savedAt: Date.now(),
            };
            // Stale-generation check immediately before writing (C3/C7 must not
            // persist Chat A after navigating to Chat B)
            if (session && !isSessionCurrent(session)) return { skipped: 'stale-generation' };
            await adapter.set({ [recordKey(convId)]: record });
            // Update LRU + evict over MAX_CHATS
            try {
                const idxItems = await adapter.get(INDEX_KEY);
                const index = (idxItems && idxItems[INDEX_KEY]) || {};
                index[convId] = Date.now();
                const entries = Object.entries(index).sort((a, b) => a[1] - b[1]);
                if (entries.length > MAX_CHATS) {
                    const evict = entries.slice(0, entries.length - MAX_CHATS);
                    const evictKeys = evict.map(([id]) => recordKey(id));
                    for (const [id] of evict) delete index[id];
                    if (evictKeys.length > 0) await adapter.remove(evictKeys);
                }
                await adapter.set({ [INDEX_KEY]: index });
            } catch (e) { /* non-fatal */ }
            return { saved: true, full };
        } catch (e) {
            return { skipped: 'error' };
        }
    }

    // Merge provisional live data into an existing full snapshot without
    // downgrading it. Returns the merged message array, or null when the
    // incoming snapshot adds nothing (pure duplicate → skip the write).
    // Never deletes: removals are left for full C3/C7 refreshes.
    function mergeIntoFull(existingRec, incomingSnap) {
        try {
            const existing = Array.isArray(existingRec.messages) ? existingRec.messages : [];
            const incoming = Array.isArray(incomingSnap.messages) ? incomingSnap.messages : [];
            if (incoming.length === 0) return null;
            const working = existing.map((m) => ({ ...m }));
            const byId = new Map(working.map((m) => [m.id, m]));
            const byIdx = new Map();
            for (const m of working) {
                if (m.promptBarIndex !== null && m.promptBarIndex !== undefined && !byIdx.has(m.promptBarIndex)) {
                    byIdx.set(m.promptBarIndex, m);
                }
            }
            let changed = false;
            for (const inc of incoming) {
                if (!inc || !inc.id) continue;
                const cur = byId.get(inc.id);
                if (cur) {
                    // Carry the exact API position independently of the text upgrade:
                    // positions are learned AFTER the text (C3 runs behind C6), so the
                    // text-length condition below would otherwise drop them on save.
                    if (inc.apiIndex !== null && inc.apiIndex !== undefined && cur.apiIndex !== inc.apiIndex) {
                        cur.apiIndex = inc.apiIndex;
                        changed = true;
                    }
                    const curLen = (cur.text || '').length;
                    const incLen = (inc.text || '').length;
                    if (incLen > curLen || (cur.isTruncated && !inc.isTruncated && incLen >= curLen)) {
                        cur.text = inc.text;
                        cur.isTruncated = !!inc.isTruncated;
                        if (inc.offsetTop !== null && inc.offsetTop !== undefined) cur.offsetTop = inc.offsetTop;
                        if (inc.turnNumber !== null && inc.turnNumber !== undefined) cur.turnNumber = inc.turnNumber;
                        if (inc.turnId) cur.turnId = inc.turnId;
                        if (inc.messageId) cur.messageId = inc.messageId;
                        if (inc.source) cur.source = inc.source;
                        if (inc.answerText) cur.answerText = inc.answerText;
                        if (inc.createTime) cur.createTime = inc.createTime;
                        changed = true;
                    }
                    continue;
                }
                // Placeholder upgrade: same promptBarIndex, old c1-* id → new uuid
                if (inc.promptBarIndex !== null && inc.promptBarIndex !== undefined) {
                    const slot = byIdx.get(inc.promptBarIndex);
                    if (slot && slot.id !== inc.id) {
                        const slotIsPlaceholder = typeof slot.text === 'string' && slot.text.indexOf('Prompt ') === 0;
                        const sameText = (slot.text || '').slice(0, 30).toLowerCase() === (inc.text || '').slice(0, 30).toLowerCase();
                        if (slotIsPlaceholder || sameText) {
                            const at = working.findIndex((m) => m.id === slot.id);
                            if (at >= 0) working[at] = { ...inc };
                            byId.delete(slot.id);
                            byId.set(inc.id, working[at >= 0 ? at : working.length - 1]);
                            byIdx.set(inc.promptBarIndex, working[at >= 0 ? at : working.length - 1]);
                            changed = true;
                            continue;
                        }
                    }
                }
                working.push({ ...inc });
                byId.set(inc.id, working[working.length - 1]);
                if (inc.promptBarIndex !== null && inc.promptBarIndex !== undefined && !byIdx.has(inc.promptBarIndex)) {
                    byIdx.set(inc.promptBarIndex, working[working.length - 1]);
                }
                changed = true;
            }
            return changed ? working : null;
        } catch (e) {
            return null;
        }
    }

    async function touchLru(adapter, convId) {
        try {
            const idxItems = await adapter.get(INDEX_KEY);
            const index = (idxItems && idxItems[INDEX_KEY]) || {};
            index[convId] = Date.now();
            await adapter.set({ [INDEX_KEY]: index });
        } catch (e) { /* ignore */ }
    }

    function debouncedSave(convId, storeOrSnapshot, session, isFullyScanned) {
        try {
            const full = !!isFullyScanned;
            const snapshot = toSnapshot(storeOrSnapshot, full);
            if (!snapshot) return;
            // Capture immutable snapshot + request time now; never hold a live store
            const requestTime = Date.now();
            if (pendingSave && pendingSave.timer) {
                clearTimeout(pendingSave.timer);
                pendingSave = null;
            }
            const capturedSession = session ? { convId: session.convId, navGen: session.navGen } : null;
            pendingSave = {
                timer: setTimeout(async () => {
                    pendingSave = null;
                    try {
                        if (capturedSession && !isSessionCurrent(capturedSession)) return;
                        // A clear that happened after this save was requested wins
                        try {
                            const adapter = safeStorage();
                            if (adapter) {
                                const items = await adapter.get(CLEARED_KEY);
                                const clearedAt = items && items[CLEARED_KEY];
                                if (clearedAt && requestTime < clearedAt) return;
                            }
                        } catch (e) { /* proceed */ }
                        await save(convId, snapshot, full, capturedSession);
                    } catch (e) { /* never break TOC */ }
                }, SAVE_DEBOUNCE_MS),
                convId,
                snapshot,
                session: capturedSession,
                isFullyScanned: full,
                requestTime,
            };
        } catch (e) { /* ignore */ }
    }

    function cancelPendingSave() {
        try {
            if (pendingSave && pendingSave.timer) {
                clearTimeout(pendingSave.timer);
            }
        } catch (e) { /* ignore */ }
        pendingSave = null;
    }

    async function clearAll() {
        cancelPendingSave();
        try {
            if (window.TOC && typeof window.TOC.clearTOCCache === 'function') {
                return await window.TOC.clearTOCCache();
            }
        } catch (e) { /* fallback below */ }
        try {
            const adapter = safeStorage();
            if (!adapter) return 0;
            const all = await adapter.getAll();
            const keys = Object.keys(all || {}).filter((k) => k.indexOf(PREFIX) === 0 && k !== INDEX_KEY);
            if (keys.length > 0) await adapter.remove(keys);
            await adapter.set({ [INDEX_KEY]: {} });
            await adapter.set({ [CLEARED_KEY]: Date.now() });
            return keys.length;
        } catch (e) {
            return 0;
        }
    }

    async function getStats() {
        try {
            const adapter = safeStorage();
            if (!adapter) return { count: 0, approxSize: 0 };
            const all = await adapter.getAll();
            const keys = Object.keys(all || {}).filter((k) => k.indexOf(PREFIX) === 0 && k !== INDEX_KEY);
            let approxSize = 0;
            for (const k of keys) {
                try {
                    approxSize += JSON.stringify(all[k]).length;
                } catch (e) { /* ignore */ }
            }
            return { count: keys.length, approxSize };
        } catch (e) {
            return { count: 0, approxSize: 0 };
        }
    }

    function setSessionValidator(fn) {
        sessionValidator = (typeof fn === 'function') ? fn : null;
    }

    // Listen for URL changes to cancel pending saves + reset store (Trap 6, 16)
    window.TOC.ConversationIdentity.onUrlChange((newId) => {
        if (newId !== currentConvId) {
            cancelPendingSave();
            resetStore();
        }
    });

    // Keep cacheEnabled default in sync with storage changes
    try {
        const rt = (typeof browser !== 'undefined' && browser && browser.storage) ? browser.storage
            : (typeof chrome !== 'undefined' && chrome && chrome.storage) ? chrome.storage : null;
        if (rt && rt.onChanged && typeof rt.onChanged.addListener === 'function') {
            rt.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes && changes.cacheEnabled && changes.cacheEnabled.newValue !== undefined) {
                    cachedCacheEnabled = !!changes.cacheEnabled.newValue;
                    if (!cachedCacheEnabled) cancelPendingSave();
                }
            });
        }
    } catch (e) { /* ignore */ }

    return {
        getStore, resetStore,
        load, save, debouncedSave, cancelPendingSave, clearAll, getStats,
        isCacheEnabled, isCacheableConversation, setSessionValidator,
    };
})();

// NEW.md spec name compatibility: StorageManager (with "age") is an alias of
// the StoreManager singleton above (without "age"), which holds both the
// in-memory store and the persistent-cache methods.
window.TOC.StorageManager = window.TOC.StoreManager;

console.log('[TOC] store.js loaded');
