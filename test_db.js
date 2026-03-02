import "./bootstrap/env.js";
import db from "./db.js";

async function run() {
    const { rows } = await db.query("SELECT * FROM public.discord_guild_integrations");
    console.log(JSON.stringify(rows, null, 2));
}

run().catch(console.error).finally(() => process.exit(0));
