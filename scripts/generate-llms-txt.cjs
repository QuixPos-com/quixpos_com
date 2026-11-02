/**
 * generate-llms-txt.cjs
 *
 * Generates llms.txt and llms-full.txt from src/docs/content/**
 * following the llms.txt convention (https://llmstxt.org/).
 *
 * Writes to dist/ (for production builds) and public/ (for dev/preview).
 *
 * Run via:
 *   node ./scripts/generate-llms-txt.cjs
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// -- Config

const ROOT        = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'src', 'docs', 'content');
const DIST_DIR    = path.join(ROOT, 'dist');
const PUBLIC_DIR  = path.join(ROOT, 'public');

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

function sortKey(item) {
  const name = typeof item === 'string' ? item : item?.name ?? '';
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

function writeToTargets(filename, content) {
  const targets = [
    path.join(PUBLIC_DIR, filename),
  ];
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
      .sort((a, b) => sortKey(a.name) - sortKey(b.name));

    const pages = [];
    for (const mdFile of mdFiles) {
      const raw = stripBom(fs.readFileSync(path.join(folderPath, mdFile), 'utf8'));
      const { id, title, description, body } = parseFrontmatter(raw);
      pages.push({ id, title, description, body });
    }

    if (pages.length === 0) continue;
    sections.push({ catTitle: catMeta.title, pages });
  }

  // 1. Generate llms.txt (Standard curated index with links)
  const indexLines = [];
  indexLines.push('# ' + SITE_TITLE);
  indexLines.push('');
  indexLines.push('> ' + SITE_DESCRIPTION);
  indexLines.push('');
  indexLines.push('Source: ' + SITE_URL + '/docs');
  indexLines.push('');
  indexLines.push('## Übersicht & Einstieg');
  indexLines.push('');
  indexLines.push(`- [Startseite](${SITE_URL}/): QuixPOS – Das Kassensystem für den Ladenalltag.`);
  indexLines.push(`- [Dokumentation](${SITE_URL}/docs): Handbücher, Anleitungen und Schnellstart.`);
  indexLines.push('');

  for (const { catTitle, pages } of sections) {
    indexLines.push('## ' + catTitle);
    indexLines.push('');
    for (const { id, title, description } of pages) {
      const url = `${SITE_URL}/docs/${id}`;
      const desc = description ? `: ${description}` : '';
      indexLines.push(`- [${title}](${url})${desc}`);
    }
    indexLines.push('');
  }

  indexLines.push('## Optional');
  indexLines.push('');
  indexLines.push(`- [Vollständige Dokumentation](${SITE_URL}/llms-full.txt): Der komplette Text aller Dokumentationsseiten zusammengefasst.`);
  indexLines.push('');

  writeToTargets('llms.txt', indexLines.join('\n'));

  // 2. Generate llms-full.txt (Full content for in-depth retrieval)
  const fullLines = [];
  fullLines.push('# ' + SITE_TITLE + ' (Volltext)');
  fullLines.push('');
  fullLines.push('> ' + SITE_DESCRIPTION);
  fullLines.push('');
  fullLines.push('Source: ' + SITE_URL + '/docs');
  fullLines.push('');
  fullLines.push('---');
  fullLines.push('');

  for (const { catTitle, pages } of sections) {
    fullLines.push('## ' + catTitle);
    fullLines.push('');
    for (const { id, title, description, body } of pages) {
      const url = `${SITE_URL}/docs/${id}`;
      fullLines.push(`### [${title}](${url})`);
      if (description) {
        fullLines.push('');
        fullLines.push(description);
      }
      fullLines.push('');
      fullLines.push(stripMarkdown(body));
      fullLines.push('');
      fullLines.push('---');
      fullLines.push('');
    }
  }

  writeToTargets('llms-full.txt', fullLines.join('\n'));
}

build();
