const fs = require('fs');
const path = require('path');
// Resolved from THIS file so the script is cwd-independent. This script lives at
// c3/nexusClient/react/demo/demo/, so: `dist/` is emitted beside the demo dir (vite.demo.config.ts
// build.outDir = <demo>/dist, one level up), and the served tree is the nexusClient package's
// ui/content (three levels up: demo/demo -> demo -> react -> nexusClient).
const DIST_PATH = path.resolve(__dirname, '../dist');
const UI_CONTENT_PATH = path.resolve(__dirname, '../../../ui/content');

/**
 * Routes the SPA owns and therefore needs a landed `index.html` for, so C3's UiService serves a
 * deep link (or a refresh on one) instead of 404ing before React Router boots. `/` is the index
 * written separately. MUST stay in sync with the routes `demo/EmbedDemoRoutes.tsx` actually
 * serves without redirecting — a stale entry here ships a directory for a route that no longer
 * exists (that is how a phantom `/home` survived). Pinned by `src/demo/postBuild.test.ts`.
 */
const ROUTE_PATHS = ['chat'];

/**
 * Emitted-CSS rules that can only come from the `@c3/agentix-client-ui` `ui/*` primitives the chat UI
 * composes (a dialog's width, its Radix open-state variant, its enter animation). Nothing in `demo/`
 * writes them, so they are the cheapest available proof that the Tailwind scanner still walks the
 * whole presentation layer: if the `@source` registration regresses they vanish while the build
 * otherwise succeeds — and the MCP consent dialog renders invisible at runtime.
 *
 * Matched as RULES, not substrings. A plain `includes('max-w-lg')` is a false pass: the
 * responsive variant `.sm\:max-w-lg` ships from elsewhere and satisfies a substring search even
 * when the bare `.max-w-lg` utility is missing entirely (observed on a real artifact).
 *
 * jsdom does not apply stylesheets, so no vitest run can ever catch this. The build is the only
 * automated place the check can live.
 */
const HOST_ONLY_CSS_RULES = [
  { label: 'max-w-lg (dialog width)', pattern: /\.max-w-lg\s*\{/ },
  { label: 'animate-in (dialog enter animation)', pattern: /\.animate-in\s*\{/ },
  { label: 'data-state=open (Radix open-state variant)', pattern: /\[data-state=["']?open["']?\]/ },
];

/**
 * Strip <script>/<link> tags that point at assets/* and return them in document order.
 * We re-inject them via document.write(..., src|href = b + path) together with <base>.
 * Otherwise the browser's speculative preload scanner may fetch "assets/..." against the
 * document URL (e.g. .../chat/) before the inline script runs, producing 404s on .../chat/assets/.
 */
function extractAssetTags(html) {
  const tags = [];

  const scriptRe = /<script[^>]+src="(assets\/[^"]+)"[^>]*>[\s\S]*?<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    tags.push({ full: m[0], path: m[1], isScript: true });
  }

  const linkRe = /<link[^>]+href="(assets\/[^"]+)"[^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    if (/rel\s*=\s*"stylesheet"/i.test(m[0])) {
      tags.push({ full: m[0], path: m[1], isScript: false });
    }
  }

  if (tags.length === 0) {
    throw new Error('postBuild.cjs: no assets/ script or link in dist/index.html (unexpected Vite output)');
  }
  let cleaned = html;
  for (const t of tags) {
    cleaned = cleaned.split(t.full).join('');
  }
  return { cleaned, tags };
}

/** Rewrite Vite's `./assets/` references to gateway-relative `assets/`. */
function toSpaHtml(indexHtml) {
  return indexHtml.replace(/src="\.\/assets\//g, 'src="assets/').replace(/href="\.\/assets\//g, 'href="assets/');
}

/**
 * Build the head script that plants a dynamic `<base>` and re-writes the asset tags underneath it.
 * A page served at root (`/`, local preview) has no `/<env>/<app>` prefix, so it takes the
 * relative branch and emits no `<base>` at all.
 */
function buildDynamicBaseScript(assetTags) {
  const write = (t, prefix) =>
    t.isScript
      ? '        document.write(\'<script type="module" crossorigin src="' + prefix + t.path + '"><\\/script>\');'
      : '        document.write(\'<link rel="stylesheet" crossorigin href="' + prefix + t.path + '">\');';

  const assetWrites = assetTags.map((t) => write(t, "'+b+'")).join('\n');
  const assetWritesRelative = assetTags.map((t) => write(t, '')).join('\n');

  return (
    `<script>
      (function(){
        var p=location.pathname.split('/').filter(Boolean);
        if(p.length<2) {
` +
    assetWritesRelative +
    `
          return;
        }
        var b='/'+p[0]+'/'+p[1]+'/';
        document.write('<base href="'+b+'">');
` +
    assetWrites +
    `
      })();
    </script>`
  );
}

/** Splice the dynamic-base script into the head, right after </title>. */
function injectDynamicBase(spaWithoutAssetTags, dynamicBase) {
  const finalHtml = spaWithoutAssetTags.replace('</title>', '</title>\n    ' + dynamicBase);
  if (finalHtml === spaWithoutAssetTags) {
    throw new Error('postBuild.cjs: </title> not found in index.html — dynamic base script injection failed');
  }
  return finalHtml;
}

/** Full dist/index.html → served index.html transform. */
function buildIndexHtml(indexHtml) {
  const { cleaned, tags } = extractAssetTags(toSpaHtml(indexHtml));
  return injectDynamicBase(cleaned, buildDynamicBaseScript(tags));
}

/**
 * Fail the build when the emitted stylesheet is missing rules that can only come from the
 * `@c3/agentix-client-ui` `ui/*` primitives — i.e. when Tailwind stopped scanning the presentation
 * layer. Failing here is the point: the alternative is a green build that ships an invisible MCP
 * consent dialog.
 */
function assertHostOnlyCssRules(css, cssPathLabel) {
  const missing = HOST_ONLY_CSS_RULES.filter((rule) => !rule.pattern.test(css));
  if (missing.length === 0) return;
  throw new Error(
    `postBuild.cjs: emitted CSS (${cssPathLabel}, ${css.length} bytes) is missing host-only ` +
      `Tailwind rules: ${missing.map((r) => r.label).join(', ')}.\n` +
      'These reach the bundle only via the packaged ui/* primitives the chat UI composes, so their\n' +
      "absence means Tailwind's scan roots regressed and shared chrome will render unstyled —\n" +
      'most visibly the MCP consent dialog, which becomes invisible rather than merely ugly.\n' +
      "Fix: check the @source roots in demo/demo.css and the @import of @c3/agentix-client-ui's\n" +
      'tailwind-sources.css it relies on — a moved, renamed, or dropped @source line is the\n' +
      'usual cause.'
  );
}

/** The emitted stylesheet(s) under a served `assets/` dir. */
function findEmittedCss(uiContentPath) {
  const assetsDir = path.join(uiContentPath, 'assets');
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`postBuild.cjs: no assets/ dir at ${assetsDir} — the demo build emitted nothing to verify`);
  }
  const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
  if (cssFiles.length === 0) {
    throw new Error(
      `postBuild.cjs: no *.css in ${assetsDir} — the Tailwind entry (demo/demo.css) produced no ` +
        'stylesheet, so the embed would render completely unstyled'
    );
  }
  return cssFiles.map((f) => path.join(assetsDir, f));
}

/** Real build locations, used when this runs as a script. Overridable per-call for tests. */
const MAIN_DEFAULTS = { distPath: DIST_PATH, uiContentPath: UI_CONTENT_PATH, log: console.log };

/**
 * Copy the built SPA into the served `ui/content`, verify the stylesheet, and land an index at
 * every owned route. Paths are injectable so the whole flow is testable against a temp dir.
 */
function main(overrides) {
  const { distPath, uiContentPath, log } = { ...MAIN_DEFAULTS, ...overrides };
  if (fs.existsSync(uiContentPath)) {
    fs.rmSync(uiContentPath, { recursive: true });
  }
  fs.mkdirSync(uiContentPath, { recursive: true });

  fs.cpSync(distPath, uiContentPath, { recursive: true });
  log('Copied dist →', uiContentPath);

  // Verify the stylesheet BEFORE writing the HTML, so a scan-root regression fails the build
  // instead of quietly shipping.
  for (const cssPath of findEmittedCss(uiContentPath)) {
    const css = fs.readFileSync(cssPath, 'utf-8');
    assertHostOnlyCssRules(css, path.relative(uiContentPath, cssPath));
    log('Verified host-only Tailwind rules in', path.relative(uiContentPath, cssPath), `(${css.length} bytes)`);
  }

  const finalHtml = buildIndexHtml(fs.readFileSync(path.join(distPath, 'index.html'), 'utf-8'));
  fs.writeFileSync(path.join(uiContentPath, 'index.html'), finalHtml);

  for (const sub of ROUTE_PATHS) {
    const dir = path.join(uiContentPath, sub);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), finalHtml);
    log('Created', sub + '/index.html');
  }
}

module.exports = {
  ROUTE_PATHS,
  HOST_ONLY_CSS_RULES,
  MAIN_DEFAULTS,
  extractAssetTags,
  toSpaHtml,
  buildDynamicBaseScript,
  injectDynamicBase,
  buildIndexHtml,
  assertHostOnlyCssRules,
  findEmittedCss,
  main,
};

if (require.main === module) {
  main();
}
