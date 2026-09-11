#!/bin/bash
# Generate AI movie/series posters for NovaPlay demo
OUT="/home/z/my-project/public/posters"
BD="/home/z/my-project/public/backdrops"
mkdir -p "$OUT" "$BD"

gen() {
  local prompt="$1"
  local size="$2"
  local path="$3"
  if [ -f "$path" ]; then echo "SKIP $path"; return; fi
  echo "GEN $path ..."
  z-ai image -p "$prompt" -o "$path" -s "$size" && echo "OK  $path" || echo "FAIL $path"
}

P="cinematic movie poster art, no text, no words, no letters, no typography, dramatic lighting, rich color grading, professional key art, high detail"
gen "epic space opera poster, massive star fleet silhouettes against giant orange nebula, a lone commander standing on obsidian platform looking up, cinematic scale, god rays, embers floating, $P" "768x1344" "$OUT/galaxy-empire.png"

gen "neo-noir thriller poster, rain soaked city alley at night, silhouette of detective under flickering neon sign, orange and teal color palette, puddle reflections, cinematic haze, $P" "768x1344" "$OUT/ash-city.png"

gen "fantasy epic poster, armored guardian with glowing amber sword standing before ancient stone gate, dragon circling in stormy sky, volumetric light, $P" "768x1344" "$OUT/last-guardian.png"

gen "modern war epic poster, soldier silhouette walking through sandstorm with burning tank behind, red dust atmosphere, dramatic backlight, $P" "768x1344" "$OUT/red-storm.png"

gen "emotional drama poster, middle eastern man silhouette standing in golden wheat field at sunset, wind, warm amber tones, melancholic cinematic mood, $P" "768x1344" "$OUT/old-scar.png"

gen "cyberpunk tech thriller poster, hooded hacker in dark room surrounded by floating holographic green code streams, face lit by monitors, high contrast, $P" "768x1344" "$OUT/code-zero.png"

gen "horror poster, abandoned wooden cabin in misty pine forest at night, faint ghostly figure between trees, cold fog, moonlight, eerie atmosphere, $P" "768x1344" "$OUT/silent-forest.png"

gen "crime heist movie poster, group of masked robbers in suits walking away from bank vault, golden money bills flying, dramatic low angle, teal and gold grade, $P" "768x1344" "$OUT/big-heist.png"

gen "romantic drama poster, couple standing apart on frozen lake under green aurora borealis, breath visible in cold air, magical winter night, $P" "768x1344" "$OUT/frozen-heart.png"

gen "surreal mystery poster, giant floating black monolith above desert road, person standing with suitcase looking up, dreamlike purple sky with two moons, $P" "768x1344" "$OUT/beyond.png"
echo "PART_A_DONE"
