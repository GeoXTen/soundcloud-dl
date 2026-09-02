// Direct SoundCloud downloader - bypasses CrossPilot, no eval needed
(function() {
    console.log("[direct] SoundCloud direct downloader loaded at", location.href);
    const BTN_ID = "sc-direct-download-btn";
    let clientId = null;

    // Extract SoundCloud client_id from page
    function isValidClientId(id) {
        return id && /^[a-zA-Z0-9]{20,64}$/.test(id) && !id.includes("+") && !id.includes(".");
    }
    async function getClientId() {
        if (clientId) return clientId;
        // Try to find in page scripts - look for 32-char hex client_id
        const scripts = Array.from(document.querySelectorAll('script[src*="a-v2.sndcdn.com"]'));
        for (const s of scripts) {
            try {
                const txt = await fetch(s.src).then(r => r.text());
                // Look for 32-char hex id
                const mHex = txt.match(/["']([a-zA-Z0-9]{32})["']/g);
                if (mHex) {
                    for (const cand of mHex) {
                        const id = cand.replace(/["']/g, "");
                        if (isValidClientId(id)) {
                            // Test it quickly
                            try {
                                const test = await fetch(`https://api-v2.soundcloud.com/tracks/2392658898?client_id=${id}`).then(r => r.ok ? r.json() : null);
                                if (test && test.id) { clientId = id; console.log("[direct] client_id from script (validated):", clientId); return clientId; }
                            } catch(e) {}
                        }
                    }
                }
                const m = txt.match(/client_id\s*[:=]\s*["']([a-zA-Z0-9]{20,})["']/);
                if (m && isValidClientId(m[1])) { clientId = m[1]; console.log("[direct] client_id from script:", clientId); return clientId; }
            } catch(e) {}
        }
        // Try inline extraction with validation
        const inline = document.documentElement.innerHTML.match(/client_id["']?\s*[:=]\s*["']([a-zA-Z0-9]{20,})["']/);
        if (inline && isValidClientId(inline[1])) { clientId = inline[1]; console.log("[direct] client_id from inline:", clientId); return clientId; }
        // Hardcoded fallback - test each until one works
        const fallbacks = ["a3e059563d07fd3372b49b3a19f00c6", "2t9loNOuKBkz2zlBEzzHQT8QCGgAaaR9", "iZIs9mchVcX5lhVRyQGGAYlR5h6y3z3", "rCWYCFdrQ95LJCk3y2N4MO7s1h9aGWgA", "fDoItMDbsBt_LDv1WTaK0ZBk1tuK14m"];
        for (const id of fallbacks) {
            try {
                const test = await fetch(`https://api-v2.soundcloud.com/tracks/2392658898?client_id=${id}`).then(r => r.ok ? r.json() : null);
                if (test && test.id) { clientId = id; console.log("[direct] using fallback client_id:", id); return id; }
                else console.log("[direct] fallback", id, "failed");
            } catch(e) { console.log("[direct] fallback", id, "error", e.message); }
        }
        console.log("[direct] failed to get client_id");
        return null;
    }

    function getTrackId() {
        // Method 0: Extract from currently playing track in player bar (works on any page)
        const playerTrackUrl = getPlayerTrackUrl();
        if (playerTrackUrl) {
            const m = playerTrackUrl.match(/tracks?[\/:](\d{6,})/);
            if (m) { console.log("[direct] track ID from player link:", m[1]); return m[1]; }
            // Also try matching numeric ID in URL path like /artist/track-name
            const slug = playerTrackUrl.match(/soundcloud\.com\/([^\/]+)\/([^\/\?]+)/);
            if (slug) { console.log("[direct] player track slug:", slug[1], slug[2]); /* will resolve later */ }
        }
        // From twitter:player meta - handle double-encoded
        const meta = document.querySelector('meta[property="twitter:player"]');
        if (meta && meta.content) {
            try {
                const decoded = decodeURIComponent(decodeURIComponent(meta.content));
                const m = decoded.match(/tracks[:\/](\d{6,})/);
                if (m) return m[1];
            } catch(e) {}
            const m2 = meta.content.match(/(\d{7,})/);
            if (m2) return m2[1];
        }
        // Try og:url
        const og = document.querySelector('meta[property="og:url"]');
        if (og && og.content) {
            const mm = og.content.match(/(\d{7,})/);
            if (mm) return mm[1];
        }
        // Try hydration - find sound object
        if (window.__sc_hydration) {
            try {
                const s = JSON.stringify(window.__sc_hydration);
                const title = getTrackTitle();
                const idx = s.indexOf(title.substring(0,10));
                if (idx >= 0) {
                    const sub = s.substring(Math.max(0, idx-500), idx+500);
                    const mm = sub.match(/"id"\s*:\s*(\d{6,})/);
                    if (mm) return mm[1];
                }
                const mm2 = s.match(/"id"\s*:\s*(\d{7,})/);
                if (mm2) return mm2[1];
            } catch(e) {}
        }
        return null;
    }
    function getPlayerTrackUrl() {
        // Get the track URL from the bottom player bar
        const footer = document.querySelector('footer, [role="contentinfo"]');
        if (footer) {
            // Look for links to soundcloud.com/artist/track inside the player
            const links = footer.querySelectorAll('a[href*="soundcloud.com/"]');
            for (const a of links) {
                const href = a.getAttribute('href');
                if (href && !href.includes('/you/') && !href.includes('/search') && !href.includes('/discover')) {
                    // Looks like a track link (e.g. /agonyispainful/wannacry)
                    if (href.split('/').filter(Boolean).length >= 2) {
                        console.log("[direct] player track URL:", href);
                        return href.startsWith('http') ? href : `https://soundcloud.com${href}`;
                    }
                }
            }
            // Fallback: find track link near playback controls
            const allLinks = footer.querySelectorAll('a');
            for (const a of allLinks) {
                const href = a.getAttribute('href') || '';
                const parts = href.replace(/^\//, '').split('/').filter(Boolean);
                if (parts.length >= 2 && !parts[0].startsWith('you') && parts[0] !== 'search') {
                    console.log("[direct] player track URL (fallback):", href);
                    return href.startsWith('http') ? href : `https://soundcloud.com${href}`;
                }
            }
        }
        return null;
    }
    async function resolveTrackId(cid) {
        // First try: resolve using the player bar track URL
        const playerUrl = getPlayerTrackUrl();
        if (playerUrl) {
            try {
                const url = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(playerUrl)}&client_id=${cid}`;
                console.log("[direct] resolving player URL:", url);
                const r = await fetch(url);
                if (r.ok) {
                    const data = await r.json();
                    console.log("[direct] resolve data id:", data.id, "title:", data.title);
                    if (data.id) return String(data.id);
                } else {
                    console.log("[direct] resolve player URL failed:", r.status);
                }
            } catch(e) { console.log("[direct] resolve player URL error:", e.message); }
        }
        // Fallback: resolve using page URL
        try {
            const url = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(location.href)}&client_id=${cid}`;
            console.log("[direct] resolving page URL:", url);
            const r = await fetch(url);
            if (r.ok) {
                const data = await r.json();
                console.log("[direct] resolve data id:", data.id, "title:", data.title);
                if (data.id) return String(data.id);
            } else {
                console.log("[direct] resolve failed status:", r.status);
            }
        } catch(e) { console.log("[direct] resolve error:", e.message); }
        return null;
    }

    function sanitizeFilename(s) {
        // Keep " - " format as user wants: HOL - GOD_2.mp3
        // Remove ! and illegal Windows chars, keep spaces and dash
        return s.replace(/!/g, "").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().replace(/\s*-\s*/g, " - ").substring(0, 120) || "track";
    }
    function getTrackTitle(apiTitle) {
        if (apiTitle) return sanitizeFilename(apiTitle);
        const h1 = document.querySelector('h1');
        if (h1 && h1.innerText.trim()) return sanitizeFilename(h1.innerText);
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) return sanitizeFilename(ogTitle.content);
        const docTitle = document.title.replace(/Stream\s+|\s+by\s+.*$/gi, "").trim();
        if (docTitle) return sanitizeFilename(docTitle);
        return "soundcloud-track";
    }
    function getArtistTitle(apiData) {
        if (apiData && apiData.user && apiData.user.username && apiData.title) {
            return sanitizeFilename(`${apiData.user.username} - ${apiData.title}`);
        }
        return null;
    }

    let lastApiInfo = null;
    async function getStreamUrl(trackId, cid) {
        try {
            const info = await fetch(`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${cid}`).then(r => r.json());
            lastApiInfo = info;
            console.log("[direct] track info:", info.title, "user:", info.user && info.user.username, "media:", info.media);
            if (info.media && info.media.transcodings) {
                // Prefer progressive mp3
                let transcoding = info.media.transcodings.find(t => t.preset === "mp3_0_1" || (t.format && t.format.protocol === "progressive"));
                if (!transcoding) transcoding = info.media.transcodings.find(t => t.format && t.format.mime_type === "audio/mpeg");
                if (!transcoding) transcoding = info.media.transcodings[0];
                if (transcoding) {
                    console.log("[direct] using transcoding:", transcoding.preset, transcoding.url);
                    const stream = await fetch(`${transcoding.url}?client_id=${cid}`).then(r => r.json());
                    console.log("[direct] stream url:", stream.url);
                    return stream.url;
                }
            }
            // Fallback: try download_url
            if (info.download_url) {
                const dl = await fetch(`${info.download_url}?client_id=${cid}`).then(r => r.json());
                if (dl && dl.redirectUri) return dl.redirectUri;
            }
            // Try progressive via api
            if (info.media) console.log("[direct] no suitable transcoding");
        } catch(e) {
            console.log("[direct] getStreamUrl error:", e.message);
        }
        return null;
    }

    function makeBtn(idSuffix, extraCss) {
        const btn = document.createElement("button");
        btn.id = BTN_ID + idSuffix;
        btn.title = "Download this track";
        btn.className = "sc-button sc-button-medium sc-button-icon sc-button-responsive";
        btn.style.cssText = extraCss || "margin-left:8px;background:#ff5500;color:#fff;border-color:#ff5500;cursor:pointer;position:relative;z-index:10;";
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        btn.addEventListener("click", handleDownload);
        return btn;
    }
    async function handleDownload(e) {
        const btn = e.currentTarget;
        e.preventDefault(); e.stopPropagation();
        const isMini = btn.id.includes("-player");
        btn.disabled = true; const orig = btn.innerHTML;
        btn.innerHTML = isMini ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="animation:spin 0.8s linear infinite;"><path d="M12 4a8 8 0 018 8h-2a6 6 0 00-6-6V4z"/><style>@keyframes spin{to{transform:rotate(360deg)}}</style></svg>' : '<span>⏳ Loading...</span>';
        if (isMini) btn.style.opacity = "0.7";
        try {
            const cid = await getClientId(); if (!cid) throw new Error("Could not get client_id");
            let trackId = getTrackId(); if (!trackId) trackId = await resolveTrackId(cid);
            if (!trackId) throw new Error("Could not find track ID (try refresh)");
            const streamUrl = await getStreamUrl(trackId, cid);
            if (!streamUrl) throw new Error("Could not get stream URL (track may be download-restricted)");
            let filename = getArtistTitle(lastApiInfo) || getTrackTitle(lastApiInfo && lastApiInfo.title);
            if (!filename.endsWith(".mp3")) filename += ".mp3";
            filename = filename.replace(/^\.+/, "").substring(0, 180);
            console.log("[direct] downloading:", filename, streamUrl);
            // Download directly via content script to ensure correct filename (bypass server UUID)
            try {
                const blob = await fetch(streamUrl).then(r => {
                    if (!r.ok) throw new Error("fetch mp3 failed " + r.status);
                    return r.blob();
                });
                console.log("[direct] blob fetched size=" + blob.size);
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = filename;
                a.style.display = "none";
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 1000);
                console.log("[direct] blob download triggered:", filename);
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
                return;
            } catch(e) {
                console.log("[direct] blob download failed, falling back to background:", e.message);
            }
            // Fallback to background chrome.downloads
            chrome.runtime.sendMessage({messageRecipient:"__SC_DIRECT__", action:"download", url: streamUrl, filename: filename}, (resp) => {
                if (chrome.runtime.lastError) console.log("[direct] download msg error:", chrome.runtime.lastError.message);
                console.log("[direct] download response:", resp);
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
            });
            setTimeout(() => { if (btn.disabled) { btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = ""; } }, 8000);
        } catch(err) {
            console.log("[direct] download failed:", err.message);
            btn.disabled = false;
            if (isMini) { btn.innerHTML = orig; btn.style.opacity = ""; btn.title = err.message; }
            else { btn.textContent = "Error: " + err.message; setTimeout(() => { btn.innerHTML = orig; }, 3000); }
        }
    }
    function createButton() {
        let injected = false;

        // Clean up ALL old download buttons first to prevent duplicates
        document.querySelectorAll('[id^="sc-direct-download-btn"]').forEach(el => el.remove());

        // 1) Middle bar next to 3-dot "More" — action bar only, never in footer
        const MID_ID = BTN_ID + "-mid";
        const moreBtn = document.querySelector('button[aria-label="More actions"], button[aria-label="More"]') || Array.from(document.querySelectorAll('button')).find(b => {
            const t = (b.textContent || "").trim();
            const ttl = b.getAttribute("title") || b.getAttribute("aria-label") || "";
            return (t === "More" || t === "..." || ttl.includes("More")) && !b.closest('footer, [role="contentinfo"], [class*="miniplayer"], [class*="playback"]');
        });
        if (moreBtn && moreBtn.parentElement) {
            const btn2 = makeBtn("-mid", "margin-left:8px;background:#ff5500;color:#fff;border-color:#ff5500;cursor:pointer;position:relative;z-index:10;");
            btn2.id = MID_ID;
            moreBtn.parentElement.insertBefore(btn2, moreBtn.nextSibling);
            console.log("[direct] mid button injected next to More"); injected = true;
        }

        // 2) Bottom mini-player — orange circle in the bottom playback bar
        const PLAYER_ID = BTN_ID + "-player";
        // Inject style override once
        if (!document.getElementById(BTN_ID + "-player-style")) {
            const st = document.createElement("style");
            st.id = BTN_ID + "-player-style";
            st.textContent = `
                #${PLAYER_ID}{
                    width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;max-width:32px!important;
                    border-radius:50%!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;
                    flex:0 0 32px!important;flex-shrink:0!important;padding:0!important;margin-left:8px!important;
                    background:#ff5500!important;color:#fff!important;border:none!important;box-sizing:border-box!important;
                    cursor:pointer!important;vertical-align:middle!important;position:relative;z-index:9999!important;
                    transition:transform 0.15s ease, box-shadow 0.15s ease!important;
                    box-shadow:0 2px 8px rgba(255,85,0,0.35)!important;
                }
                #${PLAYER_ID}:hover{transform:scale(1.1)!important;box-shadow:0 4px 12px rgba(255,85,0,0.5)!important;}
                #${PLAYER_ID}:active{transform:scale(0.95)!important;}
                #${PLAYER_ID} svg{pointer-events:none!important;}
            `;
            document.head.appendChild(st);
        }
        // Find the bottom playback bar
        let pContainer = null;
        // Try standard class first
        pContainer = document.querySelector('.playbackSoundBadge__actions');
        // Try footer — find the right-side icon button group
        if (!pContainer) {
            const footer = document.querySelector('footer, [role="contentinfo"]');
            if (footer) {
                const btns = Array.from(footer.querySelectorAll('button'));
                // Find buttons near the right end (Like, Follow, Queue icons)
                for (const b of btns) {
                    const label = (b.getAttribute('aria-label') || b.textContent.trim()).toLowerCase();
                    if (label === 'like' || label === 'queue' || label.includes('follow')) {
                        pContainer = b.parentElement;
                        break;
                    }
                }
            }
        }
        if (pContainer) {
            const btn3 = document.createElement("button");
            btn3.id = PLAYER_ID;
            btn3.title = "Download this track";
            btn3.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
            btn3.addEventListener("click", handleDownload);
            pContainer.appendChild(btn3);
            console.log("[direct] player mini button injected"); injected = true;
        } else {
            console.log("[direct] WARNING: could not find bottom player bar");
        }

        if (!injected) { console.log("[direct] no container found, retry"); return false; }
        return true;
    }

    // Poll for container
    let attempts = 0;
    const poll = setInterval(() => {
        attempts++;
        if (createButton()) clearInterval(poll);
        if (attempts > 60) { clearInterval(poll); console.log("[direct] gave up after 60 attempts"); }
    }, 500);

    // Re-inject on SPA navigation
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            console.log("[direct] URL changed to", lastUrl);
            setTimeout(() => {
                const existing = document.getElementById(BTN_ID);
                if (existing) existing.remove();
                let a = 0;
                const p2 = setInterval(() => { a++; if (createButton()) clearInterval(p2); if (a > 20) clearInterval(p2); }, 500);
            }, 1000);
        }
    }, 1000);

    // Also observe DOM for new track loads or player re-renders
    const PLAYER_BTN_ID = BTN_ID + "-player";
    const obs = new MutationObserver(() => {
        if (!document.getElementById(PLAYER_BTN_ID) && document.querySelector('footer, [role="contentinfo"]')) {
            createButton();
        }
    });
    obs.observe(document.body, {childList:true, subtree:true});
})();

