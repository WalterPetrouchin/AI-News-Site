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


def parse_report(md_path: Path) -> dict:
    text = md_path.read_text(encoding="utf-8")

    # ── Date ──────────────────────────────────────────────────────────────────
    # Looks for the first ## line after the # Distillr Daily header
    date_match = re.search(r'^# Distillr Daily.*?\n## (.+?)$', text, re.MULTILINE)
    if not date_match:
        # Fallback: first ## line anywhere
        date_match = re.search(r'^## ([A-Z][a-z]+ \d+, \d{4})$', text, re.MULTILINE)
    date_str = date_match.group(1).strip() if date_match else datetime.now().strftime("%B %d, %Y")

    try:
        dt = datetime.strptime(date_str, "%B %d, %Y")
        date_iso = dt.strftime("%Y-%m-%d")
    except ValueError:
        date_iso = datetime.now().strftime("%Y-%m-%d")

    # ── Quick Scan stories ────────────────────────────────────────────────────
    # Format:
    #   - **Headline** — Summary sentence. [Score: X/25]
    #     - Source name | https://url
    stories = []

    quick_scan_match = re.search(
        r'## Quick Scan\n.*?\n(.*?)(?=\n---|\n## )',
        text,
        re.DOTALL
    )
    scan_text = quick_scan_match.group(1) if quick_scan_match else text

    story_pattern = re.compile(
        r'-\s+\*\*(.+?)\*\*\s*[—–-]+\s*(.+?)\s*\[Score:\s*(\d+)/\d+\]'
        r'\s*\n\s+-\s+(.+?)\s*\|\s*(?:\[.+?\]\((https?://[^)]+)\)|(https?://\S+))',
        re.MULTILINE
    )

    for i, m in enumerate(story_pattern.finditer(scan_text), 1):
        # Group 5 = markdown link URL [text](url), group 6 = plain URL
        url = (m.group(5) or m.group(6) or '').strip()
        # Strip "Source: " prefix if present
        source = re.sub(r'^Source:\s*', '', m.group(4).strip())
        stories.append({
            "rank":     i,
            "headline": m.group(1).strip(),
            "summary":  m.group(2).strip(),
            "score":    int(m.group(3)),
            "source":   source,
            "url":      url,
            "color":    RANK_COLORS[(i - 1) % len(RANK_COLORS)],
        })

    lead = stories[0]["headline"] if stories else "Today's AI Rundown"

    # ── Theme (optional) ──────────────────────────────────────────────────────
    theme_match = re.search(r'\*\*Theme.*?\*\*[^\n]*\n\s+-\s+(.+?)$', text, re.MULTILINE)
    theme = theme_match.group(1).strip() if theme_match else None

    return {
        "date":       date_str,
        "dateISO":    date_iso,
        "lead":       lead,
        "theme":      theme,
        "storyCount": len(stories),
        "stories":    stories,
    }


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
