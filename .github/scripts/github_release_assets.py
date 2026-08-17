#!/usr/bin/env python3
"""Helpers for GitHub release asset names.

GitHub sanitizes uploaded filenames (cli/cli#7024): spaces and other special
characters become dots. "OmniClone Setup 1.0.9.exe" is stored as
"OmniClone.Setup.1.0.9.exe". Deletes must match that sanitized name or the
next upload returns 422 already_exists.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterable
from typing import Any


def sanitize_asset_name(name: str) -> str:
    if name.startswith("."):
        name = "default." + name
    name = re.sub(r"[^A-Za-z0-9\-_@+]+", ".", name)
    name = re.sub(r"\.{2,}", ".", name)
    return name.strip(".")


def colliding_assets(assets: Iterable[dict[str, Any]], name: str) -> list[dict[str, Any]]:
    want = sanitize_asset_name(name)
    matches: list[dict[str, Any]] = []
    for asset in assets:
        stored = asset.get("name") or ""
        if stored == name or sanitize_asset_name(stored) == want:
            matches.append(asset)
    return matches


def log_assets(assets: Any) -> None:
    if not isinstance(assets, list) or not assets:
        print("  (none)", file=sys.stderr)
        return
    for asset in assets:
        size = asset.get("size", "?")
        print(f"  {asset['id']} {asset['name']} ({size} bytes)", file=sys.stderr)


def self_test() -> None:
    assert sanitize_asset_name("OmniClone Setup 1.0.9.exe") == "OmniClone.Setup.1.0.9.exe"
    assert sanitize_asset_name("OmniClone.Setup.1.0.9.exe") == "OmniClone.Setup.1.0.9.exe"
    assert sanitize_asset_name("OmniClone Setup 1.0.9.exe.blockmap") == "OmniClone.Setup.1.0.9.exe.blockmap"
    assert sanitize_asset_name("OmniClone-1.0.9-arm64.dmg") == "OmniClone-1.0.9-arm64.dmg"

    assets = [
        {"id": 1, "name": "OmniClone.Setup.1.0.9.exe", "size": 10},
        {"id": 2, "name": "OmniClone.Setup.1.0.9.exe.blockmap", "size": 11},
        {"id": 3, "name": "OmniClone-1.0.9-arm64.dmg", "size": 12},
    ]
    exe = colliding_assets(assets, "OmniClone Setup 1.0.9.exe")
    assert [asset["id"] for asset in exe] == [1], exe
    blockmap = colliding_assets(assets, "OmniClone Setup 1.0.9.exe.blockmap")
    assert [asset["id"] for asset in blockmap] == [2], blockmap
    dmg = colliding_assets(assets, "OmniClone-1.0.9-arm64.dmg")
    assert [asset["id"] for asset in dmg] == [3], dmg
    log_assets(assets)
    print("self-test ok")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] in {"-h", "--help"}:
        print(
            "usage: github_release_assets.py --self-test | sanitize NAME | log | collisions NAME",
            file=sys.stderr,
        )
        return 2

    command = argv[1]
    if command == "--self-test":
        self_test()
        return 0
    if command == "sanitize":
        print(sanitize_asset_name(argv[2]))
        return 0
    if command == "log":
        log_assets(json.load(sys.stdin))
        return 0
    if command == "collisions":
        payload = json.load(sys.stdin)
        assets = payload if isinstance(payload, list) else []
        for asset in colliding_assets(assets, argv[2]):
            print(f"{asset['id']}\t{asset['name']}")
        return 0

    print(f"unknown command: {command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
