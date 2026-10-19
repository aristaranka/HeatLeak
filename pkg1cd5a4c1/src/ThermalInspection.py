"""
HeatLeak AI -- ThermalInspection.analyze

The client has already detected candidate regions from the ACTUAL uploaded image
pixels (thermal-contrast analysis on a canvas) and passes them here as JSON. This
method does the language work: it asks an LLM to write a cautious, verification-
oriented explanation for each region plus an overall summary, then persists the
findings as ThermalAnomaly records and updates the inspection.
"""

import json
import re


def _location_phrase(r, idx):
    label = r.get("locationLabel") or "an area of the frame"
    pol = "cooler-than-surroundings" if r.get("polarity") == "cold" else "warmer-than-surroundings"
    strength = abs(r.get("relativeIntensity") or 0)
    mag = "strong" if strength > 0.66 else "moderate" if strength > 0.33 else "subtle"
    size = "broad" if (r.get("areaPct") or 0) > 0.06 else "localized"
    return "#{n}: a {mag}, {size} {pol} region in the {label} of the image".format(
        n=idx + 1, mag=mag, size=size, pol=pol, label=label
    )


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


def _fallback(regions):
    summary = (
        "Detected {n} candidate thermal-contrast region(s). These are preliminary "
        "screening observations only and require on-site verification; apparent "
        "temperature differences can also arise from reflections, emissivity, or the "
        "camera palette."
    ).format(n=len(regions))
    priority = "Medium" if len(regions) >= 3 else "Low"
    findings = []
    for r in regions:
        warmer = "cooler" if r.get("polarity") == "cold" else "warmer"
        findings.append({
            "category": "Ambiguous thermal pattern",
            "observation": "A {w} area relative to its surroundings in the {loc}.".format(
                w=warmer, loc=r.get("locationLabel") or "frame"),
            "possibleCauses": "Could correspond to insulation variation, air movement, or a thermal bridge.",
            "alternativeExplanations": "May also be a reflection, an emissivity difference, or a palette artifact.",
            "verificationStep": "Re-image from another angle and correlate with a physical/contact inspection.",
            "priority": "Medium" if abs(r.get("relativeIntensity") or 0) > 0.6 else "Low",
        })
    return summary, priority, findings


def analyze(this, regionsJson):
    insp = this.get("this")
    if insp is None:
        raise ValueError("ThermalInspection {} not found".format(this.id))

    try:
        regions = json.loads(regionsJson) if regionsJson else []
    except Exception:
        regions = []
    if not isinstance(regions, list):
        regions = []

    # Remove any prior findings so re-analysis is idempotent.
    existing = c3.ThermalAnomaly.fetch(spec={
        "filter": "inspection.id == '{}'".format(insp.id),
        "include": "id",
        "limit": -1,
    })
    if existing and existing.objs and len(existing.objs) > 0:
        c3.ThermalAnomaly.removeBatch(existing.objs)

    if len(regions) == 0:
        summary = (
            "No clear thermal contrast regions were isolated from this image at the "
            "current screening sensitivity. This does not mean the building is free of "
            "issues -- it may reflect image quality, palette, framing, or a genuinely "
            "uniform surface. Consider re-capturing under a larger indoor/outdoor "
            "temperature difference, or review the image manually."
        )
        priority = "Low"
        findings = []
    else:
        region_lines = "\n".join(_location_phrase(r, i) for i, r in enumerate(regions))
        ctx = []
        if insp.buildingType:
            ctx.append("building type: " + str(insp.buildingType))
        if insp.indoorTempC is not None:
            ctx.append("indoor temp: {} C".format(insp.indoorTempC))
        if insp.outdoorTempC is not None:
            ctx.append("outdoor temp: {} C".format(insp.outdoorTempC))
        if insp.notes:
            ctx.append("inspector notes: " + str(insp.notes))
        context_line = ("Context -- " + "; ".join(ctx) + ".") if ctx else ""

        system = (
            "You are HeatLeak AI, a cautious building-energy inspection assistant that "
            "interprets infrared thermal images. You are a SCREENING aid, not a verdict. "
            "Follow these scientific limits strictly: warm colors alone do not prove heat "
            "loss; different cameras use different palettes; reflections and emissivity "
            "affect apparent temperature; without radiometric metadata you cannot state "
            "absolute temperatures; a thermal anomaly is NOT a confirmed defect. Always "
            "describe results as preliminary observations requiring verification. Be "
            "concise, specific, and professional. Never invent image details beyond the "
            "region descriptions given."
        )

        user = (
            "A thermal image was screened and these candidate regions were detected from "
            "the actual image pixels:\n" + region_lines + "\n\n" + context_line + "\n\n"
            "For EACH region, in the same order, produce a finding. Return STRICT JSON "
            "only, shaped as:\n"
            "{\n"
            '  "summary": "2-4 sentence overall, cautious screening summary",\n'
            '  "priority": "Low|Medium|High",\n'
            '  "findings": [\n'
            "    {\n"
            '      "category": "one of: Window-frame thermal contrast | Possible thermal '
            'bridging | Door-seal irregularity | Wall/ceiling temperature pattern | '
            'Ambiguous thermal pattern",\n'
            '      "observation": "what the image visually shows at this region (describe '
            'the contrast, not a conclusion)",\n'
            '      "possibleCauses": "possible building-related causes",\n'
            '      "alternativeExplanations": "non-defect explanations (reflection, '
            'emissivity, palette, draft, sun)",\n'
            '      "verificationStep": "one concrete recommended next verification step",\n'
            '      "priority": "Low|Medium|High"\n'
            "    }\n"
            "  ]\n"
            "}\n"
            "Exactly " + str(len(regions)) + " findings. No prose outside the JSON."
        )

        parsed = None
        try:
            client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("default-completions")
            response = client.completion(
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                options={"returnJson": True, "max_tokens": 2048},
            )
            content = response["choices"][0]["message"]["content"]
            parsed = _safe_parse_json(content)
        except Exception:
            parsed = None

        if parsed and parsed.get("findings"):
            findings = parsed["findings"]
            summary = parsed.get("summary") or ""
            priority = parsed.get("priority") or "Medium"
        else:
            summary, priority, findings = _fallback(regions)

    # Persist the anomalies.
    to_create = []
    for i, r in enumerate(regions):
        f = findings[i] if i < len(findings) else {}
        to_create.append(c3.ThermalAnomaly.make({
            "id": "{}_a{}".format(insp.id, i),
            "inspection": {"id": insp.id},
            "anomalyIndex": i,
            "category": f.get("category") or "Ambiguous thermal pattern",
            "polarity": r.get("polarity") or "hot",
            "xPct": r.get("xPct") or 0,
            "yPct": r.get("yPct") or 0,
            "wPct": r.get("wPct") or 0,
            "hPct": r.get("hPct") or 0,
            "relativeIntensity": r.get("relativeIntensity") or 0,
            "areaPct": r.get("areaPct") or 0,
            "locationLabel": r.get("locationLabel") or "center",
            "observation": f.get("observation") or "",
            "possibleCauses": f.get("possibleCauses") or "",
            "alternativeExplanations": f.get("alternativeExplanations") or "",
            "verificationStep": f.get("verificationStep") or "",
            "priority": f.get("priority") or "Low",
        }))
    if to_create:
        c3.ThermalAnomaly.mergeBatch(to_create)

    c3.ThermalInspection.make({
        "id": insp.id,
        "summary": summary,
        "priority": priority,
        "anomalyCount": len(regions),
        "status": "Needs Review",
        "analyzed": True,
    }).merge()

    return this.get("this, anomalies.this")
