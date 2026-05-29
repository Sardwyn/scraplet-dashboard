#!/bin/bash
cd /home/sardwyn/repos/scraplet-dashboard
node scripts/test-gemini-bot.js "$(cat prompt.txt)"
