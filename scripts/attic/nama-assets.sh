#!/bin/bash
# NAMA asset fetcher: posters (700x1050), backdrops (1200x627), episode thumbs (320x180)
# + ffmpeg-generated demo videos (offline-safe for Iran / Electron)
set -u
PUB=/home/z/my-project/public
mkdir -p "$PUB/posters" "$PUB/backdrops" "$PUB/thumbs" "$PUB/videos"
PX="https://images.pexels.com/photos"
Q="?auto=compress&cs=tinysrgb&fit=crop"

# slug -> pexels id
declare -A IDS=(
  [endless-night]=35171253 [orbit-of-silence]=37269529 [desert-winds]=39260641
  [last-train]=35171250 [city-shadows]=19943722 [the-deep]=932638
  [summit]=38887601 [pomegranate]=30878453 [red-winter]=23384428
  [night-shift]=8765934 [fog-road]=15707399 [house-seven]=11850828
  [dark-capital]=37911517 [galaxy-migrants]=37269550 [dynasty]=998635
  [midnight-cafe]=30878454
)

fail=0
for slug in "${!IDS[@]}"; do
  id=${IDS[$slug]}
  curl -sfL -m 40 "$PX/$id/pexels-photo-$id.jpeg$Q&h=1050&w=700" -o "$PUB/posters/$slug.jpg" || { echo "POSTER FAIL $slug ($id)"; fail=1; }
  curl -sfL -m 40 "$PX/$id/pexels-photo-$id.jpeg$Q&h=627&w=1200" -o "$PUB/backdrops/$slug.jpg" || { echo "BACKDROP FAIL $slug ($id)"; fail=1; }
done

# episode thumbnails
i=1
for id in 35171250 6494958 3629669 39040884 6494957 34215537 19224452 34007217 23384407; do
  curl -sfL -m 40 "$PX/$id/pexels-photo-$id.jpeg$Q&h=180&w=320" -o "$PUB/thumbs/t$i.jpg" || { echo "THUMB FAIL t$i ($id)"; fail=1; }
  i=$((i+1))
done

# ---- demo videos: cinematic gradient scenes, ~2:45, 720p, tiny ----
mkvid () { # name c0 c1 c2 speed
  ffmpeg -y -loglevel error -f lavfi -i "gradients=size=1280x720:speed=$5:duration=165:c0=$2:c1=$3:c2=$4" \
    -vf "noise=alls=6:allf=t,vignette=PI/5" \
    -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -movflags +faststart "$PUB/videos/$1.mp4" \
    && echo "video $1 ok" || { echo "VIDEO FAIL $1"; fail=1; }
}
mkvid v1 0x1a0b2e 0x7a1f3d 0xd46a2b 0.025   # noir ember
mkvid v2 0x02111f 0x0b3a53 0x2e86ab 0.018   # deep space
mkvid v3 0x2b1406 0x8a4b1e 0xe0a458 0.030   # desert
mkvid v4 0x04120c 0x14532d 0x4c9f70 0.022   # emerald
mkvid v5 0x0d0221 0x371a79 0x9d4edd 0.015   # violet night

echo "---- results ----"
ls -la "$PUB/posters" | head -20
ls "$PUB/backdrops" | wc -l; ls "$PUB/thumbs" | wc -l; ls -la "$PUB/videos"
echo "FAILMARK=$fail"
