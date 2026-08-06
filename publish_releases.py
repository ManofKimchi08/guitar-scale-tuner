import os
import re
import sys
import json
import urllib.request
import urllib.error

REPO = "ManofKimchi08/guitar-scale-tuner"
CHANGELOG_PATH = "CHANGELOG.md"

def parse_changelog(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    pattern = re.compile(
        r"##\s+[^\n]*?\[(v\d+\.\d+\.\d+)\]\s*-\s*([^\n]+)\n(.*?)(?=\n##\s+|\Z)",
        re.DOTALL
    )

    releases = []
    for match in pattern.finditer(content):
        tag = match.group(1).strip()
        title_line = match.group(2).strip()
        body = match.group(3).strip()
        name = f"{tag} - {title_line}"
        releases.append({
            "tag_name": tag,
            "name": name,
            "body": body
        })
    return releases

def create_release(token, repo, tag_name, name, body):
    url = f"https://api.github.com/repos/{repo}/releases"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "GuitarScaleTuner-ReleaseAutomator",
        "Content-Type": "application/json"
    }
    payload = json.dumps({
        "tag_name": tag_name,
        "name": name,
        "body": body,
        "draft": False,
        "prerelease": False
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"✅ [SUCCESS] Published {tag_name}: {data.get('html_url')}")
            return True
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        if e.code == 422 and "already_exists" in err_msg:
            print(f"⚠️ [NOTICE] Release {tag_name} already exists. Skipping.")
            return True
        else:
            print(f"❌ [ERROR] {tag_name} [{e.code}]: {err_msg}")
            return False

def main():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token and len(sys.argv) > 1:
        token = sys.argv[1]

    if not token:
        print("="*60)
        print("🔑 GitHub Access Token Required!")
        print("="*60)
        token = input("Please enter your GitHub Personal Access Token (PAT): ").strip()

    if not token:
        print("No token provided. Exiting.")
        sys.exit(1)

    releases = parse_changelog(CHANGELOG_PATH)
    print(f"\n🚀 Starting batch publication of {len(releases)} releases to https://github.com/{REPO}...\n")

    success_count = 0
    # Publish from oldest to newest (v1.0.0 -> v1.7.9)
    for rel in reversed(releases):
        print(f"📦 Publishing {rel['tag_name']}...")
        if create_release(token, REPO, rel['tag_name'], rel['name'], rel['body']):
            success_count += 1

    print(f"\n🎉 Finished publishing releases! ({success_count}/{len(releases)} completed successfully)")

if __name__ == "__main__":
    main()
