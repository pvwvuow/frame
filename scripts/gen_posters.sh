#!/bin/bash
# Generate fake movie posters for the VOD app demo (Field Kit cinematic aesthetic)
OUT=/home/z/my-project/public/posters
mkdir -p "$OUT"

STYLE="cinematic film still, analog 35mm film photography, subtle film grain, halation glow on highlights, faint warm amber light leak on one frame edge, deep rich shadows, professional movie key art, dramatic lighting, no text, no letters, no typography, no watermark, no logo"

# --- batch 1: portrait posters (864x1152) ---
z-ai image -p "lone astronaut standing on a red desert planet under a giant pale sun, epic scale silhouette, dust in the air, $STYLE" -o "$OUT/poster-orbit.png" -s 864x1152 &
z-ai image -p "rain soaked neon lit city alley at night, lone detective with umbrella, reflections on wet asphalt, teal and orange, $STYLE" -o "$OUT/poster-noir.png" -s 864x1152 &
z-ai image -p "old lonely house on a cliff above a sea of clouds at golden hour, warm sunlight, birds, $STYLE" -o "$OUT/poster-house.png" -s 864x1152 &
z-ai image -p "silhouettes of soldiers walking on a ridge at dusk, smoke and amber sky, epic war film, $STYLE" -o "$OUT/poster-frontline.png" -s 864x1152 &
wait

# --- batch 2 ---
z-ai image -p "couple standing at the shoreline writing in the sand, huge orange sunset over the ocean, romantic film, $STYLE" -o "$OUT/poster-sea.png" -s 864x1152 &
z-ai image -p "dark hotel corridor with a single numbered door glowing warm, mystery thriller mood, fog, $STYLE" -o "$OUT/poster-room8.png" -s 864x1152 &
z-ai image -p "camel caravan crossing massive sand dunes at dawn, long shadows, adventure epic, $STYLE" -o "$OUT/poster-caravan.png" -s 864x1152 &
z-ai image -p "vintage detective desk with case files photos and red string evidence board, moody lamp light, crime series, $STYLE" -o "$OUT/poster-coldcase.png" -s 864x1152 &
wait

# --- batch 3 ---
z-ai image -p "empty underground metro station at night with flickering lights and fog, eerie sci-fi series, $STYLE" -o "$OUT/poster-station13.png" -s 864x1152 &
z-ai image -p "hooded hunter with bow in misty pine forest, shafts of light between trees, fantasy series, $STYLE" -o "$OUT/poster-hunters.png" -s 864x1152 &
z-ai image -p "young woman looking at stormy sea from a train window, motion blur, melancholic drama, $STYLE" -o "$OUT/poster-train.png" -s 864x1152 &
z-ai image -p "boxer wrapping hands in dark gym, single overhead light, sweat and chalk dust, sports drama, $STYLE" -o "$OUT/poster-boxer.png" -s 864x1152 &
wait

# --- batch 4: landscape backdrops (1440x720) ---
z-ai image -p "vast mountain valley at night with a river of fire and embers flowing through it, epic fantasy hero shot, $STYLE" -o "$OUT/hero-main.png" -s 1440x720 &
z-ai image -p "night highway seen from above with car light trails through forest, $STYLE" -o "$OUT/thumb-highway.png" -s 1440x720 &
z-ai image -p "grand old cinema hall with dusty projector beam cutting through darkness onto screen, $STYLE" -o "$OUT/thumb-cinema.png" -s 1440x720 &
z-ai image -p "snowy observatory dome under green aurora and stars, $STYLE" -o "$OUT/thumb-aurora.png" -s 1440x720 &
z-ai image -p "lighthouse in stormy sea hit by giant wave at dusk, $STYLE" -o "$OUT/thumb-lighthouse.png" -s 1440x720 &
wait

echo "DONE"; ls -la "$OUT"
