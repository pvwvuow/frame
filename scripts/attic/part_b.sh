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
gen "historical epic poster, ancient persian warrior king on horse at golden desert dunes, flowing cape, massive army behind, sunset glory, $P" "768x1344" "$OUT/desert-king.png"

gen "street racing action poster, sports car drifting through neon night city intersection, motion blur, sparks, rain reflections, adrenaline mood, $P" "768x1344" "$OUT/final-race.png"

gen "supernatural horror poster, decayed hospital corridor with wheelchair, ghost silhouette at end of hallway, flickering lights, green tinted dread, $P" "768x1344" "$OUT/purgatory.png"

gen "noir crime poster, detective in trench coat under streetlamp in fog, vintage car behind, high contrast black and orange, 1970s thriller mood, $P" "768x1344" "$OUT/dark-alley.png"

# ---------- SERIES POSTERS (portrait) ----------
gen "prestige drama series poster, tehran city skyline at blue hour with milad tower lights, woman with headscarf silhouette on rooftop overlooking city, warm street lights, cinematic, $P" "768x1344" "$OUT/tehran-nights.png"

gen "spy thriller series poster, split face of double agent half in shadow half in light, chess pieces and gun reflection, cold steel tones, tension, $P" "768x1344" "$OUT/double-agent.png"

gen "sci-fi mystery series poster, person touching glowing sound wave anomaly in dark laboratory, ripples of cyan light, scientific instruments, mysterious mood, $P" "768x1344" "$OUT/echo.png"

# ---------- HERO BACKDROPS (wide) ----------
gen "ultra wide cinematic space battle backdrop, giant capital ships in formation near orange gas giant planet, fighter squadrons, nebula clouds, epic scale, film still, no text, $P" "1440x736" "$BD/hero-galaxy.png"

gen "ultra wide cinematic noir city backdrop, futuristic tehran-like megacity at night in rain, orange neon signs, flying vehicles light trails, moody atmosphere, film still, no text, $P" "1440x736" "$BD/hero-noir.png"

gen "ultra wide cinematic desert epic backdrop, caravan of riders crossing massive sand dunes at golden hour, birds eye dramatic scale, warm haze, film still, no text, $P" "1440x736" "$BD/hero-desert.png"

echo "ALL DONE"
echo "PART_B_DONE"
