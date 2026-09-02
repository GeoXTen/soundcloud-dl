// Diagnostic content script - runs before sandbox-content.js
// Logs all chrome.runtime.sendMessage calls to trace messaging pipeline

(function() {
    console.log("[DIAG-CS] Diagnostic content script loaded at", window.location.href);
    
    // Track when this content script loads
    var loadTime = Date.now();
    
    // Monitor chrome.runtime.sendMessage
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        var origSendMessage = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = function() {
            var args = Array.prototype.slice.call(arguments);
            var message = args[0];
            var msgPreview = "";
            
            if (message && typeof message === "object") {
                msgPreview = JSON.stringify({
                    recipient: message.messageRecipient || "none",
                    action: message.action || "none",
                    keys: Object.keys(message).slice(0, 10)
                });
            } else {
                msgPreview = String(message);
            }
            
            console.log("[DIAG-CS] sendMessage called:", msgPreview);
            console.log("[DIAG-CS] Time since load:", (Date.now() - loadTime) + "ms");
            console.log("[DIAG-CS] Args count:", args.length);
            if (args.length >= 2 && typeof args[args.length-1] === 'function') {
                var origCb = args[args.length-1];
                args[args.length-1] = function(response) {
                    console.log("[DIAG-CS] sendMessage response:", response === null ? "null" : (response && response.data ? "data.js=" + (response.data.js?response.data.js.length:0) + " css=" + (response.data.css?response.data.css.length:0) : JSON.stringify(response).substring(0,500)));
                    try { return origCb.apply(this, arguments); } catch(e) { console.log("[DIAG-CS] callback error: " + e.message); }
                };
            } else {
                // Promise-based
                var result = origSendMessage.apply(this, args);
                if (result && typeof result.then === 'function') {
                    result.then(function(response) {
                        console.log("[DIAG-CS] sendMessage promise resolved:", response === null ? "null" : (response && response.data ? "data.js=" + (response.data.js?response.data.js.length:0) + " css=" + (response.data.css?response.data.css.length:0) : JSON.stringify(response).substring(0,500)));
                    }, function(err) {
                        console.log("[DIAG-CS] sendMessage promise rejected:", err);
                    });
                    return result;
                }
                console.log("[DIAG-CS] sendMessage non-promise result:", result);
                return result;
            }
            
            // Call original with all arguments as-is
            return origSendMessage.apply(this, args);
        };
        console.log("[DIAG-CS] sendMessage monitoring active");
    } else {
        console.log("[DIAG-CS] WARNING: chrome.runtime.sendMessage not available");
    }
    
    // Monitor when sandbox-content.js sets its attribute
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === "attributes" && mutation.attributeName === "crosspilot-121") {
                console.log("[DIAG-CS] CrossPilot attribute detected on", document.documentElement.tagName);
                console.log("[DIAG-CS] Time since load:", (Date.now() - loadTime) + "ms");
            }
        });
    });
    
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["crosspilot-121"]
    });
    
    console.log("[DIAG-CS] MutationObserver attached");
})();
