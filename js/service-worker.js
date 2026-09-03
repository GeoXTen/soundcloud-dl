// MV3 Service Worker - polyfills DOM APIs and loads the original background script
// The background.js CrossPilot engine needs window, document, localStorage, etc.
// which are unavailable in service worker context.

// === Step 1: Polyfill window ===
if (typeof window === "undefined") {
    self.window = self;
}

// === Step 1b: MV2 → MV3 API aliases ===
// The webextension-polyfill does: e.exports = n(chrome)
// It wraps chrome APIs into browser.browserAction, etc.
// In MV3, chrome.browserAction doesn't exist, only chrome.action
// The polyfill uses Object.keys(chrome) and property access to discover APIs
console.log("[SW] Step 1b: Starting MV2→MV3 alias setup");

var _noopFn = function() {};
var _makeBAMock = function() {
    return {
        setTitle: function(details) {
            if (chrome.action && chrome.action.setTitle) return chrome.action.setTitle(details);
        },
        setIcon: function(details, callback) {
            try {
                if (!details || (!details.path && !details.imageData)) {
                    console.log("[SW] setIcon called without path/imageData, ignoring");
                    if (callback) setTimeout(function() { callback(); }, 0);
                    return Promise.resolve();
                }
                if (chrome.action && chrome.action.setIcon) return chrome.action.setIcon(details, callback).catch(function(e){
                    console.log("[SW] setIcon suppressed:", e.message);
                    if (callback) callback();
                });
            } catch(e) { console.log("[SW] setIcon exception suppressed:", e.message); }
            if (callback) setTimeout(function() { callback(); }, 0);
            return Promise.resolve();
        },
        setBadgeText: function(details) {
            if (chrome.action && chrome.action.setBadgeText) return chrome.action.setBadgeText(details);
        },
        setBadgeBackgroundColor: function(details) {
            if (chrome.action && chrome.action.setBadgeBackgroundColor) return chrome.action.setBadgeBackgroundColor(details);
        },
        setBadgeIcon: function(details, callback) {
            if (chrome.action && chrome.action.setBadgeIcon) return chrome.action.setBadgeIcon(details, callback);
            if (callback) setTimeout(function() { callback(); }, 0);
        },
        setPopup: function(details) {
            if (chrome.action && chrome.action.setPopup) return chrome.action.setPopup(details);
        },
        getPopup: function(details, callback) {
            if (chrome.action && chrome.action.getPopup) return chrome.action.getPopup(details, callback);
            if (callback) setTimeout(function() { callback(""); }, 0);
        },
        disable: function(tabId) {
            if (chrome.action && chrome.action.disable) return chrome.action.disable(tabId);
        },
        enable: function(tabId) {
            if (chrome.action && chrome.action.enable) return chrome.action.enable(tabId);
        },
        onClicked: {
            addListener: function(fn) {
                if (chrome.action && chrome.action.onClicked) return chrome.action.onClicked.addListener(fn);
            },
            removeListener: function(fn) {
                if (chrome.action && chrome.action.onClicked) return chrome.action.onClicked.removeListener(fn);
            },
            hasListener: function(fn) {
                if (chrome.action && chrome.action.onClicked) return chrome.action.onClicked.hasListener(fn);
                return false;
            }
        }
    };
};

// Capture original chrome before any modifications
var _nativeChrome = chrome;
var _baMock = _makeBAMock();

// Create a Proxy that adds browserAction to the chrome object
// The polyfill uses Object.keys() and `in` operator to discover APIs
var _chromeProxy = new Proxy(_nativeChrome, {
    get: function(target, prop) {
        if (prop === "browserAction") {
            console.log("[SW] Proxy get: browserAction");
            return _baMock;
        }
        var val = target[prop];
        return val;
    },
    has: function(target, prop) {
        if (prop === "browserAction") return true;
        return prop in target;
    },
    ownKeys: function(target) {
        var keys = Object.getOwnPropertyNames(target);
        if (keys.indexOf("browserAction") === -1) {
            keys.push("browserAction");
        }
        return keys;
    },
    getOwnPropertyDescriptor: function(target, prop) {
        if (prop === "browserAction") {
            return { value: _baMock, writable: true, enumerable: true, configurable: true };
        }
        return Object.getOwnPropertyDescriptor(target, prop);
    }
});

// Replace the global chrome with our Proxy
try {
    Object.defineProperty(self, "chrome", {
        value: _chromeProxy,
        writable: true,
        configurable: true
    });
    console.log("[SW] Step 1b: chrome replaced with Proxy via defineProperty");
} catch(e) {
    console.log("[SW] Step 1b: defineProperty failed, using direct assignment:", e.message);
    self.chrome = _chromeProxy;
}

// Verify
console.log("[SW] Step 1b: chrome.browserAction exists:", typeof chrome.browserAction);
console.log("[SW] Step 1b: chrome.browserAction.setIcon:", typeof chrome.browserAction.setIcon);
console.log("[SW] Step 1b: 'browserAction' in chrome:", "browserAction" in chrome);
console.log("[SW] Step 1b: Object.keys(chrome) includes browserAction:", Object.keys(chrome).indexOf("browserAction") >= 0);

// === Step 2: Polyfill document ===
if (typeof document === "undefined") {
    function _makeAnchor() {
        var _href = "";
        var _parsed = { protocol: "", host: "", hostname: "", port: "", pathname: "/", search: "", hash: "" };
        function _parse() {
            try {
                var u = new URL(_href, "https://dummy.example.com");
                _parsed.protocol = u.protocol.replace(/:$/, "");
                _parsed.host = u.host;
                _parsed.hostname = u.hostname;
                _parsed.port = u.port;
                _parsed.pathname = u.pathname;
                _parsed.search = u.search;
                _parsed.hash = u.hash;
            } catch(e) {}
        }
        var el = {
            style: {},
            setAttribute: function(name, value) {
                if (name === "href") { _href = value; _parse(); }
            },
            getAttribute: function(name) {
                if (name === "href") return _href;
                return null;
            },
            onload: null, onerror: null,
            appendChild: function() {},
            removeChild: function() {},
            addEventListener: function() {},
            removeEventListener: function() {},
            querySelector: function() { return null; },
            querySelectorAll: function() { return []; },
            innerHTML: "", textContent: "",
            classList: { add: function() {}, remove: function() {}, contains: function() { return false; } }
        };
        Object.defineProperty(el, "href", {
            get: function() { return _href; },
            set: function(v) { _href = v; _parse(); }
        });
        Object.defineProperty(el, "protocol", {
            get: function() { return _parsed.protocol; }
        });
        Object.defineProperty(el, "host", {
            get: function() { return _parsed.host; }
        });
        Object.defineProperty(el, "hostname", {
            get: function() { return _parsed.hostname; }
        });
        Object.defineProperty(el, "port", {
            get: function() { return _parsed.port; }
        });
        Object.defineProperty(el, "pathname", {
            get: function() { return _parsed.pathname; }
        });
        Object.defineProperty(el, "search", {
            get: function() { return _parsed.search; }
        });
        Object.defineProperty(el, "hash", {
            get: function() { return _parsed.hash; }
        });
        return el;
    }
    var _doc = {
        createElement: function(tag) {
            if (tag === "a" || tag === "A" || tag === "area") {
                return _makeAnchor();
            }
            var el = {
                src: "", onload: null, onerror: null,
                style: {},
                setAttribute: function() {},
                getAttribute: function() { return null; },
                appendChild: function() {},
                removeChild: function() {},
                addEventListener: function() {},
                removeEventListener: function() {},
                querySelector: function() { return null; },
                querySelectorAll: function() { return []; },
                innerHTML: "", textContent: "",
                classList: { add: function() {}, remove: function() {}, contains: function() { return false; } }
            };
            return el;
        },
        createElementNS: function(ns, tag) { return this.createElement(tag); },
        createTextNode: function(text) { return { textContent: text }; },
        createDocumentFragment: function() {
            return { appendChild: function() {}, childNodes: [], innerHTML: "" };
        },
        head: { appendChild: function() {} },
        body: { appendChild: function() {}, style: {} },
        documentElement: { style: {} },
        addEventListener: function() {},
        removeEventListener: function() {},
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        getElementById: function() { return null; },
        getElementsByTagName: function() { return []; },
        readyState: "complete",
        cookie: "", URL: "", title: "",
        hidden: false, visibilityState: "visible",
        implementation: { createHTMLDocument: function() { return _doc; } }
    };
    self.document = _doc;
}

// === Step 3: Polyfill navigator ===
if (typeof navigator === "undefined") {
    self.navigator = {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        platform: "Win32",
        language: "en-US",
        languages: ["en-US", "en"],
        cookieEnabled: true,
        onLine: true,
        sendBeacon: function() { return false; }
    };
}

// === Step 4: Polyfill localStorage (uses chrome.storage under the hood) ===
if (typeof localStorage === "undefined") {
    var _store = {};
    self.localStorage = {
        getItem: function(key) { return _store.hasOwnProperty(key) ? _store[key] : null; },
        setItem: function(key, value) { _store[key] = String(value); },
        removeItem: function(key) { delete _store[key]; },
        clear: function() { _store = {}; },
        get length() { return Object.keys(_store).length; },
        key: function(i) { return Object.keys(_store)[i] || null; }
    };
}

// === Step 5: Polyfill sessionStorage ===
if (typeof sessionStorage === "undefined") {
    self.sessionStorage = self.localStorage;
}

// === Step 6: Polyfill XMLHttpRequest ===
if (typeof XMLHttpRequest === "undefined") {
    self.XMLHttpRequest = function() {
        this.readyState = 0;
        this.response = null;
        this.responseText = "";
        this.status = 0;
        this.statusText = "";
        this.responseURL = "";
        this.responseType = "";
        this._headers = {};
        this._method = "";
        this._url = "";
        this._async = true;
        this._timeout = 0;
        this._responseHeaders = {};
        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
        this.onloadend = null;
        this.onloadstart = null;
        this.onprogress = null;
        this.ontimeout = null;
    };
    self.XMLHttpRequest.prototype.open = function(method, url, async) {
        this._method = method;
        this._url = url;
        this._async = async !== false;
    };
    self.XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this._headers[name] = value;
    };
    self.XMLHttpRequest.prototype.getResponseHeader = function(name) {
        return this._responseHeaders[name.toLowerCase()] || null;
    };
    self.XMLHttpRequest.prototype.getAllResponseHeaders = function() {
        var pairs = [];
        for (var k in this._responseHeaders) {
            pairs.push(k + ": " + this._responseHeaders[k]);
        }
        return pairs.join("\r\n");
    };
    self.XMLHttpRequest.prototype.overrideMimeType = function() {};
    self.XMLHttpRequest.prototype.abort = function() { this._aborted = true; };
    self.XMLHttpRequest.prototype.send = function(body) {
        var xhr = this;
        // blob: URLs not supported in service worker fetch — fail gracefully
        if (this._url && this._url.indexOf("blob:") === 0) {
            console.log("[SW-XHR] blob URL not supported, aborting:", this._url.substring(0,60));
            setTimeout(function() { if (xhr.onerror) xhr.onerror(); }, 0);
            return;
        }
        var controller = new AbortController();
        var opts = { method: this._method, headers: this._headers, signal: controller.signal };
        if (body) opts.body = body;
        if (this._timeout > 0) {
            setTimeout(function() { controller.abort(); }, this._timeout);
        }
        fetch(this._url, opts).then(function(response) {
            xhr.status = response.status;
            xhr.statusText = response.statusText;
            xhr.responseURL = response.url;
            xhr._responseHeaders = {};
            response.headers.forEach(function(v, k) { xhr._responseHeaders[k] = v; });
            var readFn;
            if (xhr.responseType === "blob") readFn = function() { return response.blob(); };
            else if (xhr.responseType === "arraybuffer") readFn = function() { return response.arrayBuffer(); };
            else if (xhr.responseType === "json") readFn = function() { return response.json(); };
            else readFn = function() { return response.text(); };
            return readFn();
        }).then(function(data) {
            if (xhr.responseType === "" || xhr.responseType === "text") {
                xhr.responseText = data;
                xhr.response = data;
            } else {
                xhr.response = data;
            }
            xhr.readyState = 4;
            if (xhr.onreadystatechange) xhr.onreadystatechange();
            if (xhr.onload) xhr.onload();
            if (xhr.onloadend) xhr.onloadend();
        }).catch(function() {
            if (xhr.onerror) xhr.onerror();
        });
    };
    self.XMLHttpRequest.prototype.addEventListener = function() {};
    self.XMLHttpRequest.prototype.removeEventListener = function() {};
}

// === Step 7: Polyfill location ===
if (typeof location === "undefined") {
    self.location = {
        href: "chrome-extension://0/background.html",
        protocol: "chrome-extension:",
        host: "0", hostname: "0",
        pathname: "/background.html", search: "", hash: "",
        origin: "chrome-extension://0",
        reload: function() {},
        assign: function() {},
        replace: function() {},
        toString: function() { return this.href; }
    };
}

// === Step 8: Polyfill URL.createObjectURL ===
// In service workers, URL.createObjectURL may not exist — use real one if available, otherwise skip
if (typeof URL !== "undefined" && !URL.createObjectURL) {
    console.log("[SW] URL.createObjectURL not available, downloads will use direct URL");
    URL.createObjectURL = function(blob) { return null; };
    URL.revokeObjectURL = function() {};
}

// === Step 9: Polyfill Image ===
if (typeof Image === "undefined") {
    self.Image = function() { this.onload = null; this.onerror = null; this.src = ""; };
}

// === Step 10: Polyfill alert/confirm/prompt ===
if (typeof alert === "undefined") self.alert = function() {};
if (typeof confirm === "undefined") self.confirm = function() { return true; };
if (typeof prompt === "undefined") self.prompt = function() { return ""; };

// === Step 11: Polyfill matchMedia ===
if (typeof matchMedia === "undefined") {
    self.matchMedia = function() { return { matches: false, addListener: function() {}, removeListener: function() {} }; };
}

// === Step 12: Polyfill getComputedStyle ===
if (typeof getComputedStyle === "undefined") {
    self.getComputedStyle = function() { return {}; };
}

// === Step 13: Polyfill requestAnimationFrame ===
if (typeof requestAnimationFrame === "undefined") {
    self.requestAnimationFrame = function(cb) { return setTimeout(cb, 16); };
    self.cancelAnimationFrame = function(id) { clearTimeout(id); };
}

// === Step 14: Fix base64 encode/decode ===
// btoa and atob exist in service workers, but ensure escape/unescape exist
if (typeof escape === "undefined") {
    self.escape = function(s) {
        return String(s).replace(/[^\w*+./-]/g, function(c) {
            return "%X".replace("X", c.charCodeAt(0).toString(16).toUpperCase());
        });
    };
}
if (typeof unescape === "undefined") {
    self.unescape = function(s) {
        return decodeURIComponent(String(s).replace(/%(?=[\da-f]{2})/gi, "%"));
    };
}

// === Intercept: Capture and neutralize CrossPilot's message handler ===
// The CrossPilot engine registers a chrome.runtime.onMessage listener that returns null
// when t.extension===null (engine not initialized). That null response beats our async response.
// We capture the engine's listener and remove it after import.
var _capturedCPListeners = [];
var _origAddListener = chrome.runtime.onMessage.addListener;
var _origHasListener = chrome.runtime.onMessage.hasListener;
chrome.runtime.onMessage.addListener = function(fn) {
    // Check if this looks like CrossPilot's dispatcher (contains its message key)
    var src = "";
    try { src = fn.toString(); } catch(e) {}
    if (src.indexOf("__CROSSPILOT_MESSAGE__") >= 0 || src.indexOf("sandbox-content-scripts-data") >= 0 || src.indexOf("messageRecipient") >= 0) {
        console.log("[SW] Intercepted CrossPilot onMessage listener, neutralizing");
        // Wrap it to never call sendResponse (return without responding)
        var wrapped = function(message, sender, sendResponse) {
            // Only handle non-sandbox messages; for sandbox-content-scripts-data, do nothing so our handler can respond
            if (message && message.action === "sandbox-content-scripts-data") {
                return false; // Don't call sendResponse, let our handler do it
            }
            try { return fn(message, sender, sendResponse); } catch(e) { return false; }
        };
        _capturedCPListeners.push({orig: fn, wrapped: wrapped});
        return _origAddListener.call(this, wrapped);
    }
    _capturedCPListeners.push({orig: fn, wrapped: fn});
    return _origAddListener.call(this, fn);
};

// === Load the original background script ===
try {
    importScripts("background.js");
    console.log("[SW] Background script loaded successfully");
    
    // Check if CrossPilot engine loaded
    if (typeof window.engine !== "undefined") {
        console.log("[SW] CrossPilot engine detected: engine=" + typeof window.engine);
        console.log("[SW] Engine methods:", Object.keys(window.engine).join(", "));
    } else {
        console.log("[SW] WARNING: CrossPilot engine NOT found after background.js load");
    }
} catch (e) {
    console.error("[SW] Failed to load background script:", e.message || e);
}
// Patch browser polyfill to prevent setIcon crash (MV2->MV3)
try {
    if (typeof browser !== "undefined" && !browser.browserAction) {
        browser.browserAction = chrome.browserAction;
        console.log("[SW] Patched global browser.browserAction");
    }
    if (typeof self.browser !== "undefined" && !self.browser.browserAction) {
        self.browser.browserAction = chrome.browserAction;
    }
    // Suppress unhandled setIcon errors
    self.addEventListener("unhandledrejection", function(e) {
        var msg = e.reason && e.reason.message ? e.reason.message : "";
        if (msg.indexOf("setIcon") >= 0 || msg.indexOf("path or imageData") >= 0 || msg.indexOf("imageData") >= 0) {
            console.log("[SW] Suppressed setIcon unhandledrejection:", msg);
            e.preventDefault();
        }
    });
    // Also suppress uncaught errors for setIcon
    self.addEventListener("error", function(e) {
        var msg = e.message || "";
        if (msg.indexOf("path or imageData") >= 0 || msg.indexOf("setIcon") >= 0) {
            console.log("[SW] Suppressed setIcon error:", msg);
            e.preventDefault();
        }
    });
} catch(e) { console.log("[SW] patch browserAction failed:", e.message); }
// Restore original addListener for our own handler
chrome.runtime.onMessage.addListener = _origAddListener;

// === Step 15: Diagnose chrome.storage.local contents ===
chrome.storage.local.get(null, function(items) {
    var keys = Object.keys(items);
    console.log("[SW] Storage keys (" + keys.length + "): " + keys.join(", "));
    // Check for CrossPilot file storage
    if (items["__APP_FILES__"]) {
        var fileKeys = Object.keys(items["__APP_FILES__"]);
        console.log("[SW] __APP_FILES__ keys: " + fileKeys.join(", "));
        fileKeys.forEach(function(k) {
            var val = items["__APP_FILES__"][k];
            console.log("[SW]   " + k + ": type=" + typeof val + ", len=" + (typeof val === "string" ? val.length : "N/A"));
        });
    }
    if (items["__APP_DATA__"]) {
        var dataKeys = Object.keys(items["__APP_DATA__"]);
        console.log("[SW] __APP_DATA__ keys: " + dataKeys.join(", "));
    }
    if (items["__API_SCHEMA__"]) {
        var schemaKeys = Object.keys(items["__API_SCHEMA__"]);
        console.log("[SW] __API_SCHEMA__ keys: " + schemaKeys.join(", "));
    }
});

// === Messaging: Intercept CrossPilot messages and respond directly ===
// The engine never initializes due to polyfill issues, so we handle messages ourselves
(function() {
    var msgCount = 0;
    var _cachedExtension = null;
    
    function decodeFile(content) {
        if (!content) return "";
        if (content.indexOf("data:") === 0) {
            var comma = content.indexOf(",");
            if (comma >= 0) {
                var b64 = content.substring(comma + 1);
                try { return atob(b64); } catch(e) { return content; }
            }
        }
        return content;
    }
    function getFile(files, key) {
        return decodeFile(files[key] || "");
    }
    function buildExtension(storage) {
        if (_cachedExtension) return _cachedExtension;
        
        var files = storage["__APP_FILES__"] || {};
        var rawManifest = getFile(files, "manifest.json");
        var manifest;
        try { manifest = JSON.parse(rawManifest || "{}"); } catch(e) { manifest = {}; console.log("[SW] manifest parse error: " + e.message); }
        console.log("[SW] manifest keys: " + Object.keys(manifest).join(", "));
        console.log("[SW] manifest content_scripts: " + JSON.stringify(manifest.content_scripts || null).substring(0, 1000));
        console.log("[SW] manifest.json raw start: " + rawManifest.substring(0, 600));
        
        var appUrl = "chrome-extension://" + chrome.runtime.id;
        
        // Build webAccessibleResources from manifest
        var webAccessibleResources = {};
        if (manifest.web_accessible_resources) {
            manifest.web_accessible_resources.forEach(function(resource) {
                webAccessibleResources[resource] = appUrl + "/" + resource;
            });
        }
        // Also add common resources
        ["html/sandbox.html", "html/options.html", "html/popup.html", "js/popup.js", "js/options.js"].forEach(function(r) {
            if (!webAccessibleResources[r]) webAccessibleResources[r] = appUrl + "/" + r;
        });
        
        // Build locale from _locales/en/messages.json
        var locale = null;
        var rawLocale = getFile(files, "_locales/en/messages.json");
        if (rawLocale) {
            try { locale = JSON.parse(rawLocale); } catch(e) { console.log("[SW] locale parse error: " + e.message); }
        }
        
        // Build matchList from manifest content_scripts — exact CrossPilot conversion
        function patternToRegex(pattern, handleQuestion) {
            if (pattern === "<all_urls>") return "^https?|file|ftp://.+$";
            var r = ["^"];
            for (var i = 0; i < pattern.length; i++) {
                var n = pattern[i];
                if (handleQuestion && n === "?") {
                    r.push(".");
                } else if (n === "*") {
                    if (pattern.substr(i + 1, 3) === "://") {
                        r.push("[^/]+");
                    } else {
                        r.push(".+");
                    }
                } else if (n === "/") {
                    r.push("\\/");
                } else if (n === ".") {
                    if (r.slice(-1)[0] === ".+") {
                        r.splice(-1);
                        r.push("(:?[^/]+\\.|)");
                    } else {
                        r.push("\\.");
                    }
                } else {
                    r.push(n);
                }
            }
            if (r.slice(-2).toString() === "\\/,.+") {
                r.splice(-2);
                r.push(".*");
            }
            r.push("$");
            return r.join("");
        }
        var matchList = [];
        var matchUrlPatterns = [];
        var matchFrameUrlPatterns = [];
        
        if (manifest.content_scripts) {
            manifest.content_scripts.forEach(function(cs) {
                var entry = {};
                entry.frame = !!cs.all_frames;
                var hasMatches = false;
                ["include_globs", "exclude_globs", "matches", "exclude_matches"].forEach(function(key, idx) {
                    if (cs[key] && cs[key].length) {
                        var parts = [];
                        cs[key].forEach(function(pat) {
                            parts.push(patternToRegex(pat, idx < 2));
                        });
                        entry[key] = parts.join("|");
                        if (key === "matches" && parts.length) hasMatches = true;
                    }
                });
                if (!entry.matches || !entry.matches.length) return;
                if (entry.frame) matchFrameUrlPatterns.push(entry.matches);
                matchUrlPatterns.push(entry.matches);
                try { entry.matches = new RegExp(entry.matches); } catch(e) { console.log("[SW] bad matches regex: " + e.message); entry.matches = new RegExp("^$"); }
                if (entry.exclude_matches) try { entry.exclude_matches = new RegExp(entry.exclude_matches); } catch(e) { entry.exclude_matches = null; }
                if (entry.include_globs) try { entry.include_globs = new RegExp(entry.include_globs); } catch(e) { entry.include_globs = null; }
                if (entry.exclude_globs) try { entry.exclude_globs = new RegExp(entry.exclude_globs); } catch(e) { entry.exclude_globs = null; }
                
                // Concatenate JS files
                var jsParts = [];
                if (cs.js) {
                    cs.js.forEach(function(jsFile) {
                        var c = getFile(files, jsFile);
                        if (c) jsParts.push(c);
                    });
                }
                if (jsParts.length) entry.js = jsParts.join("\n");
                else entry.js = "";
                
                // Concatenate CSS files
                var cssParts = [];
                if (cs.css) {
                    cs.css.forEach(function(cssFile) {
                        var c = getFile(files, cssFile);
                        if (c) cssParts.push(c);
                    });
                }
                if (cssParts.length) entry.css = cssParts.join("\n");
                else entry.css = "";
                
                matchList.push(entry);
            });
        }
        
        var matchUrl = matchUrlPatterns.length ? new RegExp(matchUrlPatterns.join("|")) : null;
        var matchFrameUrl = matchFrameUrlPatterns.length ? new RegExp(matchFrameUrlPatterns.join("|")) : null;
        
        _cachedExtension = {
            appId: chrome.runtime.id,
            matchUrl: matchUrl,
            matchFrameUrl: matchFrameUrl,
            matchList: matchList,
            appUrl: appUrl,
            locale: locale,
            webAccessibleResources: webAccessibleResources
        };
        
        console.log("[SW] Extension built: matchList=" + matchList.length + " entries");
        matchList.forEach(function(entry, i) {
            console.log("[SW]   Entry " + i + ": js=" + (entry.js ? entry.js.length : 0) + " chars, css=" + (entry.css ? entry.css.length : 0) + " chars, frame=" + entry.frame);
        });
        
        return _cachedExtension;
    }
    
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        msgCount++;
        var senderInfo = sender.tab ? "tab:" + sender.tab.url : "extension";
        console.log("[SW-MSG #" + msgCount + "] FROM=" + senderInfo + " action=" + (message && message.action));
        
        // Handle direct download from direct.js (bypasses CrossPilot) — direct URL only
        if (message && message.messageRecipient === "__SC_DIRECT__" && message.action === "download") {
            console.log("[SW-DL] download request url=" + (message.url||"").substring(0,120) + " filename=" + message.filename);
            try {
                let fn = (message.filename || "soundcloud-track.mp3").replace(/!/g, "").replace(/[\\/:*?"<>|]/g, "_");
                if (!fn.toLowerCase().endsWith(".mp3")) fn += ".mp3";
                fn = fn.substring(0,180);
                console.log("[SW-DL] sanitized filename=" + fn + " orig=" + message.filename);
                // Direct download — content script already handles blob+ID3, this is fallback only
                chrome.downloads.download({url: message.url, filename: fn, conflictAction: "uniquify"}, function(downloadId) {
                    if (chrome.runtime.lastError) {
                        console.log("[SW-DL] download failed:", chrome.runtime.lastError.message);
                        sendResponse({success:false, error: chrome.runtime.lastError.message});
                    } else {
                        console.log("[SW-DL] download started id=" + downloadId + " filename=" + fn);
                        sendResponse({success:true, downloadId: downloadId});
                    }
                });
            } catch(e) {
                console.log("[SW-DL] exception:", e.message);
                sendResponse({success:false, error: e.message});
            }
            return true;
        }
        // Handle sandbox-content-scripts-data - return null to disable old CrossPilot inject (now handled by direct.js)
        if (message && message.messageRecipient === "__CROSSPILOT_MESSAGE__" && message.action === "sandbox-content-scripts-data") {
            console.log("[SW-MSG #" + msgCount + "] sandbox-content-scripts-data disabled, returning null (direct.js handles UI)");
            // Return null so old content script does nothing (it checks if null===e return)
            sendResponse(null);
            return false;
        }
    });
    console.log("[SW] Message handler initialized (direct download + sandbox disabled)");
})();
