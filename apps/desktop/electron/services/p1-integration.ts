export function getP1Status(): { enabled: boolean; stage: string } {
  return { enabled: true, stage: "completed" };
}

export function getP1Capabilities(): string[] {
  return ["publish", "monitor", "analyze"];
}