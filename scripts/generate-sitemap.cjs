/**
 * generate-sitemap.cjs
 *
 * Generates sitemap.xml for quixpos.com based on static routes
 * and src/docs/content/** markdown documentation pages.
 *
 * Writes to public/sitemap.xml and dist/sitemap.xml.
 *
 * Run via:
 *   node ./scripts/generate-sitemap.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src', 'docs', 'content');
const DIST_DIR = path.join(ROOT, 'dist');
const PUBLIC_DIR = path.join(ROOT, 'public');

const SITE_URL = 'https://quixpos.com';

function stripBom(str) {
  return str.replace(/^\uFEFF/, '');
}

function parseFrontmatterId(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim();
      const val = line.slice(colon + 1).trim();
      if (key === 'id') return val;
    }
  }
  return '';
}

function sortKey(item) {
  const name = typeof item === 'string' ? item : item?.name ?? '';
  const m = name.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : 9999;
}

function writeToTargets(filename, content) {
  const targets = [path.join(PUBLIC_DIR, filename)];
  if (fs.existsSync(DIST_DIR)) {
    targets.push(path.join(DIST_DIR, filename));
  }

  for (const target of targets) {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(target, content, 'utf8');
    const kb = (fs.statSync(target).size / 1024).toFixed(1);
    console.log(`${filename} written to ${target} (${kb} KB)`);
  }
}

function build() {
  const today = new Date().toISOString().split('T')[0];

  const staticUrls = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${SITE_URL}/docs`, priority: '0.9', changefreq: 'weekly' },
    { loc: `${SITE_URL}/account`, priority: '0.6', changefreq: 'monthly' },
    { loc: `${SITE_URL}/privacypolicy`, priority: '0.3', changefreq: 'yearly' },
    { loc: `${SITE_URL}/terms`, priority: '0.3', changefreq: 'yearly' },
  ];

  const categoryFolders = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => sortKey(a.name) - sortKey(b.name));

  const docUrls = [];

  for (const folder of categoryFolders) {
    const folderPath = path.join(CONTENT_DIR, folder.name);
    const mdFiles = fs
      .readdirSync(folderPath)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => sortKey(a) - sortKey(b));

    for (const mdFile of mdFiles) {
      const filePath = path.join(folderPath, mdFile);
      const raw = stripBom(fs.readFileSync(filePath, 'utf8'));
      const id = parseFrontmatterId(raw);
      if (!id) continue;

      let lastmod = today;
      try {
        const stat = fs.statSync(filePath);
        lastmod = stat.mtime.toISOString().split('T')[0];
      } catch {
        // fallback to today
      }

      docUrls.push({
        loc: `${SITE_URL}/docs/${id}`,
        priority: '0.8',
        changefreq: 'weekly',
        lastmod,
      });
    }
  }

  const allUrls = [...staticUrls.map((u) => ({ ...u, lastmod: today })), ...docUrls];

  const xmlLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];

  for (const item of allUrls) {
    xmlLines.push('  <url>');
    xmlLines.push(`    <loc>${item.loc}</loc>`);
    if (item.lastmod) {
      xmlLines.push(`    <lastmod>${item.lastmod}</lastmod>`);
    }
    if (item.changefreq) {
      xmlLines.push(`    <changefreq>${item.changefreq}</changefreq>`);
    }
    if (item.priority) {
      xmlLines.push(`    <priority>${item.priority}</priority>`);
    }
    xmlLines.push('  </url>');
  }

  xmlLines.push('</urlset>');
  xmlLines.push('');

  writeToTargets('sitemap.xml', xmlLines.join('\n'));
}

build();
