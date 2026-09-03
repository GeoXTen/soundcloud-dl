// Direct SoundCloud downloader - bypasses CrossPilot, no eval needed
// Requires lame.min.js for MP3 trimming
(function() {
    console.log("[direct] SoundCloud direct downloader loaded at", location.href);
    const BTN_ID = "sc-direct-download-btn";
    let clientId = null;

    // Extract SoundCloud client_id from page
    function isValidClientId(id) {
        // Real SoundCloud client_id is 32 alphanumeric chars, must contain at least one digit
        return id && /^[a-zA-Z0-9]{32}$/.test(id) && /\d/.test(id);
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

    // Toast download indicator
    let toastCount = 0;
    function showDownloadToast(name) {
        const id = "sc-dl-toast-" + (++toastCount);
        let c = document.getElementById("sc-dl-toast-container");
        if (!c) {
            c = document.createElement("div");
            c.id = "sc-dl-toast-container";
            c.style.cssText = "position:fixed;top:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
            document.body.appendChild(c);
        }
        const t = document.createElement("div");
        t.id = id;
        t.style.cssText = "pointer-events:auto;background:#1a1a2e;color:#fff;padding:12px 18px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.4);border:1px solid rgba(255,85,0,0.3);opacity:0;transform:translateX(40px);transition:all 0.3s cubic-bezier(0.4,0,0.2,1);min-width:220px;max-width:320px;";
        // Spinner (react-spinners-kit PushSpinner style)
        t.innerHTML = '<div style="flex-shrink:0;width:22px;height:22px;position:relative;"><div style="width:100%;height:100%;border:3px solid rgba(255,85,0,0.2);border-top-color:#ff5500;border-radius:50%;animation:sc-dl-spin 0.8s linear infinite;"></div></div><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (name || "track") + '</span>';
        c.appendChild(t);
        requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(0)"; });
        return id;
    }
    function hideDownloadToast(id) {
        if (!id) return;
        const t = document.getElementById(id);
        if (!t) return;
        t.style.opacity = "0";
        t.style.transform = "translateX(40px)";
        setTimeout(() => t.remove(), 300);
    }

    // Trim popup UI
    function showTrimPopup(apiInfo, streamUrl, filename) {
        return new Promise((resolve) => {
            const duration = apiInfo.duration ? Math.floor(apiInfo.duration / 1000) : 0;
            const formatTime = (totalSec) => {
                totalSec = Math.max(0, Math.floor(totalSec));
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                const s = totalSec % 60;
                return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            };
            const parseTime = (str) => {
                const parts = str.split(':').map(Number);
                if (parts.some(isNaN)) return 0;
                if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
                if (parts.length === 2) return parts[0]*60 + parts[1];
                return parts[0] || 0;
            };

            // Remove existing popup
            const existing = document.getElementById('sc-dl-trim-popup');
            if (existing) existing.remove();

            const overlay = document.createElement('div');
            overlay.id = 'sc-dl-trim-popup';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:999998;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

            const popup = document.createElement('div');
            popup.style.cssText = 'background:#1a1a2e;border-radius:16px;padding:24px;width:380px;max-width:90vw;color:#fff;box-shadow:0 8px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,85,0,0.2);';

            const trackName = filename.replace('.mp3', '').substring(0, 40);
            const durationStr = duration ? formatTime(duration) : '--:--:--';

            popup.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                    <div style="width:40px;height:40px;background:rgba(255,85,0,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff5500"><path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/></svg>
                    </div>
                    <div>
                        <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">${trackName}</div>
                        <div style="font-size:12px;color:#888;">Duration: ${durationStr}</div>
                    </div>
                </div>

                <div style="background:#12122a;border-radius:10px;padding:16px;margin-bottom:16px;">
                    <div style="font-size:13px;color:#aaa;margin-bottom:12px;">Trim (optional)</div>
                    
                    <div style="display:flex;gap:12px;margin-bottom:12px;">
                        <div style="flex:1;">
                            <label style="font-size:11px;color:#666;display:block;margin-bottom:4px;">From</label>
                            <input id="sc-trim-from" type="text" value="00:00:00" placeholder="00:00:00"
                                style="width:100%;background:#0a0a1a;border:1px solid #333;border-radius:6px;padding:8px 10px;color:#fff;font-size:13px;font-family:monospace;outline:none;box-sizing:border-box;"
                            />
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:11px;color:#666;display:block;margin-bottom:4px;">To</label>
                            <input id="sc-trim-to" type="text" value="${durationStr}" placeholder="${durationStr}"
                                style="width:100%;background:#0a0a1a;border:1px solid #333;border-radius:6px;padding:8px 10px;color:#fff;font-size:13px;font-family:monospace;outline:none;box-sizing:border-box;"
                            />
                        </div>
                    </div>

                    ${duration ? `
                    <div style="position:relative;height:36px;margin:12px 0 4px;">
                        <div style="position:absolute;top:16px;left:0;right:0;height:4px;background:#333;border-radius:2px;"></div>
                        <div id="sc-trim-range" style="position:absolute;top:16px;height:4px;background:#ff5500;border-radius:2px;left:0;right:0;"></div>
                        <input id="sc-trim-slider-from" type="range" min="0" max="${duration}" value="0" step="1"
                            style="position:absolute;top:6px;left:0;width:100%;-webkit-appearance:none;background:transparent;z-index:3;margin:0;cursor:pointer;"
                        />
                        <input id="sc-trim-slider-to" type="range" min="0" max="${duration}" value="${duration}" step="1"
                            style="position:absolute;top:6px;left:0;width:100%;-webkit-appearance:none;background:transparent;z-index:4;margin:0;cursor:pointer;"
                        />
                        <style>
                            #sc-trim-slider-from::-webkit-slider-thumb{
                                -webkit-appearance:none;width:18px;height:18px;background:#ff5500;border-radius:50%;cursor:pointer;
                                box-shadow:0 2px 6px rgba(0,0,0,0.4);position:relative;z-index:5;border:2px solid #fff;
                            }
                            #sc-trim-slider-to::-webkit-slider-thumb{
                                -webkit-appearance:none;width:18px;height:18px;background:#ff8800;border-radius:50%;cursor:pointer;
                                box-shadow:0 2px 6px rgba(0,0,0,0.4);position:relative;z-index:5;border:2px solid #fff;
                            }
                            #sc-trim-slider-from::-webkit-slider-runnable-track,#sc-trim-slider-to::-webkit-slider-runnable-track{
                                background:transparent;height:36px;
                            }
                        </style>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;color:#666;margin-top:2px;">
                        <span>00:00:00</span>
                        <span>${durationStr}</span>
                    </div>
                    ` : ''}
                </div>

                <div style="display:flex;gap:10px;">
                    <button id="sc-trim-cancel" style="flex:1;background:#222;color:#aaa;border:1px solid #333;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;">Cancel</button>
                    <button id="sc-trim-full" style="flex:1;background:#333;color:#fff;border:1px solid #444;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;">Download Full</button>
                    <button id="sc-trim-download" style="flex:1;background:#ff5500;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">Download</button>
                </div>
            `;

            overlay.appendChild(popup);
            document.body.appendChild(overlay);

            // Elements
            const fromInput = popup.querySelector('#sc-trim-from');
            const toInput = popup.querySelector('#sc-trim-to');
            const sliderFrom = popup.querySelector('#sc-trim-slider-from');
            const sliderTo = popup.querySelector('#sc-trim-slider-to');
            const rangeBar = popup.querySelector('#sc-trim-range');
            const cancelBtn = popup.querySelector('#sc-trim-cancel');
            const fullBtn = popup.querySelector('#sc-trim-full');
            const downloadBtn = popup.querySelector('#sc-trim-download');

            // Update range bar
            function updateRange() {
                if (!duration || !sliderFrom || !sliderTo) return;
                const from = parseInt(sliderFrom.value) || 0;
                const to = parseInt(sliderTo.value) || 0;
                const minVal = Math.min(from, to);
                const maxVal = Math.max(from, to);
                const left = (minVal / duration) * 100;
                const width = ((maxVal - minVal) / duration) * 100;
                rangeBar.style.left = left + '%';
                rangeBar.style.width = width + '%';
                fromInput.value = formatTime(minVal);
                toInput.value = formatTime(maxVal);
            }

            // Sync input to slider
            function syncInputToSlider(input, slider) {
                input.addEventListener('change', () => {
                    const sec = parseTime(input.value);
                    slider.value = Math.min(Math.max(sec, 0), duration);
                    updateRange();
                });
            }

            if (sliderFrom && sliderTo) {
                sliderFrom.addEventListener('input', updateRange);
                sliderTo.addEventListener('input', updateRange);
                syncInputToSlider(fromInput, sliderFrom);
                syncInputToSlider(toInput, sliderTo);
                updateRange();
            }

            // Buttons
            cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(null); });
            fullBtn.addEventListener('click', () => { overlay.remove(); resolve({ trim: false }); });
            downloadBtn.addEventListener('click', () => {
                const from = parseTime(fromInput.value);
                const to = parseTime(toInput.value);
                if (from >= to || to <= 0) {
                    downloadBtn.style.background = '#ff3333';
                    downloadBtn.textContent = 'Invalid range';
                    setTimeout(() => { downloadBtn.style.background = '#ff5500'; downloadBtn.textContent = 'Download'; }, 1000);
                    return;
                }
                overlay.remove();
                resolve({ trim: true, from, to });
            });
            overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(null); } });
        });
    }

    // Trim MP3 using Web Audio API + lamejs
    function trimMp3(blob, fromSec, toSec) {
        return new Promise((resolve, reject) => {
            console.log("[trim] Starting trim:", { from: fromSec, to: toSec, blobSize: blob.size });
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const audioBuffer = await audioCtx.decodeAudioData(reader.result);

                    const sampleRate = audioBuffer.sampleRate;
                    const channels = audioBuffer.numberOfChannels;
                    const totalDuration = audioBuffer.duration;
                    const startSample = Math.floor(fromSec * sampleRate);
                    const endSample = Math.min(Math.floor(toSec * sampleRate), audioBuffer.length);
                    const length = endSample - startSample;

                    console.log("[trim] Audio info:", { sampleRate, channels, totalDuration, startSample, endSample, length });

                    if (length <= 0) { reject(new Error("Invalid trim range")); return; }

                    // Extract channels
                    const left = audioBuffer.getChannelData(0).subarray(startSample, endSample);
                    const right = channels > 1 ? audioBuffer.getChannelData(1).subarray(startSample, endSample) : left;

                    // Convert Float32 to Int16 for lamejs
                    function floatTo16(float32) {
                        const int16 = new Int16Array(float32.length);
                        for (let i = 0; i < float32.length; i++) {
                            const s = Math.max(-1, Math.min(1, float32[i]));
                            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                        }
                        return int16;
                    }

                    const left16 = floatTo16(left);
                    const right16 = floatTo16(right);

                    console.log("[trim] Encoding to MP3...");

                    // Encode to MP3 using lamejs
                    const mp3Encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
                    const mp3Data = [];
                    const chunkSize = 1152;

                    for (let i = 0; i < left16.length; i += chunkSize) {
                        const leftChunk = left16.subarray(i, i + chunkSize);
                        const rightChunk = right16.subarray(i, i + chunkSize);
                        const mp3buf = channels > 1
                            ? mp3Encoder.encodeBuffer(leftChunk, rightChunk)
                            : mp3Encoder.encodeBuffer(leftChunk);
                        if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));
                    }

                    const end = mp3Encoder.flush();
                    if (end.length > 0) mp3Data.push(new Uint8Array(end));

                    // Combine chunks
                    let totalLen = 0;
                    for (const chunk of mp3Data) totalLen += chunk.length;
                    const result = new Uint8Array(totalLen);
                    let offset = 0;
                    for (const chunk of mp3Data) { result.set(chunk, offset); offset += chunk.length; }

                    console.log("[trim] Done. Output size:", result.length);

                    audioCtx.close();
                    resolve(new Blob([result], { type: 'audio/mpeg' }));
                } catch(e) {
                    console.log("[trim] Error:", e);
                    reject(e);
                }
            };
            reader.onerror = () => reject(new Error("Failed to read audio"));
            reader.readAsArrayBuffer(blob);
        });
    }

    // Write ID3v2.3 tags to MP3 blob (title, artist, album art)
    function tagMp3Blob(blob, apiInfo) {
        return new Promise((resolve) => {
            if (!apiInfo) { resolve(blob); return; }
            try {
                const frames = [];
                // TIT2 - Title
                if (apiInfo.title) frames.push(makeTextFrame('TIT2', apiInfo.title));
                // TPE1 - Artist
                if (apiInfo.user && apiInfo.user.username) frames.push(makeTextFrame('TPE1', apiInfo.user.username));
                // TALB - Album
                const album = apiInfo.album_title || (apiInfo.publisher && apiInfo.publisher.name);
                if (album) frames.push(makeTextFrame('TALB', album));
                // TDRC - Year
                const year = (apiInfo.release_date || apiInfo.created_at || '').substring(0, 4);
                if (year) frames.push(makeTextFrame('TDRC', year));
                // TCON - Genre
                if (apiInfo.genre) frames.push(makeTextFrame('TCON', apiInfo.genre));
                // TRCK - Track number
                if (apiInfo.track_number) frames.push(makeTextFrame('TRCK', String(apiInfo.track_number)));
                // COMM - Comment
                if (apiInfo.description) frames.push(makeCommentFrame(apiInfo.description.substring(0, 200)));
                // TENC - Encoded By
                frames.push(makeTextFrame('TENC', 'SoundCloud Downloader by Geo'));
                // APIC - Album art
                const coverUrl = apiInfo.artwork_url || (apiInfo.user && apiInfo.user.avatar_url);
                if (coverUrl) {
                    // Get largest artwork (original > t500x500 > t300x300)
                    const largeUrl = coverUrl
                        .replace(/-\w+x\w+\./, '-t500x500.')
                        .replace('-large.', '-t500x500.')
                        .replace('-original.', '-t500x500.');
                    fetch(largeUrl).then(r => r.blob()).then(imgBlob => {
                        const imgReader = new FileReader();
                    imgReader.onload = function() {
                        const apic = makeApicFrame(new Uint8Array(imgReader.result));
                        if (apic) frames.push(apic);
                        resolve(attachTags(blob, frames));
                        };
                        imgReader.onerror = function() { resolve(attachTags(blob, frames)); };
                        imgReader.readAsArrayBuffer(imgBlob);
                    }).catch(() => resolve(attachTags(blob, frames)));
                } else {
                    resolve(attachTags(blob, frames));
                }
            } catch(e) {
                console.log("[direct] ID3 tag error:", e);
                resolve(blob);
            }
        });
    }

    function strToUint8(str) {
        const enc = new TextEncoder();
        return enc.encode(str);
    }

    function makeTextFrame(id, value) {
        let data;
        // Check if value has non-ASCII chars — use UTF-16LE with BOM
        if (/[^\x00-\x7F]/.test(value)) {
            const utf8 = new TextEncoder().encode(value);
            const utf16 = [];
            let i = 0;
            while (i < utf8.length) {
                let cp;
                const b = utf8[i];
                if (b < 0x80) { cp = b; i++; }
                else if ((b & 0xE0) === 0xC0) { cp = ((b & 0x1F) << 6) | (utf8[i+1] & 0x3F); i += 2; }
                else if ((b & 0xF0) === 0xE0) { cp = ((b & 0x0F) << 12) | ((utf8[i+1] & 0x3F) << 6) | (utf8[i+2] & 0x3F); i += 3; }
                else { cp = ((b & 0x07) << 18) | ((utf8[i+1] & 0x3F) << 12) | ((utf8[i+2] & 0x3F) << 6) | (utf8[i+3] & 0x3F); i += 4; }
                utf16.push(cp & 0xFF, (cp >> 8) & 0xFF);
            }
            const bom = new Uint8Array([0xFF, 0xFE]); // UTF-16LE BOM
            const textData = new Uint8Array(utf16);
            // encoding(0x01=UTF-16) + BOM + text
            data = new Uint8Array(1 + bom.length + textData.length);
            data[0] = 0x01; // encoding: UTF-16 with BOM
            data.set(bom, 1);
            data.set(textData, 1 + bom.length);
        } else {
            data = new Uint8Array([0x00, ...strToUint8(value)]); // ISO-8859-1
        }
        return makeFrame(id, data);
    }

    function makeCommentFrame(text) {
        const lang = strToUint8('eng');
        let textData;
        if (/[^\x00-\x7F]/.test(text)) {
            const utf8 = new TextEncoder().encode(text);
            const utf16 = [];
            let i = 0;
            while (i < utf8.length) {
                let cp;
                const b = utf8[i];
                if (b < 0x80) { cp = b; i++; }
                else if ((b & 0xE0) === 0xC0) { cp = ((b & 0x1F) << 6) | (utf8[i+1] & 0x3F); i += 2; }
                else if ((b & 0xF0) === 0xE0) { cp = ((b & 0x0F) << 12) | ((utf8[i+1] & 0x3F) << 6) | (utf8[i+2] & 0x3F); i += 3; }
                else { cp = ((b & 0x07) << 18) | ((utf8[i+1] & 0x3F) << 12) | ((utf8[i+2] & 0x3F) << 6) | (utf8[i+3] & 0x3F); i += 4; }
                utf16.push(cp & 0xFF, (cp >> 8) & 0xFF);
            }
            const bom = new Uint8Array([0xFF, 0xFE]);
            const descUtf16 = new Uint8Array([0x00, 0x00]); // empty description in UTF-16 (2-byte null)
            const textArr = new Uint8Array(utf16);
            const body = new Uint8Array(1 + lang.length + bom.length + descUtf16.length + textArr.length);
            let offset = 0;
            body[offset++] = 0x01; // encoding: UTF-16 with BOM
            body.set(lang, offset); offset += lang.length;
            body.set(bom, offset); offset += bom.length;
            body.set(descUtf16, offset); offset += descUtf16.length;
            body.set(textArr, offset);
            return makeFrame('COMM', body);
        } else {
            const desc = new Uint8Array(1); // empty description
            textData = new Uint8Array([0x00, ...strToUint8(text)]);
            const body = new Uint8Array(1 + lang.length + desc.length + textData.length);
            let offset = 0;
            body[offset++] = 0x00; // encoding: ISO-8859-1
            body.set(lang, offset); offset += lang.length;
            body.set(desc, offset); offset += desc.length;
            body.set(textData, offset);
            return makeFrame('COMM', body);
        }
    }

    function makeApicFrame(imgData) {
        try {
            const mime = strToUint8('image/jpeg');
            // body: encoding(1) + mime + null + picType(1) + desc(null) + imgData
            const body = new Uint8Array(1 + mime.length + 1 + 1 + 1 + imgData.length);
            let offset = 0;
            body[offset++] = 0x00; // text encoding: ISO-8859-1
            body.set(mime, offset); offset += mime.length;
            body[offset++] = 0x00; // null terminator after mime
            body[offset++] = 0x03; // picture type: front cover
            body[offset++] = 0x00; // empty description (null-terminated)
            body.set(imgData, offset);
            return makeFrame('APIC', body);
        } catch(e) {
            return null;
        }
    }

    function makeFrame(id, data) {
        const idBytes = strToUint8(id);
        const size = data.length;
        const sizeBytes = new Uint8Array([
            (size >> 24) & 0xff,
            (size >> 16) & 0xff,
            (size >> 8) & 0xff,
            size & 0xff
        ]);
        const header = new Uint8Array([...idBytes, ...sizeBytes, 0x00, 0x00]);
        return { header, data };
    }

    function attachTags(blob, frames) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function() {
                let mp3Data = new Uint8Array(reader.result);
                // Strip existing ID3v2 tag (at beginning of file)
                if (mp3Data[0] === 0x49 && mp3Data[1] === 0x44 && mp3Data[2] === 0x33) {
                    const size = ((mp3Data[6] & 0x7f) << 21) | ((mp3Data[7] & 0x7f) << 14) | ((mp3Data[8] & 0x7f) << 7) | (mp3Data[9] & 0x7f);
                    const tagLen = 10 + size;
                    mp3Data = mp3Data.slice(tagLen);
                }
                // Strip ID3v1 tag (at end of file, 128 bytes starting with "TAG")
                if (mp3Data.length > 128 &&
                    mp3Data[mp3Data.length - 128] === 0x54 && // T
                    mp3Data[mp3Data.length - 127] === 0x41 && // A
                    mp3Data[mp3Data.length - 126] === 0x47) { // G
                    mp3Data = mp3Data.slice(0, mp3Data.length - 128);
                }
                // Build ID3v2.3 tag
                let totalFrameSize = 0;
                for (const f of frames) totalFrameSize += f.header.length + f.data.length;
                // Tag header: "ID3" + version(2.3) + flags + size(4 bytes synchsafe)
                const tagSize = synchsafe(totalFrameSize);
                const tagHeader = new Uint8Array(10);
                tagHeader[0] = 0x49; // I
                tagHeader[1] = 0x44; // D
                tagHeader[2] = 0x33; // 3
                tagHeader[3] = 0x03; // version 2.3
                tagHeader[4] = 0x00; // revision
                tagHeader[5] = 0x00; // no flags
                tagHeader[6] = (tagSize >> 21) & 0x7f;
                tagHeader[7] = (tagSize >> 14) & 0x7f;
                tagHeader[8] = (tagSize >> 7) & 0x7f;
                tagHeader[9] = tagSize & 0x7f;
                // Concatenate all
                const tagParts = [tagHeader];
                for (const f of frames) { tagParts.push(f.header); tagParts.push(f.data); }
                const id3Tag = concatUint8(tagParts);
                // Merge: ID3 tag + original MP3 data
                const result = concatUint8([id3Tag, mp3Data]);
                resolve(new Blob([result], { type: 'audio/mpeg' }));
            };
            reader.onerror = function() { resolve(blob); };
            reader.readAsArrayBuffer(blob);
        });
    }

    function synchsafe(n) {
        let result = 0;
        result |= (n & 0x0fe00000) << 3;
        result |= (n & 0x001fc000) << 2;
        result |= (n & 0x00003f80) << 1;
        result |= (n & 0x0000007f);
        return result;
    }

    function concatUint8(arrays) {
        let totalLen = 0;
        for (const a of arrays) totalLen += a.length;
        const result = new Uint8Array(totalLen);
        let offset = 0;
        for (const a of arrays) { result.set(a, offset); offset += a.length; }
        return result;
    }

    // Download handler — accepts trackUrl param for multi-track feed injection
    async function handleDownload(e, trackUrl) {
        const btn = e.currentTarget;
        e.preventDefault(); e.stopPropagation();
        const isMini = btn.id.includes("-player");
        btn.disabled = true; const orig = btn.innerHTML;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M12 4a8 8 0 018 8h-2a6 6 0 00-6-6V4z"/></svg>';
        if (isMini) btn.style.opacity = "0.7";
        const toastName = trackUrl ? trackUrl.split('/').filter(Boolean).pop().replace(/-/g, ' ') : "track";
        const toast = showDownloadToast(toastName);
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

            // Show trim popup
            const trimResult = await showTrimPopup(lastApiInfo, streamUrl, filename);
            console.log("[direct] Trim result:", trimResult);
            if (!trimResult) {
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
                hideDownloadToast(toast);
                return;
            }

            // Update toast with actual filename
            const toastEl = document.getElementById(toast);
            if (toastEl) { const sp = toastEl.querySelector('span'); if (sp) sp.textContent = filename; }

            try {
                console.log("[direct] Fetching MP3 from:", streamUrl);
                const rawBlob = await fetch(streamUrl).then(r => {
                    if (!r.ok) throw new Error("fetch mp3 failed " + r.status);
                    return r.blob();
                });
                console.log("[direct] Raw MP3 size:", rawBlob.size);

                let finalBlob;
                if (trimResult.trim && typeof lamejs !== 'undefined') {
                    // Trim mode: decode, trim, re-encode
                    if (toastEl) { const sp = toastEl.querySelector('span'); if (sp) sp.textContent = "Trimming... " + filename; }
                    console.log("[direct] Trimming from", trimResult.from, "to", trimResult.to);
                    finalBlob = await trimMp3(rawBlob, trimResult.from, trimResult.to);
                    console.log("[direct] Trimmed blob size:", finalBlob.size);
                    finalBlob = await tagMp3Blob(finalBlob, lastApiInfo);
                } else {
                    // Full mode
                    if (trimResult.trim && typeof lamejs === 'undefined') {
                        console.warn("[direct] lamejs not available, downloading full track");
                    }
                    finalBlob = await tagMp3Blob(rawBlob, lastApiInfo);
                }

                const blobUrl = URL.createObjectURL(finalBlob);
                const a = document.createElement("a");
                a.href = blobUrl; a.download = filename; a.style.display = "none";
                document.body.appendChild(a); a.click();
                setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 1000);
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
                hideDownloadToast(toast);
                return;
            } catch(e) {
                console.log("[direct] blob download failed:", e.message);
            }
            chrome.runtime.sendMessage({messageRecipient:"__SC_DIRECT__", action:"download", url: streamUrl, filename: filename}, (resp) => {
                btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = "";
                hideDownloadToast(toast);
            });
            setTimeout(() => { if (btn.disabled) { btn.disabled = false; btn.innerHTML = orig; btn.style.opacity = ""; hideDownloadToast(toast); } }, 8000);
        } catch(err) {
            console.log("[direct] download failed:", err.message);
            btn.disabled = false;
            hideDownloadToast(toast);
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

        // Type 3: Likes/Library grid tiles — audibleTile.playableTile without playableTile__actionWrapper
        const gridTiles = document.querySelectorAll('.audibleTile.playableTile');
        gridTiles.forEach(tile => {
            if (tile.closest('footer, [role="contentinfo"], [class*="playback"], [class*="miniplayer"]')) return;
            const tileKey = tile.className + tile.querySelector('a[href]')?.getAttribute('href');
            if (seenContainers.has(tileKey)) return;

            // Get track URL from artwork link or any track link
            let trackUrl = null;
            const artLink = tile.querySelector('a[href]');
            if (artLink) trackUrl = getTrackUrl(artLink.getAttribute('href'));
            if (!trackUrl) {
                const allLinks = tile.querySelectorAll('a[href]');
                for (const a of allLinks) {
                    const url = getTrackUrl(a.getAttribute('href'));
                    if (url) { trackUrl = url; break; }
                }
            }
            if (!trackUrl) return;

            // Find the action row — either .playableTile__actionWrapper or the tile itself
            const actionRow = tile.querySelector('.playableTile__actionWrapper') || tile;
            seenContainers.add(tileKey);
            results.push({ container: actionRow, trackUrl });
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
            @keyframes sc-dl-spin{to{transform:rotate(360deg)}}
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
                // Try sc-button-group first, then sc-button-toolbar, then append to container
                const btnGroup = container.querySelector('.sc-button-group, .sc-button-toolbar');
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
