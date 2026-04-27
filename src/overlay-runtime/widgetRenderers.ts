import { registerWidgetRenderer } from '../shared/overlayRenderer/widgetContract';

// All widgets use the full-featured renderers from ./widgets/
// These read all visual config from state (bgColor, fontFamily, displayMode etc.)
import { TickerWidget }          from './widgets/TickerWidget';
import { EmoteCounterWidget }    from './widgets/EmoteCounterWidget';
import { EmoteWallWidget }       from './widgets/EmoteWallWidget';
import { HypeTrainWidget }       from './widgets/HypeTrainWidget';
import { MediaQueueWidget }      from './widgets/MediaQueueWidget';
import { PollWidget }            from './widgets/PollWidget';
import { RaffleWidget }          from './widgets/RaffleWidget';
import { RandomNumberWidget }    from './widgets/RandomNumberWidget';
import { SoundVisualizerWidget } from './widgets/SoundVisualizerWidget';
import { SubathonTimerWidget }   from './widgets/SubathonTimerWidget';
import { TopDonatorsWidget }     from './widgets/TopDonatorsWidget';
import { TopSupportersWidget }   from './widgets/TopSupportersWidget';
import { ViewerCountWidget }     from './widgets/ViewerCountWidget';
import { CountdownWidget }       from './widgets/CountdownWidget';
import { SubCounterWidget }      from './widgets/SubCounterWidget';
import { EventConsoleWidget }    from './widgets/EventConsoleWidget';
import { AlertBoxWidget }        from './widgets/AlertBoxWidget';
import { TtsPlayerWidget }       from './widgets/TtsPlayerWidget';

// Chat overlay uses its own renderer (handles messages array structure)
import { ChatOverlayWidget }     from './renderers/ChatOverlayWidget';

registerWidgetRenderer('ticker',               TickerWidget);
registerWidgetRenderer('emote-counter',        EmoteCounterWidget);
registerWidgetRenderer('emote-wall',           EmoteWallWidget);
registerWidgetRenderer('hype-train',           HypeTrainWidget);
registerWidgetRenderer('media-queue',          MediaQueueWidget);
registerWidgetRenderer('poll',                 PollWidget);
registerWidgetRenderer('raffle',               RaffleWidget);
registerWidgetRenderer('random-number',        RandomNumberWidget);
registerWidgetRenderer('sound-visualizer',     SoundVisualizerWidget);
registerWidgetRenderer('subathon-timer',       SubathonTimerWidget);
registerWidgetRenderer('top-donators',         TopDonatorsWidget);
registerWidgetRenderer('top-supporters',       TopSupportersWidget);
registerWidgetRenderer('viewer-count',         ViewerCountWidget);
registerWidgetRenderer('countdown',            CountdownWidget);
registerWidgetRenderer('sub-counter',          SubCounterWidget);
registerWidgetRenderer('event-console-widget', EventConsoleWidget);
registerWidgetRenderer('alert-box-widget',     AlertBoxWidget);
registerWidgetRenderer('tts-player',           TtsPlayerWidget);
registerWidgetRenderer('chat-overlay',         ChatOverlayWidget);
