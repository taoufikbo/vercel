#!/usr/bin/env node

/**
 * categorize.js
 * Lit tous les fichiers HTML dans content/
 * Appelle Claude API pour détecter la catégorie
 * Déplace les fichiers dans le bon sous-dossier
 * Génère public/index.html (dashboard portfolio)
 */

import fs from "fs/promises";
import path from "path";
import { existsSync, mkdirSync } from "fs";

// ── Config ────────────────────────────────────────────────────────────────────
const CONTENT_DIR = "./content";
const PUBLIC_DIR = "./public";
const CATEGORIES = ["ia", "agile", "telco", "cloud", "architecture", "other"];
const CATEGORY_LABELS = {
  ia:           { label: "Intelligence Artificielle", emoji: "🤖", color: "#7C3AED" },
  agile:        { label: "Agile & Organisation",      emoji: "⚡", color: "#059669" },
  telco:        { label: "Telco & 5G",                emoji: "📡", color: "#0284C7" },
  cloud:        { label: "Cloud & Infrastructure",    emoji: "☁️",  color: "#0891B2" },
  architecture: { label: "Architecture & Design",     emoji: "🏗️",  color: "#D97706" },
  other:        { label: "Autres",                    emoji: "📄", color: "#6B7280" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function extractTextFromHTML(html) {
  // Extrait ~2000 chars de texte brut depuis le HTML pour l'envoyer à Claude
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function extractTitle(html, filename) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match    = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return (titleMatch?.[1] || h1Match?.[1] || filename.replace(".html", "")).trim();
}

function extractDescription(html) {
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (metaDesc) return metaDesc[1];
  const firstP = html.match(/<p[^>]*>([^<]{30,})<\/p>/i);
  return firstP ? firstP[1].trim().slice(0, 160) : "";
}

// ── Claude API call ───────────────────────────────────────────────────────────
async function categorizeWithClaude(filename, textContent) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 100,
      system: `Tu es un classificateur de contenu technique. Réponds UNIQUEMENT avec un JSON sur une seule ligne, sans markdown, sans explication.
Format exact : {"category":"<cat>","confidence":0.9}
Catégories valides : ia, agile, telco, cloud, architecture, other
- ia : IA, LLM, ML, données, NLP, automatisation intelligente
- agile : Scrum, Kanban, SAFe, organisation, management, transformation
- telco : 5G, RAN, Core, VNF, CNF, CaaS, réseau, Orange, opérateur
- cloud : OpenShift, Kubernetes, OCP, infrastructure, IaC, GitOps, CI/CD, lock-in
- architecture : design système, patterns, urbanisation, intégration, API
- other : tout le reste`,
      messages: [{
        role: "user",
        content: `Fichier: ${filename}\n\nContenu:\n${textContent}`
      }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim() || '{"category":"other","confidence":0.5}';
  try {
    return JSON.parse(text);
  } catch {
    return { category: "other", confidence: 0.5 };
  }
}

// ── Scan des fichiers HTML à la racine de content/ ───────────────────────────
async function scanNewFiles() {
  const entries = await fs.readdir(CONTENT_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith(".html"))
    .map(e => e.name);
}

// ── Scan de tous les fichiers déjà catégorisés ───────────────────────────────
async function scanAllCategorized() {
  const all = [];
  for (const cat of CATEGORIES) {
    const dir = path.join(CONTENT_DIR, cat);
    ensureDir(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith(".html")) {
        const filepath = path.join(dir, e.name);
        const html = await fs.readFile(filepath, "utf-8");
        all.push({
          category: cat,
          filename: e.name,
          filepath,
          title: extractTitle(html, e.name),
          description: extractDescription(html),
          url: `/${cat}/${e.name}`,
          mtime: (await fs.stat(filepath)).mtime,
        });
      }
    }
  }
  return all.sort((a, b) => b.mtime - a.mtime);
}

// ── Génération du dashboard index.html ───────────────────────────────────────
async function generateIndex(articles) {
  const byCategory = {};
  for (const cat of CATEGORIES) byCategory[cat] = [];
  for (const a of articles) byCategory[a.category].push(a);

  const totalCount = articles.length;
  const activeCategories = CATEGORIES.filter(c => byCategory[c].length > 0);

  const categoryNav = CATEGORIES.map(cat => {
    const info = CATEGORY_LABELS[cat];
    const count = byCategory[cat].length;
    if (count === 0) return "";
    return `<button class="cat-btn" data-cat="${cat}" onclick="filterCat('${cat}')">
      <span class="cat-emoji">${info.emoji}</span>
      <span class="cat-name">${info.label}</span>
      <span class="cat-count" style="background:${info.color}20;color:${info.color}">${count}</span>
    </button>`;
  }).join("\n");

  const cards = articles.map(a => {
    const info = CATEGORY_LABELS[a.category];
    const date = a.mtime.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    return `<a class="card" href="${a.url}" data-cat="${a.category}" style="--accent:${info.color}">
      <div class="card-header">
        <span class="card-cat" style="color:${info.color};background:${info.color}18">${info.emoji} ${info.label}</span>
        <span class="card-date">${date}</span>
      </div>
      <h3 class="card-title">${a.title}</h3>
      ${a.description ? `<p class="card-desc">${a.description}</p>` : ""}
    </a>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Base — Taoufik Bouazza</title>
  <style>
    :root {
      --bg:       #0B0E14;
      --surface:  #131720;
      --border:   #1E2533;
      --text:     #E2E8F0;
      --muted:    #64748B;
      --mono:     'JetBrains Mono', 'Fira Code', monospace;
      --sans:     'Inter', system-ui, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      min-height: 100vh;
    }

    /* ── Header ── */
    header {
      border-bottom: 1px solid var(--border);
      padding: 2rem 2.5rem 1.5rem;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .site-id {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .site-eyebrow {
      font-family: var(--mono);
      font-size: 0.65rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .site-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
    }

    .site-meta {
      font-family: var(--mono);
      font-size: 0.75rem;
      color: var(--muted);
      text-align: right;
    }

    .site-meta strong {
      color: var(--text);
      font-size: 1.5rem;
      font-weight: 700;
      display: block;
      line-height: 1;
    }

    /* ── Sidebar + Grid ── */
    .layout {
      display: grid;
      grid-template-columns: 220px 1fr;
      min-height: calc(100vh - 100px);
    }

    /* ── Sidebar ── */
    nav {
      border-right: 1px solid var(--border);
      padding: 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      position: sticky;
      top: 0;
      height: calc(100vh - 100px);
      overflow-y: auto;
    }

    .nav-label {
      font-family: var(--mono);
      font-size: 0.6rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      padding: 0 0.75rem;
      margin-bottom: 0.5rem;
    }

    .cat-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: none;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
      border-radius: 6px;
      font-size: 0.82rem;
      font-family: var(--sans);
      text-align: left;
      width: 100%;
      transition: background 0.15s, color 0.15s;
    }

    .cat-btn:hover, .cat-btn.active {
      background: var(--surface);
      color: var(--text);
    }

    .cat-emoji { font-size: 1rem; flex-shrink: 0; }
    .cat-name  { flex: 1; }

    .cat-count {
      font-family: var(--mono);
      font-size: 0.65rem;
      padding: 0.1rem 0.4rem;
      border-radius: 999px;
      font-weight: 600;
    }

    .btn-all {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: none;
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      border-radius: 6px;
      font-size: 0.82rem;
      font-family: var(--sans);
      width: 100%;
      margin-bottom: 0.75rem;
      font-weight: 600;
      transition: background 0.15s;
    }

    .btn-all:hover { background: var(--border); }

    /* ── Main ── */
    main {
      padding: 1.5rem 2rem;
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem 1rem;
      margin-bottom: 1.5rem;
    }

    .search-icon { color: var(--muted); font-size: 0.9rem; }

    .search-bar input {
      background: none;
      border: none;
      outline: none;
      color: var(--text);
      font-size: 0.875rem;
      width: 100%;
      font-family: var(--sans);
    }

    .search-bar input::placeholder { color: var(--muted); }

    /* ── Cards grid ── */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem;
    }

    .card {
      display: block;
      text-decoration: none;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem;
      transition: border-color 0.2s, transform 0.15s;
      border-left: 3px solid var(--accent);
    }

    .card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .card-cat {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      letter-spacing: 0.02em;
    }

    .card-date {
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
    }

    .card-title {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text);
      line-height: 1.4;
      margin-bottom: 0.5rem;
    }

    .card-desc {
      font-size: 0.78rem;
      color: var(--muted);
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .empty {
      grid-column: 1/-1;
      text-align: center;
      padding: 4rem 2rem;
      color: var(--muted);
      font-size: 0.875rem;
    }

    .empty strong { display: block; font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text); }

    /* ── Footer ── */
    footer {
      border-top: 1px solid var(--border);
      padding: 1rem 2.5rem;
      font-family: var(--mono);
      font-size: 0.65rem;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .layout { grid-template-columns: 1fr; }
      nav { position: static; height: auto; flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid var(--border); }
      .nav-label { display: none; }
      header { padding: 1.25rem; }
    }

    /* ── Hidden ── */
    .card.hidden { display: none; }
  </style>
</head>
<body>

<header>
  <div class="site-id">
    <span class="site-eyebrow">Knowledge Base / Publications</span>
    <span class="site-title">Taoufik Bouazza</span>
  </div>
  <div class="site-meta">
    <strong>${totalCount}</strong>
    documents indexés
  </div>
</header>

<div class="layout">
  <nav>
    <span class="nav-label">Filtrer</span>
    <button class="btn-all" onclick="filterCat('all')">📚 Tous les articles</button>
    ${categoryNav}
  </nav>

  <main>
    <div class="search-bar">
      <span class="search-icon">🔍</span>
      <input type="text" id="search" placeholder="Rechercher un article…" oninput="filterSearch(this.value)">
    </div>

    <div class="grid" id="grid">
      ${cards || `<div class="empty"><strong>Aucun contenu</strong>Dépose des fichiers HTML dans content/ puis relance le build.</div>`}
    </div>
  </main>
</div>

<footer>
  <span>Généré automatiquement — ${new Date().toLocaleString("fr-FR")}</span>
  <span>Structure: ${activeCategories.join(" · ")}</span>
</footer>

<script>
  let currentCat = 'all';
  let currentSearch = '';

  function applyFilters() {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
      const catMatch = currentCat === 'all' || card.dataset.cat === currentCat;
      const searchMatch = !currentSearch || card.textContent.toLowerCase().includes(currentSearch.toLowerCase());
      card.classList.toggle('hidden', !catMatch || !searchMatch);
    });
  }

  function filterCat(cat) {
    currentCat = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === cat));
    applyFilters();
  }

  function filterSearch(val) {
    currentSearch = val;
    applyFilters();
  }
</script>
</body>
</html>`;

  return html;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Build démarré…\n");
  ensureDir(PUBLIC_DIR);

  // 1. Copier les sous-dossiers catégorisés dans public/
  for (const cat of CATEGORIES) {
    const srcDir = path.join(CONTENT_DIR, cat);
    const dstDir = path.join(PUBLIC_DIR, cat);
    ensureDir(srcDir);
    ensureDir(dstDir);
    const files = await fs.readdir(srcDir).catch(() => []);
    for (const f of files) {
      if (f.endsWith(".html")) {
        await fs.copyFile(path.join(srcDir, f), path.join(dstDir, f));
      }
    }
  }

  // 2. Catégoriser les fichiers HTML à la racine de content/
  const newFiles = await scanNewFiles();
  if (newFiles.length > 0) {
    console.log(`📂 ${newFiles.length} nouveau(x) fichier(s) à catégoriser…\n`);
    for (const filename of newFiles) {
      const filepath = path.join(CONTENT_DIR, filename);
      const html = await fs.readFile(filepath, "utf-8");
      const text = extractTextFromHTML(html);
      console.log(`  → Analyse de ${filename}…`);
      const result = await categorizeWithClaude(filename, text);
      const cat = CATEGORIES.includes(result.category) ? result.category : "other";
      const destDir = path.join(CONTENT_DIR, cat);
      const destPath = path.join(destDir, filename);
      await fs.rename(filepath, destPath);
      // Copier immédiatement dans public/
      await fs.copyFile(destPath, path.join(PUBLIC_DIR, cat, filename));
      console.log(`     ✅ ${filename} → ${cat}/ (confiance: ${Math.round((result.confidence || 0) * 100)}%)`);
    }
  } else {
    console.log("✓ Aucun nouveau fichier à catégoriser\n");
  }

  // 3. Scanner tout et générer l'index
  const articles = await scanAllCategorized();
  const indexHTML = await generateIndex(articles);
  await fs.writeFile(path.join(PUBLIC_DIR, "index.html"), indexHTML, "utf-8");
  console.log(`\n✅ index.html généré — ${articles.length} articles indexés`);
  console.log(`📁 Dossier de déploiement : ${PUBLIC_DIR}/`);
}

main().catch(err => {
  console.error("❌ Erreur build:", err.message);
  process.exit(1);
});
