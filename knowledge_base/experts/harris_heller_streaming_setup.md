# Harris Heller — Streaming Setup & Audio Guide

## Category: streaming/expert_advice
## Tags: harris_heller, expert_advice, streaming, obs, audio, hardware, setup, microphone

## Expert: Harris Heller (Alpha Gaming)
Harris Heller is a streaming educator and creator of StreamBeats (copyright-free streaming music). His Alpha Gaming YouTube channel is one of the most trusted resources for practical streaming setup advice, with over 500,000 subscribers. He is known for rigorous hardware testing and no-nonsense production advice.

---

## Core Philosophy

Harris Heller's approach: fix the fundamentals before spending money. Most streaming problems are solved by proper settings, not expensive gear. His hierarchy: audio first, then lighting, then camera. Viewers tolerate bad video but not bad audio.

---

## OBS Settings (Harris Heller Method)

### Encoder
Always use hardware encoding. NVENC for Nvidia, AMF for AMD. Never use x264 for gaming streams — it steals CPU from your game. x264 is only appropriate for non-gaming content where CPU is available.

### Bitrate
- 1080p60: 6000 kbps
- 1080p30: 4500 kbps
- 720p60: 4500 kbps
- 720p30: 3000 kbps

Your upload speed should be at least 1.5x your bitrate. Test your actual upload speed during streaming hours — ISP speeds vary by time of day.

### Audio Filter Chain (in order)
Harris Heller's recommended OBS audio filter chain for microphones:
1. **Noise Suppression** (RNNoise) — removes background noise
2. **Noise Gate** — cuts audio below threshold between speech
3. **Compressor** — evens out volume levels
4. **Gain** — boost if needed after compression

This order matters. Noise suppression before gate prevents the gate from triggering on noise artifacts.

### VST Plugins for Advanced Audio
For streamers wanting professional audio quality in OBS:
- **ReaPlugs (ReaGate, ReaEQ)** — free, professional-grade VST plugins from Cockos. ReaGate for noise gate, ReaEQ for parametric EQ
- **TDR Nova** — free parametric EQ, excellent for voice
- **Waves NS1** — paid noise suppressor, industry standard
Harris recommends ReaPlugs as the best free option for most streamers.

---

## Microphone Recommendations

### USB Microphones (Best Value)
- **Rode NT-USB Mini** ($100) — Harris Heller's top recommendation for USB mics. Clean sound, compact, no drivers needed
- **Blue Yeti** ($100-130) — popular but overhyped. Multiple polar patterns most streamers don't need
- **Elgato Wave:3** ($130) — good sound, built-in mixing software, but pricier than alternatives

### XLR Microphones
- **Rode PodMic** ($100) — Harris's top XLR recommendation for streamers. Built for broadcast, handles room noise well
- **Shure SM7B** ($350-400) — industry standard but requires high-gain interface. Overkill for most streamers
- **Audio-Technica AT2020** ($80-100) — budget XLR, solid quality

### Audio Interfaces
- **Focusrite Scarlett Solo** ($120) — most popular entry-level, reliable
- **GoXLR Mini** ($200) — designed for streamers, built-in mixer and effects
- **GoXLR** ($400) — full mixer, popular with professional streamers

### Harris Heller's Mic Advice
"The room matters more than the mic." Acoustic treatment (foam panels, moving blankets, bookshelves with books) makes more difference than upgrading from a $100 mic to a $400 mic. Fix your room first.

---

## Camera and Lighting

### Lighting Priority
Harris Heller's consistent message: lighting is the highest-ROI upgrade for most streamers. A $50 ring light with a $70 webcam looks better than a $700 camera with no lighting.

### Recommended Lighting Setup
- **Key light**: Elgato Key Light ($100-200) or equivalent LED panel. Position at 45 degrees, slightly above eye level
- **Fill light**: Softer light on opposite side to reduce harsh shadows
- **Color temperature**: Match to room lighting. 5500K for daylight look, 4000K for warmer tone

### Webcam Recommendations
- **Logitech C920** ($70-90) — Harris's baseline recommendation. Reliable, widely compatible
- **Logitech Brio** ($150-200) — 4K, better low-light
- **Sony ZV-E10** ($600) — Harris's top camera recommendation for streamers who want DSLR quality. Clean HDMI out, excellent autofocus

---

## Common Mistakes Harris Heller Identifies

1. **Buying gear before fixing settings** — most audio problems are solved in OBS filters, not by buying a new mic
2. **Using x264 encoder for gaming** — always use hardware encoding
3. **Ignoring room acoustics** — hard surfaces cause echo. Add soft furnishings
4. **Bitrate too high for internet connection** — causes dropped frames. Test your actual upload speed
5. **Monitoring mic through headphones** — causes echo. Disable monitoring in OBS
6. **Not using a noise gate** — background noise bleeds into stream constantly
