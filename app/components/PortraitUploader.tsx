import { useState, useRef, useEffect } from "react";

export function PortraitUploader({ currentUrl, fallbackName, onUpload, onUrlChange }: { currentUrl: string | undefined; fallbackName: string; onUpload: (file: File) => Promise<void>; onUrlChange: (url: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const initials = fallbackName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";

  const toggle = () => setIsOpen(v => !v);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        await onUpload(file);
      } finally {
        setUploading(false);
        setIsOpen(false);
      }
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onUrlChange(urlInput.trim());
      setUrlInput("");
      setIsOpen(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);


  return (
    <>
      <button
        ref={triggerRef}
        className={`portrait-trigger ${currentUrl ? "has-image" : ""}`}
        onClick={toggle}
        type="button"
        style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', height: '100%', display: 'block', overflow: 'hidden', borderRadius: 'inherit' }}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt={`Retrato de ${fallbackName}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>{initials}</span>
        )}
      </button>

      {isOpen && (
        <div ref={popoverRef} className="portrait-popover" style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#1c1c1c', border: '1px solid #333', padding: '12px', borderRadius: '8px', width: '250px', marginTop: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ cursor: uploading ? 'not-allowed' : 'pointer', background: '#333', padding: '8px', borderRadius: '4px', textAlign: 'center', fontSize: '12px', color: '#fff', display: 'block' }}>
              {uploading ? "Enviando..." : "Fazer Upload de Imagem"}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} disabled={uploading} onChange={handleUpload} />
            </label>
            <div style={{ textAlign: 'center', fontSize: '12px', color: '#888' }}>ou colar link</div>
            <form onSubmit={handleUrlSubmit} style={{ display: 'flex', gap: '4px' }}>
              <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="URL da imagem" style={{ flex: 1, padding: '4px 8px', fontSize: '12px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '4px' }} />
              <button type="submit" style={{ padding: '4px 8px', fontSize: '12px', background: '#444', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>OK</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
