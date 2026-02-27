// /utils/mockData.js
// Widget/overlay registry used by dashboard UI.

export const widgets = [
  {
    id: "chat",
    name: "Live Chat",
    icon: "💬",
    description: "Real-time chat overlay for streams",
    status: "unlocked",
    configureView: "tabs/chat",
    configSchema: {
      fields: [
        { name: "theme", type: "select", label: "Theme", options: ["dark", "light", "neon"] },
        { name: "fontSize", type: "text", label: "Font Size (px)" },
      ],
    },
  },
  {
    id: "donation",
    name: "Donation Tracker",
    icon: "💰",
    description: "Displays recent donations and goals",
    status: "unlocked",
    configureView: "tabs/donation",
    configSchema: {
      fields: [
        { name: "goalAmount", type: "text", label: "Donation Goal" },
        { name: "showRecent", type: "select", label: "Show Recent Donations", options: ["yes", "no"] },
      ],
    },
  },
  {
    id: "stats",
    name: "Stream Stats",
    icon: "📊",
    description: "Live viewer count and engagement",
    status: "unlocked",
    configureView: "tabs/stats",
    configSchema: {
      fields: [
        { name: "showViewers", type: "select", label: "Show Viewer Count", options: ["yes", "no"] },
        { name: "style", type: "select", label: "Style", options: ["minimal", "graph", "compact"] },
      ],
    },
  },

  // ✅ Sub Counter / Goal Bar
  {
    id: "sub-counter",
    name: "Sub Counter",
    icon: "📈",
    description: "A clean sub goal bar fed by subs.update events",
    status: "unlocked",
    configureView: "tabs/sub-counter",
    configSchema: { fields: [] },
  },

  // ✅ Raffle / Giveaway
  {
    id: "raffle",
    name: "Raffle",
    icon: "🎟️",
    description: "Chat join → animated winner reveal (wheel / slot / scramble) for OBS",
    status: "unlocked",
    configureView: "tabs/raffle",
    configSchema: {
      fields: [
        { name: "joinPhrase", type: "text", label: "Join phrase", placeholder: "!join" },
        { name: "animation", type: "select", label: "Reveal animation", options: ["wheel", "slot", "scramble"] },
        { name: "winnersPerDraw", type: "text", label: "Winners per draw", placeholder: "1" },
        { name: "subOnly", type: "select", label: "Subscribers only", options: ["no", "yes"] },
        { name: "subMultiplier", type: "text", label: "Subscriber multiplier", placeholder: "1" },
        { name: "minFollowDays", type: "text", label: "Min follow days", placeholder: "0" },
        { name: "minSubMonths", type: "text", label: "Min sub months", placeholder: "0" },
      ],
    },
  },

  // ✅ NEW: Alerts (V1)
  // IMPORTANT:
  // - Dashboard tile should link to /dashboard/widgets/alerts (which redirects to /dashboard/widgets/alerts/configure)
  // - Your configure route is already bespoke, so configureView is just a placeholder for now.
  {
    id: "alerts",
    name: "Alerts",
    icon: "🚨",
    description: "One alert widget powering follows/subs/raids/tips across overlays (BotRix parity baseline)",
    status: "unlocked",
    configureView: "tabs/alerts",
    configSchema: { fields: [] },
  },
];

export function getWidgetById(id) {
  return widgets.find((w) => w.id === id);
}

export const overlays = [
  { id: "overlay-1", name: "Intro Splash", description: "Animated intro overlay for stream start", status: "installed", icon: "🎬" },
  { id: "overlay-2", name: "Break Screen", description: "AFK overlay with music and countdown", status: "unlocked", icon: "⏸️" },
  { id: "overlay-3", name: "End Credits", description: "Outro overlay with supporter names", status: "locked", icon: "🎞️" },
];
