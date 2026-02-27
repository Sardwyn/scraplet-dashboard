export async function loadSkin(skinKey) {
  const key = String(skinKey || "neon-v1").trim();

  const res = await fetch(`/skins/${encodeURIComponent(key)}/skin.json`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to load skin.json for skin=${key} (${res.status})`);
  }

  const json = await res.json();
  if (!json || typeof json !== "object") {
    throw new Error("Invalid skin.json");
  }

  return json;
}
