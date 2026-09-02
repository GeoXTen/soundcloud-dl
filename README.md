# SoundCloud Downloader

Chrome/Brave extension for downloading SoundCloud tracks as MP3. Manifest V3 compatible.

## Quick Install

### Option 1: Download ZIP (recommended)

1. Download [`soundcloud-dl.zip`](https://github.com/GeoXTen/soundcloud-dl/releases/latest/download/soundcloud-dl.zip) from [Releases](https://github.com/GeoXTen/soundcloud-dl/releases/latest)
2. Extract the ZIP anywhere (e.g. Desktop)
3. Open `chrome://extensions` (or `brave://extensions`)
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** and select the extracted folder
6. Done — visit any SoundCloud track and click the orange download button

### Option 2: Clone repo

```bash
git clone https://github.com/GeoXTen/soundcloud-dl.git
```

Then follow steps 3-6 above.

## Features

- **Download any SoundCloud track** as 128kbps MP3
- **Works on any page** — track pages, likes, playlists, search results
- **Correct filenames** — saves as `Artist - Title.mp3` (not server UUIDs)
- **SPA-aware** — detects currently playing track from the player bar
- **Both UI layouts** — supports old light UI and new 2026 dark UI
- **Mini player button** — small orange circle in the bottom playback bar
- **Action bar button** — icon next to the `⋯ More` menu

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
