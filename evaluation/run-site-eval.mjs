import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function argValue(flag, fallback) {
  const args = process.argv.slice(2);
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return fallback;
  }
  return args[idx + 1];
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePathForReport(filePath) {
  return filePath.replace(/\\/g, "/");
}

function decodeSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Cannot read config:", configPath);
    console.error(error.message);
    process.exit(2);
  }
}

function listHtmlFiles(rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function parseAttributes(rawAttributes) {
  const attrs = {};
  const attrRegex = /(\w[\w:-]*)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = attrRegex.exec(rawAttributes)) !== null) {
    attrs[match[1].toLowerCase()] = match[3];
  }
  return attrs;
}

function computeStatus(score, thresholds) {
  if (score >= thresholds.excellent) {
    return "excellent";
  }
  if (score >= thresholds.good) {
    return "good";
  }
  if (score >= thresholds.needs_attention) {
    return "needs_attention";
  }
  return "critical";
}

function ensureDirectory(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

const strictMode = process.argv.includes("--strict");
const configPath = path.resolve(path.join(__dirname, "site-evaluation.config.json"));
const config = readConfig(configPath);
const rootDir = path.resolve(path.join(__dirname, ".."));
const outputPath = path.resolve(
  argValue("--json", path.join(__dirname, "reports", "site-evaluation.latest.json"))
);

const htmlFiles = listHtmlFiles(rootDir);
if (htmlFiles.length === 0) {
  console.error("No HTML files found in", rootDir);
  process.exit(3);
}

const pagesRaw = new Map();
for (const page of htmlFiles) {
  const fullPath = path.join(rootDir, page);
  pagesRaw.set(page, fs.readFileSync(fullPath, "utf8"));
}

const report = {
  generatedAt: new Date().toISOString(),
  rootDir: normalizePathForReport(rootDir),
  configPath: normalizePathForReport(configPath),
  pages: [],
  navConsistency: {
    enabled: !!config.rules.check_nav_consistency,
    referencePage: null,
    inconsistentPages: []
  },
  overall: {
    score: 0,
    status: "unknown",
    counts: { errors: 0, warnings: 0, infos: 0 }
  }
};

const incomingLinks = new Map(htmlFiles.map((p) => [p, 0]));
const navSignatures = new Map();

function addFinding(pageResult, level, rule, message, details = {}) {
  pageResult.findings.push({ level, rule, message, details });
  if (level === "error") pageResult.counts.errors += 1;
  if (level === "warning") pageResult.counts.warnings += 1;
  if (level === "info") pageResult.counts.infos += 1;
}

for (const page of htmlFiles) {
  const content = pagesRaw.get(page);
  const analyzableContent = content.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  const pageResult = {
    page,
    score: 100,
    status: "unknown",
    counts: { errors: 0, warnings: 0, infos: 0 },
    checks: {
      title: { ok: true },
      metaDescription: { ok: true },
      h1: { ok: true },
      lang: { ok: true },
      mainLandmark: { ok: true },
      images: { ok: true },
      links: { ok: true },
      assets: { ok: true }
    },
    findings: []
  };

  const htmlLangMatch = analyzableContent.match(/<html[^>]*\blang\s*=\s*(["'])(.*?)\1/i);
  if (config.rules.lang_required && !htmlLangMatch) {
    pageResult.checks.lang.ok = false;
    addFinding(pageResult, "warning", "lang_required", "Missing lang attribute on <html>.");
  }
  if (htmlLangMatch && config.rules.lang_expected && htmlLangMatch[2] !== config.rules.lang_expected) {
    pageResult.checks.lang.ok = false;
    addFinding(
      pageResult,
      "warning",
      "lang_expected",
      "Unexpected lang value on <html>.",
      { expected: config.rules.lang_expected, found: htmlLangMatch[2] }
    );
  }

  const titleMatch = analyzableContent.match(/<title>([\s\S]*?)<\/title>/i);
  if (config.rules.title_required && !titleMatch) {
    pageResult.checks.title.ok = false;
    addFinding(pageResult, "error", "title_required", "Missing <title> tag.");
  } else if (titleMatch) {
    const titleValue = stripTags(titleMatch[1]);
    pageResult.checks.title.value = titleValue;
    if (titleValue.length < config.rules.title_min || titleValue.length > config.rules.title_max) {
      pageResult.checks.title.ok = false;
      addFinding(
        pageResult,
        "warning",
        "title_length",
        "Title length is outside recommended range.",
        { length: titleValue.length, min: config.rules.title_min, max: config.rules.title_max }
      );
    }
  }

  const metaDescTagMatch = analyzableContent.match(/<meta[^>]*\bname\s*=\s*(["'])description\1[^>]*>/i);
  if (config.rules.meta_description_required && !metaDescTagMatch) {
    pageResult.checks.metaDescription.ok = false;
    addFinding(pageResult, "warning", "meta_description_required", "Missing meta description.");
  } else if (metaDescTagMatch) {
    const contentAttrMatch = metaDescTagMatch[0].match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
    const descriptionText = contentAttrMatch ? contentAttrMatch[2].trim() : "";
    pageResult.checks.metaDescription.value = descriptionText;
    if (!descriptionText) {
      pageResult.checks.metaDescription.ok = false;
      addFinding(pageResult, "warning", "meta_description_empty", "Meta description content is empty.");
    } else if (
      descriptionText.length < config.rules.meta_description_min ||
      descriptionText.length > config.rules.meta_description_max
    ) {
      pageResult.checks.metaDescription.ok = false;
      addFinding(
        pageResult,
        "info",
        "meta_description_length",
        "Meta description length is outside recommended range.",
        {
          length: descriptionText.length,
          min: config.rules.meta_description_min,
          max: config.rules.meta_description_max
        }
      );
    }
  }

  const h1Matches = [...analyzableContent.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  pageResult.checks.h1.count = h1Matches.length;
  if (config.rules.h1_required && h1Matches.length === 0) {
    pageResult.checks.h1.ok = false;
    addFinding(pageResult, "error", "h1_required", "No <h1> found on page.");
  }
  if (h1Matches.length > config.rules.h1_max) {
    pageResult.checks.h1.ok = false;
    addFinding(
      pageResult,
      "warning",
      "h1_max",
      "More than one <h1> found on page.",
      { count: h1Matches.length, max: config.rules.h1_max }
    );
  }

  const hasMain = /<main\b/i.test(analyzableContent);
  pageResult.checks.mainLandmark.present = hasMain;
  if (config.rules.main_recommended && !hasMain) {
    pageResult.checks.mainLandmark.ok = false;
    addFinding(pageResult, "info", "main_recommended", "Consider adding a <main> landmark.");
  }

  const imageTags = [...analyzableContent.matchAll(/<img\b([^>]*?)>/gi)];
  let missingAltCount = 0;
  let missingImageFileCount = 0;

  for (const imageTag of imageTags) {
    const attrs = parseAttributes(imageTag[1]);
    if (config.rules.img_alt_required && !("alt" in attrs)) {
      missingAltCount += 1;
    }
    if (config.rules.img_alt_required && "alt" in attrs && attrs.alt.trim() === "") {
      addFinding(pageResult, "warning", "img_alt_empty", "Image has empty alt text.", { src: attrs.src || "" });
    }

    if (config.rules.local_assets_must_exist && attrs.src) {
      const src = attrs.src.trim();
      if (!/^(https?:|data:|mailto:|tel:)/i.test(src)) {
        const cleanSrc = decodeSafe(src.split("#")[0].split("?")[0]);
        if (cleanSrc) {
          const resolved = path.resolve(path.dirname(path.join(rootDir, page)), cleanSrc);
          if (!fs.existsSync(resolved)) {
            missingImageFileCount += 1;
            addFinding(pageResult, "error", "img_src_exists", "Image source file does not exist.", {
              src,
              resolved: normalizePathForReport(path.relative(rootDir, resolved))
            });
          }
        }
      }
    }
  }

  if (missingAltCount > 0) {
    pageResult.checks.images.ok = false;
    addFinding(pageResult, "error", "img_alt_required", "One or more images are missing alt text.", {
      count: missingAltCount
    });
  }
  if (missingImageFileCount > 0) {
    pageResult.checks.images.ok = false;
  }

  const scriptTags = [...content.matchAll(/<script\b([^>]*?)>/gi)];
  for (const scriptTag of scriptTags) {
    const attrs = parseAttributes(scriptTag[1]);
    if (!attrs.src || !config.rules.local_assets_must_exist) {
      continue;
    }
    const src = attrs.src.trim();
    if (/^(https?:|data:)/i.test(src)) {
      continue;
    }
    const cleanSrc = decodeSafe(src.split("#")[0].split("?")[0]);
    if (!cleanSrc) {
      continue;
    }
    const resolved = path.resolve(path.dirname(path.join(rootDir, page)), cleanSrc);
    if (!fs.existsSync(resolved)) {
      pageResult.checks.assets.ok = false;
      addFinding(pageResult, "error", "script_src_exists", "Script source file does not exist.", {
        src,
        resolved: normalizePathForReport(path.relative(rootDir, resolved))
      });
    }
  }

  const stylesheetTags = [...analyzableContent.matchAll(/<link\b([^>]*?)>/gi)];
  for (const stylesheetTag of stylesheetTags) {
    const attrs = parseAttributes(stylesheetTag[1]);
    if (!attrs.href || !config.rules.local_assets_must_exist) {
      continue;
    }
    const rel = (attrs.rel || "").toLowerCase();
    if (!rel.includes("stylesheet")) {
      continue;
    }
    const href = attrs.href.trim();
    if (/^(https?:|data:)/i.test(href)) {
      continue;
    }
    const cleanHref = decodeSafe(href.split("#")[0].split("?")[0]);
    if (!cleanHref) {
      continue;
    }
    const resolved = path.resolve(path.dirname(path.join(rootDir, page)), cleanHref);
    if (!fs.existsSync(resolved)) {
      pageResult.checks.assets.ok = false;
      addFinding(pageResult, "error", "stylesheet_href_exists", "Stylesheet file does not exist.", {
        href,
        resolved: normalizePathForReport(path.relative(rootDir, resolved))
      });
    }
  }

  const anchorTags = [...analyzableContent.matchAll(/<a\b([^>]*?)>/gi)];
  for (const anchorTag of anchorTags) {
    const attrs = parseAttributes(anchorTag[1]);
    const href = (attrs.href || "").trim();
    if (!href) {
      continue;
    }

    if (attrs.target === "_blank" && config.rules.target_blank_rel_required) {
      const relTokens = (attrs.rel || "").toLowerCase().split(/\s+/).filter(Boolean);
      const hasNoopener = relTokens.includes("noopener");
      const hasNoreferrer = relTokens.includes("noreferrer");
      if (!hasNoopener || !hasNoreferrer) {
        pageResult.checks.links.ok = false;
        addFinding(pageResult, "warning", "target_blank_rel", "External link uses target=_blank without full rel hardening.", {
          href,
          rel: attrs.rel || ""
        });
      }
    }

    if (!config.rules.internal_links_must_exist) {
      continue;
    }
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(href)) {
      continue;
    }

    const hrefWithoutHash = href.split("#")[0].split("?")[0].trim();
    if (!hrefWithoutHash) {
      continue;
    }

    const cleanHref = decodeSafe(hrefWithoutHash);
    const resolved = path.resolve(path.dirname(path.join(rootDir, page)), cleanHref);
    if (!fs.existsSync(resolved)) {
      pageResult.checks.links.ok = false;
      addFinding(pageResult, "error", "internal_link_exists", "Internal link points to a missing file.", {
        href,
        resolved: normalizePathForReport(path.relative(rootDir, resolved))
      });
      continue;
    }

    if (path.extname(cleanHref).toLowerCase() === ".html") {
      const targetPage = path.basename(cleanHref);
      if (incomingLinks.has(targetPage)) {
        incomingLinks.set(targetPage, incomingLinks.get(targetPage) + 1);
      }
    }
  }

  const navMatch = analyzableContent.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
  if (navMatch) {
    const navInner = navMatch[1];
    const labels = [...navInner.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
      .map((m) => stripTags(m[1]).toLowerCase())
      .filter(Boolean);
    navSignatures.set(page, labels);
  }

  const deductions =
    pageResult.counts.errors * config.weights.error +
    pageResult.counts.warnings * config.weights.warning +
    pageResult.counts.infos * config.weights.info;
  pageResult.score = Math.max(0, 100 - deductions);
  pageResult.status = computeStatus(pageResult.score, config.thresholds);
  report.pages.push(pageResult);
}

if (config.rules.detect_orphan_pages) {
  for (const pageResult of report.pages) {
    if (pageResult.page.toLowerCase() === "index.html") {
      continue;
    }
    const incoming = incomingLinks.get(pageResult.page) || 0;
    if (incoming === 0) {
      addFinding(
        pageResult,
        "warning",
        "orphan_page",
        "Page is not linked from other local HTML pages.",
        { page: pageResult.page }
      );
      const deductions =
        pageResult.counts.errors * config.weights.error +
        pageResult.counts.warnings * config.weights.warning +
        pageResult.counts.infos * config.weights.info;
      pageResult.score = Math.max(0, 100 - deductions);
      pageResult.status = computeStatus(pageResult.score, config.thresholds);
    }
  }
}

if (config.rules.check_nav_consistency && navSignatures.size > 1) {
  const referencePage = navSignatures.has("index.html")
    ? "index.html"
    : [...navSignatures.keys()].sort((a, b) => a.localeCompare(b))[0];
  const referenceSignature = navSignatures.get(referencePage) || [];
  report.navConsistency.referencePage = referencePage;

  for (const pageResult of report.pages) {
    const currentSignature = navSignatures.get(pageResult.page) || [];
    const sameLength = currentSignature.length === referenceSignature.length;
    const sameValues = sameLength && currentSignature.every((v, idx) => v === referenceSignature[idx]);
    if (!sameValues) {
      addFinding(
        pageResult,
        "warning",
        "nav_consistency",
        "Navigation links differ from reference page.",
        {
          referencePage,
          referenceLinks: referenceSignature,
          currentLinks: currentSignature
        }
      );
      report.navConsistency.inconsistentPages.push(pageResult.page);
      const deductions =
        pageResult.counts.errors * config.weights.error +
        pageResult.counts.warnings * config.weights.warning +
        pageResult.counts.infos * config.weights.info;
      pageResult.score = Math.max(0, 100 - deductions);
      pageResult.status = computeStatus(pageResult.score, config.thresholds);
    }
  }
}

const totalScore = report.pages.reduce((acc, pageResult) => acc + pageResult.score, 0);
const pageCount = report.pages.length;
const avgScore = pageCount > 0 ? Math.round((totalScore / pageCount) * 10) / 10 : 0;

for (const pageResult of report.pages) {
  report.overall.counts.errors += pageResult.counts.errors;
  report.overall.counts.warnings += pageResult.counts.warnings;
  report.overall.counts.infos += pageResult.counts.infos;
}

report.overall.score = avgScore;
report.overall.status = computeStatus(avgScore, config.thresholds);

ensureDirectory(outputPath);
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

console.log("Website evaluation completed.");
console.log("Root:", normalizePathForReport(rootDir));
console.log("Pages analyzed:", pageCount);
console.log("Global score:", report.overall.score, "/ 100", "=>", report.overall.status);
console.log(
  "Counts:",
  `errors=${report.overall.counts.errors}, warnings=${report.overall.counts.warnings}, infos=${report.overall.counts.infos}`
);
console.log("Report:", normalizePathForReport(outputPath));

if (strictMode && report.overall.counts.errors > 0) {
  process.exitCode = 1;
}
