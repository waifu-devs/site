#!/usr/bin/env bash
# Which workspace packages a change needs CI for (ci.yml).
#
#   changes.sh pr <number>   the files a pull request changes
#   changes.sh since <sha>   the files changed between <sha> and HEAD
#   changes.sh stdin         the files listed on standard input (to try it locally)
#   changes.sh all           every package (started by hand, or no base to compare)
#
# Prints for $GITHUB_OUTPUT:
#   run=true|false      whether CI has anything to check
#   filter=<args>       pnpm --filter arguments: each changed package and every package
#                       that depends on it, or nothing for the whole workspace
# A file outside apps/<app>/ and packages/<package>/ that isn't listed below as
# unable to affect a build (the lock file, tsconfig.base.json, patches/, a new
# folder) checks the whole workspace. When the list can't be had, so does it.
set -euo pipefail

everything() {
  printf 'run=true\nfilter=\n'
  exit 0
}

case "${1:-all}" in
  pr)
    [ "${CHANGED_FILES:-0}" -lt 3000 ] || everything
    files=$(gh api "repos/$GITHUB_REPOSITORY/pulls/$2/files" --paginate \
      --jq '.[] | .filename, (.previous_filename // empty)') || everything
    ;;
  since)
    base=$2
    [[ $base =~ ^[0-9a-f]{40}$ && $base != 0000000000000000000000000000000000000000 ]] || everything
    git fetch --no-tags --quiet --depth=1 origin "$base" 2>/dev/null || everything
    files=$(git diff --name-only --no-renames "$base" HEAD) || everything
    ;;
  stdin) files=$(cat) ;;
  *) everything ;;
esac

declare -A packages=()
count=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  count=$((count + 1))
  if [[ $f == .railway/* || $f == .github/workflows/railway-config.yml ]]; then
    : # read by no build, type check or test (.railway/ has its own workflow)
  elif [[ $f != */* && $f == *.md ]]; then
    : # the README
  elif [[ $f =~ ^(apps|packages)/[^/]+/ ]]; then
    dir=${BASH_REMATCH[0]%/}
    # A folder that isn't a package yet checks it all.
    [ -f "$dir/package.json" ] || everything
    packages[$dir]=1
  else
    everything
  fi
done <<< "$files"

echo "changed files: $count" >&2
if [ ${#packages[@]} -eq 0 ]; then
  printf 'run=false\nfilter=\n'
  exit 0
fi
filter=
for dir in "${!packages[@]}"; do
  name=$(jq -r .name "$dir/package.json")
  filter+=" --filter ...$name"
done
printf 'run=true\nfilter=%s\n' "${filter# }"
