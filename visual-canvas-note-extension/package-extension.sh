#!/usr/bin/env bash
# ساخت نسخه‌ی نصبی افزونه (فایل ZIP آماده‌ی Load Unpacked)
set -e
echo "» building app…"
npm run build

rm -rf .pkg-tmp
mkdir -p .pkg-tmp/persian-notes-extension
cp -r dist/* .pkg-tmp/persian-notes-extension/
# نسخه‌ی قبلی زیپ نباید داخل خودش قرار بگیرد
rm -f .pkg-tmp/persian-notes-extension/persian-notes-extension.zip

rm -f public/persian-notes-extension.zip
(cd .pkg-tmp && zip -qr ../public/persian-notes-extension.zip persian-notes-extension)
rm -rf .pkg-tmp

# قرار دادن همان زیپ در dist تا به‌صورت عمومی قابل دانلود باشد
cp public/persian-notes-extension.zip dist/persian-notes-extension.zip
echo "✓ done → dist/persian-notes-extension.zip"
