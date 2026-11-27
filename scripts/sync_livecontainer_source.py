#!/usr/bin/env python3
"""Build a single AltStore-style source for LiveContainer from ten upstream repos."""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
import zipfile
import plistlib
from datetime import datetime, timezone

OUT = "livecontainer-apps.json"
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = "https://api.github.com"
REPOS = [
    {"repo": "huami1314/GestaltX", "icon": "https://raw.githubusercontent.com/huami1314/GestaltX/main/GestaltX/Assets.xcassets/AppIcon.appiconset/AppIcon.png", "subtitle": "MobileGestalt 编辑与设备配置研究工具", "minOS": "26.0"},
    {"repo": "Kianuni/Erosion-CN", "source": "apps.json"},
    {"repo": "mengangs/ipadn", "source": "altstore-source.json"},
    {"repo": "hseons/WQManager", "icon": "https://raw.githubusercontent.com/hseons/WQManager/main/docs/images/icon.png", "subtitle": "iOS 应用数据备份、还原与缓存清理工具", "minOS": "26.0"},
    {"repo": "Reukix/Reloc", "icon": "https://raw.githubusercontent.com/Reukix/Reloc/main/docs/icon.png", "subtitle": "iPhone 与 iPad 本机虚拟外设定位模拟工具", "minOS": "17.0"},
    {"repo": "imxieyi/Kernarium", "source": "sideload/source.json"},
    {"repo": "kolbicz/WQFiles", "source": "source.json"},
    {"repo": "maow318/seekly-open", "icon": "https://raw.githubusercontent.com/ucuw/rules/main/assets/seekly-icon.jpg", "subtitle": "NodeSeek 社区第三方 iOS 客户端", "minOS": "16.0"},
    {"repo": "Kianuni/Camlo", "source": "apps.json"},
    {"repo": "Rone89/cilicili", "icon": "https://raw.githubusercontent.com/Rone89/cilicili/main/bili/Assets.xcassets/AppIcon.appiconset/cilicili-icon.png", "subtitle": "第三方哔哩哔哩 iOS 客户端", "minOS": "26.1"},
]

def request(url, binary=False):
    headers = {"User-Agent": "ucuw-livecontainer-source-sync", "Accept": "application/vnd.github+json"}
    if TOKEN and "api.github.com" in url:
        headers["Authorization"] = "Bearer " + TOKEN
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=90) as response:
        data = response.read()
    return data if binary else data.decode("utf-8")

def get_json(url):
    return json.loads(request(url))

def extract_app_metadata(ipa_url, max_bytes=150 * 1024 * 1024):
    req = urllib.request.Request(ipa_url, headers={"User-Agent": "ucuw-livecontainer-source-sync"})
    with urllib.request.urlopen(req, timeout=180) as response:
        length = int(response.headers.get("Content-Length", "0") or 0)
        if length and length > max_bytes:
            raise ValueError("IPA exceeds metadata inspection limit")
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("IPA exceeds metadata inspection limit")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        candidates = [n for n in archive.namelist() if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", n)]
        if not candidates:
            raise ValueError("IPA has no Payload/*.app/Info.plist")
        info = plistlib.loads(archive.read(candidates[0]))
    return info

def app_from_release(cfg):
    repo = cfg["repo"]
    release = get_json(f"{API}/repos/{repo}/releases/latest")
    assets = [a for a in release.get("assets", []) if a.get("name", "").lower().endswith(".ipa")]
    if not assets:
        raise ValueError("latest release has no IPA asset")
    assets.sort(key=lambda a: ("lite" in a["name"].lower(), a["name"].lower()))
    asset = assets[0]
    info = extract_app_metadata(asset["browser_download_url"])
    bundle = info.get("CFBundleIdentifier")
    if not bundle:
        raise ValueError("CFBundleIdentifier missing from IPA Info.plist")
    name = info.get("CFBundleDisplayName") or info.get("CFBundleName") or repo.split("/")[1]
    version = info.get("CFBundleShortVersionString") or release.get("tag_name", "").lstrip("v")
    build = info.get("CFBundleVersion")
    min_os = info.get("MinimumOSVersion") or cfg.get("minOS")
    body = (release.get("body") or "").strip()
    version_item = {
        "version": str(version),
        "date": (release.get("published_at") or "")[:10],
        "localizedDescription": body[:9000],
        "downloadURL": asset["browser_download_url"],
        "size": asset.get("size", 0),
    }
    if build:
        version_item["buildVersion"] = str(build)
    if min_os:
        version_item["minOSVersion"] = str(min_os)
    app = {
        "name": str(name),
        "bundleIdentifier": bundle,
        "developerName": repo.split("/")[0],
        "subtitle": cfg.get("subtitle", f"{name} 官方 GitHub Release"),
        "localizedDescription": body[:9000] or f"{name} 的官方 GitHub Release 安装包。",
        "versions": [version_item],
        "version": str(version),
        "versionDate": release.get("published_at", ""),
        "versionDescription": body[:9000],
        "downloadURL": asset["browser_download_url"],
        "size": asset.get("size", 0),
    }
    if cfg.get("icon"):
        app["iconURL"] = cfg["icon"]
    if min_os:
        app["minOSVersion"] = str(min_os)
    return app

def main():
    apps = []
    errors = []
    for cfg in REPOS:
        repo = cfg["repo"]
        try:
            if cfg.get("source"):
                raw = request(f"https://raw.githubusercontent.com/{repo}/main/{cfg['source']}")
                source = json.loads(raw)
                found = source.get("apps") or []
                if not found:
                    raise ValueError("source JSON contains no apps")
                # LiveContainer does not support app extensions. Use iPadn's
                # official Lite IPA for its latest version (without widgets/live activities).
                if repo == "mengangs/ipadn":
                    for app in found:
                        latest = str(app.get("version", ""))
                        if latest:
                            lite_url = f"https://github.com/mengangs/ipadn/releases/download/v{latest}/iPadn-{latest}-lite-unsigned.ipa"
                            app["downloadURL"] = lite_url
                            if latest == "2.3.5":
                                app["size"] = 49971723
                            for version in app.get("versions", []):
                                if str(version.get("version", "")) == latest:
                                    version["downloadURL"] = lite_url
                                    if latest == "2.3.5":
                                        version["size"] = 49971723
                                    note = "LiveContainer compatibility: this source points to the official Lite IPA, which omits app extensions."
                                    old = version.get("localizedDescription", "")
                                    version["localizedDescription"] = (old + "\\n\\n" + note).strip()
                apps.extend(found)
                print(f"source: {repo}: {len(found)} app(s)")
            else:
                app = app_from_release(cfg)
                apps.append(app)
                print(f"release: {repo}: {app['name']} {app['version']}")
        except Exception as exc:
            errors.append({"repo": repo, "error": str(exc)})
            print(f"SKIP: {repo}: {exc}", file=sys.stderr)

    # Keep one entry per bundle identifier. Prefer the first (official source) entry.
    unique = {}
    for app in apps:
        bundle = app.get("bundleIdentifier")
        if bundle and bundle not in unique:
            unique[bundle] = app
    result = {
        "name": "ucuw IPA 聚合源",
        "identifier": "com.ucuw.livecontainer.source",
        "subtitle": "整合 10 个 GitHub 项目的 iOS IPA 应用",
        "description": "由 ucuw/rules 自动聚合指定 GitHub 项目的官方 AltStore 源与最新 Release IPA。IPA 文件仍由原作者 GitHub Releases 托管；源每 6 小时自动检查更新。",
        "website": "https://github.com/ucuw/rules",
        "apps": list(unique.values()),
        "news": [],
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {OUT}: {len(unique)} unique apps")
    if errors:
        print("Upstream errors:", json.dumps(errors, ensure_ascii=False))
    # Do not fail the job for a single upstream outage; the source can still update partially.
    if not unique:
        raise RuntimeError("No apps were collected")

if __name__ == "__main__":
    main()
