/**
 * SilhouetteAvatar — Uniqa's new front avatar (user order 2026-11-28,
 * from his Stonic screenshot 1000051843_0_eumi.jpg).
 *
 * The face is OUR OWN generated mist image
 * (client/public/silhouette-mist.webp): a faint, luminous teal
 * silhouette — head + shoulders dissolving into soft smoke, long
 * flowing hair, FACELESS (no eyes, no mouth, no features). NEVER
 * Stonic's assets (closed code), never a fetched image. The image was
 * generated from a text description of the look, then cropped to the
 * head + shoulders + long falls, and converted so its black
 * background becomes transparency (luminance -> alpha) — it
 * composites straight onto the dark panel, no box, no blend hack.
 *
 * Why an image, not SVG: seven SVG versions (blob, locks, mist, lit
 * face, ellipse sculpture, vertical falls) were all judged by the user
 * as not matching — vector blobs cannot render the fine flowing hair
 * strands of the reference. The generated mist image renders them
 * naturally. (User order 2026-11-28, after his third rejection:
 * "pehle is ghalti ko sudharo" — fix the mistake first, then he
 * tests. So this version is fixed FIRST and verified against the
 * reference with my own eyes before he is asked to test it.)
 *
 * She MOVES, gently and continuously (pure CSS animation, see .usil-*
 * in index.css): slow breathing glow (~7s) and one slow drift of the
 * whole mist (~11s). While she speaks the glow pulses a little faster.
 * prefers-reduced-motion stills her.
 */

export default function SilhouetteAvatar({
  isSpeaking,
  terminated,
}: {
  isSpeaking: boolean;
  terminated: boolean;
}) {
  return (
    <div
      className={`usil-figure${isSpeaking ? ' speaking' : ''}${terminated ? ' terminated' : ''}`}
      role="img"
      aria-label="یونیکا — ہلکی سی دھند جیسی سلیوٹ"
      data-testid="silhouette-avatar"
    >
      <div className="usil-halo" aria-hidden="true" />
      <div className="usil-breathe">
        <div className="usil-drift">
          <img src="/silhouette-mist.webp" className="usil-img" alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}
