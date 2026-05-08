"use client";

import { useRef, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { usePet } from "@/context/PetContext";
import { usePetDrag } from "@/hooks/usePetDrag";
import { PET_STATES } from "@/lib/pet-script";

type PetStyle = CSSProperties & {
  "--pet-left": string;
  "--pet-top": string;
  "--pet-row": number;
  "--pet-frames": number;
  "--pet-duration": string;
};

export default function PagePet() {
  const { t } = useTranslation();
  const { position, state, bubble, dialogOpen, setDialogOpen } = usePet();
  const bodyRef = useRef<HTMLButtonElement>(null);
  usePetDrag(bodyRef);
  const frame = PET_STATES[state];
  const style: PetStyle = {
    "--pet-left": `${position.x}px`,
    "--pet-top": `${position.y}px`,
    "--pet-row": frame.row,
    "--pet-frames": frame.frames,
    "--pet-duration": `${frame.durationMs}ms`,
  };

  return (
    <div
      className="page-pet"
      role="img"
      aria-label={t("pet:label")}
      style={style}
    >
      <div
        className={`pet-bubble${bubble ? " is-visible" : ""}`}
        aria-live="polite"
      >
        {bubble?.text ?? ""}
      </div>
      <button
        ref={bodyRef}
        type="button"
        className="pet-body"
        aria-label={t("pet:bodyAria")}
        onClick={() => setDialogOpen(!dialogOpen)}
      >
        <span className="pet-sprite" />
      </button>
    </div>
  );
}
