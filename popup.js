document.addEventListener('DOMContentLoaded', function () {
    const trackerToggle = document.getElementById('tracker-toggle');
    const fingerprintToggle = document.getElementById('fingerprint-toggle');
    const trackerCountElement = document.getElementById('tracker-count');
    const trackerListElement = document.getElementById('tracker-list');
    const trackerSummaryElement = document.getElementById('tracker-summary');
    const trackerViewsElement = document.getElementById('tracker-views');
    const navDots = document.querySelectorAll('.nav-dot');
    const kittyGifElement = document.getElementById('kitty-gif');
    const fingerprintAlertElement = document.getElementById('fingerprint-alert');
    const fingerprintDomainElement = document.getElementById('fingerprint-domain');

    // Variable to store current page trackers for visualization
    let currentPageTrackers = [];

    // Fix for GIF looping - force reload the GIF to make it loop continuously
    if (kittyGifElement) {
        // Store the original src
        const originalSrc = kittyGifElement.src;

        // Function to reload the GIF
        function reloadGif() {
            kittyGifElement.src = '';
            setTimeout(() => {
                kittyGifElement.src = originalSrc + '?t=' + new Date().getTime();
            }, 50);
        }

        // Reload initially
        reloadGif();

        // Set up a periodic reload to ensure continuous looping
        setInterval(reloadGif, 10000); // Reload every 10 seconds
    }

    // Load saved settings and tracking data
    chrome.storage.local.get(
        ['trackerBlockingEnabled', 'fingerprintProtectionEnabled', 'fingerprintDomains'],
        function (result) {
            // Update tracker toggle
            trackerToggle.checked = result.trackerBlockingEnabled !== false;

            // Update fingerprint toggle
            fingerprintToggle.checked = result.fingerprintProtectionEnabled !== false;

            // Check the current tab to see if fingerprinting was detected on this domain
            getCurrentTab().then(tab => {
                if (tab && tab.url) {
                    try {
                        const domain = new URL(tab.url).hostname;

                        // Check if fingerprinting was detected for this domain
                        const fingerprintDomains = result.fingerprintDomains || {};

                        if (fingerprintDomains[domain]) {
                            // Always show the alert when fingerprinting is detected
                            showFingerprintAlert(domain, fingerprintToggle.checked);
                        }

                        // Get tracker counts for the current tab
                        requestTabData(tab.id);
                    } catch (e) {
                        console.error("Error processing tab URL:", e);
                    }
                }
            });
        });

    // Function to get the current active tab
    async function getCurrentTab() {
        let queryOptions = { active: true, currentWindow: true };
        let [tab] = await chrome.tabs.query(queryOptions);
        return tab;
    }

    // Function to show the fingerprint alert with domain
    function showFingerprintAlert(domain, isProtectionEnabled) {
        if (!domain) domain = 'this site';

        // Update the alert text
        if (fingerprintDomainElement) {
            fingerprintDomainElement.textContent = domain;
        }

        // Show the alert
        if (fingerprintAlertElement) {
            fingerprintAlertElement.style.display = 'block';

            // Get or create the protection status message element
            let statusElement = document.getElementById('protection-status');
            if (!statusElement) {
                statusElement = document.createElement('div');
                statusElement.id = 'protection-status';
                statusElement.style.marginTop = '8px';
                statusElement.style.fontWeight = 'bold';
                fingerprintAlertElement.appendChild(statusElement);
            }

            // Update status message based on protection state
            if (isProtectionEnabled) {
                statusElement.textContent = "Values randomized, fingerprint protected.";
                statusElement.style.color = "#4CAF50"; // Green color for protection enabled
            } else {
                statusElement.textContent = "Recommend enabling fingerprint protection.";
                statusElement.style.color = "#FF5722"; // Orange/red color for warning
            }
        }

        // Animate the kitty to react to the detection
        if (kittyGifElement) {
            kittyGifElement.style.transition = 'transform 0.5s ease-in-out';
            kittyGifElement.style.transform = 'rotate(-10deg)';

            setTimeout(() => {
                kittyGifElement.style.transform = 'rotate(10deg)';

                setTimeout(() => {
                    kittyGifElement.style.transform = 'rotate(0deg)';
                }, 300);
            }, 300);
        }
    }

    // Function to request tracker data for a specific tab
    function requestTabData(tabId) {
        chrome.runtime.sendMessage(
            {
                action: 'getTabBlockCount',
                tabId: tabId
            },
            function (response) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }

                if (response) {
                    // Update the counter
                    trackerCountElement.textContent = response.count || 0;

                    // Update current page trackers
                    currentPageTrackers = response.trackers || [];

                    // Update the tracker list
                    if (currentPageTrackers.length > 0) {
                        displayTrackers(currentPageTrackers);
                        generateTrackerSummary(currentPageTrackers);
                    } else {
                        displayPlaceholder();
                        displaySummaryPlaceholder();
                    }
                }
            }
        );
    }

    // Handle tracker toggle changes
    trackerToggle.addEventListener('change', function () {
        const isEnabled = trackerToggle.checked;

        chrome.storage.local.set({ trackerBlockingEnabled: isEnabled });

        // Communicate with the background script
        chrome.runtime.sendMessage({
            action: 'updateTrackerBlocking',
            enabled: isEnabled
        });

        // Animate the kitty when toggled
        if (kittyGifElement) {
            kittyGifElement.style.transition = 'transform 0.3s ease-in-out';
            kittyGifElement.style.transform = 'scale(1.2)';

            setTimeout(() => {
                kittyGifElement.style.transform = 'scale(1)';
            }, 300);
        }
    });

    // Handle fingerprint toggle changes
    fingerprintToggle.addEventListener('change', function () {
        const isEnabled = fingerprintToggle.checked;

        chrome.storage.local.set({ fingerprintProtectionEnabled: isEnabled });

        // Update fingerprint alert status based on the toggle state
        getCurrentTab().then(tab => {
            if (tab && tab.url) {
                try {
                    const domain = new URL(tab.url).hostname;

                    chrome.storage.local.get(['fingerprintDomains'], function (result) {
                        const fingerprintDomains = result.fingerprintDomains || {};

                        if (fingerprintDomains[domain]) {
                            // Update the existing alert with the new protection status
                            showFingerprintAlert(domain, isEnabled);
                        }
                    });
                } catch (e) {
                    console.error("Error checking fingerprint detection:", e);
                }
            }
        });

        // Communicate with the background script
        chrome.runtime.sendMessage({
            action: 'updateFingerprintProtection',
            enabled: isEnabled
        });

        // Immediately trigger detection after enabling protection
        if (isEnabled) {
            getCurrentTab().then(tab => {
                if (tab && tab.id) {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            chrome.runtime.sendMessage({
                                action: 'fingerprintDetected',
                                method: 'canvas',
                                domain: window.location.hostname,
                                url: window.location.href
                            });
                        }
                    });
                }
            });
        }


        // Animate the kitty when toggled
        if (kittyGifElement) {
            kittyGifElement.style.transition = 'transform 0.3s ease-in-out';
            kittyGifElement.style.transform = 'rotate(20deg)';

            setTimeout(() => {
                kittyGifElement.style.transform = 'rotate(0deg)';
            }, 300);
        }
    });

    // Handle view navigation
    navDots.forEach(dot => {
        dot.addEventListener('click', function () {
            const viewIndex = dot.getAttribute('data-view');

            // Update active dot
            navDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');

            // Slide to the selected view
            trackerViewsElement.style.transform = viewIndex === '0' ? 'translateX(0)' : 'translateX(-50%)';
        });
    });

    // Display placeholder when no trackers have been blocked
    function displayPlaceholder() {
        trackerListElement.innerHTML = '';

        const placeholderElement = document.createElement('div');
        placeholderElement.className = 'tracker-item';
        placeholderElement.textContent = 'No trackers detected yet!';
        placeholderElement.style.fontStyle = 'italic';
        placeholderElement.style.color = '#99b3e6';
        placeholderElement.style.textAlign = 'center';

        trackerListElement.appendChild(placeholderElement);
    }

    // Display placeholder for summary view
    function displaySummaryPlaceholder() {
        trackerSummaryElement.innerHTML = '<div class="tracker-summary-title">Most Common Trackers</div>';

        const placeholderElement = document.createElement('div');
        placeholderElement.style.fontStyle = 'italic';
        placeholderElement.style.color = '#99b3e6';
        placeholderElement.style.textAlign = 'center';
        placeholderElement.style.padding = '10px';
        placeholderElement.textContent = 'No tracker data available yet!';

        trackerSummaryElement.appendChild(placeholderElement);
    }

    // Display trackers in the list
    function displayTrackers(trackers) {
        trackerListElement.innerHTML = '';

        trackers.forEach(tracker => {
            const trackerElement = document.createElement('div');
            trackerElement.className = 'tracker-item';

            // Create and add the block icon
            const iconElement = document.createElement('img');
            iconElement.className = 'tracker-icon';
            iconElement.src = 'images/paw-print.png';
            iconElement.alt = 'Block';
            trackerElement.appendChild(iconElement);

            // Add the tracker domain text
            const textElement = document.createElement('span');
            textElement.textContent = tracker.domain;
            trackerElement.appendChild(textElement);

            trackerListElement.appendChild(trackerElement);
        });
    }

    // Function to extract the main domain from a full domain
    function extractMainDomain(domain) {
        try {
            // Split the domain by dots and get the last two parts
            const parts = domain.split('.');
            if (parts.length >= 2) {
                return parts[parts.length - 2] + '.' + parts[parts.length - 1];
            }
            return domain;
        } catch (e) {
            return domain;
        }
    }

    // Generate tracker summary visualization for main domains
    function generateTrackerSummary(trackers) {
        // Reset the summary
        trackerSummaryElement.innerHTML = '<div class="tracker-summary-title">Most Common Trackers</div>';

        if (!trackers || trackers.length === 0) {
            displaySummaryPlaceholder();
            return;
        }

        // Get all blocked trackers from storage
        chrome.storage.local.get(['allTrackers'], function (result) {
            const allTrackers = result.allTrackers || [];

            // Create an object to count domains - using SET to prevent duplicates
            const mainDomainSet = new Set();
            const mainDomainCounts = {};

            // Process all trackers
            allTrackers.forEach(trackerDomain => {
                if (typeof trackerDomain === 'string') {
                    const mainDomain = extractMainDomain(trackerDomain);

                    // Add to the set to track unique domains
                    if (!mainDomainSet.has(mainDomain)) {
                        mainDomainSet.add(mainDomain);
                        mainDomainCounts[mainDomain] = 1;
                    } else {
                        mainDomainCounts[mainDomain]++;
                    }
                }
            });

            // Convert to array and sort by count
            const sortedDomains = Object.keys(mainDomainCounts)
                .map(domain => ({
                    domain: domain,
                    count: mainDomainCounts[domain]
                }))
                .sort((a, b) => b.count - a.count);

            // Get ONLY the top 4 domains
            const topDomains = sortedDomains.slice(0, 4);

            // Find max count for scaling bars
            const maxCount = topDomains.length > 0 ? Math.max(...topDomains.map(t => t.count)) : 0;

            // Clear any existing items
            while (trackerSummaryElement.childElementCount > 1) {
                trackerSummaryElement.removeChild(trackerSummaryElement.lastChild);
            }

            // Generate visualization
            topDomains.forEach(tracker => {
                const percent = maxCount > 0 ? (tracker.count / maxCount) * 100 : 0;

                const trackerItem = document.createElement('div');
                trackerItem.className = 'tracker-summary-item';

                // Domain name
                const domainName = document.createElement('div');
                domainName.style.width = '120px';
                domainName.style.overflow = 'hidden';
                domainName.style.textOverflow = 'ellipsis';
                domainName.style.whiteSpace = 'nowrap';
                domainName.textContent = tracker.domain;
                trackerItem.appendChild(domainName);

                // Bar visualization
                const barContainer = document.createElement('div');
                barContainer.className = 'tracker-bar-container';

                const bar = document.createElement('div');
                bar.className = 'tracker-bar';
                bar.style.width = `${percent}%`;

                barContainer.appendChild(bar);
                trackerItem.appendChild(barContainer);

                // Count number
                const countElement = document.createElement('div');
                countElement.className = 'tracker-count';
                countElement.textContent = tracker.count;
                trackerItem.appendChild(countElement);

                trackerSummaryElement.appendChild(trackerItem);
            });

            // Show placeholder if no trackers found
            if (topDomains.length === 0) {
                displaySummaryPlaceholder();
            }
        });
    }

    // Listen for updates from background script
    chrome.runtime.onMessage.addListener(function (message) {
        // Update blocked trackers count and list
        if (message.action === 'updateBlockedTrackers') {
            // Check if the update is for the current tab
            getCurrentTab().then(tab => {
                if (tab && tab.id === message.tabId) {
                    // Update the counter
                    trackerCountElement.textContent = message.count || 0;

                    // Update current page trackers
                    currentPageTrackers = message.trackers || [];

                    // Add a quick animation when the count changes
                    trackerCountElement.style.transition = 'transform 0.3s ease-in-out';
                    trackerCountElement.style.transform = 'scale(1.2)';

                    setTimeout(() => {
                        trackerCountElement.style.transform = 'scale(1)';
                    }, 300);

                    // Update the tracker list and summary
                    if (currentPageTrackers.length > 0) {
                        displayTrackers(currentPageTrackers);
                        generateTrackerSummary(currentPageTrackers);
                    } else {
                        displayPlaceholder();
                        displaySummaryPlaceholder();
                    }
                }
            });
        }
        // Handle fingerprint detection
        else if (message.action === 'fingerprintDetected') {
            // Always show the alert when fingerprinting is detected
            chrome.storage.local.get(['fingerprintProtectionEnabled'], function (result) {
                const isProtectionEnabled = result.fingerprintProtectionEnabled !== false;
                showFingerprintAlert(message.domain || 'this site', isProtectionEnabled);
            });
        }
    });

    // Set up periodic refresh of tracker data
    // This ensures the popup stays up-to-date if it's left open
    setInterval(async () => {
        const tab = await getCurrentTab();
        if (tab) {
            requestTabData(tab.id);
        }
    }, 1000); // Update every second
});