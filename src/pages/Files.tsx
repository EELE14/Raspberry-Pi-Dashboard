import { lazy, Suspense, useState } from "react";
import { FileText } from "lucide-react";
import type { FileEntry } from "../types/api";
import FileBrowser from "../components/files/FileBrowser";
const FileEditor = lazy(() => import("../components/files/FileEditor"));

export default function Files() {
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null);

  return (
    <div className="flex h-screen">
      {/* Left: browser */}
      <div className="w-64 shrink-0 border-r border-[oklch(20%_0.01_260)] flex flex-col bg-[oklch(13%_0.01_260)]">
        <div className="px-3 py-3 border-b border-[oklch(20%_0.01_260)]">
          <h1 className="text-sm font-semibold text-white">Files</h1>
        </div>
        <div className="flex-1 min-h-0">
          <FileBrowser
            onFileSelect={(entry) => setSelectedFile(entry)}
            selectedPath={selectedFile?.path}
          />
        </div>
      </div>

      {/* Right: editor or placeholder */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedFile ? (
          <Suspense fallback={null}>
            <FileEditor
              key={selectedFile.path}
              file={selectedFile}
              onClose={() => setSelectedFile(null)}
            />
          </Suspense>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[oklch(35%_0.01_260)] gap-3">
            <FileText size={36} strokeWidth={1} />
            <p className="text-sm">Select a file from the browser</p>
          </div>
        )}
      </div>
    </div>
  );
}
