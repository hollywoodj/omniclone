#!/usr/bin/env bash
# Publish a GitHub Release from prebuilt artifacts.
#
# Must not rely on a local git checkout for `gh release *`: that command
# shells out to git and fails with
#   fatal: not a git repository
# Drafts are also invisible to GET /releases/tags/{tag}, so we look up by
# listing releases (including drafts) and talk to the API by numeric id.
set -euo pipefail

: "${GITHUB_REPOSITORY:?}"
: "${GH_TOKEN:?}"
: "${TAG:?}"
: "${SHA:?}"
: "${DIST:?}"

export GH_REPO="${GH_REPO:-$GITHUB_REPOSITORY}"

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

delete_asset_named() {
  local id="$1"
  local name="$2"
  local asset_id
  asset_id="$(
    gh api "repos/${GITHUB_REPOSITORY}/releases/${id}/assets?per_page=100" \
      --jq "[.[] | select(.name == \"${name}\") | .id] | first // empty"
  )"
  if [[ -n "$asset_id" ]]; then
    echo "Replacing existing asset ${name} (${asset_id})" >&2
    gh api --method DELETE "repos/${GITHUB_REPOSITORY}/releases/assets/${asset_id}" >/dev/null
  fi
}

upload_file() {
  local id="$1"
  local file="$2"
  local name
  name="$(basename "$file")"
  echo "Uploading ${name}" >&2
  gh api --method POST \
    -H "Content-Type: application/octet-stream" \
    -H "Accept: application/vnd.github+json" \
    --input "$file" \
    "https://uploads.github.com/repos/${GITHUB_REPOSITORY}/releases/${id}/assets?name=$(encode_name "$name")" \
    --jq .browser_download_url
}

upload_assets() {
  local id="$1"
  local file name
  shopt -s nullglob
  for file in "$DIST"/*.dmg "$DIST"/*.exe "$DIST"/*.blockmap; do
    name="$(basename "$file")"
    delete_asset_named "$id" "$name" || true
    if ! retry 4 upload_file "$id" "$file"; then
      echo "Upload failed for ${name}; replacing any partial asset and retrying" >&2
      delete_asset_named "$id" "$name" || true
      retry 3 upload_file "$id" "$file"
    fi
  done
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
  done < <(find artifacts -type f \( -name '*.dmg' -o -name '*.exe' -o -name '*.blockmap' \) -print0)

  if [[ "$found" -eq 0 ]]; then
    echo "No installer files found under artifacts/." >&2
    find artifacts -type f -print || true
    exit 1
  fi
  ls -la "$DIST"
}

main() {
  stage_artifacts
  local id
  id="$(ensure_release_id)"
  echo "Using release id ${id}"
  upload_assets "$id"
  local url
  url="$(retry 8 publish_release "$id")"
  echo "Published ${url}"
}

main
