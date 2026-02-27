// public/js/widgets/plinko-settings.js
async function plinkoLoad() {
  const r = await fetch("/dashboard/api/widgets/plinko/config", { cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "load_failed");
  return j;
}

async function plinkoSave(patch) {
  const r = await fetch("/dashboard/api/widgets/plinko/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "save_failed");
  return j;
}

function $(id){ return document.getElementById(id); }

window.initPlinkoSettings = async function initPlinkoSettings() {
  const data = await plinkoLoad();
  const cfg = data.config || {};
  const ball = cfg?.visuals?.ball || {};

  // populate fields if they exist
  if ($("pl_ball_size")) $("pl_ball_size").value = ball.size ?? 24;
  if ($("pl_curve_min")) $("pl_curve_min").value = ball.curveMin ?? 10;
  if ($("pl_curve_max")) $("pl_curve_max").value = ball.curveMax ?? 20;
  if ($("pl_lift")) $("pl_lift").value = ball.controlLift ?? 0.55;
  if ($("pl_xlag")) $("pl_xlag").value = ball.xLag ?? 0.92;
  if ($("pl_spin_min")) $("pl_spin_min").value = ball.spinMin ?? 0.04;
  if ($("pl_spin_max")) $("pl_spin_max").value = ball.spinMax ?? 0.09;

  if ($("pl_save_btn")) {
    $("pl_save_btn").onclick = async () => {
      const patch = {
        visuals: {
          ball: {
            size: Number($("pl_ball_size")?.value || 24),
            curveMin: Number($("pl_curve_min")?.value || 10),
            curveMax: Number($("pl_curve_max")?.value || 20),
            controlLift: Number($("pl_lift")?.value || 0.55),
            xLag: Number($("pl_xlag")?.value || 0.92),
            spinMin: Number($("pl_spin_min")?.value || 0.04),
            spinMax: Number($("pl_spin_max")?.value || 0.09),
          }
        }
      };

      $("pl_save_btn").disabled = true;
      try {
        await plinkoSave(patch);
        if ($("pl_status")) $("pl_status").textContent = "Saved.";
      } catch (e) {
        if ($("pl_status")) $("pl_status").textContent = "Save failed: " + e.message;
      } finally {
        $("pl_save_btn").disabled = false;
      }
    };
  }
};
