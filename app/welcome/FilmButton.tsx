"use client";
import { useRef } from "react";

// Secondary hero action: opens the 14-second product film (rendered from marketing/film with HyperFrames' format).
export default function FilmButton() {
  const dlg = useRef<HTMLDialogElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const open = () => { dlg.current?.showModal(); vid.current?.play().catch(() => {}); };
  const close = () => { vid.current?.pause(); dlg.current?.close(); };
  return (
    <>
      <button type="button" className="lp-ghost lp-pill-lg lp-film-btn" onClick={open}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7.5-4.5z" fill="currentColor" /></svg>Watch the film · 14 s
      </button>
      <dialog ref={dlg} className="lp-film" onClick={(e) => { if (e.target === dlg.current) close(); }} onClose={() => vid.current?.pause()}>
        <video ref={vid} src="/film/feldbuch-film.mp4" poster="/film/feldbuch-film-poster.jpg" controls playsInline muted preload="none" width={1920} height={1080}>
          A 14-second film: four site visit reports are read and turned into a priced invoice.
        </video>
        <button type="button" className="lp-film-close" onClick={close} aria-label="Close film">×</button>
      </dialog>
    </>
  );
}
