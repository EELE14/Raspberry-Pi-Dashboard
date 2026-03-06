import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "../lib/ws";

export default function Terminal() {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement != null);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      outerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  useEffect(() => {
    if (!containerRef.current) return;

    // xterm.js
    const terminal = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", ui-monospace, monospace',
      theme: {
        background: "#0d0d10",
        foreground: "#e0e0e0",
        cursor: "#6b9fff",
        selectionBackground: "#6b9fff44",
        black: "#1a1a1a",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#e5c07b",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#e5c07b",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      },
      allowTransparency: false,
      scrollback: 3000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    const { cols, rows } = terminal;

    // websocket
    const ws = new WebSocket(
      wsUrl("/terminal", { cols: String(cols), rows: String(rows) }),
    );
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      terminal.focus();
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(e.data));
      } else {
        terminal.write(e.data as string);
      }
    };

    ws.onclose = () => {
      terminal.write("\r\n\x1b[31m[Connection closed]\x1b[0m\r\n");
    };

    ws.onerror = () => {
      terminal.write("\r\n\x1b[31m[WebSocket error]\x1b[0m\r\n");
    };

    terminal.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      terminal.dispose();
    };
  }, []);

  return (
    <div ref={outerRef} className="flex flex-col h-screen bg-[#0d0d10]">
      {/* Header — visible in both normal and fullscreen mode */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[oklch(20%_0.01_260)] bg-[oklch(13%_0.01_260)]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Terminal</span>
          <span className="text-xs text-[oklch(40%_0.01_260)]">
            — bash @ Pi
          </span>
        </div>
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
          className="text-[oklch(45%_0.01_260)] hover:text-white transition-colors p-1 rounded"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* xterm container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 p-2"
        style={{ background: "#0d0d10" }}
      />
    </div>
  );
}
