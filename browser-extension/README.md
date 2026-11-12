# ActivityTrack Website Companion

This optional Chromium extension reads only the hostname of the active tab and sends it to the visible ActivityTrack agent on `127.0.0.1:8765`. It does not send page content, query strings, paths, or browsing history.

## Install (Chrome / Edge)
1. Start the ActivityTrack employee agent.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable Developer mode.
4. Choose **Load unpacked** and select this `browser-extension` folder.
5. Keep the extension enabled while ActivityTrack is running.

The agent classifies the website domain against the administrator's Productive Websites allowlist. Any domain not on that list is Unproductive. Genuine system idle remains Idle.
