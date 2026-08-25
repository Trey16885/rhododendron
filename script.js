(function () {
    "use strict";

    // We use an array of endpoints and a dynamic active URL variable.
    const OLLAMA_ENDPOINTS = [
        "https://ollama-tunnel.serveousercontent.com",
        "http://localhost:11434"
    ];
    let OLLAMA_URL = null; // Will be set to the working endpoint dynamically

    const DB_NAME = "RhododendronDB";
    const DB_VERSION = 1;
    const EXPORT_FILENAME = "rhododendron_export.json";
    const MAX_CONTEXT_MESSAGES = 60;
    const STREAM_PAINT_MS = 60;
    const TAGS_TIMEOUT_MS = 5000;

    const els = {};
    const state = {
        db: null,
        currentChatId: null,
        activeGemId: null,
        activeGemPrompt: "",
        sending: false,
        controller: null
    };
    const verifiedModels = new Set();

    const dbReady = new Promise((resolve, reject) => {
        let request;
        try {
            request = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (err) {
            reject(err);
            return;
        }
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("chats")) db.createObjectStore("chats", { keyPath: "id" });
            if (!db.objectStoreNames.contains("gems")) db.createObjectStore("gems", { keyPath: "id" });
        };
        request.onsuccess = (e) => {
            state.db = e.target.result;
            resolve(state.db);
        };
        request.onerror = () => reject(request.error || new Error("IndexedDB unavailable"));
        request.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
    });

    async function idbRequest(storeName, mode, run) {
        await dbReady;
        return new Promise((resolve, reject) => {
            let tx;
            try {
                tx = state.db.transaction(storeName, mode);
            } catch (err) { reject(err); return; }
            const req = run(tx.objectStore(storeName));
            tx.onabort = tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
            if (req) {
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            } else {
                tx.oncomplete = () => resolve();
            }
        });
    }

    const idbGet = (store, key) => idbRequest(store, "readonly", (s) => s.get(key));
    const idbGetAll = (store) => idbRequest(store, "readonly", (s) => s.getAll());
    const idbPut = (store, value) => idbRequest(store, "readwrite", (s) => s.put(value));

    async function idbPutMany(entries) {
        await dbReady;
        return new Promise((resolve, reject) => {
            const tx = state.db.transaction(["chats", "gems"], "readwrite");
            const chats = tx.objectStore("chats");
            const gems = tx.objectStore("gems");
            entries.chats.forEach((c) => chats.put(c));
            entries.gems.forEach((g) => gems.put(g));
            tx.oncomplete = () => resolve();
            tx.onabort = tx.onerror = () => reject(tx.error || new Error("Import failed"));
        });
    }

    function generateId() {
        if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    function makeTitle(text) {
        const clean = text.replace(/\s+/g, " ").trim();
        return clean.length > 25 ? clean.slice(0, 25) + "…" : clean;
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
        ));
    }

    function readSetting(key, fallback) {
        try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
        catch (err) { return fallback; }
    }

    function writeSetting(key, value) {
        try {
            if (value === null || value === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        } catch (err) {}
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    const FORBIDDEN_TAGS = new Set([
        "SCRIPT", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "BASE",
        "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "STYLE", "FOREIGNOBJECT"
    ]);
    const SAFE_URI = /^(?:https?:|mailto:|tel:|#|\/|\.|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i;
    const URI_ATTRS = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"]);

    function sanitizeToFragment(html) {
        const tpl = document.createElement("template");
        tpl.innerHTML = html;
        const doomed = [];
        const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
            const el = walker.currentNode;
            if (FORBIDDEN_TAGS.has(el.tagName.toUpperCase())) { doomed.push(el); continue; }
            for (const attr of Array.from(el.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith("on")) {
                    el.removeAttribute(attr.name);
                } else if (URI_ATTRS.has(name) && !SAFE_URI.test(attr.value.trim())) {
                    el.removeAttribute(attr.name);
                } else if (name === "style" && /expression\s*\(|url\s*\(|@import/i.test(attr.value)) {
                    el.removeAttribute(attr.name);
                }
            }
            if (el.tagName === "A" && el.getAttribute("href")) {
                el.setAttribute("target", "_blank");
                el.setAttribute("rel", "noopener noreferrer");
            }
        }
        doomed.forEach((el) => el.remove());
        return tpl.content;
    }

    function renderMarkdown(text) {
        let html;
        if (window.marked && typeof marked.parse === "function") {
            try {
                html = marked.parse(text, { breaks: true, gfm: true });
            } catch (err) {
                html = "<p>" + escapeHtml(text) + "</p>";
            }
        } else {
            html = "<p>" + escapeHtml(text).replace(/\n/g, "<br>") + "</p>";
        }
        return sanitizeToFragment(html);
    }

    function serializeSvg(svg) {
        const clone = svg.cloneNode(true);
        if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        return new XMLSerializer().serializeToString(clone);
    }

    function makeDownloadButton(svg) {
        const btn = document.createElement("button");
        btn.className = "svg-btn";
        btn.type = "button";
        btn.textContent = "Download SVG";
        btn.addEventListener("click", () => {
            downloadBlob(new Blob([serializeSvg(svg)], { type: "image/svg+xml" }), "rhododendron_image.svg");
        });
        return btn;
    }

    function wrapSvg(svg, insertAfter) {
        const wrap = document.createElement("div");
        wrap.className = "svg-render";
        if (insertAfter) insertAfter.after(wrap);
        else svg.replaceWith(wrap);
        wrap.appendChild(svg);
        wrap.after(makeDownloadButton(svg));
    }

    function enhanceSvgs(container) {
        container.querySelectorAll("svg").forEach((svg) => {
            if (svg.parentElement && svg.parentElement.classList.contains("svg-render")) return;
            if (svg.parentElement && svg.parentElement.closest("svg")) return;
            wrapSvg(svg, null);
        });
        container.querySelectorAll("pre > code").forEach((code) => {
            const src = code.textContent.trim();
            if (!/^<svg[\s>]/i.test(src) || !/<\/svg>$/i.test(src)) return;
            const svg = sanitizeToFragment(src).querySelector("svg");
            if (svg) wrapSvg(svg, code.parentElement);
        });
    }

    function appendBubble(sender) {
        const div = document.createElement("div");
        div.className = "message " + (sender === "user" ? "user-message" : "ai-message");
        els.chatContainer.appendChild(div);
        scrollToBottom();
        return div;
    }

    function fillBubble(div, sender, text, { withSvg = true } = {}) {
        if (sender === "user") {
            div.textContent = text;
            return div;
        }
        div.textContent = "";
        div.appendChild(renderMarkdown(text));
        if (withSvg) enhanceSvgs(div);
        return div;
    }

    function renderMessage(sender, text) {
        return fillBubble(appendBubble(sender), sender, text);
    }

    function scrollToBottom() {
        els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
    }

    function isNearBottom() {
        const c = els.chatContainer;
        return c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    }

    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add("open");
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove("open");
    }

    function closeTopModal() {
        const open = document.querySelectorAll(".modal.open");
        if (open.length) { open[open.length - 1].classList.remove("open"); return true; }
        return false;
    }

    function toggleSidebar(force) {
        const open = force === undefined ? !els.sidebar.classList.contains("open") : force;
        els.sidebar.classList.toggle("open", open);
        els.overlay.classList.toggle("open", open);
        els.menuBtn.setAttribute("aria-expanded", String(open));
    }

    function closeSidebarOnMobile() {
        if (window.innerWidth <= 768) toggleSidebar(false);
    }

    function markActive(listEl, datasetKey, activeValue) {
        for (const btn of listEl.children) {
            btn.classList.toggle("active", (btn.dataset[datasetKey] || null) === activeValue);
        }
    }

    async function loadChatList() {
        const chats = await idbGetAll("chats");
        chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const frag = document.createDocumentFragment();
        chats.forEach((c) => {
            const btn = document.createElement("button");
            btn.className = "sidebar-btn" + (state.currentChatId === c.id ? " active" : "");
            btn.dataset.chatId = c.id;
            btn.textContent = c.title || "Untitled Chat";
            btn.title = c.title || "Untitled Chat";
            frag.appendChild(btn);
        });
        els.chatList.replaceChildren(frag);
    }

    async function loadGemList() {
        const gems = await idbGetAll("gems");
        const frag = document.createDocumentFragment();

        const defaultBtn = document.createElement("button");
        defaultBtn.className = "sidebar-btn" + (state.activeGemId ? "" : " active");
        defaultBtn.textContent = "Default Model";
        frag.appendChild(defaultBtn);

        let activeStillExists = false;
        gems.forEach((g) => {
            const btn = document.createElement("button");
            btn.className = "sidebar-btn" + (state.activeGemId === g.id ? " active" : "");
            btn.dataset.gemId = g.id;
            btn.textContent = "💎 " + g.name;
            btn.title = g.name;
            frag.appendChild(btn);
            if (state.activeGemId === g.id) {
                activeStillExists = true;
                state.activeGemPrompt = g.systemPrompt || "";
            }
        });
        els.gemList.replaceChildren(frag);

        if (state.activeGemId && !activeStillExists) activateGem(null);
        else updateHeaderTitle();
    }

    function loadSidebar() {
        return Promise.all([loadChatList(), loadGemList()]);
    }

    function updateHeaderTitle() {
        els.headerTitle.textContent = state.activeGemId ? "Rhododendron 2.0 (Gem Active)" : "Rhododendron 2.0";
    }

    function activateGem(id) {
        state.activeGemId = id;
        state.activeGemPrompt = "";
        writeSetting("activeGemId", id);
        if (id) {
            idbGet("gems", id)
                .then((gem) => { state.activeGemPrompt = (gem && gem.systemPrompt) || ""; })
                .catch(() => {});
        }
        markActive(els.gemList, "gemId", id);
        updateHeaderTitle();
    }

    async function startNewChat({ silent = false } = {}) {
        const id = generateId();
        await idbPut("chats", { id, title: "New Chat", messages: [], timestamp: Date.now() });
        state.currentChatId = id;
        writeSetting("lastChatId", id);
        if (!silent) {
            els.chatContainer.replaceChildren();
            closeSidebarOnMobile();
        }
        await loadChatList();
        return id;
    }

    async function loadChat(id) {
        const chat = await idbGet("chats", id);
        state.currentChatId = id;
        writeSetting("lastChatId", id);
        const frag = document.createDocumentFragment();
        const svgHosts = [];
        if (chat && Array.isArray(chat.messages)) {
            chat.messages.forEach((m) => {
                const div = document.createElement("div");
                div.className = "message " + (m.sender === "user" ? "user-message" : "ai-message");
                if (m.sender === "user") {
                    div.textContent = m.text;
                } else {
                    div.appendChild(renderMarkdown(m.text || ""));
                    svgHosts.push(div);
                }
                frag.appendChild(div);
            });
        }
        els.chatContainer.replaceChildren(frag);
        svgHosts.forEach(enhanceSvgs);
        scrollToBottom();
        markActive(els.chatList, "chatId", id);
        closeSidebarOnMobile();
    }

    async function saveGem() {
        const name = els.gemName.value.trim();
        const prompt = els.gemPrompt.value.trim();
        if (!name) { els.gemName.focus(); return; }

        try {
            await idbPut("gems", { id: generateId(), name, systemPrompt: prompt });
        } catch (err) {
            alert("Could not save the Gem: " + err.message);
            return;
        }
        closeModal("gem-modal");
        els.gemName.value = "";
        els.gemPrompt.value = "";
        await loadGemList();
    }

    async function exportData() {
        if (typeof JSZip === "undefined") {
            alert("The export library failed to load. Check your internet connection and reload.");
            return;
        }
        try {
            const [chats, gems] = await Promise.all([idbGetAll("chats"), idbGetAll("gems")]);
            const zip = new JSZip();
            zip.file(EXPORT_FILENAME, JSON.stringify({ chats, gems }));
            const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
            downloadBlob(blob, "Rhododendron_Data.zip");
        } catch (err) {
            alert("Export failed: " + err.message);
        }
    }

    async function importData(file) {
        if (typeof JSZip === "undefined") {
            alert("The import library failed to load. Check your internet connection and reload.");
            return;
        }
        try {
            const zip = await JSZip.loadAsync(file);
            const entry = zip.file(EXPORT_FILENAME) || zip.file(/\.json$/i)[0];
            if (!entry) throw new Error("no " + EXPORT_FILENAME + " inside the archive");

            const data = JSON.parse(await entry.async("string"));
            const chats = Array.isArray(data && data.chats) ? data.chats.filter((c) => c && c.id) : [];
            const gems = Array.isArray(data && data.gems) ? data.gems.filter((g) => g && g.id) : [];
            if (!chats.length && !gems.length) throw new Error("the archive contains no chats or gems");

            await idbPutMany({ chats, gems });
            await loadSidebar();
            alert("Imported " + chats.length + " chat(s) and " + gems.length + " gem(s).");
        } catch (err) {
            alert("Import failed: " + err.message);
        }
    }

    // --- Multi-endpoint connection check ---
    async function ensureModelReady(modelName) {
        if (verifiedModels.has(modelName) && OLLAMA_URL) return true;

        let data;
        let successUrl = null;

        // Iterate over endpoints to find one that is alive
        for (const url of OLLAMA_ENDPOINTS) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TAGS_TIMEOUT_MS);
            try {
                const res = await fetch(url + "/api/tags", { signal: controller.signal });
                if (res.ok) {
                    data = await res.json();
                    successUrl = url;
                    clearTimeout(timer);
                    break; // Stop at the first working endpoint
                }
            } catch (err) {
                // Silently fail and try the next endpoint in the list
            } finally {
                clearTimeout(timer);
            }
        }

        if (!successUrl) {
            openModal("cors-modal");
            return false;
        }

        OLLAMA_URL = successUrl;

        const strip = (n) => String(n).replace(/:latest$/, "");
        const models = data && Array.isArray(data.models) ? data.models : [];
        const exists = models.some((m) => m && m.name && strip(m.name) === strip(modelName));
        if (!exists) {
            els.missingModelName.textContent = modelName;
            els.pullCommand.textContent = "ollama pull " + modelName;
            openModal("model-modal");
            return false;
        }
        verifiedModels.add(modelName);
        return true;
    }

    function buildApiMessages(chat) {
        const messages = [];
        if (state.activeGemId && state.activeGemPrompt) {
            messages.push({ role: "system", content: state.activeGemPrompt });
        }
        const history = chat.messages.slice(-MAX_CONTEXT_MESSAGES);
        for (const m of history) {
            messages.push({ role: m.sender === "user" ? "user" : "assistant", content: m.text });
        }
        return messages;
    }

    async function streamChat({ model, messages, signal, onDelta }) {
        const res = await fetch(OLLAMA_URL + "/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages, stream: true }),
            signal
        });

        if (!res.ok) {
            let detail = "";
            try {
                const body = await res.json();
                detail = body && body.error ? ": " + body.error : "";
            } catch (err) {}
            throw new Error("Ollama returned HTTP " + res.status + detail);
        }

        let full = "";
        const consume = (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            let obj;
            try { obj = JSON.parse(trimmed); } catch (err) { return; }
            if (obj.error) throw new Error(obj.error);
            const chunk = obj.message && obj.message.content;
            if (chunk) { full += chunk; onDelta(full); }
        };

        if (res.body && typeof res.body.getReader === "function") {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf("\n")) !== -1) {
                    consume(buffer.slice(0, idx));
                    buffer = buffer.slice(idx + 1);
     