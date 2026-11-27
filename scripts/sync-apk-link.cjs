'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOC_FILE = path.join(
  ROOT,
  'src',
  'docs',
  'content',
  '01-installation',
  '01-downloads-releases.md',
);
const APK_HELPER_FILE = path.join(ROOT, 'src', 'apkDownload.ts');

const MANIFEST_CANDIDATES = [
  path.resolve(ROOT, '../Pos420/web/public/android-apk.json'),
  path.resolve(ROOT, '../Pos420/dist-web/android-apk.json'),
  'C:/src/Pos420/web/public/android-apk.json',
  'C:/src/Pos420/dist-web/android-apk.json',
];

function syncApkLink() {
  const manifestPath = MANIFEST_CANDIDATES.find((p) => fs.existsSync(p));
  if (!manifestPath || !fs.existsSync(DOC_FILE)) {
    return;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const file = typeof manifest.file === 'string' ? manifest.file.trim() : '';
    if (!file || !/^QuixPOS-[A-Za-z0-9._-]+\.apk$/i.test(file)) {
      return;
    }

    const targetUrl = `https://pos.quixpos.com/${file}`;
    const rawDoc = fs.readFileSync(DOC_FILE, 'utf8');
    const updatedDoc = rawDoc.replace(
      /https:\/\/pos\.quixpos\.com\/(?:quixpos-latest\.apk|QuixPOS-[A-Za-z0-9._-]+\.apk)/g,
      targetUrl,
    );

    if (updatedDoc !== rawDoc) {
      fs.writeFileSync(DOC_FILE, updatedDoc, 'utf8');
      console.log(`[sync-apk-link] Updated APK link -> ${targetUrl}`);
    } else {
      console.log(`[sync-apk-link] APK link up to date (${targetUrl})`);
    }

    if (fs.existsSync(APK_HELPER_FILE)) {
      const rawHelper = fs.readFileSync(APK_HELPER_FILE, 'utf8');
      const updatedHelper = rawHelper.replace(
        /FALLBACK_ANDROID_APK_FILE = '[^']+'/,
        `FALLBACK_ANDROID_APK_FILE = '${file}'`,
      );
      if (updatedHelper !== rawHelper) {
        fs.writeFileSync(APK_HELPER_FILE, updatedHelper, 'utf8');
        console.log(`[sync-apk-link] Updated FALLBACK_ANDROID_APK_FILE -> ${file}`);
      }
    }
  } catch (err) {
    console.warn('[sync-apk-link] Skipped:', err.message);
  }
}

syncApkLink();
