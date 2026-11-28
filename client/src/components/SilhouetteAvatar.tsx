/**
 * SilhouetteAvatar — Uniqa's new front avatar (user order 2026-11-28,
 * from his Stonic screenshot 1000051843_0_eumi.jpg).
 *
 * The face is an image (client/public/silhouette-mist.webp): a
 * faint, luminous teal silhouette — head + shoulders dissolving
 * into soft smoke, long flowing hair, FACELESS (no eyes, no mouth,
 * no features). v8–v10 were generated from a text description of
 * the look; v11 (below) is a crop of the figure from the user's own
 * screenshot, by his explicit order. In every version the image is
 * cropped to the head + shoulders and converted so its dark
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
 * v11 (2026-11-28): the user said v10 was "somewhat better" and
 * ordered, twice over, the EXACT thing copied from his screenshot
 * and pasted here ("bilkul same wahi cheez idhar se copy karo udhar
 * laga do"). So this version IS his own screenshot's figure: the
 * figure alone is cropped out of his clearer close-up reference
 * (1000051941_0_z0h0.jpg) — no UI chrome, no text, no pills — and
 * its dark background is converted to transparency (luminance ->
 * alpha, with a black-point so the photo's dark panel stays fully
 * transparent and no box shows). The crop is tight on the figure so
 * it fills the panel like the reference, with a small transparent
 * margin so the drift never clips the hair wisps. A gentle gamma
 * lift (0.72) restores the reference's luminous read — the plain
 * crop rendered too faint, a linear brighten blew the highlights
 * out white — so the mid-tones rise while the bright wave edges
 * stay soft. The image URL carries "?v=11" so his browser must
 * fetch the new image, never a stale cached one.
 *
 * v12 (2026-11-28): the user approved v11's shape exactly
 * ("bilkul bilkul bilkul theek bana hai") and asked only that the
 * FACE show a little clearer, like in the screenshot. So the face
 * oval alone gets a gentle lift toward white (18%, soft feathered
 * ellipse over the detected face centre, rim untouched) — the face
 * now reads as a soft oval instead of a dark hole, while the shape
 * stays pixel-exact. The image URL carries "?v=12" so his browser
 * must fetch the new image, never a stale cached one. The figure
 * height stays 230px (the 768px page is not scrollable; the date
 * bar is verified back in place).
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
          <img src="/silhouette-mist.webp?v=12" className="usil-img" alt="" draggable={false} />
        </div>
      </div>
    </div>
  );
}
