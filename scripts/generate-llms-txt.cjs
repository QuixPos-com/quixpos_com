/**
 * generate-llms-txt.cjs
 *
 * Generates dist/llms.txt from src/docs/content/**
 * following the llms.txt convention (https://llmstxt.org/).
 *
 * Run after `vite build`, e.g.:
 *   node ./scripts/generate-llms-txt.cjs
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// -- Config

const ROOT        = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src', 'docs', 'content');
const OUT_FILE    = path.join(ROOT, 'dist', 'llms.txt');

const SITE_TITLE       = 'QuixPOS Dokumentation';
const SITE_DESCRIPTION =
  'Vollst\u00e4ndige Dokumentation f\u00fcr QuixPOS \u2013 das modulare Kassensystem f\u00fcr JTL-Wawi. ' +
  'Enth\u00e4lt Installationsanleitungen, Konfigurationsreferenzen und Bedienungshandb\u00fccher.';
const SITE_URL         = 'https://quixpos.com';

// -- Helpers

function stripBom(str) {
  return str.replace(/^\uFEFF/, '');
}

function parseFrontmatter(raw) {
  const fm = {};
  let body = raw;
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      fm[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
    body = match[2];
  }
  return {
    id:          fm['id']          ?? '',
    title:       fm['title']       ?? '',
    description: fm['description'] ?? '',
    body,
  };
}

function sortKey(name) {
  const m = name.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : 9999;
}

function readCategory(jsonPath) {
  try {
    return JSON.parse(stripBom(fs.readFileSync(jsonPath, 'utf8')));
  } catch {
    return null;
  }
}

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^---+$/gm, '')
    .replace(/\| ?:?-+:? ?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// -- Build

function build() {
  const categoryFolders = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => sortKey(a.name) - sortKey(b.name));

  const sections = [];

  for (const folder of categoryFolders) {
    const folderPath = path.join(CONTENT_DIR, folder.name);
    const catMeta    = readCategory(path.join(folderPath, '_category.json'));
    if (!catMeta) continue;

    const mdFiles = fs
      .readdirSync(folderPath)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => sortKey(a) - sortKey(b));

    const pages = [];
    for (const mdFile of mdFiles) {
      const raw = stripBom(fs.readFileSync(path.join(folderPath, mdFile), 'utf8'));
      const { title, description, body } = parseFrontmatter(raw);
      pages.push({ title, description, body });
    }

    if (pages.length === 0) continue;
    sections.push({ catTitle: catMeta.title, pages });
  }

  const lines = [];
  lines.push('# ' + SITE_TITLE);
  lines.push('');
  lines.push('> ' + SITE_DESCRIPTION);
  lines.push('');
  lines.push('Source: ' + SITE_URL);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const { catTitle, pages } of sections) {
    lines.push('## ' + catTitle);
    lines.push('');
    for (const { title, description, body } of pages) {
      lines.push('### ' + title);
      if (description) {
        lines.push('');
        lines.push(description);
      }
      lines.push('');
      lines.push(stripMarkdown(body));
      lines.push('');
    }
  }

  const distDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log('llms.txt written to ' + OUT_FILE + ' (' + kb + ' KB)');
}

build();