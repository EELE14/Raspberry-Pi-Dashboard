import { useContext } from "react";
import { PiStatusContext } from "../context/PiStatusContext";

export function usePiStatus() {
  const ctx = useContext(PiStatusContext);
  if (!ctx) throw new Error("usePiStatus must be used within PiStatusProvider");
  return ctx;
}
