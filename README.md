# 🐱 Kitty Guard – Chrome Privacy Extension

**Kitty Guard** is a Chrome extension that boosts user privacy by blocking web trackers and protecting against canvas fingerprinting. It gives users control and alerts them when tracking is detected.

---

## 🚀 Features

### 🛡️ Tracker Blocking
- Blocks known trackers using `declarativeNetRequest` (Manifest V3).
- Uses a domain list defined in `rules.json`.
- Tracks how many requests are blocked per page.
- Toggle on/off anytime.

### 🧬 Canvas Fingerprint Protection
- Detects canvas fingerprinting attempts.
- Overrides canvas APIs by injecting code into the main page context.
- Randomizes canvas output to prevent consistent fingerprints.
- Sends alerts and displays detection in the popup.
- Toggle protection on/off as needed.

### 📊 Visual Insights
- Shows blocked tracker count per tab.
- Lists recent blocked domains.
- Visualizes top tracking domains across sessions.

---

## 🔧 Installation

1. Clone/download this repo.
2. Go to `chrome://extensions`, enable **Developer Mode**.
3. Click **Load unpacked** and select the project folder.

---

## 🧪 Testing Fingerprint Protection

Use `test.html` to verify behavior:
- Protection **off** → fingerprints are identical.
- Protection **on** → fingerprints differ each time.

> 🔁 **Note:** Refresh the page after toggling protection. Injection occurs on page load.

---

## 📁 Structure

```bash
KittyGuard/
├── background.js         # Main logic & injection
├── content-script.js     # Detection messaging
├── rules.json            # Blocklist for trackers
├── popup.html/.js        # UI and toggle handling
├── manifest.json         # Extension config
├── test.html             # Local fingerprint test
└── images/, icons/       # UI assets
