import React from "react";
import { useStore } from "../state/store";

export const StatusPill: React.FC = () => {
  const status = useStore((s) => s.bggStatus);
  const label =
    status.state === "idle"
      ? "idle"
      : status.state === "syncing"
        ? `syncing ${status.queueDepth ? "· " + status.queueDepth + " queued" : ""}`
        : status.state === "rate-limited"
          ? "rate-limited"
          : "error";
  return (
    <div className={"status-pill " + status.state} title={status.lastError ?? `BoardGameGeek sync — ${status.state}`}>
      <span className="dot" />
      <span>BGG</span>
      <span className="num">{label}</span>
    </div>
  );
};
