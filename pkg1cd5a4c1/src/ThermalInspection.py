"""
HeatLeak AI -- ThermalInspection.analyze (vision engine)

The client's pixel scout proposes candidate regions from the ACTUAL uploaded image
and passes them here together with a coarse apparent-temperature grid and, per
candidate, a small JPEG crop. This method gives the model the full image, the
crops and the grid, asks for a keep/reject verdict per candidate, specific
explanations for keepers and up to two additional findings, then persists the
result as ThermalAnomaly records and updates the inspection.

Payload accepted (see AnalyzePayload in ui/react/src/lib/heatleak.ts):

    {"regions": [...], "gridText": "...", "gridW": 24, "gridH": 16}

or, for unmerged branches, the legacy bare array of regions.

explanationSource on the inspection states truthfully what produced the text:
    'vision'   the model saw the full image (+ crops)
    'text'     the model saw only the grid and region statistics
    'template' the LLM call failed and template text was used

-----------------------------------------------------------------------------
B1 PROBE (run once in the Studio Python console, then set VISION_SHAPE below)

    client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("default-completions")
    B64 = "<base64 of a small real PNG>"
    text = {"type": "text", "text": "Describe this image in one sentence."}
    # Try 1 -- OpenAI-style parts
    msgs = [{"role": "user", "content": [text,
        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + B64}}]}]
    # Try 2 -- Anthropic/Bedrock-native parts
    msgs = [{"role": "user", "content": [text,
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": B64}}]}]
    r = client.completion(messages=msgs, options={"max_tokens": 100})
    print(r["choices"][0]["message"]["content"])

    VISION ON via openai     -> VISION_SHAPE = "openai"
    VISION ON via anthropic  -> VISION_SHAPE = "anthropic"
    VISION OFF               -> VISION_SHAPE = "off"
-----------------------------------------------------------------------------
"""

import json
import re

# Which multimodal message shape the C3 completion client passes through to the
# model. "auto" tries "openai" then "anthropic" and falls back to the text path
# if both fail; set it to the probe's answer so the demo makes exactly one call.
VISION_SHAPE = "openai"  # "openai" | "anthropic" | "off" | "auto"  (probe: VISION ON via openai)

MAX_ADDITIONAL_FINDINGS = 2
MAX_TOKENS = 8000  # the full reply for 5 candidates ran past 3000
CONFIG_KEY = "default-completions"

CATEGORIES = [
    "Window-frame thermal contrast",
    "Possible thermal bridging",
    "Door-seal irregularity",
    "Wall/ceiling temperature pattern",
    "Ambiguous thermal pattern",
]
PRIORITIES = ["Low", "Medium", "High"]

SYSTEM_PROMPT = (
    "Role: you are a building-thermography screening assistant reviewing an infrared "
    "image of a building.\n\n"
    "Task: for every candidate region you are given, decide keep or reject.\n"
    "Reject anything that is not a building-envelope surface: sky, clouds, vegetation, "
    "ground, people, animals, vehicles, lamps, chimneys or flues in normal operation, "
    "sun reflections in glass, camera text overlays, palette scale bars. For a "
    "rejection give a one-sentence rejectionReason naming what the region actually is "
    "(for example \"Open sky above the roofline, not a building surface.\").\n\n"
    "For keepers, be specific and spatial: name the building element and the shape of "
    "the pattern (\"narrow cold band along the sill under the left window\", \"vertical "
    "warm streak at stud spacing\"). Do not write generic text such as \"a cooler region "
    "that may warrant attention\". Use at most one hedge per finding, and place it in "
    "verificationStep only.\n\n"
    "You may add up to " + str(MAX_ADDITIONAL_FINDINGS) + " additionalFindings, only "
    "if they are clearly visible in the image and not already covered by a candidate. "
    "Give each a bounding box as fractions (0..1) of the full frame: xPct, yPct are the "
    "top-left corner, wPct, hPct the size.\n\n"
    "category must be exactly one of: " + " | ".join(CATEGORIES) + ".\n"
    "priority must be one of: Low | Medium | High.\n\n"
    "Scientific limits still apply: no absolute temperatures (there is no radiometric "
    "data), camera palettes differ, reflections and emissivity change apparent "
    "temperature, and a thermal anomaly is not a confirmed defect. State this once, in "
    "summary, not in every field.\n\n"
    "Be brief: each prose field is one sentence of at most 30 words.\n\n"
    "Return strict JSON only, no prose outside it, shaped exactly as:\n"
    "{\"summary\": \"2-4 sentences\", \"priority\": \"Low|Medium|High\",\n"
    " \"candidates\": [{\"index\": 0, \"verdict\": \"keep|reject\", \"rejectionReason\": \"\",\n"
    "   \"category\": \"<one of the five>\", \"observation\": \"\", \"possibleCauses\": \"\",\n"
    "   \"alternativeExplanations\": \"\", \"verificationStep\": \"\", \"priority\": \"Low|Medium|High\"}],\n"
    " \"additionalFindings\": [{\"xPct\": 0.1, \"yPct\": 0.2, \"wPct\": 0.3, \"hPct\": 0.1, "
    "\"polarity\": \"cold\",\n"
    "   \"category\": \"\", \"observation\": \"\", \"possibleCauses\": \"\", "
    "\"alternativeExplanations\": \"\",\n"
    "   \"verificationStep\": \"\", \"priority\": \"\"}]}\n"
    "candidates must contain one entry per candidate, index = the candidate number "
    "minus one, in the same order as given."
)


# ----------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------

def _log(msg):
    """Write to the Studio log; never let logging itself raise."""
    text = "[HeatLeak analyze] " + str(msg)
    try:
        c3.log.info(text)
    except Exception:
        pass
    try:
        print(text)
    except Exception:
        pass


def _num(v, default=0.0):
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _clamp01(v):
    v = _num(v, 0.0)
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def _location_label(cx, cy):
    """Same thirds as the client's locationLabel() in thermalAnalysis.ts."""
    v = "upper" if cy < 0.34 else "lower" if cy > 0.66 else "middle"
    h = "left" if cx < 0.34 else "right" if cx > 0.66 else "center"
    if v == "middle" and h == "center":
        return "center"
    return v + "-" + h


def _grid_span(r, grid_w, grid_h):
    """1-based inclusive grid column/row span covered by a region's bbox."""
    if not grid_w or not grid_h:
        return None
    x0 = _clamp01(r.get("xPct"))
    y0 = _clamp01(r.get("yPct"))
    x1 = _clamp01(x0 + _num(r.get("wPct")))
    y1 = _clamp01(y0 + _num(r.get("hPct")))
    c0 = min(grid_w, int(x0 * grid_w) + 1)
    c1 = max(c0, min(grid_w, int(x1 * grid_w - 1e-9) + 1))
    r0 = min(grid_h, int(y0 * grid_h) + 1)
    r1 = max(r0, min(grid_h, int(y1 * grid_h - 1e-9) + 1))
    return c0, c1, r0, r1


def _split_data_url(data_url):
    """'data:image/jpeg;base64,AAA' -> ('image/jpeg', 'AAA')."""
    s = str(data_url or "")
    if not s.startswith("data:"):
        return "image/jpeg", s
    header, _, b64 = s.partition(",")
    media = header[5:].split(";")[0] or "image/jpeg"
    return media, b64


def _image_part(shape, data_url):
    media, b64 = _split_data_url(data_url)
    if shape == "anthropic":
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media, "data": b64},
        }
    # OpenAI-style parts (what C3 most likely normalizes).
    url = data_url if str(data_url).startswith("data:") else "data:" + media + ";base64," + b64
    return {"type": "image_url", "image_url": {"url": url}}


def _safe_parse_json(text):
    if not text:
        return None
    t = str(text).strip()
    t = re.sub(r"^```(?:json)?", "", t, flags=re.IGNORECASE).strip()
    t = re.sub(r"```$", "", t).strip()
    try:
        return json.loads(t)
    except Exception:
        start = t.find("{")
        end = t.rfind("}")
        if 0 <= start < end:
            try:
                return json.loads(t[start:end + 1])
            except Exception:
                return None
        return None


def _category(v):
    s = str(v or "").strip()
    return s if s in CATEGORIES else "Ambiguous thermal pattern"


def _priority(v, default="Low"):
    s = str(v or "").strip().capitalize()
    return s if s in PRIORITIES else default


def _polarity(v, default="hot"):
    s = str(v or "").strip().lower()
    return s if s in ("hot", "cold") else default


# ----------------------------------------------------------------------------
# Payload
# ----------------------------------------------------------------------------

def _parse_payload(regionsJson):
    """Return (regions, crops, gridText, gridW, gridH). Accepts the object or the
    legacy bare array. Crops are stripped out of the regions into a parallel list."""
    data = None
    try:
        data = json.loads(regionsJson) if regionsJson else []
    except Exception as e:
        _log("payload is not valid JSON: " + str(e))
        data = []
    if isinstance(data, list):
        data = {"regions": data, "gridText": "", "gridW": 0, "gridH": 0}
    if not isinstance(data, dict):
        data = {"regions": [], "gridText": "", "gridW": 0, "gridH": 0}

    raw = data.get("regions") or []
    if not isinstance(raw, list):
        raw = []
    regions, crops = [], []
    for r in raw:
        if not isinstance(r, dict):
            continue
        r = dict(r)
        crop = r.pop("crop", None)
        regions.append(r)
        crops.append(crop if isinstance(crop, str) and crop.startswith("data:") else None)

    grid_text = str(data.get("gridText") or "").strip()
    grid_w = int(_num(data.get("gridW"), 0))
    grid_h = int(_num(data.get("gridH"), 0))
    if not grid_text or grid_w <= 0 or grid_h <= 0:
        grid_text, grid_w, grid_h = "", 0, 0
    return regions, crops, grid_text, grid_w, grid_h


def _build_user_text(insp, regions, grid_text, grid_w, grid_h):
    lines = []

    ctx = []
    if insp.buildingType:
        ctx.append("building type " + str(insp.buildingType))
    if insp.indoorTempC is not None and insp.outdoorTempC is not None:
        delta = _num(insp.indoorTempC) - _num(insp.outdoorTempC)
        ctx.append("indoor {:.1f} C, outdoor {:.1f} C, delta T {:.1f} C".format(
            _num(insp.indoorTempC), _num(insp.outdoorTempC), delta))
    elif insp.indoorTempC is not None:
        ctx.append("indoor {:.1f} C".format(_num(insp.indoorTempC)))
    elif insp.outdoorTempC is not None:
        ctx.append("outdoor {:.1f} C".format(_num(insp.outdoorTempC)))
    if insp.notes:
        ctx.append("inspector notes: " + str(insp.notes).strip())
    lines.append("Context: " + ("; ".join(ctx) if ctx else "no building context given") + ".")
    lines.append("")

    if grid_text:
        lines.append(
            "Apparent-temperature grid, {w} columns x {h} rows, row 1 = top of image. "
            "0 = coolest, 9 = warmest apparent. This is relative within the image, not "
            "temperature.".format(w=grid_w, h=grid_h))
        lines.append(grid_text)
        lines.append("")

    lines.append("Candidates ({n}):".format(n=len(regions)))
    for i, r in enumerate(regions):
        span = _grid_span(r, grid_w, grid_h)
        grid_part = ""
        if span:
            grid_part = ", covers grid columns {}-{} rows {}-{}".format(*span)
        lines.append(
            "Candidate #{n}: {pol} region, bbox x={x:.2f} y={y:.2f} w={w:.2f} h={h:.2f} "
            "(fractions of frame){grid}, strength {s:.2f}, location {loc}.".format(
                n=i + 1,
                pol=_polarity(r.get("polarity")),
                x=_num(r.get("xPct")), y=_num(r.get("yPct")),
                w=_num(r.get("wPct")), h=_num(r.get("hPct")),
                grid=grid_part,
                s=abs(_num(r.get("relativeIntensity"))),
                loc=str(r.get("locationLabel") or "center"),
            ))
    return "\n".join(lines)


def _build_messages(shape, user_text, full_image, crops):
    """shape None -> plain string content (text path). Otherwise multimodal parts."""
    if shape is None:
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
        ]
    parts = [{"type": "text", "text": user_text}]
    if full_image:
        parts.append({"type": "text", "text": "Full thermal image:"})
        parts.append(_image_part(shape, full_image))
    for i, crop in enumerate(crops):
        if crop:
            parts.append({"type": "text", "text": "Candidate #{} crop:".format(i + 1)})
            parts.append(_image_part(shape, crop))
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": parts},
    ]


def _call_llm(messages):
    client = c3.GenaiCore.Llm.Completion.Client.forConfigKey(CONFIG_KEY)
    response = client.completion(
        messages=messages,
        options={"returnJson": True, "max_tokens": MAX_TOKENS},
    )
    content = response["choices"][0]["message"]["content"]
    parsed = _safe_parse_json(content)
    if not isinstance(parsed, dict) or not isinstance(parsed.get("candidates"), list):
        raise ValueError("model returned no parseable candidates JSON: " + str(content)[:300])
    return parsed


def _ask_model(user_text, full_image, crops):
    """Try the configured vision shape(s), then the text path. Returns
    (parsed, explanationSource) or (None, 'template') if everything failed."""
    has_images = bool(full_image) or any(crops)
    shapes = []
    if has_images:
        if VISION_SHAPE == "auto":
            shapes = ["openai", "anthropic"]
        elif VISION_SHAPE in ("openai", "anthropic"):
            shapes = [VISION_SHAPE]
    for shape in shapes:
        try:
            parsed = _call_llm(_build_messages(shape, user_text, full_image, crops))
            _log("vision call succeeded via " + shape + " parts")
            return parsed, "vision"
        except Exception as e:
            _log("vision call via " + shape + " parts failed: " + str(e))
    try:
        parsed = _call_llm(_build_messages(None, user_text, None, []))
        _log("text call succeeded" + (" (no images in payload)" if not has_images else ""))
        return parsed, "text"
    except Exception as e:
        _log("text call failed, using template text: " + str(e))
        return None, "template"


# ----------------------------------------------------------------------------
# Template fallback (LLM failure only)
# ----------------------------------------------------------------------------

def _fallback(regions):
    summary = (
        "Detected {n} candidate thermal-contrast region(s). The language model was "
        "unavailable, so these are template descriptions, not model judgments. Apparent "
        "temperature differences can also arise from reflections, emissivity, or the "
        "camera palette; nothing here is a confirmed defect."
    ).format(n=len(regions))
    priority = "Medium" if len(regions) >= 3 else "Low"
    findings = []
    for r in regions:
        warmer = "cooler" if _polarity(r.get("polarity")) == "cold" else "warmer"
        findings.append({
            "verdict": "keep",
            "category": "Ambiguous thermal pattern",
            "observation": "A {w} area relative to its surroundings in the {loc}.".format(
                w=warmer, loc=r.get("locationLabel") or "frame"),
            "possibleCauses": "Could correspond to insulation variation, air movement, or a thermal bridge.",
            "alternativeExplanations": "May also be a reflection, an emissivity difference, or a palette artifact.",
            "verificationStep": "Re-image from another angle and correlate with a physical/contact inspection.",
            "priority": "Medium" if abs(_num(r.get("relativeIntensity"))) > 0.6 else "Low",
        })
    return summary, priority, findings


# ----------------------------------------------------------------------------
# Assemble findings in display order
# ----------------------------------------------------------------------------

def _make_anomaly(insp_id, index, r, f, source, rejected=False, rejection_reason=""):
    x = _clamp01(r.get("xPct"))
    y = _clamp01(r.get("yPct"))
    w = _clamp01(r.get("wPct"))
    h = _clamp01(r.get("hPct"))
    if x + w > 1:
        w = 1 - x
    if y + h > 1:
        h = 1 - y
    area = r.get("areaPct")
    area = _clamp01(area) if area is not None else w * h
    loc = r.get("locationLabel") or _location_label(x + w / 2.0, y + h / 2.0)
    return c3.ThermalAnomaly.make({
        "id": "{}_a{}".format(insp_id, index),
        "inspection": {"id": insp_id},
        "anomalyIndex": index,
        "category": _category(f.get("category")),
        "polarity": _polarity(r.get("polarity")),
        "xPct": x,
        "yPct": y,
        "wPct": w,
        "hPct": h,
        "relativeIntensity": _num(r.get("relativeIntensity")),
        "areaPct": area,
        "locationLabel": str(loc),
        "observation": str(f.get("observation") or ""),
        "possibleCauses": str(f.get("possibleCauses") or ""),
        "alternativeExplanations": str(f.get("alternativeExplanations") or ""),
        "verificationStep": str(f.get("verificationStep") or ""),
        "priority": _priority(f.get("priority")),
        "rejected": bool(rejected),
        "rejectionReason": str(rejection_reason or ""),
        "source": source,
    })


def _order_findings(regions, parsed):
    """Return (kept, additional, rejected) lists of (region, finding) tuples from the
    model's JSON. Candidates the model did not mention are kept with empty prose."""
    by_index = {}
    for c in parsed.get("candidates") or []:
        if not isinstance(c, dict):
            continue
        try:
            by_index[int(c.get("index"))] = c
        except Exception:
            continue

    kept, rejected = [], []
    for i, r in enumerate(regions):
        c = by_index.get(i) or {}
        verdict = str(c.get("verdict") or "keep").strip().lower()
        if verdict == "reject":
            reason = str(c.get("rejectionReason") or "").strip() or \
                "Judged not to be a building-envelope surface."
            rejected.append((r, c, reason))
        else:
            kept.append((r, c))

    additional = []
    for a in parsed.get("additionalFindings") or []:
        if len(additional) >= MAX_ADDITIONAL_FINDINGS:
            break
        if not isinstance(a, dict):
            continue
        w = _clamp01(a.get("wPct"))
        h = _clamp01(a.get("hPct"))
        if w <= 0 or h <= 0:
            continue
        x = _clamp01(a.get("xPct"))
        y = _clamp01(a.get("yPct"))
        region = {
            "xPct": x, "yPct": y, "wPct": w, "hPct": h,
            "polarity": _polarity(a.get("polarity"), "cold"),
            "relativeIntensity": 0.0,
            "areaPct": None,  # computed from the clamped box in _make_anomaly
            "locationLabel": None,
        }
        additional.append((region, a))
    return kept, additional, rejected


# ----------------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------------

def analyze(this, regionsJson):
    insp = this.get("this")
    if insp is None:
        raise ValueError("ThermalInspection {} not found".format(this.id))

    regions, crops, grid_text, grid_w, grid_h = _parse_payload(regionsJson)
    _log("inspection {} : {} candidate(s), grid {}x{}, {} crop(s), image {}".format(
        insp.id, len(regions), grid_w, grid_h, sum(1 for c in crops if c),
        "present" if insp.originalImage else "absent"))

    # Remove any prior findings so re-analysis is idempotent.
    existing = c3.ThermalAnomaly.fetch(spec={
        "filter": "inspection.id == '{}'".format(insp.id),
        "include": "id",
        "limit": -1,
    })
    if existing and existing.objs and len(existing.objs) > 0:
        c3.ThermalAnomaly.removeBatch(existing.objs)

    explanation_source = "text"
    kept, additional, rejected = [], [], []

    if len(regions) == 0:
        summary = (
            "No clear thermal contrast regions were isolated from this image at the "
            "current screening sensitivity. This does not mean the building is free of "
            "issues -- it may reflect image quality, palette, framing, or a genuinely "
            "uniform surface. Consider re-capturing under a larger indoor/outdoor "
            "temperature difference, or review the image manually."
        )
        priority = "Low"
    else:
        user_text = _build_user_text(insp, regions, grid_text, grid_w, grid_h)
        parsed, explanation_source = _ask_model(user_text, insp.originalImage, crops)

        if parsed is not None:
            summary = str(parsed.get("summary") or "").strip()
            kept, additional, rejected = _order_findings(regions, parsed)
            priority = _priority(parsed.get("priority"), "Medium")
            if not summary:
                summary = "The model reviewed {} candidate region(s) and kept {}.".format(
                    len(regions), len(kept) + len(additional))
        else:
            summary, priority, findings = _fallback(regions)
            kept = [(r, findings[i]) for i, r in enumerate(regions)]

    # Persist in display order: kept scout regions, vision additions, then rejected.
    to_create = []
    index = 0
    for r, f in kept:
        to_create.append(_make_anomaly(insp.id, index, r, f, "cv"))
        index += 1
    for r, f in additional:
        to_create.append(_make_anomaly(insp.id, index, r, f, "vision"))
        index += 1
    for r, f, reason in rejected:
        to_create.append(_make_anomaly(insp.id, index, r, f, "cv", True, reason))
        index += 1
    if to_create:
        c3.ThermalAnomaly.upsertBatch(to_create)

    anomaly_count = len(kept) + len(additional)
    _log("inspection {} : kept {}, added {}, rejected {}, explanationSource={}".format(
        insp.id, len(kept), len(additional), len(rejected), explanation_source))

    c3.ThermalInspection.make({
        "id": insp.id,
        "summary": summary,
        "priority": priority,
        "anomalyCount": anomaly_count,
        "status": "Needs Review",
        "analyzed": True,
        "explanationSource": explanation_source,
    }).merge()

    return this.get("this, anomalies.this")
