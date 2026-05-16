#!/bin/bash
python3 -c '
path = "/etc/nginx/sites-enabled/scraplet.store"
with open(path, "r") as f:
    lines = f.readlines()
new_lines = []
seen_locations = set()
skip_block = False
for line in lines:
    if "location ^~" in line:
        loc = line.strip()
        if loc in seen_locations:
            skip_block = True
            continue
        seen_locations.add(loc)
    
    if skip_block:
        if "}" in line:
            skip_block = False
        continue
    
    new_lines.append(line)

with open("/tmp/scraplet.store.clean", "w") as f:
    f.writelines(new_lines)
'
echo "$1" | sudo -S cp /tmp/scraplet.store.clean /etc/nginx/sites-enabled/scraplet.store
echo "$1" | sudo -S nginx -t && echo "$1" | sudo -S systemctl reload nginx
