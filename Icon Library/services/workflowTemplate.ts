import type { IconLibrarySettings } from "./models";
import { STANDARD_WORKFLOW_PATH, STANDARD_WORKFLOW_SCRIPT_PATH } from "./settings";

export function buildGenerateIconsScript(settings: IconLibrarySettings): string {
  const iconDir = settings.iconDir.replace(/\\/g, "/");
  const jsonFile = settings.jsonPath.replace(/\\/g, "/");
  return `#!/usr/bin/env python3
import json
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ICON_DIR_NAME = "${iconDir}"
ICON_DIR = os.path.join(ROOT_DIR, ICON_DIR_NAME)
JSON_FILE = os.path.join(ROOT_DIR, "${jsonFile}")
REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "")
REF_NAME = os.environ.get("GITHUB_REF_NAME", "main")
RAW_BASE = f"https://raw.githubusercontent.com/{REPOSITORY}/{REF_NAME}"

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico")


def generate_json() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)
    icons = []
    for filename in sorted(os.listdir(ICON_DIR), key=str.casefold):
        if filename.startswith("."):
            continue
        if filename.lower().endswith(IMAGE_EXTS):
            name, _ext = os.path.splitext(filename)
            rel = f"{ICON_DIR_NAME}/{filename}".replace("\\\\", "/")
            icons.append({"name": name, "url": f"{RAW_BASE}/{rel}"})

    data = {
        "name": REPOSITORY or "Icon Library",
        "description": "Generated icon index",
        "icons": icons,
    }
    os.makedirs(os.path.dirname(JSON_FILE) or ".", exist_ok=True)
    with open(JSON_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\\n")


if __name__ == "__main__":
    generate_json()
`;
}

export function buildGenerateIconsWorkflow(settings: IconLibrarySettings): string {
  const iconDir = settings.iconDir.replace(/\\/g, "/");
  const jsonFile = settings.jsonPath.replace(/\\/g, "/");
  return `name: Generate icon index

on:
  push:
    paths:
      - "${iconDir}/**"
      - "${STANDARD_WORKFLOW_SCRIPT_PATH}"
      - "${STANDARD_WORKFLOW_PATH}"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: generate-icon-index-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.x"

      - name: Generate and validate icon index
        run: |
          python ${STANDARD_WORKFLOW_SCRIPT_PATH}
          python -m json.tool ${jsonFile} > /dev/null

      - name: Commit generated index
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add "${jsonFile}"
          if git diff --cached --quiet; then
            echo "Icon index is already up to date."
            exit 0
          fi
          git commit -m "chore(icons): update generated index"
          git push
`;
}

export function emptyCatalogJson(settings: IconLibrarySettings): string {
  return `${JSON.stringify(
    {
      name: `${settings.owner}/${settings.repo}`,
      description: "Generated icon index",
      icons: [],
    },
    null,
    2,
  )}\n`;
}
