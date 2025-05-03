(function () {
    chrome.storage.local.get(['fingerprintProtectionEnabled'], function (result) {
        if (result.fingerprintProtectionEnabled) {
            // This just sends a detection notice to background/popup
            chrome.runtime.sendMessage({
                action: 'fingerprintDetected',
                method: 'canvas',
                domain: window.location.hostname,
                url: window.location.href
            });
        }
    });
})();
