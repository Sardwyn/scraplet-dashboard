export const SOURCE_CATALOG_V1 = Object.freeze([
  {
    id: "latest_chat",
    label: "Latest Chat",
    fields: [
      { id: "name", label: "Name", type: "text", path: "event.author.display" },
      { id: "text", label: "Message", type: "text", path: "event.message.text" },
      { id: "avatar", label: "Avatar", type: "image", path: "event.author.avatar_url" },
    ],
  },
  {
    id: "latest_alert",
    label: "Latest Alert",
    fields: [
      { id: "user", label: "User", type: "text", path: "event.actor.displayName" },
      { id: "message", label: "Message", type: "text", path: "event.message" },
      { id: "avatar", label: "Avatar", type: "image", path: "event.actor.avatar" },
      { id: "amount", label: "Amount", type: "text", path: "event.amount" },
      { id: "count", label: "Count", type: "number", path: "event.count" },
    ],
  },
  {
    id: "producer_card",
    label: "Producer Card",
    fields: [
      { id: "title", label: "Title", type: "text", path: "event.title" },
      { id: "body", label: "Body", type: "text", path: "event.text" },
      { id: "image", label: "Image", type: "image", path: "event.image" },
    ],
  },
  {
    id: "test_data",
    label: "Test Data",
    fields: [
      { id: "message", label: "Test Message", type: "text", path: "event.message" },
      { id: "random", label: "Random Num", type: "number", path: "event.random" },
    ],
  },
]);
