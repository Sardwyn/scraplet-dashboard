import 'dotenv/config';
import { getValidUserAccessToken } from "./services/kickUserTokens.js";
async function main() {
  try {
    const token = await getValidUserAccessToken(4);
    console.log("Token:", token.substring(0, 10) + "...");
    const resp = await fetch("https://api.kick.com/public/v1/channels?broadcaster_user_id=1546486", {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" }
    });
    console.log("STATUS:", resp.status);
    const text = await resp.text();
    console.log("BODY:", text);
    
    // Test the other route format too just in case
    const resp2 = await fetch("https://api.kick.com/public/v1/channels/yourbudde", {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" }
    });
    console.log("STATUS2:", resp2.status);
    const text2 = await resp2.text();
    console.log("BODY2:", text2.substring(0, 500));
  } catch (err) {
    console.error("Error:", err);
  }
  process.exit(0);
}
main();
