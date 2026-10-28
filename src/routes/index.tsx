import { createFileRoute } from "@tanstack/react-router";
import { SoundboardApp } from "@/components/soundboard/soundboard-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SoundboardApp />;
}
