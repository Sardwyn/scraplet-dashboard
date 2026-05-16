#!/bin/bash
TARGET="/etc/nginx/sites-enabled/scraplet.store"
# Create a fixed version in /tmp
python3 -c '
import sys
path = "/etc/nginx/sites-enabled/scraplet.store"
with open(path, "r") as f:
    lines = f.readlines()
new_lines = []
skip = False
for line in lines:
    if "# Widget Library API" in line:
        skip = True
        new_lines.append("    # Widget Library API (dashboard port 3000)\n")
        new_lines.append("    location ^~ /api/widget-library/ {\n")
        new_lines.append("        proxy_pass http://127.0.0.1:3000;\n")
        new_lines.append("        proxy_http_version 1.1;\n")
        new_lines.append("        proxy_set_header Host $host;\n")
        new_lines.append("        proxy_set_header X-Real-IP $remote_addr;\n")
        new_lines.append("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
        new_lines.append("        proxy_set_header X-Forwarded-Proto $scheme;\n")
        new_lines.append("        proxy_set_header Connection \"\";\n")
        new_lines.append("    }\n\n")
        new_lines.append("    # Bot Widget Preferences API (dashboard port 3000)\n")
        new_lines.append("    location ^~ /api/bot-widget-preferences/ {\n")
        new_lines.append("        proxy_pass http://127.0.0.1:3000;\n")
        new_lines.append("        proxy_http_version 1.1;\n")
        new_lines.append("        proxy_set_header Host $host;\n")
        new_lines.append("        proxy_set_header X-Real-IP $remote_addr;\n")
        new_lines.append("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
        new_lines.append("        proxy_set_header X-Forwarded-Proto $scheme;\n")
        new_lines.append("        proxy_set_header Connection \"\";\n")
        new_lines.append("    }\n\n")
        new_lines.append("    # Bot Layer API (dashboard port 3000)\n")
        new_lines.append("    location ^~ /api/bot/ {\n")
        new_lines.append("        proxy_pass http://127.0.0.1:3000;\n")
        new_lines.append("        proxy_http_version 1.1;\n")
        new_lines.append("        proxy_set_header Host $host;\n")
        new_lines.append("        proxy_set_header X-Real-IP $remote_addr;\n")
        new_lines.append("        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
        new_lines.append("        proxy_set_header X-Forwarded-Proto $scheme;\n")
        new_lines.append("        proxy_set_header Connection \"\";\n")
        new_lines.append("    }\n")
        continue
    if skip:
        if "# Scrapbot API catch-all" in line:
            skip = False
            new_lines.append("\n")
            new_lines.append(line)
        continue
    new_lines.append(line)
with open("/tmp/scraplet.store.fixed", "w") as f:
    f.writelines(new_lines)
'
# Apply
echo "$1" | sudo -S cp /tmp/scraplet.store.fixed "$TARGET"
echo "$1" | sudo -S nginx -t && echo "$1" | sudo -S systemctl reload nginx
