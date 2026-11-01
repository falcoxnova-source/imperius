#!/bin/bash
set -e
DOCROOT=/root/xnova/frontend-html
cd "$DOCROOT"

# Identify the main bundle referenced by index.html (hashes can contain '-')
MAIN=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' index.html | head -1 | sed 's#assets/##')
echo "Main bundle referenced by index.html: $MAIN"

if [ -z "$MAIN" ] || [ ! -f "assets/$MAIN" ]; then
  echo "ERROR: main bundle not found, aborting cleanup."
  exit 1
fi

echo "--- Markers in main bundle ---"
printf 'token-price occurrences: '; grep -o 'token-price' "assets/$MAIN" | wc -l
printf 'USDT mentions: '; grep -o 'USDT' "assets/$MAIN" | wc -l

# Clean ALL orphan bundles — keep only those referenced by the main bundle
echo "--- Cleaning ALL orphan bundles ---"
ORPHANS=0
for f in assets/*-*.js; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  # Skip the main bundle itself (it's the one we keep)
  case "$base" in index-*) continue ;; esac
  # Check if this chunk is referenced by the main bundle
  if ! grep -q "$base" "assets/$MAIN" 2>/dev/null; then
    echo "rm orphan: $base"
    rm -f "$f" "$f.map" 2>/dev/null || true
    ORPHANS=$((ORPHANS + 1))
  fi
done
echo "Removed $ORPHANS orphan bundles."

# Also clean orphan CSS files (keep only the one referenced by index.html)
MAIN_CSS=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.css' index.html | head -1 | sed 's#assets/##')
if [ -n "$MAIN_CSS" ]; then
  for f in assets/index-*.css; do
    base=$(basename "$f")
    if [ "$base" != "$MAIN_CSS" ]; then
      echo "rm orphan CSS: $base"
      rm -f "$f" 2>/dev/null || true
    fi
  done
fi

# Remove all old index-*.js (keep $MAIN)
echo "--- Cleaning orphan index bundles ---"
for f in assets/index-*.js; do
  base=$(basename "$f")
  if [ "$base" != "$MAIN" ]; then
    echo "rm orphan: $base"
    rm -f "$f" "$f.map" 2>/dev/null || true
  fi
done

echo "--- Remaining bundles ---"
ls -1 assets/index-*.js assets/index-*.css 2>/dev/null
echo "--- Done ---"
