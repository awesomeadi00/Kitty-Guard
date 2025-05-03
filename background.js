console.log("Kitty Guard background service worker started!");

// --- Fingerprint Protection Injection ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http') || tab.url.startsWith('file'))) {
        const result = await chrome.storage.local.get('fingerprintProtectionEnabled');
        const isEnabled = result.fingerprintProtectionEnabled || false;

        if (isEnabled) {
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tabId, allFrames: true },
                    world: 'MAIN',
                    func: overrideCanvasFunctions
                });
                console.log(`Injected canvas override into tab ${tabId}`);
            } catch (e) {
                if (!e.message.includes("Cannot access") && !e.message.includes("No tab with id")) {
                    console.warn(`Canvas override injection failed on tab ${tabId}:`, e);
                }
            }
        }
    }
});

// This function is injected directly into the webpage context (MAIN world)
function overrideCanvasFunctions() {
    if (window.__canvasFingerprintOverrideApplied__) return;
    window.__canvasFingerprintOverrideApplied__ = true;

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

    HTMLCanvasElement.prototype.toDataURL = function () {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.width;
        tempCanvas.height = this.height;
        const ctx = tempCanvas.getContext('2d');

        try {
            ctx.drawImage(this, 0, 0);
        } catch (e) {
            return originalToDataURL.apply(this, arguments); // Fallback if canvas is tainted
        }

        try {
            const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                if (Math.random() < 0.05) {
                    data[i] ^= Math.floor(Math.random() * 5);     // R
                    data[i + 1] ^= Math.floor(Math.random() * 5); // G
                    data[i + 2] ^= Math.floor(Math.random() * 5); // B
                }
            }

            ctx.putImageData(imageData, 0, 0);
        } catch (e) {
            console.warn('Error adding canvas noise:', e);
        }

        // ✅ Safe: call the original function
        return originalToDataURL.call(tempCanvas);
    };

    console.log("[Kitty Guard] Canvas fingerprint override applied in page context.");
}


// List of tracker domains we're blocking (for display in the UI)
const trackerDomains = [
    "google-analytics.com",
    "analytics.google.com",
    "googletagmanager.com",
    "tagmanager.google.com",
    "doubleclick.net",
    "2mdn.net",
    "googlesyndication.com",
    "googleadservices.com",
    "connect.facebook.net",
    "facebook.com/tr",
    "platform.twitter.com",
    "analytics.twitter.com",
    "static.ads-twitter.com",
    "platform.linkedin.com",
    "ads.linkedin.com",
    "adnxs.com",
    "rubiconproject.com",
    "pubmatic.com",
    "casalemedia.com",
    "smartadserver.com",
    "criteo.com",
    "criteo.net",
    "taboola.com",
    "outbrain.com",
    "advertising.com",
    "amazon-adsystem.com",
    "openx.net",
    "scorecardresearch.com",
    "quantserve.com",
    "quantcount.com",
    "chartbeat.com",
    "hotjar.com",
    "clicktale.net",
    "mousestats.com",
    "krxd.net",
    "bluekai.com",
    "rlcdn.com",
    "exelator.com",
    "demdex.net",
    "adsrvr.org",
    "adroll.com",
    "mathtag.com",
    "mediamath.com",
    "moatads.com",
    "adform.net",
    "flashtalking.com",
    "mookie1.com",
    "agkn.com",
    "everesttech.net",
    "pardot.com",
    "marketo.com",
    "bizible.com",
    "inspectlet.com",
    "mouseflow.com",
    "crazyegg.com",
    "segment.com",
    "segment.io",
    "mixpanel.com",
    "amplitude.com",
    "kissmetrics.com",
    "adition.com",
    "adtech.de",
    "yieldlab.net",
    "sharethis.com",
    "addthis.com",
    "statcounter.com"
];

// Maps to store tracker counts per tab
let tabBlockCounts = new Map(); // Tracks counts per tab
let recentlyBlockedTrackers = []; // Tracks the most recently blocked trackers
let fingerprintDetectionMap = new Map(); // Tracks fingerprinting detection per tab
let allTrackerDomains = []; // Stores all tracker domains for visualization

// Initialize default settings
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({
        trackerBlockingEnabled: true,
        fingerprintProtectionEnabled: true,
        fingerprintDomains: {},
        allTrackers: []
    });

    console.log('Kitty Guard installed! Meow! Ready to protect your privacy!');

    // Initialize tracker blocking
    updateRulesetState(true);
});

// Consolidated message listener for all incoming messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateTrackerBlocking') {
        updateRulesetState(message.enabled);
        sendResponse({});
    }
    else if (message.action === 'updateFingerprintProtection') {
        chrome.storage.local.set({ fingerprintProtectionEnabled: message.enabled });
        sendResponse({});
    }
    else if (message.action === 'getTabBlockCount') {
        // Send the count for the specified tab
        const tabId = message.tabId;
        const count = tabBlockCounts.get(tabId) || 0;
        const trackers = recentlyBlockedTrackers
            .filter(t => t.tabId === tabId)
            .slice(0, 4); // Get the 4 most recent trackers for this tab

        sendResponse({
            count: count,
            trackers: trackers
        });
    }
    else if (message.action === 'fingerprintDetected') {
        // Handle fingerprint detection
        handleFingerprintDetection(message, sender);
        sendResponse({});
    }
    else if (message.action === 'checkFingerprintDetection') {
        // Check if fingerprinting was detected for a specific tab
        const tabId = message.tabId;
        const detectionInfo = fingerprintDetectionMap.get(tabId);

        sendResponse({
            detected: !!detectionInfo,
            domain: detectionInfo ? detectionInfo.domain : null,
            method: detectionInfo ? detectionInfo.method : null
        });
    }

    // Return true to indicate we'll respond asynchronously
    return true;
});

// Function to handle fingerprint detection
function handleFingerprintDetection(message, sender) {
    console.log('Fingerprint detection reported:', message);

    // Get information about the detection
    const method = message.method || 'unknown';
    const domain = message.domain || (sender.tab ? extractDomain(sender.tab.url) : 'unknown');
    const tabId = sender.tab ? sender.tab.id : -1;

    console.log(`Fingerprinting detected (${method}) on ${domain}, tab ${tabId}`);

    // Store detection for this tab
    if (tabId > 0) {
        fingerprintDetectionMap.set(tabId, {
            method: method,
            domain: domain,
            timestamp: Date.now()
        });
    }

    // Store detection for this domain in persistent storage
    chrome.storage.local.get(['fingerprintDomains'], function (result) {
        const fingerprintDomains = result.fingerprintDomains || {};

        // Update the domain record
        fingerprintDomains[domain] = {
            method: method,
            lastDetected: Date.now()
        };

        // Save back to storage
        chrome.storage.local.set({
            fingerprintDomains: fingerprintDomains
        });

        // Notify the popup if it's open
        try {
            chrome.runtime.sendMessage({
                action: 'fingerprintDetected',
                tabId: tabId,
                method: method,
                domain: domain
            }, function (response) {
                if (chrome.runtime.lastError) {
                    // Popup might not be open, ignore the error
                }
            });
        } catch (error) {
            // Popup might not be open, ignore the error
            console.error('Error notifying popup:', error);
        }
    });
}

// Extract domain from URL
function extractDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return url;
    }
}

// Function to enable/disable the ruleset
function updateRulesetState(isEnabled) {
    chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: isEnabled ? [] : ['ruleset_1'],
        enableRulesetIds: isEnabled ? ['ruleset_1'] : []
    });

    console.log(`Tracker blocking ${isEnabled ? 'enabled' : 'disabled'}`);
}

// Function to check if a URL matches any known tracker domain
function isTrackerUrl(url) {
    try {
        const hostname = new URL(url).hostname;
        return trackerDomains.some(domain => hostname.includes(domain));
    } catch (e) {
        return false;
    }
}

// Function to update the allTrackers list for visualization
function updateAllTrackers(domain) {
    chrome.storage.local.get(['allTrackers'], function (result) {
        let allTrackers = result.allTrackers || [];

        // Add the new tracker domain
        allTrackers.push(domain);

        // Limit the size to prevent excessive storage usage (keep last 1000)
        if (allTrackers.length > 1000) {
            allTrackers = allTrackers.slice(-1000);
        }

        // Save back to storage
        chrome.storage.local.set({ allTrackers: allTrackers });
    });
}

// Listen for rule matches with declarativeNetRequest API
if (chrome.declarativeNetRequest && chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
        (info) => {
            // Extract the tab ID and request details
            const tabId = info.request.tabId;
            const requestUrl = info.request.url;

            // If this is a valid tab (not a background request)
            if (tabId > 0) {
                // Increment the count for this tab
                const currentCount = tabBlockCounts.get(tabId) || 0;
                tabBlockCounts.set(tabId, currentCount + 1);

                // Extract the domain from the URL
                let domain = '';
                try {
                    domain = new URL(requestUrl).hostname;
                } catch (e) {
                    // If URL parsing fails, try to extract domain manually
                    const domainMatch = requestUrl.match(/^(?:https?:\/\/)?([^\/]+)/i);
                    domain = domainMatch ? domainMatch[1] : requestUrl;
                }

                // Add to recently blocked trackers
                recentlyBlockedTrackers.unshift({
                    domain: domain,
                    timestamp: new Date().getTime(),
                    tabId: tabId
                });

                // Keep only the 10 most recent trackers
                if (recentlyBlockedTrackers.length > 10) {
                    recentlyBlockedTrackers = recentlyBlockedTrackers.slice(0, 10);
                }

                // Update the allTrackers list for visualization
                updateAllTrackers(domain);

                // Notify the popup if it's open
                try {
                    chrome.runtime.sendMessage({
                        action: 'updateBlockedTrackers',
                        tabId: tabId,
                        count: tabBlockCounts.get(tabId) || 0,
                        trackers: recentlyBlockedTrackers.filter(t => t.tabId === tabId).slice(0, 4)
                    }, function (response) {
                        if (chrome.runtime.lastError) {
                            // Popup might not be open, ignore the error
                        }
                    });
                } catch (error) {
                    // Popup might not be open, ignore the error
                }
            }
        }
    );
}
// Fallback approach: use webRequest for monitoring (but not blocking)
else if (chrome.webRequest) {
    chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
            // Check if this request is to a tracker domain
            if (isTrackerUrl(details.url)) {
                const tabId = details.tabId;

                // Only count requests from actual tabs (not background)
                if (tabId > 0) {
                    // Increment the count for this tab
                    const currentCount = tabBlockCounts.get(tabId) || 0;
                    tabBlockCounts.set(tabId, currentCount + 1);

                    // Extract the domain from the URL
                    let domain = '';
                    try {
                        domain = new URL(details.url).hostname;
                    } catch (e) {
                        const domainMatch = details.url.match(/^(?:https?:\/\/)?([^\/]+)/i);
                        domain = domainMatch ? domainMatch[1] : details.url;
                    }

                    // Add to recently blocked trackers
                    recentlyBlockedTrackers.unshift({
                        domain: domain,
                        timestamp: new Date().getTime(),
                        tabId: tabId
                    });

                    // Keep only the 10 most recent trackers
                    if (recentlyBlockedTrackers.length > 10) {
                        recentlyBlockedTrackers = recentlyBlockedTrackers.slice(0, 10);
                    }

                    // Update the allTrackers list for visualization
                    updateAllTrackers(domain);

                    // Notify the popup if it's open
                    try {
                        chrome.runtime.sendMessage({
                            action: 'updateBlockedTrackers',
                            tabId: tabId,
                            count: tabBlockCounts.get(tabId) || 0,
                            trackers: recentlyBlockedTrackers.filter(t => t.tabId === tabId).slice(0, 4)
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                // Popup might not be open, ignore the error
                            }
                        });
                    } catch (error) {
                        // Popup might not be open, ignore the error
                    }
                }
            }

            // This listener is only for monitoring, not blocking
            return { cancel: false };
        },
        { urls: ["<all_urls>"] }
    );
}

// Listen for tab updates to reset the page counter when navigating to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading') {
        // Reset the page-specific blocked count when navigating to a new page
        tabBlockCounts.set(tabId, 0);

        // Remove old records for this tab from the recently blocked list
        recentlyBlockedTrackers = recentlyBlockedTrackers.filter(t => t.tabId !== tabId);

        // Reset fingerprint detection for this tab
        fingerprintDetectionMap.delete(tabId);
    }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
    // Remove the tab's count
    tabBlockCounts.delete(tabId);

    // Remove the tab's entries from recently blocked trackers
    recentlyBlockedTrackers = recentlyBlockedTrackers.filter(t => t.tabId !== tabId);

    // Remove fingerprint detection for this tab
    fingerprintDetectionMap.delete(tabId);
});