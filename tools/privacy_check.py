#!/usr/bin/env python3
"""Refuses personal information before it reaches this public repo.

Usage:
  python3 tools/privacy_check.py                 # scan the files git would commit
  python3 tools/privacy_check.py --commits       # also scan unpushed commit messages and authors
  python3 tools/privacy_check.py --terms FILE    # also look for the owner's private terms

The private term list (names, places and accounts that must never appear) is
kept OUTSIDE this repo on purpose, one term per line; it is never committed.
Generic checks always run: email addresses, home-directory paths, phone
numbers and home-network IP addresses.

Exit code 1 and a list of hits if anything is found.
"""
import argparse
import os
import re
import subprocess
import sys

ALLOWED_EMAILS = {"noreply@anthropic.com", "gamequarryllc@protonmail.com"}  # the studio's public contact address
ALLOWED_EMAIL_SUFFIXES = ("@users.noreply.github.com", "@example.com", "@example.org")
# Third-party license files carry their authors' contact details; that's expected.
SKIP_NAME = re.compile(r"(LICEN[CS]E|COPYING|NOTICE|AUTHORS|OFL)", re.I)
SKIP_EXT = {".png", ".jpg", ".jpeg", ".webp", ".ogg", ".wav", ".mp3", ".ttf", ".otf", ".woff", ".woff2",
            ".glb", ".gltf", ".res", ".scn", ".wasm", ".pck", ".zip", ".ico", ".icns"}
MAX_BYTES = 2_000_000

GENERIC = [
    ("email address", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("home-directory path", re.compile(r"(/Users/[A-Za-z0-9._-]+/|[A-Za-z]:\\\\?Users\\\\?[A-Za-z0-9._-]+|/home/(?!claude\b|runner\b)[A-Za-z0-9._-]+/)")),
    ("phone number", re.compile(r"(?<![\w.])(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\w.])")),
    ("home-network IP address", re.compile(r"(?<![\d.])(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?![\d.])")),
]


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False).stdout


def email_ok(addr):
    a = addr.lower()
    return a in ALLOWED_EMAILS or a.endswith(ALLOWED_EMAIL_SUFFIXES)


def load_terms(path):
    terms = []
    if path:
        with open(path, encoding="utf-8") as f:
            for line in f:
                t = line.strip()
                if t and not t.startswith("#"):
                    terms.append(re.compile(r"(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])", re.I))
    return terms


def lockfile_text(label, text, hits):
    """An npm lockfile is generated from the public registry. Its "deprecated"
    notices are other people's text (some carry a maintainer's address), so
    those lines are blanked, line numbers kept. Every package must come from
    the public registry: a private or home-network one would leak a hostname."""
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip()
        if stripped.startswith('"deprecated":'):
            out.append("")
            continue
        if stripped.startswith('"resolved":') and '"https://registry.npmjs.org/' not in stripped:
            hits.append(f"{label}:{n}: package not from the public npm registry")
        out.append(line)
    return "\n".join(out)


def scan_text(label, text, terms, hits):
    for n, line in enumerate(text.splitlines(), 1):
        for what, rx in GENERIC:
            for m in rx.finditer(line):
                if what == "email address" and email_ok(m.group(0)):
                    continue
                hits.append(f"{label}:{n}: {what}: {m.group(0)}")
        for rx in terms:
            if rx.search(line):
                # Don't echo the private term into CI logs; the line number is enough.
                hits.append(f"{label}:{n}: private term")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--terms", help="file with private terms, one per line (kept outside the repo)")
    ap.add_argument("--commits", action="store_true", help="also check commits not yet on origin/main")
    args = ap.parse_args()

    root = git("rev-parse", "--show-toplevel").strip() or "."
    os.chdir(root)
    terms = load_terms(args.terms)
    hits = []

    files = [f for f in git("ls-files", "-co", "--exclude-standard").splitlines() if f]
    for f in files:
        if not os.path.isfile(f) or SKIP_NAME.search(os.path.basename(f)):
            continue
        if os.path.splitext(f)[1].lower() in SKIP_EXT or os.path.getsize(f) > MAX_BYTES:
            continue
        try:
            with open(f, encoding="utf-8") as fh:
                text = fh.read()
        except (UnicodeDecodeError, OSError):
            continue
        if os.path.basename(f) == "package-lock.json":
            text = lockfile_text(f, text, hits)
        scan_text(f, text, terms, hits)

    if args.commits:
        # Only commits that aren't on GitHub yet. Some clones have no origin/main
        # ref, so fall back to asking the remote what main points at.
        base = git("rev-parse", "--verify", "--quiet", "origin/main").strip()
        if not base:
            remote = git("ls-remote", "origin", "refs/heads/main").split()
            if remote and git("cat-file", "-t", remote[0]).strip() == "commit":
                base = remote[0]
        rng = f"{base}..HEAD" if base else "HEAD"
        log = git("log", rng, "--format=%h%x00%an <%ae>%x00%cn <%ce>%x00%B%x01")
        for entry in log.split("\x01"):
            parts = entry.strip("\n").split("\x00")
            if len(parts) < 4:
                continue
            sha, author, committer, body = parts
            for who in (author, committer):
                if who != "Claude <noreply@anthropic.com>":
                    hits.append(f"commit {sha}: author/committer is not 'Claude <noreply@anthropic.com>'")
            scan_text(f"commit {sha} message", body, terms, hits)

    if hits:
        print("Privacy check FAILED. Remove these before pushing:")
        for h in sorted(set(hits)):
            print("  " + h)
        sys.exit(1)
    print(f"Privacy check passed ({len(files)} files" + (", commits" if args.commits else "") +
          (f", {len(terms)} private terms" if terms else "") + ").")


if __name__ == "__main__":
    main()
