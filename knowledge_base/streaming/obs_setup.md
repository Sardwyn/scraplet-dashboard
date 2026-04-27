# OBS Studio Setup for Live Streaming

## Category: streaming/setup
## Tags: obs, setup, streaming, configuration, beginner

---

## What is OBS Studio?

OBS Studio (Open Broadcaster Software) is the industry-standard free and open-source software for live streaming and recording. It runs on Windows, Mac, and Linux. Most professional streamers use OBS or a fork of it (Streamlabs OBS, OBS.Ninja).

---

## Initial Setup

### Download and Install
Download from obsproject.com. Run the auto-configuration wizard on first launch — it will test your system and suggest settings. You can always override these manually.

### Scene and Source Basics
- **Scenes** are layouts — think of them as different camera setups or screen configurations
- **Sources** are the elements inside a scene: game capture, webcam, microphone, browser sources, images, text
- You switch between scenes during a stream (e.g. Starting Soon → Live → BRB → Ending)

### Essential Sources
- **Game Capture** — captures a specific game window. Lower CPU than Display Capture
- **Display Capture** — captures your entire screen. Use when Game Capture doesn't work
- **Video Capture Device** — your webcam
- **Browser Source** — loads a URL as an overlay (alerts, chat, Scraplet overlays)
- **Audio Input Capture** — your microphone
- **Audio Output Capture** — desktop audio (game sounds, music)

---

## Output Settings

### Resolution and Frame Rate
- **Canvas Resolution**: 1920x1080 (1080p) is standard. Match your monitor resolution.
- **Output Resolution**: Can be lower than canvas to reduce encoding load. 1280x720 (720p) is acceptable for lower-end PCs.
- **Frame Rate**: 60fps for gaming content. 30fps if your PC struggles.

### Bitrate
Bitrate determines stream quality. Higher = better quality but requires more upload bandwidth.

| Resolution | Frame Rate | Recommended Bitrate |
|------------|------------|---------------------|
| 1080p      | 60fps      | 6000 kbps           |
| 1080p      | 30fps      | 4500 kbps           |
| 720p       | 60fps      | 4500 kbps           |
| 720p       | 30fps      | 3000 kbps           |

Rule: your upload speed should be at least 1.5x your bitrate. For 6000 kbps streaming, you need ~9 Mbps upload minimum.

### Encoder Selection
- **NVENC** (Nvidia GPU) — best option if you have an Nvidia GPU. Offloads encoding to dedicated hardware, doesn't impact game performance
- **AMF** (AMD GPU) — AMD equivalent of NVENC
- **x264** (CPU) — software encoding. Higher quality at same bitrate but uses CPU. Only use if you have CPU headroom
- **Apple VT** (Mac) — hardware encoding on Apple Silicon

**Recommendation**: Always use hardware encoding (NVENC/AMF) for gaming streams. Use x264 only for non-gaming content where CPU is available.

---

## Audio Setup

### Microphone Settings
1. Add Audio Input Capture source, select your microphone
2. Right-click the audio source → Filters → Add these in order:
   - **Noise Suppression** (RNNoise or Speex) — removes background noise
   - **Noise Gate** — cuts audio below a threshold (eliminates room noise between speech)
   - **Compressor** — evens out volume levels
   - **Gain** — boost volume if needed

### Audio Levels
- Microphone should peak around -12dB to -6dB in the mixer
- Desktop audio (game sounds) should sit lower, around -20dB to -15dB
- Never let audio clip (hit 0dB / red zone)

### Audio Sync Issues
If your audio is out of sync with video:
- Add an **Audio Delay** filter to your microphone source
- Start at 200ms and adjust until sync is correct
- Alternatively, use the **Sync Offset** in Advanced Audio Settings

---

## Replay Buffer (Quick Clipping)

The Replay Buffer saves the last N seconds of your stream to disk on demand — perfect for capturing moments without recording everything.

**Setup:**
1. Settings → Output → Replay Buffer tab
2. Enable Replay Buffer
3. Set duration (60-120 seconds recommended)
4. Bind a hotkey to "Save Replay Buffer" in Settings → Hotkeys

**Usage:** When something clip-worthy happens, press your hotkey. The last 60-90 seconds saves as a video file automatically.

The Scraplet Showrunner can trigger the replay buffer automatically when highlights are detected.

---

## Common Issues

### Dropped Frames
- Lower your bitrate (try 4500 kbps instead of 6000)
- Switch to a wired ethernet connection
- Check if your ISP is throttling streaming traffic
- Try a different streaming server (closer geographic location)

### High CPU Usage
- Switch from x264 to NVENC/AMF encoder
- Lower your output resolution (1080p → 720p)
- Reduce in-game graphics settings
- Close background applications

### Black Screen on Game Capture
- Run OBS as Administrator
- Switch from Game Capture to Display Capture
- For fullscreen games: try windowed or borderless windowed mode
- Disable hardware-accelerated GPU scheduling in Windows settings

### Audio Echo
- You have monitoring enabled. Go to Edit → Advanced Audio Settings
- Set monitoring to "Monitor Off" for your microphone
- If using headphones, ensure you're not hearing your mic through them

---

## Browser Sources for Overlays

Browser sources load web pages as overlay elements. This is how Scraplet overlays work.

**Setup:**
1. Add Source → Browser Source
2. Enter your overlay URL (from Scraplet dashboard)
3. Set width/height to 1920x1080
4. Enable "Shutdown source when not visible" to save resources

**Tips:**
- Right-click → Refresh to reload the overlay without restarting OBS
- Use "Interact" to click elements inside the browser source
- Custom CSS can hide scrollbars: `body { overflow: hidden; }`
