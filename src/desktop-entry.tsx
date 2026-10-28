import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SoundboardApp } from "@/components/soundboard/soundboard-app";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");

createRoot(root).render(
  <StrictMode>
    <SoundboardApp />
  </StrictMode>,
);
