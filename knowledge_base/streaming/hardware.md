# Streaming Hardware Guide

## Category: streaming/hardware
## Tags: hardware, camera, microphone, lighting, capture-card, PC, setup

---

## PC Requirements

### Minimum Specs for 1080p60 Streaming
- **CPU**: Intel i5-10th gen / AMD Ryzen 5 3600 or better
- **GPU**: Nvidia GTX 1660 Super / AMD RX 5600 XT or better (for NVENC/AMF encoding)
- **RAM**: 16GB DDR4
- **Storage**: SSD for OS and OBS (HDD fine for recordings)
- **Upload**: 10+ Mbps stable

### Recommended Specs for High-Quality Streaming
- **CPU**: Intel i7-12th gen / AMD Ryzen 7 5800X
- **GPU**: Nvidia RTX 3070 / AMD RX 6700 XT
- **RAM**: 32GB DDR4
- **Upload**: 25+ Mbps

### Dual PC Setup
Some streamers use a dedicated streaming PC to offload encoding:
- Gaming PC handles the game
- Streaming PC handles OBS, encoding, and overlays
- Connected via capture card
- Eliminates any performance impact on the game
- Overkill for most streamers — only worth it at high production levels

---

## Microphones

### USB Microphones (Plug and Play)
Best for beginners — no audio interface needed.

| Microphone | Price Range | Best For |
|------------|-------------|----------|
| Blue Yeti | $100-130 | All-around, multiple polar patterns |
| HyperX QuadCast | $100-140 | Gaming aesthetic, built-in shock mount |
| Elgato Wave:3 | $130-150 | Clean sound, built-in mixing software |
| Rode NT-USB Mini | $100 | Compact, excellent sound quality |

### XLR Microphones (Requires Audio Interface)
Higher quality ceiling, more flexibility.

| Microphone | Price Range | Notes |
|------------|-------------|-------|
| Shure SM7B | $350-400 | Industry standard, needs high-gain interface |
| Rode PodMic | $100-130 | Great value, built for streaming |
| Audio-Technica AT2020 | $80-100 | Budget XLR, solid quality |

### Audio Interfaces (for XLR mics)
- **Focusrite Scarlett Solo** ($120) — most popular entry-level
- **GoXLR Mini** ($200) — designed for streamers, built-in mixer
- **GoXLR** ($400) — full mixer with effects, popular with professional streamers

### Microphone Placement
- Position 6-8 inches from your mouth
- Slightly off-axis (not directly in front) to reduce plosives (p/b sounds)
- Use a pop filter or foam windscreen
- Boom arm keeps the mic off your desk (reduces vibration noise)

---

## Cameras

### Webcams
| Camera | Price | Resolution | Notes |
|--------|-------|------------|-------|
| Logitech C920 | $70-90 | 1080p30 | Industry standard, reliable |
| Logitech C922 | $90-110 | 1080p30 | Better low-light than C920 |
| Logitech Brio | $150-200 | 4K30 | Overkill for streaming but future-proof |
| Razer Kiyo Pro | $130-160 | 1080p60 | Excellent low-light performance |

### DSLR/Mirrorless as Webcam
Significantly better image quality than webcams.

**Popular choices:**
- Sony ZV-E10 ($600-700) — designed for content creators, clean HDMI out
- Sony A6400 ($900-1000) — excellent autofocus, popular streamer choice
- Canon M50 Mark II ($650-750) — good autofocus, clean HDMI

**Requirements:**
- Clean HDMI output (no overlays/info on screen)
- Capture card to connect to PC (Elgato Cam Link 4K, $130)
- Dummy battery for continuous power

**Note:** A good webcam in good lighting beats a DSLR in bad lighting. Fix lighting first.

---

## Lighting

Lighting has the biggest impact on camera quality. A $50 light setup with a $70 webcam looks better than a $700 camera with no lighting.

### Key Light
Your main light source, positioned in front and slightly to the side.
- **Ring Light** ($30-80) — even, flattering light. Popular for face-cam streams
- **Key Light** ($100-200, e.g. Elgato Key Light) — adjustable color temperature, app-controlled
- **Softbox** ($50-100) — professional look, softer shadows

### Three-Point Lighting Setup
1. **Key Light** — main light, front-left or front-right at 45°
2. **Fill Light** — softer light on opposite side, reduces harsh shadows
3. **Back Light** — behind you, separates you from background

### Color Temperature
- **Warm (3000-4000K)** — cozy, gaming aesthetic
- **Neutral (5000-5500K)** — natural daylight look
- **Cool (6000-6500K)** — clean, professional look

Match your light color temperature to your room lighting to avoid mixed color casts.

---

## Capture Cards

Required if streaming from a console or using a dual-PC setup.

| Card | Price | Max Input | Notes |
|------|-------|-----------|-------|
| Elgato HD60 X | $150-200 | 4K30/1080p60 | Most popular, USB |
| Elgato 4K60 Pro | $200-250 | 4K60 | PCIe, lower latency |
| AVerMedia Live Gamer Portable 2 | $100-130 | 1080p60 | Budget option, standalone recording |
| Razer Ripsaw HD | $80-100 | 1080p60 | Budget USB option |

**Console streaming:** Connect console HDMI → capture card → PC. OBS sees the capture card as a video source.

---

## Network Setup

### Wired vs WiFi
Always use wired ethernet for streaming if possible. WiFi introduces packet loss and jitter that causes dropped frames.

### Router Placement
If wired isn't possible:
- Use 5GHz WiFi band (less interference, higher speed)
- Position router line-of-sight to streaming PC
- Consider a WiFi 6 router for better performance

### Upload Speed Requirements
| Bitrate | Minimum Upload | Recommended Upload |
|---------|---------------|-------------------|
| 3000 kbps | 5 Mbps | 8 Mbps |
| 4500 kbps | 7 Mbps | 12 Mbps |
| 6000 kbps | 9 Mbps | 15 Mbps |

### QoS (Quality of Service)
Most routers support QoS — prioritise streaming traffic over other devices on your network. Set your streaming PC as high priority in router settings.

---

## Headphones and Monitoring

- Use closed-back headphones to prevent audio bleed into your microphone
- Popular choices: HyperX Cloud II, SteelSeries Arctis 7, Sony WH-1000XM5
- Set OBS audio monitoring to "Monitor Off" for your mic to prevent echo
