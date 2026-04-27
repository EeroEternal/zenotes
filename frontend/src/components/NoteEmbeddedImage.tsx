import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";

export type NoteEmbeddedImageVariant = "card" | "dialog";

const thumbClass: Record<NoteEmbeddedImageVariant, string> = {
  card: "max-h-40 w-full max-w-full object-contain rounded-lg border border-border/40 bg-muted/15",
  dialog: "max-h-52 w-full max-w-full object-contain rounded-xl border border-border/40 bg-muted/15",
};

/**
 * 笔记内嵌图：列表/编辑里按容器缩小显示，点击图片或放大图标在灯箱中查看接近原图尺寸。
 */
export function NoteEmbeddedImage({
  src,
  alt,
  variant,
}: {
  src: string;
  alt: string;
  variant: NoteEmbeddedImageVariant;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox]);

  return (
    <>
      <figure className="group relative my-2 mx-auto w-full max-w-full">
        <button
          type="button"
          className="block w-full cursor-zoom-in text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          onClick={() => setLightbox(true)}
          aria-label="View larger image"
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className={`${thumbClass[variant]} pointer-events-none select-none`}
            draggable={false}
          />
        </button>
        <button
          type="button"
          title="View larger"
          aria-label="View larger"
          className="absolute right-1.5 top-1.5 rounded-lg bg-background/95 p-1.5 text-foreground shadow-md ring-1 ring-border/60 opacity-90 transition-opacity hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setLightbox(true);
          }}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </figure>

      {mounted &&
        lightbox &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Image preview"
            className="fixed inset-0 z-[500] flex items-center justify-center bg-black/88 p-3 backdrop-blur-sm"
            onClick={() => setLightbox(false)}
          >
            <button
              type="button"
              className="absolute right-3 top-3 z-[510] rounded-full bg-background/95 p-2 text-foreground shadow-lg ring-1 ring-border hover:bg-muted"
              aria-label="Close"
              onClick={() => setLightbox(false)}
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={src}
              alt={alt}
              className="max-h-[92vh] max-w-[92vw] object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
