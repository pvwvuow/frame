"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AuraApp } from "@/components/aura/AuraApp";
import { FieldKitApp } from "@/components/fieldkit/FieldKitApp";

type Skin = "aura" | "kit";

export default function Page() {
  const [skin, setSkin] = useState<Skin>("aura");
  const toggle = () => setSkin((s) => (s === "aura" ? "kit" : "aura"));

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={skin}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        {skin === "aura" ? <AuraApp onSwitchSkin={toggle} /> : <FieldKitApp onSwitchSkin={toggle} />}
      </motion.div>
    </AnimatePresence>
  );
}
