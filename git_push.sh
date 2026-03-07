#!/bin/bash
git add views/tabs/scrapbot-disco.ejs
git commit -m "fix(ui): use locals.tabView for scope safety and add DOM must bindings"
git push origin master
