import React, { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { 
  FileText, Download, ExternalLink, X, ZoomIn, ZoomOut, 
  RotateCcw, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Printer 
} from "lucide-react";

// Ensure worker is configured
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();
}

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  pdfDataUrl: string | null;
}

/**
 * Converts a base64 Data URL to a Uint8Array for PDF.js.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const parts = dataUrl.split(",");
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts a base64 Data URL to a Blob.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
  const bytes = dataUrlToUint8Array(dataUrl);
  return new Blob([bytes], { type: mime });
}

export default function PdfViewerModal({
  isOpen,
  onClose,
  title,
  pdfDataUrl
}: PdfViewerModalProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.25);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());
  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen || !pdfDataUrl) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);
    setNumPages(0);
    setCurrentPage(1);

    async function loadPdf() {
      try {
        const bytes = dataUrlToUint8Array(pdfDataUrl!);
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        const pdf = await loadingTask.promise;

        if (!isMounted) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setIsLoading(false);
      } catch (err: any) {
        console.error("PDF.js load error:", err);
        if (isMounted) {
          setErrorMessage(err?.message || "Could not decode PDF document.");
          setIsLoading(false);
        }
      }
    }

    loadPdf();

    return () => {
      isMounted = false;
      // Cancel active render tasks
      renderTasksRef.current.forEach((task) => {
        try {
          task.cancel();
        } catch {}
      });
      renderTasksRef.current.clear();
      pdfDocRef.current = null;
    };
  }, [isOpen, pdfDataUrl]);

  // Render pages onto canvases whenever scale or numPages change
  useEffect(() => {
    if (!isOpen || !pdfDocRef.current || numPages === 0) return;

    let isCancelled = false;

    async function renderAllPages() {
      const pdf = pdfDocRef.current;
      if (!pdf) return;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (isCancelled) break;
        const canvas = canvasRefs.current.get(pageNum);
        if (!canvas) continue;

        try {
          // Cancel previous render task for this page if ongoing
          const existingTask = renderTasksRef.current.get(pageNum);
          if (existingTask) {
            try {
              existingTask.cancel();
            } catch {}
          }

          const page = await pdf.getPage(pageNum);
          if (isCancelled) break;

          const pixelRatio = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: scale * pixelRatio });

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / pixelRatio}px`;
          canvas.style.height = `${viewport.height / pixelRatio}px`;

          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          const renderContext = {
            canvasContext: ctx,
            viewport: viewport
          };

          const renderTask = page.render(renderContext);
          renderTasksRef.current.set(pageNum, renderTask);

          await renderTask.promise;
          renderTasksRef.current.delete(pageNum);
        } catch (err: any) {
          if (err?.name !== "RenderingCancelledException") {
            console.warn(`Page ${pageNum} render error:`, err);
          }
        }
      }
    }

    renderAllPages();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, numPages, scale]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!pdfDataUrl) return;
    try {
      const blob = dataUrlToBlob(pdfDataUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^A-Za-z0-9_\-]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleOpenNewWindow = () => {
    if (!pdfDataUrl) return;
    try {
      const blob = dataUrlToBlob(pdfDataUrl);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      console.error("Open in new window failed:", e);
    }
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setScale(1.25);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-3xl w-full max-w-6xl h-[94vh] flex flex-col shadow-2xl overflow-hidden border border-slate-700/80">
        
        {/* Viewer Header */}
        <div className="p-3.5 sm:p-4 bg-slate-950 border-b border-slate-800 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          
          {/* Document Title */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold font-mono text-sm sm:text-base text-white truncate tracking-tight">
                {title}
              </h3>
              {numPages > 0 && (
                <div className="text-[11px] text-slate-400 font-mono">
                  {numPages} {numPages === 1 ? "page" : "pages"} loaded
                </div>
              )}
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl p-1 gap-1 text-slate-300">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                className="p-1 rounded-lg hover:bg-slate-700 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-0.5 text-xs font-mono font-bold hover:bg-slate-700 hover:text-white rounded transition-colors cursor-pointer"
                title="Reset Zoom"
              >
                {Math.round(scale * 80)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                className="p-1 rounded-lg hover:bg-slate-700 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Action Buttons */}
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer active:scale-95 shadow-xs"
              title="Download original PDF"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Download</span>
            </button>

            <button
              type="button"
              onClick={handleOpenNewWindow}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer active:scale-95 shadow-xs"
              title="Open PDF in new browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              <span>New Window</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer ml-1"
              title="Close Viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer Content Body */}
        <div 
          ref={containerRef}
          className="flex-1 bg-slate-950/95 overflow-y-auto p-4 sm:p-6 flex flex-col items-center gap-6"
        >
          {/* Loading State */}
          {isLoading && (
            <div className="my-auto py-20 flex flex-col items-center justify-center text-slate-400 gap-3 font-mono">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-sm">Rendering PDF document...</span>
            </div>
          )}

          {/* Error Fallback */}
          {errorMessage && !isLoading && (
            <div className="my-auto max-w-md p-6 bg-slate-900 border border-rose-500/30 rounded-2xl text-center font-mono">
              <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white mb-1">Preview Notice</h4>
              <p className="text-xs text-slate-400 mb-4">{errorMessage}</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewWindow}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Tab</span>
                </button>
              </div>
            </div>
          )}

          {/* Rendered PDF Pages */}
          {!isLoading && !errorMessage && numPages > 0 && (
            <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div 
                  key={pageNum}
                  className="flex flex-col items-center gap-2 w-full animate-in fade-in duration-200"
                >
                  <div className="flex items-center justify-between w-full max-w-3xl px-2 text-[10px] font-mono text-slate-400">
                    <span>Page {pageNum} of {numPages}</span>
                    <span>{title}</span>
                  </div>
                  <div className="p-1 sm:p-2 bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden flex items-center justify-center">
                    <canvas
                      ref={(el) => {
                        if (el) {
                          canvasRefs.current.set(pageNum, el);
                        } else {
                          canvasRefs.current.delete(pageNum);
                        }
                      }}
                      className="block max-w-full h-auto bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Viewer Footer Status Bar */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-center justify-between shrink-0">
          <span>Industrial EPP Document Engine • Native Canvas Renderer</span>
          <span>Original High-Resolution Output</span>
        </div>

      </div>
    </div>
  );
}
