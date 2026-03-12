#!/usr/bin/env python3
"""
publish.py — Converts a Full_Research.md into site JSON and pushes to GitHub.

Usage:
    python3 publish.py /path/to/000_Full_Research.md
"""

import sys
import re
import json
import os
import subprocess
from datetime import datetime
from pathlib import Path

SITE_DIR = Path("/Users/walterpetrouchin/Desktop/Walter/Everything/0_Most Current/YouTube/Distillr (AI News)/News/_AI News Site")
DATA_DIR = SITE_DIR / "data"

# Cycle through the site's letter colors by story rank
RANK_COLORS = [
    "#7C83D4",  # soft indigo
    "#E07A8F",  # dusty rose
    "#E8A84C",  # warm amber
    "#5CBD9A",  # sage mint
    "#5AAFE0",  # sky blue
    "#A87ED4",  # soft lavender
    "#E07858",  # muted coral
    "#5AB8B0",  # teal
]

# Maps Full Report section headers to Set 5 display category names
CATEGORY_MAP = {
    "Models & Research":      "Brains",
    "Business & Funding":     "Bags",
    "Products & Tools":       "Shiny New Things",
    "Policy, Safety & Legal": "Uh Oh",
    "Community & Viral":      "Everyone's Talking",
    "Builder Workflows":      "Actually Useful",
    "New AI Tools":           "Try This",
}


def normalize_headline(h: str) -> str:
    """Lowercase, strip punctuation for fuzzy headline matching."""
    return re.sub(r'[^a-z0-9 ]', '', h.lower()).strip()


def extract_field(block: str, field_name: str) -> str | None:
    """
    Extract the value of a bullet field like:
      - **Field name:** value text that may span lines until the next field
    """
    pattern = r'-\s+\*\*' + re.escape(field_name) + r':\*\*\s*([\s\S]+?)(?=\n\s*-\s+\*\*|\Z)'
    m = re.search(pattern, block)
    if not m:
        return None
    # Collapse internal newlines/whitespace
    return re.sub(r'\s+', ' ', m.group(1)).strip()


def parse_meta(text: str) -> dict:
    """Extract welcomeLine and transitionLine from the ## Meta block."""
    meta = {}
    meta_match = re.search(r'^## Meta\s*\n(.*?)(?=\n## |\Z)', text, re.DOTALL | re.MULTILINE)
    if not meta_match:
        return meta

    block = meta_match.group(1)

    welcome_match = re.search(r'-\s+\*\*welcomeLine\*\*[:\s]+(.+?)$', block, re.MULTILINE)
    if welcome_match:
        meta['welcomeLine'] = welcome_match.group(1).strip()

    transition_match = re.search(r'-\s+\*\*transitionLine\*\*[:\s]+(.+?)$', block, re.MULTILINE)
    if transition_match:
        meta['transitionLine'] = transition_match.group(1).strip()

    return meta


def parse_full_report(text: str) -> dict:
    """
    Parse the ## Full Report section to extract per-story body content and category.

    Returns a dict keyed by normalized headline:
      { normalized_headline: { category, bodyParagraph1, bodyParagraph2, bodyParagraph3, sourceQuip } }
    """
    result = {}

    full_report_match = re.search(r'^## Full Report\s*\n(.*)', text, re.DOTALL | re.MULTILINE)
    if not full_report_match:
        return result

    report_text = full_report_match.group(1)

    # Split by ### section headers (section name alternates with body text)
    parts = re.split(r'^### (.+?)$', report_text, flags=re.MULTILINE)
    # parts[0] = preamble, parts[1] = section name, parts[2] = section body, ...

    i = 1
    while i < len(parts) - 1:
        section_name = parts[i].strip()
        section_body = parts[i + 1]
        category = CATEGORY_MAP.get(section_name, section_name)
        i += 2

        # Split section into individual story blocks (each starts with "- **")
        story_blocks = re.split(r'\n(?=- \*\*)', section_body)

        for block in story_blocks:
            block = block.strip()
            if not block:
                continue

            headline_match = re.match(r'-\s+\*\*(.+?)\*\*', block)
            if not headline_match:
                continue

            headline = headline_match.group(1).strip()
            norm_key = normalize_headline(headline)

            entry = {'category': category}

            # Try explicit Body 1/2/3 fields first (added by enrichment)
            body1 = extract_field(block, 'Body 1') or extract_field(block, 'bodyParagraph1')
            body2 = extract_field(block, 'Body 2') or extract_field(block, 'bodyParagraph2')
            body3 = extract_field(block, 'Body 3') or extract_field(block, 'bodyParagraph3')

            # Fall back to What happened + Why it matters
            if not body1:
                body1 = extract_field(block, 'What happened')
                if not body2:
                    body2 = extract_field(block, 'Why it matters')

            if body1:
                entry['bodyParagraph1'] = body1
            if body2:
                entry['bodyParagraph2'] = body2
            if body3:
                entry['bodyParagraph3'] = body3

            source_quip = extract_field(block, 'Source quip') or extract_field(block, 'sourceQuip')
            if source_quip:
                entry['sourceQuip'] = source_quip

            result[norm_key] = entry

    return result


def parse_report(md_path: Path) -> dict:
    text = md_path.read_text(encoding="utf-8")

    # ── Date ──────────────────────────────────────────────────────────────────
    date_match = re.search(r'^# Daily AI Intelligence Brief.*?\n## (.+?)$', text, re.MULTILINE)
    if not date_match:
        date_match = re.search(r'^# Distillr Daily.*?\n## (.+?)$', text, re.MULTILINE)
    if not date_match:
        date_match = re.search(r'^## ([A-Z][a-z]+ \d+, \d{4})$', text, re.MULTILINE)
    date_str = date_match.group(1).strip() if date_match else datetime.now().strftime("%B %d, %Y")

    try:
        dt = datetime.strptime(date_str, "%B %d, %Y")
        date_iso = dt.strftime("%Y-%m-%d")
    except ValueError:
        date_iso = datetime.now().strftime("%Y-%m-%d")

    # ── Meta block ─────────────────────────────────────────────────────────────
    meta = parse_meta(text)

    # ── Quick Scan stories ────────────────────────────────────────────────────
    # Format:
    #   - **Headline** — Summary sentence. [Score: X/20] [Top4]
    #     - Source name | https://url
    stories = []

    quick_scan_match = re.search(
        r'## Quick Scan\n.*?\n(.*?)(?=\n---|\n## )',
        text,
        re.DOTALL
    )
    scan_text = quick_scan_match.group(1) if quick_scan_match else text

    story_pattern = re.compile(
        r'-\s+\*\*(.+?)\*\*\s*[—–-]+\s*(.+?)\s*\[Score:\s*(\d+)/\d+\](\s*\[Top4\])?'
        r'\s*\n\s+-\s+(.+?)\s*\|\s*(?:\[.+?\]\((https?://[^)]+)\)|(https?://\S+))',
        re.MULTILINE
    )

    for i, m in enumerate(story_pattern.finditer(scan_text), 1):
        # Group 6 = URL from markdown link [text](url), group 7 = plain URL
        url = (m.group(6) or m.group(7) or '').strip()
        source = re.sub(r'^Source:\s*', '', m.group(5).strip())
        top4 = bool(m.group(4))
        stories.append({
            "rank":     i,
            "headline": m.group(1).strip(),
            "summary":  m.group(2).strip(),
            "score":    int(m.group(3)),
            "top4":     top4,
            "source":   source,
            "url":      url,
            "color":    RANK_COLORS[(i - 1) % len(RANK_COLORS)],
        })

    # ── Merge Full Report body content ─────────────────────────────────────────
    full_report_data = parse_full_report(text)

    for story in stories:
        norm = normalize_headline(story['headline'])
        match = full_report_data.get(norm)

        if not match:
            # Fuzzy fallback: check if 60%+ of headline words appear in a key
            story_words = set(norm.split())
            for key, val in full_report_data.items():
                key_words = set(key.split())
                if story_words and len(story_words & key_words) / len(story_words) >= 0.6:
                    match = val
                    break

        if match:
            story['category'] = match.get('category')
            for field in ('bodyParagraph1', 'bodyParagraph2', 'bodyParagraph3', 'sourceQuip'):
                if field in match:
                    story[field] = match[field]

    lead = stories[0]["headline"] if stories else "Today's AI Rundown"

    # ── Theme (optional) ──────────────────────────────────────────────────────
    theme_match = re.search(r'\*\*Theme.*?\*\*[^\n]*\n\s+-\s+(.+?)$', text, re.MULTILINE)
    theme = theme_match.group(1).strip() if theme_match else None

    result = {
        "date":       date_str,
        "dateISO":    date_iso,
        "lead":       lead,
        "theme":      theme,
        "storyCount": len(stories),
        "stories":    stories,
    }

    if meta.get('welcomeLine'):
        result['welcomeLine'] = meta['welcomeLine']
    if meta.get('transitionLine'):
        result['transitionLine'] = meta['transitionLine']

    return result


def update_index(report: dict):
    index_path = DATA_DIR / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else []

    # Remove any existing entry for this date
    index = [e for e in index if e.get("dateISO") != report["dateISO"]]

    # Prepend so newest is first
    index.insert(0, {
        "date":       report["date"],
        "dateISO":    report["dateISO"],
        "file":       f"{report['dateISO']}.json",
        "lead":       report["lead"],
        "storyCount": report["storyCount"],
    })

    index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False))
    print(f"  index.json updated ({len(index)} entries)")


def git_push(date_str: str):
    os.chdir(SITE_DIR)
    subprocess.run(["git", "add", "data/"], check=True)
    subprocess.run(
        ["git", "commit", "-m", f"report: {date_str}"],
        check=True
    )
    subprocess.run(["git", "pull", "--rebase"], check=True)
    subprocess.run(["git", "push"], check=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 publish.py /path/to/Full_Research.md")
        sys.exit(1)

    md_path = Path(sys.argv[1])
    if not md_path.exists():
        print(f"Error: file not found — {md_path}")
        sys.exit(1)

    print(f"Parsing {md_path.name}...")
    report = parse_report(md_path)
    print(f"  Date:    {report['date']}")
    print(f"  Stories: {report['storyCount']}")
    print(f"  Lead:    {report['lead'][:70]}...")

    top4_count = sum(1 for s in report['stories'] if s.get('top4'))
    categorized = sum(1 for s in report['stories'] if s.get('category'))
    has_body = sum(1 for s in report['stories'] if s.get('bodyParagraph1'))
    print(f"  Top4:    {top4_count} stories flagged")
    print(f"  Cats:    {categorized}/{report['storyCount']} stories categorized")
    print(f"  Body:    {has_body}/{report['storyCount']} stories have expanded content")

    DATA_DIR.mkdir(exist_ok=True)

    # Write the day's report JSON
    report_file = DATA_DIR / f"{report['dateISO']}.json"
    report_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"  Wrote {report_file.name}")

    # Update latest.json
    latest = {"file": f"{report['dateISO']}.json", "date": report["date"]}
    (DATA_DIR / "latest.json").write_text(json.dumps(latest, indent=2))
    print("  Updated latest.json")

    # Update index.json
    update_index(report)

    # Push to GitHub
    print("Pushing to GitHub...")
    try:
        git_push(report["date"])
        print(f"Done. Cloudflare will deploy in ~30 seconds.")
        print(f"  Site: today's report is live as '{report['lead']}'")
    except subprocess.CalledProcessError as e:
        print(f"Git push failed: {e}")
        print("JSON files were written locally. Push manually when ready.")
        sys.exit(1)


if __name__ == "__main__":
    main()
