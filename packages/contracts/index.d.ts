export declare const CHAT_ENVELOPE_V1: 1;
export declare const OVERLAY_RUNTIME_PACKET_V1: "1";

export declare const PLATFORM: Readonly<{
  KICK: "kick";
  YOUTUBE: "youtube";
  TWITCH: "twitch";
}>;

export declare const INGEST: Readonly<{
  WS: "ws";
  POLL: "poll";
  API: "api";
}>;

export declare const ROLE: Readonly<{
  VIEWER: "viewer";
  SUBSCRIBER: "subscriber";
  MEMBER: "member";
  MOD: "mod";
  BROADCASTER: "broadcaster";
  UNKNOWN: "unknown";
}>;

export interface BindingFormatV1 {
  type: "text" | "number" | "currency";
  prefix?: string;
  suffix?: string;
  precision?: number;
  casing?: "none" | "upper" | "lower";
}

export interface DynamicBindingV1 {
  mode: "dynamic";
  sourceId: string;
  fieldId: string;
  fallback: any;
  format?: BindingFormatV1;
}

export interface SourceFieldDefV1 {
  id: string;
  label: string;
  type: "text" | "number" | "image";
  path: string;
}

export interface SourceDefV1 {
  id: string;
  label: string;
  fields: SourceFieldDefV1[];
}

export type SourceCatalogV1 = readonly SourceDefV1[];
export declare const SOURCE_CATALOG_V1: SourceCatalogV1;

export interface OverlayRuntimeScopeV1 {
  tenantId: string;
  overlayPublicId: string;
  componentInstanceId?: string;
}

export interface OverlayRuntimeHeaderV1 {
  id: string;
  type: string;
  ts: number;
  producer: string;
  platform: string;
  scope: OverlayRuntimeScopeV1;
  version: "1";
}

export interface OverlayRuntimePacketV1<TPayload = Record<string, any>> {
  header: OverlayRuntimeHeaderV1;
  payload: TPayload;
}

export interface NativeComponentAddressV1 {
  kind: "native";
  tenantId: string;
  overlayPublicId: string;
  componentInstanceId: string;
}

export interface WidgetAdapterAddressV1 {
  kind: "widget";
  tenantId: string;
  overlayPublicId: string;
  widgetType: string;
  widgetId: string;
}

export type ComponentAddressV1 = NativeComponentAddressV1 | WidgetAdapterAddressV1;

export interface ComponentPropDefV1 {
  type: "text" | "color" | "image" | "boolean";
  label: string;
  default: any;
}

export interface ComponentDefinitionV1<TViewNode = any> {
  id: string;
  name: string;
  schemaVersion: number;
  kind: "overlay";
  view: {
    elements: TViewNode[];
  };
  propsSchema: Record<string, ComponentPropDefV1>;
  metadata?: Record<string, any>;
  variantGroupId?: string;
  variantName?: string;
}

export declare function deriveChatIdV1(input: {
  platform?: string;
  channelSlug?: string;
  authorKey?: string;
  ts?: string;
  text?: string;
}): string;

export declare function normalizeChatEnvelopeV1(input: any, opts?: Record<string, any>): any;
export declare function assertChatEnvelopeV1(env: any): void;
export declare function assertOverlayRuntimePacketV1(packet: any, options?: { allowLegacy?: boolean }): void;
export declare function createOverlayRuntimePacketV1<TPayload = Record<string, any>>(input: {
  header: Omit<OverlayRuntimeHeaderV1, "version"> & Partial<Pick<OverlayRuntimeHeaderV1, "version">>;
  payload: TPayload;
}): OverlayRuntimePacketV1<TPayload>;
