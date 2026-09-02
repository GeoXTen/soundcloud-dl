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
        const scripts = Array.from(document.querySelectorAll('script[src*="a-v2.sndcdn.com"]'));
        for (const s of scripts) {
            try {
                const txt = await fetch(s.src).then(r => r.text());
                const mHex = txt.match(/["']([a-zA-Z0-9]{32})["']/g);
                if (mHex) {
                    for (const cand of mHex) {
                        const id = cand.replace(/["']/g, "");
                        if (isValidClientId(id)) {
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
        const inline = document.documentElement.innerHTML.match(/client_id["']?\s*[:=]\s*["']([a-zA-Z0-9]{20,})["']/);
        if (inline && isValidClientId(inline[1])) { clientId = inline[1]; console.log("[direct] client_id from inline:", clientId); return clientId; }
        const fallbacks = ["a3e059563d07fd3372b49b3a19f00c6", "2t9loNOuKBkz2zlBEzzHQT8QCGgAaaR9", "iZIs9mchVcX5lhVRyQGGAYlR5h6y3z3", "rCWYCFdrQ95LJCk3y2N4MO7s1h9aGWgA", "fDoItMDbsBt_LDv1WTaK0ZBk1tuK14m"];
        for (const id of fallbacks) {
            try {
                const test = await fetch(`https://api-v2.soundcloud.com/tracks/2392658898?client_id=${id}`).then(r => r.ok ? r.json() : null);
                if (test && test.id) { clientId = id; console.log("[direct] using fallback client_id:", id); return id; }
            } catch(e) {}
        }
        console.log("[direct] failed to get client_id");
        return null;
    }

    function getPlayerTrackUrl() {
        const footer = document.querySelector('footer, [role="contentinfo"]');
        if (footer) {
            const links = footer.querySelectorAll('a[href*="soundcloud.com/"]');
            for (const a of links) {
                const href = a.getAttribute('href');
                if (href && !href.includes('/you/') && !href.includes('/search') && !href.includes('/discover')) {
                    if (href.split('/').filter(Boolean).length >= 2) {
                        return href.startsWith('http') ? href : `https://soundcloud.com${href}`;
                    }
                }
            }
            const allLinks = footer.querySelectorAll('a');
            for (const a of allLinks) {
                const href = a.getAttribute('href') || '';
                const parts = href.replace(/^\//, '').split('/').filter(Boolean);
                if (parts.length >= 2 && !parts[0].startsWith('you') && parts[0] !== 'search') {
                    return href.startsWith('http') ? href : `https://soundcloud.com${href}`;
                }
            }
        }
        return null;
    }

    function getTrackIdFromUrl(url) {
        if (!url) return null;
        const m = url.match(/tracks?[\/:](\d{6,})/);
        if (m) return m[1];
        const slug = url.match(/soundcloud\.com\/([^\/]+)\/([^\/\?]+)/);
        if (slug) return `${slug[1]}/${slug[2]}`;
        return null;
    }

    function getTrackId() {
        const playerTrackUrl = getPlayerTrackUrl();
        if (playerTrackUrl) {
            const id = getTrackIdFromUrl(playerTrackUrl);
            if (id) { console.log("[direct] track ID from player:", id); return id; }
        }
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
        const og = document.querySelector('meta[property="og:url"]');
        if (og && og.content) {
            const mm = og.content.match(/(\d{7,})/);
            if (mm) return mm[1];
        }
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

    async function resolveTrackId(cid, trackUrl) {
        const urlToResolve = trackUrl || getPlayerTrackUrl() || location.href;
        try {
            const url = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(urlToResolve)}&client_id=${cid}`;
            const r = await fetch(url);
            if (r.ok) {
                const data = await r.json();
                if (data.id) {
                    // If it's a playlist/set, get the first track
                    if (data.kind === 'playlist' || data.kind === 'system-playlist') {
                        const tracks = data.tracks || [];
                        if (tracks.length > 0) {
                            const firstTrack = tracks[0];
                            if (firstTrack.id) return String(firstTrack.id);
                            if (firstTrack.track_id) return String(firstTrack.track_id);
                        }
                        return null;
                    }
                    return String(data.id);
                }
            }
        } catch(e) {}
        return null;
    }

    function sanitizeFilename(s) {
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
            if (info.media && info.media.transcodings) {
                let transcoding = info.media.transcodings.find(t => t.preset === "mp3_0_1" || (t.format && t.format.protocol === "progressive"));
                if (!transcoding) transcoding = info.media.transcodings.find(t => t.format && t.format.mime_type === "audio/mpeg");
                if (!transcoding) transcoding = info.media.transcodings[0];
                if (transcoding) {
                    const stream = await fetch(`${transcoding.url}?client_id=${cid}`).then(r => r.json());
                    return stream.url;
                }
            }
            if (info.download_url) {
                const dl = await fetch(`${info.download_url}?client_id=${cid}`).then(r => r.json());
                if (dl && dl.redirectUri) return dl.redirectUri;
            }
        } catch(e) {
            console.log("[direct] getStreamUrl error:", e.message);
        }
        return null;
    }

    // Download handler — accepts trackUrl param for multi-track feed injection
    async function handleDownload(e, trackUrl) {
        const btn = e.currentTarget;
        e.preventDefault(); e.stopPropagation();
        const isMini = btn.id.includes("-player");
        btn.disabled = true; const orig = btn.innerHTML;
        btn.innerHTML = isMini
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="animation:spin 0.8s linear infinite;"><path d="M12 4a8 8 0 018 8h-2a6 6 0 00-6-6V4z"/><style>@keyframes spin{to{transform:rotate(360deg)}}</style></svg>'
            : '<svg width="16" height="16" viewBox="0 0 24 24" fill="white" style="animation:spin 0.8s linear infinite;"><path d="M12 4a8 8 0 018 8h-2a6 6 0 00-6-6V4z"/></svg>';
        if (isMini) btn.style.opacity = "0.7";
        try {
            const cid = await getClientId(); if (!cid) throw new Error("Could not get client_id");
            let trackId = null;
            // Feed page: resolve the specific track URL
            if (trackUrl) {
                console.log("[direct] resolving feed track:", trackUrl);
                trackId = await resolveTrackId(cid, trackUrl);
                console.log("[direct] resolved feed track ID:", trackId);
            }
            // Fallback: player bar or page
            if (!trackId) {
                console.log("[direct] feed resolve failed, trying player/page");
                trackId = getTrackId();
            }
            // If still a slug, resolve it
            if (trackId && trackId.includes('/')) {
                trackId = await resolveTrackId(cid, `https://soundcloud.com/${trackId}`);
            }
            if (!trackId) trackId = await resolveTrackId(cid);
            if (!trackId) throw new Error("Could not find track ID");
            const streamUrl = await getStreamUrl(trackId, cid);
            if (!streamUrl) throw new Error("Could not get stream URL");
            let filename = getArtistTitle(lastApiInfo) || getTrackTitle(lastApiInfo && lastApiInfo.title);
            if (!filename.endsWith(".mp3")) filename += ".mp3";
            filename = filename.replace(/^\.+/, "").substring(0, 180);
            try {
                const blob = await fetch(streamUrl).then(r => {
                    if (!r.ok) throw new Error("fetch mp3 failed " + r.status);
                    return r.blob();
                });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl; a.download = filename; a.style.display = "none";
                document.body.appendChild(a); a.click();
                setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 1000);
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
                return;
            } catch(e) {
                console.log("[direct] blob download failed:", e.message);
            }
            chrome.runtime.sendMessage({messageRecipient:"__SC_DIRECT__", action:"download", url: streamUrl, filename: filename}, (resp) => {
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
            });
            setTimeout(() => { if (btn.disabled) { btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = ""; } }, 8000);
        } catch(err) {
            console.log("[direct] download failed:", err.message);
            btn.disabled = false;
            if (isMini) { btn.innerHTML = orig; btn.style.opacity = ""; btn.title = err.message; }
            else { btn.innerHTML = orig; }
        }
    }

    function makeFeedBtn(trackUrl) {
        const btn = document.createElement("button");
        btn.className = "sc-button sc-button-small sc-button-icon sc-dl-feed-btn";
        btn.title = "Download this track";
        btn.style.cssText = "background:#ff5500;color:#fff;border-color:#ff5500;cursor:pointer;display:inline-flex!important;flex-shrink:0;vertical-align:middle;";
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        btn.addEventListener("click", (e) => handleDownload(e, trackUrl));
        return btn;
    }

    function makePlayerBtn() {
        const btn = document.createElement("button");
        btn.id = BTN_ID + "-player";
        btn.title = "Download this track";
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="pointer-events:none;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        btn.addEventListener("click", handleDownload);
        return btn;
    }

    // Find all action bar containers in feed/list items
    function findFeedActionBars() {
        const results = [];
        const seenContainers = new Set();

        // Helper: validate and normalize a track URL
        function getTrackUrl(href) {
            if (!href) return null;
            const full = href.startsWith('http') ? href : `https://soundcloud.com${href}`;
            if (full.includes('checkout.') || full.includes('/pages/') || full.includes('/you/') ||
                full.includes('/search') || full.includes('/discover') || full.includes('/stream') ||
                full.includes('/signin') || full.includes('/tags/') || full.includes('/legal/') ||
                full.includes('/charts/') || full.includes('/settings/')) return null;
            const path = full.replace('https://soundcloud.com/', '');
            const p = path.split('/').filter(Boolean);
            if (p.length >= 2 && !p[0].includes('.')) return full;
            return null;
        }

        // Type 1a: Direct list items (artist tracks, stream, regular reposts)
        const listItems = document.querySelectorAll('.soundList__item, .sc-list-nostyle > li');
        listItems.forEach(item => {
            if (seenContainers.has(item)) return;
            const actionBar = item.querySelector(':scope > .userStreamItem > .sound > .sound__body > .sound__footer > .sound__soundActions > .soundActions, .soundActions');
            if (!actionBar) return;
            if (seenContainers.has(actionBar)) return;

            const allBtns = actionBar.querySelectorAll('button, a[class*="sc-button"], [role="button"]');
            if (allBtns.length < 1) return;

            let trackUrl = null;
            const artLink = item.querySelector(':scope > .userStreamItem > .sound > .sound__body > .sound__artwork > a.sound__coverArt, a.sound__coverArt');
            if (artLink) trackUrl = getTrackUrl(artLink.getAttribute('href'));
            if (!trackUrl) {
                const titleLinks = item.querySelectorAll('.soundTitle__titleContainer a, .soundTitle a[href]');
                for (const a of titleLinks) {
                    const href = a.getAttribute('href');
                    const url = getTrackUrl(href);
                    if (url) { trackUrl = url; break; }
                }
            }
            if (!trackUrl) {
                const links = item.querySelectorAll('a[href]');
                for (const a of links) {
                    const href = a.getAttribute('href');
                    if (!href || href.includes('checkout.') || href.includes('gate.sc') || href.includes('/tags/')) continue;
                    const url = getTrackUrl(href);
                    if (url) { trackUrl = url; break; }
                }
            }

            if (trackUrl) {
                seenContainers.add(item);
                seenContainers.add(actionBar);
                results.push({ container: actionBar, trackUrl });
            }
        });

        // Type 1b: Nested track listings inside album reposts
        // These are soundActions inside sub-elements (e.g., "1 - Artist - Track" rows)
        document.querySelectorAll('.soundActions').forEach(actionBar => {
            if (seenContainers.has(actionBar)) return;
            if (actionBar.closest('footer, [role="contentinfo"], [class*="playback"], [class*="miniplayer"]')) return;

            const allBtns = actionBar.querySelectorAll('button, a[class*="sc-button"], [role="button"]');
            if (allBtns.length < 1) return;

            // Walk up to the closest sound context (not the outer soundList__item)
            const soundCtx = actionBar.closest('.sound, .sound__body, .sound__content, .visualSound__wrapper');
            if (!soundCtx) return;

            let trackUrl = null;

            // Find artwork link within this specific sound context
            const artLink = soundCtx.querySelector('a.sound__coverArt');
            if (artLink) trackUrl = getTrackUrl(artLink.getAttribute('href'));

            // Try title link
            if (!trackUrl) {
                const titleLinks = soundCtx.querySelectorAll('.soundTitle__titleContainer a[href], .soundTitle a[href]');
                for (const a of titleLinks) {
                    const url = getTrackUrl(a.getAttribute('href'));
                    if (url) { trackUrl = url; break; }
                }
            }

            if (trackUrl) {
                seenContainers.add(actionBar);
                results.push({ container: actionBar, trackUrl });
            }
        });

        // Type 2: Tiles (discover page) — playableTile__actionWrapper with audibleTile
        const tiles = document.querySelectorAll('.playableTile__actionWrapper');
        tiles.forEach(row => {
            if (row.closest('footer, [role="contentinfo"], [class*="playback"], [class*="miniplayer"]')) return;

            const allBtns = row.querySelectorAll('button, a[class*="sc-button"], [role="button"]');
            if (allBtns.length < 3 || allBtns.length > 10) return;

            const texts = Array.from(allBtns).map(b => (b.getAttribute('aria-label') || b.textContent || '').trim().toLowerCase());
            const hasAction = texts.some(t => t.includes('like') || t.includes('unlike') || t.includes('repost') || t.includes('share') || t.includes('more') || t === '...');
            if (!hasAction) return;
            if (texts.some(t => t.includes('your insights') || t.includes('analytics'))) return;

            // Find the individual card
            const tile = row.closest('.audibleTile, .playableTile');
            if (!tile) return;
            const tileId = tile.outerHTML.substring(0, 100);
            if (seenContainers.has(tileId)) return;

            // Get track URL from the artwork link
            let trackUrl = null;
            const artLink = tile.querySelector('a.playableTile__artworkLink, a[class*="artworkLink"]');
            if (artLink) trackUrl = getTrackUrl(artLink.getAttribute('href'));

            if (trackUrl) {
                seenContainers.add(tileId);
                results.push({ container: row, trackUrl });
            }
        });

        return results;
    }

    // Inject style for player mini button (once)
    function injectPlayerStyle() {
        const PLAYER_ID = BTN_ID + "-player";
        if (document.getElementById(PLAYER_ID + "-style")) return;
        const st = document.createElement("style");
        st.id = PLAYER_ID + "-style";
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

    function createButtons() {
        let injected = false;

        // Remove ALL old download buttons
        document.querySelectorAll('[id^="sc-direct-download-btn"], .sc-dl-feed-btn').forEach(el => el.remove());

        // === FEED PAGE: inject button on EVERY track card ===
        const feedBars = findFeedActionBars();
        if (feedBars.length > 0) {
            feedBars.forEach(({ container, trackUrl }) => {
                if (container.querySelector('.sc-dl-feed-btn')) return;
                const btn = makeFeedBtn(trackUrl);
                const btnGroup = container.querySelector('.sc-button-group');
                if (btnGroup) {
                    btnGroup.appendChild(btn);
                } else {
                    container.appendChild(btn);
                }
                injected = true;
            });
        }

        // === PLAYER BAR: mini orange circle ===
        injectPlayerStyle();
        const PLAYER_ID = BTN_ID + "-player";
        let pContainer = null;
        pContainer = document.querySelector('.playbackSoundBadge__actions');
        if (!pContainer) {
            const footer = document.querySelector('footer, [role="contentinfo"]');
            if (footer) {
                const btns = Array.from(footer.querySelectorAll('button'));
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
            const playerBtn = makePlayerBtn();
            pContainer.appendChild(playerBtn);
            console.log("[direct] player mini button injected");
            injected = true;
        }

        if (!injected) { return false; }
        return true;
    }

    // Poll for container
    let attempts = 0;
    const poll = setInterval(() => {
        attempts++;
        if (createButtons()) clearInterval(poll);
        if (attempts > 60) { clearInterval(poll); }
    }, 500);

    // Re-inject on SPA navigation
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(() => {
                let a = 0;
                const p2 = setInterval(() => { a++; if (createButtons()) clearInterval(p2); if (a > 20) clearInterval(p2); }, 500);
            }, 1000);
        }
    }, 1000);

    // Re-inject when SoundCloud lazy-loads new feed items on scroll
    let debounceTimer = null;
    const scrollObs = new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { createButtons(); }, 300);
    });
    scrollObs.observe(document.body, {childList: true, subtree: true});
})();
