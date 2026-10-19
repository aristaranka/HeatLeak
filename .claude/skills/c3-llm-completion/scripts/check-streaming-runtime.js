/*
 * check-streaming-runtime.js — decide, BEFORE you write a streaming endpoint, whether genuine
 * token-by-token streaming is available in this deployment, and if so which runtime to pin to.
 *
 * WHY: c3.GenaiCore.Llm.<Provider>.Model.completion({stream:true}) only yields real provider chunks
 * in the model's NATIVE runtime. From any other runtime the platform quietly returns one blocking
 * response — so a "stream" endpoint that isn't pinned degrades into a fake stream (blank wait, then
 * the whole answer snaps in). This script tells you which path to take instead of guessing.
 *
 * HOW TO RUN: paste the body into the C3 code runner / Console, or invoke via C3AI-AppMCP runJsCode.
 * Optionally pass a completion-client config key you intend to use (defaults to "default-completions").
 *
 *     checkStreamingRuntime("claude_4.5_sonnet")
 *
 * OUTPUT: an object with a `verdict` field — one of:
 *   "NATIVE_STREAMING_READY"  -> pin your method to `pinRuntime` and call completion({stream:true}).
 *   "NATIVE_RUNTIME_NOT_INSTALLED" -> install `pinRuntime` (see the c3-runtime skill) OR use the
 *                                     portable stdlib generator path (references/streaming.md).
 *   "NO_STREAMING_RUNTIME_FOUND"  -> no known native streaming runtime is present; use the portable
 *                                    path, or ask an admin which runtime backs your model.
 */
function checkStreamingRuntime(configKey) {
  configKey = configKey || 'default-completions';
  var out = { configKey: configKey, verdict: null, pinRuntime: null, notes: [] };

  // Runtimes whose Action.Requirement backs native LLM streaming. The suffix `-server-py4j` is the
  // Action.Requirement form you append to the method signature in the .c3typ to PIN the method.
  var STREAMING_RUNTIME_PATTERNS = ['vertexai_litellm', 'litellm', 'bedrock', 'agents'];

  // 1) List installed runtimes and flag the streaming-capable ones.
  var installedStreaming = [];
  try {
    var runtimes = Py.Runtime.fetch().objs || [];
    runtimes.forEach(function (rt) {
      var name = rt.name || '';
      var matches = STREAMING_RUNTIME_PATTERNS.some(function (p) { return name.indexOf(p) !== -1; });
      if (!matches) return;
      var isInstalled = false;
      try { isInstalled = Py.libraryManager().isInstalled(Py.Runtime.forName(name)); } catch (e) { /* skip */ }
      if (isInstalled) installedStreaming.push(name);
    });
  } catch (e) {
    out.notes.push('Could not enumerate runtimes: ' + e);
  }
  out.installedStreamingRuntimes = installedStreaming;

  // 2) Confirm the completion client resolves, and record the model behind it (for context).
  try {
    var cfg = GenaiCore.Llm.Completion.Client.make({ name: configKey }).getConfig();
    if (!cfg) {
      out.notes.push('Completion client "' + configKey + '" has no config in this deployment — pick '
        + 'another config key (GenaiCore.Llm.Completion.Client.listConfigKeys().collect()) or '
        + 'configure your own (SKILL.md Step 4).');
    } else {
      out.clientResolved = true;
    }
  } catch (e) {
    out.notes.push('Could not resolve completion client "' + configKey + '": ' + e);
  }

  // 3) Derive the Action.Requirement to pin to. Convert an installed runtime name to its
  //    `-server-py4j` requirement form (e.g. "py.3.12-vertexai_litellm_312" -> the requirement
  //    "py-vertexai_litellm_312-server-py4j"). Prefer a vertexai_litellm runtime if present.
  function toRequirement(runtimeName) {
    // Strip a leading "py.<ver>-" or "py-" prefix, keep the library segment.
    var lib = runtimeName.replace(/^py[.\-][0-9.]*[.\-]?/, '').replace(/^py[.\-]/, '');
    return 'py-' + lib + '-server-py4j';
  }

  if (installedStreaming.length) {
    var preferred = installedStreaming.filter(function (n) { return n.indexOf('vertexai_litellm') !== -1; });
    var chosen = (preferred[0] || installedStreaming[0]);
    out.pinRuntime = toRequirement(chosen);
    out.verdict = 'NATIVE_STREAMING_READY';
    out.notes.push('Pin your stream<string> method with the suffix: ": stream<string> ' + out.pinRuntime + '"');
  } else {
    // Nothing installed. Was any streaming runtime even defined (but uninstalled)?
    var known = [];
    try {
      (Py.Runtime.fetch().objs || []).forEach(function (rt) {
        if (STREAMING_RUNTIME_PATTERNS.some(function (p) { return (rt.name || '').indexOf(p) !== -1; })) known.push(rt.name);
      });
    } catch (e) { /* already noted */ }
    if (known.length) {
      out.verdict = 'NATIVE_RUNTIME_NOT_INSTALLED';
      out.uninstalledCandidates = known;
      out.pinRuntime = toRequirement(known.filter(function (n) { return n.indexOf('vertexai_litellm') !== -1; })[0] || known[0]);
      out.notes.push('Install "' + out.pinRuntime + '" (c3-runtime skill) then re-run, or use the portable stdlib path.');
    } else {
      out.verdict = 'NO_STREAMING_RUNTIME_FOUND';
      out.notes.push('No known native streaming runtime present. Use the portable stdlib generator path '
        + '(references/streaming.md), or ask an admin which runtime backs your model.');
    }
  }

  return out;
}

// Usage: checkStreamingRuntime("claude_4.5_sonnet")
if (typeof module !== 'undefined') module.exports = { checkStreamingRuntime };
