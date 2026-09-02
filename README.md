# SoundCloud Downloader (MV3)

Chrome/Brave extension for downloading SoundCloud tracks as MP3. Manifest V3 compatible.

## Features

- **Download any SoundCloud track** as 128kbps MP3
- **Works on any page** — track pages, likes, playlists, search results
- **Correct filenames** — saves as `Artist - Title.mp3` (not server UUIDs)
- **SPA-aware** — detects currently playing track from the player bar
- **Both UI layouts** — supports old light UI and new 2026 dark UI
- **Mini player button** — small orange circle in the bottom playback bar
- **Action bar button** — icon next to the `⋯ More` menu

## Installation

1. Download or clone this repo
2. Open `chrome://extensions` (or `brave://extensions`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Navigate to any SoundCloud track and click the orange download button

## How it works

1. Extracts SoundCloud `client_id` from page scripts (validated against API)
2. Resolves the currently playing track via player bar links or page meta tags
3. Fetches stream URL from SoundCloud API (`mp3_1_0` progressive transcoding)
4. Downloads as blob and saves with correct `Artist - Title.mp3` filename

## Supported browsers

- Chrome 88+
- Brave
- Edge 88+
- Any Chromium-based browser with MV3 support

## Notes

- SoundCloud's public API maxes out at **128kbps MP3** progressive. Higher quality (320kbps+) is only available through SoundCloud Go+ and not exposed via the API.
- Some tracks may be geo-restricted or download-restricted by the artist.
