/**
 * pulse-graph.js
 * Visualizes real-time chat activity (MPM) and engagement (EI) 
 * for the Scrapbot Dashboard.
 */

(function () {
    const container = document.getElementById('pulse_graph_container');
    if (!container) return;

    const canvas = document.getElementById('pulse_canvas');
    const ctx = canvas.getContext('2d');
    const loader = document.getElementById('pulse_loader');
    const tooltip = document.getElementById('pulse_tooltip');
    const liveIndicator = document.getElementById('pulse_live_indicator');

    const platform = container.dataset.platform;
    const channel = container.dataset.channel;

    if (!channel) {
        console.warn('[pulse] no channel slug found');
        return;
    }

    let data = { timeline: [], moments: [] };
    let isResizing = false;
    let hoveredPoint = null;

    // Configuration
    const COLORS = {
        ei: '#60a5fa', // Blue 400
        mpm: '#10b981', // Emerald 500
        grid: 'rgba(255,255,255,0.05)',
        moment: 'rgba(255,255,255,0.2)'
    };

    const MARGIN = { top: 20, right: 30, bottom: 20, left: 30 };

    function resize() {
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.scale(dpr, dpr);
        render();
    }

    async function fetchData() {
        try {
            const resp = await fetch(`/dashboard/api/intel/pulse?platform=${platform}&channel_slug=${channel}`);
            const json = await resp.json();
            if (json.ok) {
                data = json;
                if (loader) loader.classList.add('opacity-0');
                setTimeout(() => loader && loader.remove(), 500);
                if (liveIndicator) liveIndicator.classList.remove('hidden');
                render();
            }
        } catch (err) {
            console.error('[pulse] fetch error', err);
        }
    }

    function getX(ts, width) {
        const now = Date.now();
        const start = now - (60 * 60 * 1000); // 60 mins ago
        const duration = now - start;
        const elapsed = new Date(ts).getTime() - start;
        return MARGIN.left + (elapsed / duration) * (width - MARGIN.left - MARGIN.right);
    }

    function getY(value, max, height) {
        const chartHeight = height - MARGIN.top - MARGIN.bottom;
        return height - MARGIN.bottom - (value / max) * chartHeight;
    }

    function interpolateData(originalTimeline) {
        if (!originalTimeline || originalTimeline.length < 2) return originalTimeline;

        // Since we removed the 5-second heartbeat, we might have gaps of minutes 
        // between events. To keep the graph continuous and flat during quiet periods,
        // we inject synthetic "flat" points every 5 seconds up to the current time, 
        // carrying forward the last known values for EI, Viewers, etc.

        const interpolated = [];
        const intervalMs = 5000; // 5 seconds

        // Sort chronologically just to be sure
        const sorted = [...originalTimeline].sort((a, b) => new Date(a.bucket_ts).getTime() - new Date(b.bucket_ts).getTime());

        let lastPoint = sorted[0];
        interpolated.push(lastPoint);

        const now = Date.now();

        for (let i = 1; i < sorted.length; i++) {
            const currentPoint = sorted[i];
            const lpTime = new Date(lastPoint.bucket_ts).getTime();
            const cpTime = new Date(currentPoint.bucket_ts).getTime();

            // If gap is larger than roughly 2 intervals, fill it
            if (cpTime - lpTime > intervalMs * 1.5) {
                let fillTime = lpTime + intervalMs;
                while (fillTime < cpTime - intervalMs) {
                    // Carry forward previous values, but decay MPM to 0 since no chat happened
                    const syntheticPoint = {
                        ...lastPoint,
                        bucket_ts: new Date(fillTime).toISOString(),
                        synthetic: true,
                        mpm: 0, // No messages in this synthetic gap
                    };
                    interpolated.push(syntheticPoint);
                    fillTime += intervalMs;
                }
            }

            interpolated.push(currentPoint);
            lastPoint = currentPoint;
        }

        // Fill trailing gap up to 'now'
        const lpTime = new Date(lastPoint.bucket_ts).getTime();
        if (now - lpTime > intervalMs * 1.5) {
            let fillTime = lpTime + intervalMs;
            // Cap at 'now'
            while (fillTime <= now) {
                interpolated.push({
                    ...lastPoint,
                    bucket_ts: new Date(fillTime).toISOString(),
                    synthetic: true,
                    mpm: 0, // No messages
                });
                fillTime += intervalMs;
            }
        }

        return interpolated;
    }

    function render() {
        if (!data.timeline || data.timeline.length < 2) return;

        const displayTimeline = interpolateData(data.timeline);

        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);

        ctx.clearRect(0, 0, width, height);

        // 1. Draw Grid
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 4; i++) {
            const y = getY(i * 25, 100, height);
            ctx.moveTo(MARGIN.left, y);
            ctx.lineTo(width - MARGIN.right, y);
        }
        ctx.stroke();

        // 2. Resolve Max MPM for scaling
        const maxMpm = Math.max(50, ...displayTimeline.map(d => d.mpm || 0));

        // 3. Draw Engagement (EI) - Blue Area
        drawPath(displayTimeline, d => d.engagement_index, 100, COLORS.ei, true);

        // 4. Draw MPM - Emerald Line
        drawPath(displayTimeline, d => d.mpm, maxMpm, COLORS.mpm, false, 2);

        // 5. Draw Moments
        data.moments.forEach(m => {
            const x = getX(m.bucket_ts, width);
            if (x < MARGIN.left || x > width - MARGIN.right) return;

            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = COLORS.moment;
            ctx.beginPath();
            ctx.moveTo(x, MARGIN.top);
            ctx.lineTo(x, height - MARGIN.bottom);
            ctx.stroke();
            ctx.setLineDash([]);

            // Icon/Dot
            ctx.fillStyle = (m.kind === 'transition') ? '#facc15' : '#ef4444';
            ctx.beginPath();
            ctx.arc(x, MARGIN.top, 3, 0, Math.PI * 2);
            ctx.fill();
        });

        if (hoveredPoint) {
            drawHoverPoint(hoveredPoint, maxMpm, width, height);
        }
    }

    function drawPath(points, getValue, max, color, fill = false, lineWidth = 1.5) {
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        points.forEach((p, i) => {
            const x = getX(p.bucket_ts, width);
            const y = getY(getValue(p), max, height);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        if (fill) {
            ctx.lineTo(getX(points[points.length - 1].bucket_ts, width), height - MARGIN.bottom);
            ctx.lineTo(getX(points[0].bucket_ts, width), height - MARGIN.bottom);
            const grad = ctx.createLinearGradient(0, MARGIN.top, 0, height - MARGIN.bottom);
            // Using static since I don't want to write a hex-to-rgba helper here
            grad.addColorStop(0, 'rgba(96, 165, 250, 0.15)');
            grad.addColorStop(1, 'rgba(96, 165, 250, 0)');
            ctx.fillStyle = grad;
            ctx.fill();
        } else {
            ctx.stroke();
        }
    }

    function drawHoverPoint(p, maxMpm, width, height) {
        const x = getX(p.bucket_ts, width);
        const yEi = getY(p.engagement_index, 100, height);
        const yMpm = getY(p.mpm, maxMpm, height);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, MARGIN.top);
        ctx.lineTo(x, height - MARGIN.bottom);
        ctx.stroke();

        ctx.fillStyle = COLORS.ei;
        ctx.beginPath();
        ctx.arc(x, yEi, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = COLORS.mpm;
        ctx.beginPath();
        ctx.arc(x, yMpm, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    canvas.addEventListener('mousemove', (e) => {
        if (!data.timeline.length) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;

        const width = canvas.width / (window.devicePixelRatio || 1);
        const displayTimeline = interpolateData(data.timeline);

        // Binary search or find closest
        let closest = displayTimeline[0];
        let minDist = Math.abs(getX(closest.bucket_ts, width) - mouseX);

        for (const p of displayTimeline) {
            const d = Math.abs(getX(p.bucket_ts, width) - mouseX);
            if (d < minDist) {
                minDist = d;
                closest = p;
            }
        }

        hoveredPoint = closest;
        render();

        // Tooltip positioning
        tooltip.classList.remove('hidden');
        const ts = new Date(closest.bucket_ts);
        document.getElementById('pulse_tooltip_time').textContent = ts.toLocaleTimeString();
        document.getElementById('pulse_tooltip_ei').textContent = closest.engagement_index + '%';
        document.getElementById('pulse_tooltip_mpm').textContent = closest.mpm;

        // Viewer count parsing
        let viewersText = '-';
        if (closest.meta && closest.meta.telemetry && closest.meta.telemetry.viewers !== undefined) {
            viewersText = closest.meta.telemetry.viewers.toLocaleString();
        }
        document.getElementById('pulse_tooltip_viewers').textContent = viewersText;

        // Mood / Emotes parsing
        let moodText = '-';
        if (closest.meta && closest.meta.top_emotes && closest.meta.top_emotes.length > 0) {
            moodText = closest.meta.top_emotes.map(e => e.name || e.emote || '').join(' ');
        }
        document.getElementById('pulse_tooltip_mood').textContent = moodText || '-';

        document.getElementById('pulse_tooltip_state').textContent = closest.room_state;
        document.getElementById('pulse_tooltip_state').style.color = (closest.engagement_index > 70) ? '#f87171' : (closest.engagement_index > 40) ? '#60a5fa' : '#94a3b8';

        // Smart orient
        const tooltipRect = tooltip.getBoundingClientRect();
        let left = mouseX + 15;
        if (left + tooltipRect.width > rect.width) left = mouseX - tooltipRect.width - 15;
        tooltip.style.left = left + 'px';
        tooltip.style.top = '20px';
    });

    canvas.addEventListener('mouseleave', () => {
        hoveredPoint = null;
        tooltip.classList.add('hidden');
        render();
    });

    window.addEventListener('resize', () => {
        if (isResizing) return;
        isResizing = true;
        requestAnimationFrame(() => {
            resize();
            isResizing = false;
        });
    });

    // Init
    setTimeout(() => {
        resize();
        fetchData();
        setInterval(fetchData, 30000); // 30s poll
    }, 100);

})();
