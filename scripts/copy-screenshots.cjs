const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

const baseDir = __dirname;
const candidates = [
  path.resolve(baseDir, '../../Pos420/e2e/__screenshots__'),
  path.resolve(baseDir, '../../../Pos420/e2e/__screenshots__'),
  path.resolve(process.cwd(), '../Pos420/e2e/__screenshots__'),
  'C:/src/Pos420/e2e/__screenshots__',
];
const screenshotsRootDir = candidates.find((p) => fs.existsSync(p));
const destDir = path.resolve(baseDir, '../public/docs/images');

if (!screenshotsRootDir) {
  console.error('Error: Could not find Pos420 screenshots directory.');
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const deviceMap = {
  'phone-landscape': 'galaxy-a52s-landscape',
  'phone-portrait': 'galaxy-a52s-portrait',
  'tab-small-landscape': 'tab-a11-landscape',
  'tab-small-portrait': 'tab-a11-portrait',
  'tab-big-landscape': 'tab-s7plus-landscape',
  'tab-big-portrait': 'tab-s7plus-portrait',
  // Default aliases
  'phone': 'galaxy-a52s-landscape',
  'tab-small': 'tab-a11-landscape',
  'tab-big': 'tab-s7plus-landscape',
};

function collectImages(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectImages(fullPath));
    } else if (entry.isFile() && /\.(png|jpg|jpeg|webp|svg)$/i.test(entry.name)) {
      results.push({ fullPath, name: entry.name });
    }
  }
  return results;
}

function cleanOldPngs(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      cleanOldPngs(fullPath);
    } else if (entry.isFile() && /\.(png)$/i.test(entry.name) && entry.name !== 'quixpos-logo.png') {
      try {
        fs.unlinkSync(fullPath);
      } catch (_) {}
    }
  }
}

function needsUpdate(srcPath, outDir, baseName) {
  const ext = path.extname(baseName).toLowerCase();
  const nameWithoutExt = path.basename(baseName, ext);
  const outName = ext === '.svg' ? baseName : `${nameWithoutExt}.avif`;
  const destPath = path.join(outDir, outName);

  if (!fs.existsSync(destPath)) {
    return true;
  }

  try {
    const srcMtime = fs.statSync(srcPath).mtimeMs;
    const destMtime = fs.statSync(destPath).mtimeMs;
    return srcMtime > destMtime;
  } catch (_) {
    return true;
  }
}

async function convertAndSaveImage({ srcPath, outDir, baseName }) {
  const ext = path.extname(baseName).toLowerCase();
  const nameWithoutExt = path.basename(baseName, ext);

  if (ext === '.svg') {
    const destPath = path.join(outDir, baseName);
    fs.copyFileSync(srcPath, destPath);
    return;
  }

  const outName = `${nameWithoutExt}.avif`;
  const destPath = path.join(outDir, outName);

  try {
    await sharp(srcPath)
      .avif({ quality: 80, effort: 4 })
      .toFile(destPath);
  } catch (err) {
    console.warn(`Could not convert image to AVIF: ${baseName}`, err.message);
  }
}

async function runParallel(tasks, concurrency) {
  let index = 0;
  let completed = 0;
  const total = tasks.length;
  const startTime = Date.now();

  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (index < total) {
      const currentIndex = index++;
      const task = tasks[currentIndex];
      await convertAndSaveImage(task);
      completed++;
      if (completed % 10 === 0 || completed === total) {
        process.stdout.write(
          `\rConverting images: ${completed}/${total} (${Math.round((completed / total) * 100)}%)`
        );
      }
    }
  });

  await Promise.all(workers);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nFinished converting ${total} images in ${elapsed}s using ${concurrency} parallel workers.`);
}

async function main() {
  const cpuCount = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 4;
  console.log(`Source screenshots directory: ${screenshotsRootDir}`);
  console.log(`Destination directory: ${destDir}`);

  cleanOldPngs(destDir);

  // Build task list
  const allTasks = [];
  const tasksToUpdate = [];

  for (const [targetKey, sourceDirName] of Object.entries(deviceMap)) {
    const srcPath = path.join(screenshotsRootDir, sourceDirName);
    const targetPath = path.join(destDir, targetKey);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    const images = collectImages(srcPath);
    for (const img of images) {
      const task = {
        srcPath: img.fullPath,
        outDir: targetPath,
        baseName: img.name,
      };
      allTasks.push(task);
      if (needsUpdate(img.fullPath, targetPath, img.name)) {
        tasksToUpdate.push(task);
      }
    }
  }

  // Add default root images (tab-s7plus-landscape -> root destDir)
  const defaultSrcPath = path.join(screenshotsRootDir, 'tab-s7plus-landscape');
  const defaultImages = collectImages(defaultSrcPath);
  for (const img of defaultImages) {
    const task = {
      srcPath: img.fullPath,
      outDir: destDir,
      baseName: img.name,
    };
    allTasks.push(task);
    if (needsUpdate(img.fullPath, destDir, img.name)) {
      tasksToUpdate.push(task);
    }
  }

  console.log(`Total images checked: ${allTasks.length}. Images needing update: ${tasksToUpdate.length}.`);

  if (tasksToUpdate.length > 0) {
    console.log(`Using ${cpuCount} CPU cores for parallel conversion.`);
    await runParallel(tasksToUpdate, cpuCount);
  } else {
    console.log('All AVIF screenshots are up to date with source images. Nothing to convert.');
  }

  // Handle Logo
  const logoCandidates = [
    path.resolve(baseDir, '../../Pos420/src/assets/quixpos-logo.png'),
    path.resolve(process.cwd(), '../Pos420/src/assets/quixpos-logo.png'),
    'C:/src/Pos420/src/assets/quixpos-logo.png',
  ];
  const logoSrc = logoCandidates.find((p) => fs.existsSync(p));
  if (logoSrc) {
    const logoDestAvif = path.join(destDir, 'quixpos-logo.avif');
    const logoDestPng = path.join(destDir, 'quixpos-logo.png');
    const srcMtime = fs.statSync(logoSrc).mtimeMs;
    const avifNeedsUpdate = !fs.existsSync(logoDestAvif) || srcMtime > fs.statSync(logoDestAvif).mtimeMs;
    const pngNeedsUpdate = !fs.existsSync(logoDestPng) || srcMtime > fs.statSync(logoDestPng).mtimeMs;

    if (avifNeedsUpdate) {
      await convertAndSaveImage({ srcPath: logoSrc, outDir: destDir, baseName: 'quixpos-logo.png' });
      console.log('Updated logo AVIF.');
    }
    if (pngNeedsUpdate) {
      try {
        fs.copyFileSync(logoSrc, logoDestPng);
        console.log('Updated logo PNG fallback.');
      } catch (_) {}
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal error during screenshot conversion:', err);
  process.exit(1);
});
