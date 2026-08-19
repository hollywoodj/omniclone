#!/usr/bin/env bash
# Publish a GitHub Release from prebuilt artifacts.
#
# Must not rely on a local git checkout for `gh release *`: that command
# shells out to git and fails with
#   fatal: not a git repository
# Drafts are also invisible to GET /releases/tags/{tag}, so we look up by
# listing releases (including drafts) and talk to the API by numeric id.
#
# GitHub sanitizes asset filenames (spaces and other special characters become
# dots), so "OmniClone Setup 1.0.9.exe" is stored as "OmniClone.Setup.1.0.9.exe".
# Deletes must match that sanitized name or upload returns 422 already_exists.
set -euo pipefail

export GH_REPO="${GH_REPO:-${GITHUB_REPOSITORY:-}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_PY="${SCRIPT_DIR}/github_release_assets.py"

retry() {
  local attempts="$1"
  shift
  local delay=8
  local n=1
  while true; do
    if "$@"; then
      return 0
    fi
    if (( n >= attempts )); then
      return 1
    fi
    echo "Attempt $n failed; retrying in ${delay}s..." >&2
    sleep "$delay"
    delay=$(( delay * 2 ))
    n=$(( n + 1 ))
  done
}

encode_name() {
  python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

sanitize_asset_name() {
  python3 "$ASSETS_PY" sanitize "$1"
}

find_release_id() {
  gh api "repos/${GITHUB_REPOSITORY}/releases?per_page=100" \
    --jq "[.[] | select(.tag_name == \"${TAG}\") | .id] | first // empty"
}

create_draft() {
  echo "Creating draft release ${TAG} at ${SHA}" >&2
  local id
  if id="$(
    gh api --method POST "repos/${GITHUB_REPOSITORY}/releases" \
      -f tag_name="$TAG" \
      -f target_commitish="$SHA" \
      -f name="OmniClone ${TAG#v}" \
      -F draft=true \
      -F generate_release_notes=true \
      --jq .id
  )"; then
    printf '%s' "$id"
    return 0
  fi
  echo "Create failed; looking up an existing ${TAG} release" >&2
  find_release_id
}

ensure_release_id() {
  local id
  id="$(find_release_id)"
  if [[ -z "$id" ]]; then
    id="$(create_draft)"
  else
    echo "Found existing release ${id} for ${TAG}" >&2
  fi
  if [[ -z "$id" ]]; then
    echo "Could not create or find a release for ${TAG}" >&2
    exit 1
  fi
  printf '%s' "$id"
}

list_assets_json() {
  local id="$1"
  gh api "repos/${GITHUB_REPOSITORY}/releases/${id}" --jq '.assets'
}

log_assets() {
  local id="$1"
  echo "Current assets on release ${id}:" >&2
  list_assets_json "$id" | python3 "$ASSETS_PY" log
}

colliding_asset_ids() {
  local id="$1"
  local name="$2"
  list_assets_json "$id" | python3 "$ASSETS_PY" collisions "$name"
}

delete_asset_id() {
  local asset_id="$1"
  local status
  status="$(
    curl -sS -o /tmp/omniclone-delete-asset.json -w "%{http_code}" \
      -X DELETE \
      -H "Authorization: Bearer ${GH_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}"
  )"
  case "$status" in
    204|404) return 0 ;;
    *)
      echo "Failed to delete asset ${asset_id} (HTTP ${status})" >&2
      cat /tmp/omniclone-delete-asset.json >&2 || true
      echo >&2
      return 1
      ;;
  esac
}

delete_colliding_assets() {
  local id="$1"
  local name="$2"
  local line asset_id stored
  local found=0
  while IFS=$'\t' read -r asset_id stored; do
    [[ -z "${asset_id:-}" ]] && continue
    found=1
    echo "Replacing existing asset ${stored} (${asset_id}) before uploading ${name}" >&2
    delete_asset_id "$asset_id"
  done < <(colliding_asset_ids "$id" "$name")
  if [[ "$found" -eq 0 ]]; then
    echo "No existing asset collides with ${name} (sanitized: $(sanitize_asset_name "$name"))" >&2
  fi
}

upload_file() {
  local id="$1"
  local file="$2"
  local name sanitized
  name="$(basename "$file")"
  sanitized="$(sanitize_asset_name "$name")"
  echo "Uploading ${name} as ${sanitized}" >&2
  # Send the sanitized name so uniqueness checks match listed assets.
  gh api --method POST \
    -H "Content-Type: application/octet-stream" \
    -H "Accept: application/vnd.github+json" \
    --input "$file" \
    "https://uploads.github.com/repos/${GITHUB_REPOSITORY}/releases/${id}/assets?name=$(encode_name "$sanitized")" \
    --jq .browser_download_url
}

upload_one() {
  local id="$1"
  local file="$2"
  local name
  name="$(basename "$file")"
  delete_colliding_assets "$id" "$name"
  if upload_file "$id" "$file"; then
    return 0
  fi
  echo "Upload failed for ${name}; deleting collisions and retrying" >&2
  log_assets "$id"
  delete_colliding_assets "$id" "$name"
  retry 5 upload_file "$id" "$file"
}

upload_assets() {
  local id="$1"
  local file
  log_assets "$id"
  shopt -s nullglob
  # latest.yml is the update feed electron-updater reads; without it an
  # installed app never learns a new release exists.
  for file in "$DIST"/*.dmg "$DIST"/*.exe "$DIST"/*.blockmap "$DIST"/*.yml; do
    upload_one "$id" "$file"
  done
  log_assets "$id"
}

publish_release() {
  local id="$1"
  local url
  url="$(
    gh api "repos/${GITHUB_REPOSITORY}/releases/${id}" --jq 'select(.draft == false) | .html_url'
  )"
  if [[ -n "$url" ]]; then
    echo "Release ${id} is already published" >&2
    printf '%s\n' "$url"
    return 0
  fi
  echo "Publishing release ${id} as ${TAG}" >&2
  gh api --method PATCH "repos/${GITHUB_REPOSITORY}/releases/${id}" \
    -f tag_name="$TAG" \
    -f target_commitish="$SHA" \
    -f name="OmniClone ${TAG#v}" \
    -F draft=false \
    -f make_latest=true \
    --jq .html_url
}

stage_artifacts() {
  mkdir -p "$DIST"
  local found=0
  local file
  while IFS= read -r -d '' file; do
    cp "$file" "$DIST/"
    found=1
  done < <(find artifacts -type f \( -name '*.dmg' -o -name '*.exe' -o -name '*.blockmap' -o -name 'latest*.yml' \) -print0)

  if [[ "$found" -eq 0 ]]; then
    echo "No installer files found under artifacts/." >&2
    find artifacts -type f -print || true
    exit 1
  fi
  ls -la "$DIST"
}

self_test() {
  python3 "$ASSETS_PY" --self-test
}

main() {
  if [[ "${1:-}" == "--self-test" ]]; then
    self_test
    return 0
  fi
  : "${GITHUB_REPOSITORY:?}"
  : "${GH_TOKEN:?}"
  : "${TAG:?}"
  : "${SHA:?}"
  : "${DIST:?}"
  export GH_REPO="${GH_REPO:-$GITHUB_REPOSITORY}"
  python3 "$ASSETS_PY" --self-test
  stage_artifacts
  local id
  id="$(ensure_release_id)"
  echo "Using release id ${id}"
  upload_assets "$id"
  local url
  url="$(retry 8 publish_release "$id")"
  echo "Published ${url}"
}

main "$@"
