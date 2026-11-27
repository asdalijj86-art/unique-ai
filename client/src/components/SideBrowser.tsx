/**
 * Uniqa's own side browser (user order 2026-11-28, voice).
 *
 * A small browser docked to the side of the front: address bar,
 * back/forward, a Google-style search box, reload, close. It opens
 * when he tells Uniqa to open a site or search something («یوٹیوب
 * کھولو», «گوگل پر موسم تلاش کرو»), and from the front's براؤزر
 * pill. It never covers the face or the chat — it docks on the right
 * edge, over the globe column only, and closes with one tap.
 *
 * HONESTY (non-negotiable):
 * - Search results are REAL: Wikipedia's public OpenSearch API
 *   (lib/wiki-search — the same live search the agent work screen
 *   uses). No internet → the honest "no connection" message, never
 *   an invented result.
 * - Big sites (YouTube, Facebook, Instagram, TikTok, Google, …)
 *   refuse to render inside another page (X-Frame-Options / CSP).
 *   For those the panel shows the honest blocked message + a
 *   one-tap «نئے ٹیب میں کھولو» button (a real user gesture, so the
 *   tab opens) — never a fake page, never a claim it opened inside.
 * - Any other page that will not load inside within 10 seconds gets
 *   the same escape: a strip with the new-tab button. The toolbar
 *   always carries the new-tab button too.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isBlockedEmbedUrl,
  normalizeBrowserUrl,
  QUICK_SITES,
  type BrowserRequest,
} from '../lib/browser-intent';
import { searchWiki, type WikiResult } from '../lib/wiki-search';

type BrowserView =
  | { kind: 'home' }
  | { kind: 'site'; url: string; displayName: string }
  | { kind: 'search'; query: string }
  | { kind: 'blocked'; url: string; displayName: string };

function requestToView(req: BrowserRequest): BrowserView {
  if (req.searchQuery !== undefined) {
    const q = req.searchQuery.trim();
    return q ? { kind: 'search', query: q } : { kind: 'home' };
  }
  if (req.url) {
    return isBlockedEmbedUrl(req.url)
      ? { kind: 'blocked', url: req.url, displayName: req.displayName }
      : { kind: 'site', url: req.url, displayName: req.displayName };
  }
  return { kind: 'home' };
}

function viewTitle(view: BrowserView): string {
  switch (view.kind) {
    case 'home':
      return '🌐 براؤزر';
    case 'site':
      return view.displayName;
    case 'search':
      return `تلاش: ${view.query}`;
    case 'blocked':
      return view.displayName;
  }
}

function openInNewTab(url: string) {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* popup blocked without a gesture — the button IS the gesture,
       so this is only a safety net. */
  }
}

export function SideBrowser({
  request,
  signal,
  onClose,
}: {
  request: BrowserRequest;
  /** Increments on every new command, so a fresh request re-opens
   *  the panel on it even while it is already open. */
  signal: number;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<BrowserView[]>(() => [requestToView(request)]);
  const [hi, setHi] = useState(0);
  const view = history[hi] ?? { kind: 'home' };
  const [address, setAddress] = useState('');
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<WikiResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameSlow, setFrameSlow] = useState(false);
  const frameLoadedRef = useRef(false);
  const searchSeqRef = useRef(0);

  // A fresh command (new signal) navigates the open panel to it.
  const firstSignalRef = useRef(signal);
  useEffect(() => {
    if (signal === firstSignalRef.current) return;
    firstSignalRef.current = signal;
    const next = requestToView(request);
    setHistory((h) => [...h.slice(0, hi + 1), next]);
    setHi((i) => i + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  // Keep the address bar in step with the current view.
  useEffect(() => {
    setAddress(view.kind === 'site' || view.kind === 'blocked' ? view.url : '');
    if (view.kind === 'search') setSearchText(view.query);
  }, [view]);

  // A framed page that has not fired onLoad within 10s is either
  // blocked by the site or unreachable — offer the new-tab escape
  // instead of leaving a blank frame.
  useEffect(() => {
    if (view.kind !== 'site') return;
    frameLoadedRef.current = false;
    setFrameLoaded(false);
    setFrameSlow(false);
    const timer = setTimeout(() => {
      if (!frameLoadedRef.current) setFrameSlow(true);
    }, 10000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const navigate = useCallback(
    (next: BrowserView) => {
      setHistory((h) => [...h.slice(0, hi + 1), next]);
      setHi((i) => i + 1);
    },
    [hi],
  );

  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) return;
    const seq = ++searchSeqRef.current;
    setSearching(true);
    setSearchError('');
    setSearchedQuery(query);
    try {
      const out = await searchWiki(query);
      if (searchSeqRef.current !== seq) return;
      setResults(out);
    } catch {
      if (searchSeqRef.current !== seq) return;
      setResults([]);
      setSearchError('تلاش نہیں ہو سکی — انٹرنیٹ چیک کریں اور دوبارہ کوشش کریں۔');
    } finally {
      if (searchSeqRef.current === seq) setSearching(false);
    }
  }, []);

  // A search view searches itself the moment it opens.
  useEffect(() => {
    if (view.kind === 'search' && view.query) void runSearch(view.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const goAddress = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const url = normalizeBrowserUrl(trimmed);
    if (url) {
      navigate(
        isBlockedEmbedUrl(url)
          ? { kind: 'blocked', url, displayName: url }
          : { kind: 'site', url, displayName: url },
      );
    } else {
      navigate({ kind: 'search', query: trimmed });
    }
  };

  const openResult = (url: string, title: string) => {
    navigate(
      isBlockedEmbedUrl(url)
        ? { kind: 'blocked', url, displayName: title }
        : { kind: 'site', url, displayName: title },
    );
  };

  const currentUrl =
    view.kind === 'site' || view.kind === 'blocked' ? view.url : '';
  const googleUrl = (q: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(q.trim())}`;

  return (
    <div
      className="uside-browser"
      data-testid="side-browser"
      role="dialog"
      aria-label="یونیکا کا براؤزر"
      dir="rtl"
    >
      <div className="uside-browser-head">
        <span className="uside-browser-title" dir="auto">
          {viewTitle(view)}
        </span>
        <button
          type="button"
          className="uside-browser-close"
          onClick={onClose}
          aria-label="براؤزر بند کریں"
          data-testid="button-close-side-browser"
        >
          ✕
        </button>
      </div>

      <div className="uside-browser-bar">
        <button
          type="button"
          className="uside-browser-nav"
          disabled={hi <= 0}
          onClick={() => setHi((i) => Math.max(0, i - 1))}
          aria-label="پیچھے"
          data-testid="button-side-browser-back"
        >
          ›
        </button>
        <button
          type="button"
          className="uside-browser-nav"
          disabled={hi >= history.length - 1}
          onClick={() => setHi((i) => Math.min(history.length - 1, i + 1))}
          aria-label="آگے"
          data-testid="button-side-browser-forward"
        >
          ‹
        </button>
        <button
          type="button"
          className="uside-browser-nav"
          onClick={() => navigate({ kind: 'home' })}
          aria-label="ہوم"
          data-testid="button-side-browser-home"
        >
          ⌂
        </button>
        <form
          className="uside-browser-address-form"
          onSubmit={(e) => {
            e.preventDefault();
            goAddress(address);
          }}
        >
          <input
            type="text"
            className="uside-browser-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="پتہ یا تلاش لکھیں…"
            aria-label="پتہ یا تلاش"
            data-testid="input-side-browser-address"
            dir="ltr"
          />
        </form>
        {currentUrl && (
          <button
            type="button"
            className="uside-browser-tab"
            onClick={() => openInNewTab(currentUrl)}
            data-testid="button-side-browser-open-tab"
            title="نئے ٹیب میں کھولیں"
          >
            ↗ نیا ٹیب
          </button>
        )}
      </div>

      <div className="uside-browser-body">
        {view.kind === 'home' && (
          <div className="uside-browser-home">
            <p className="uside-browser-intro">
              یونیکا کا اپنا براؤزر — تلاش کریں یا کوئی سائٹ کھولیں۔
            </p>
            <form
              className="uside-browser-search"
              onSubmit={(e) => {
                e.preventDefault();
                if (searchText.trim()) navigate({ kind: 'search', query: searchText.trim() });
              }}
            >
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="گوگل کی طرح تلاش کریں…"
                aria-label="تلاش کریں"
                data-testid="input-side-browser-search"
              />
              <button type="submit" disabled={searching} data-testid="button-side-browser-search">
                {searching ? 'تلاش ہو رہی ہے…' : '🔎 تلاش'}
              </button>
            </form>
            <div className="uside-browser-chips">
              {QUICK_SITES.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  className="uside-browser-chip"
                  data-testid={`button-side-browser-site-${s.displayName}`}
                  onClick={() =>
                    navigate(
                      isBlockedEmbedUrl(s.url)
                        ? { kind: 'blocked', url: s.url, displayName: s.displayName }
                        : { kind: 'site', url: s.url, displayName: s.displayName },
                    )
                  }
                >
                  {s.displayName}
                </button>
              ))}
            </div>
            <p className="uside-browser-note">
              بڑی سائٹیں (یوٹیوب، فیس بک، انسٹاگرام، ٹک ٹاک) اپنے اندر کھلنے
              نہیں دیتیں — ان کے لیے «نئے ٹیب میں کھولیں» کا بٹن ملے گا۔
            </p>
          </div>
        )}

        {view.kind === 'search' && (
          <div className="uside-browser-results-wrap">
            <form
              className="uside-browser-search"
              onSubmit={(e) => {
                e.preventDefault();
                if (searchText.trim()) navigate({ kind: 'search', query: searchText.trim() });
              }}
            >
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="گوگل کی طرح تلاش کریں…"
                aria-label="تلاش کریں"
                data-testid="input-side-browser-search"
              />
              <button type="submit" disabled={searching} data-testid="button-side-browser-search">
                {searching ? 'تلاش ہو رہی ہے…' : '🔎 تلاش'}
              </button>
              <button
                type="button"
                className="uside-browser-google"
                onClick={() => openInNewTab(googleUrl(searchText.trim() || view.query))}
                data-testid="button-side-browser-google"
              >
                Google میں کھولیں
              </button>
            </form>
            {searchError ? (
              <p className="uside-browser-empty">{searchError}</p>
            ) : searching ? (
              <p className="uside-browser-empty">تلاش ہو رہی ہے…</p>
            ) : searchedQuery ? (
              results.length === 0 ? (
                <p className="uside-browser-empty">
                  «{searchedQuery}» کے لیے کوئی نتیجہ نہیں ملا — کچھ اور لکھ کر
                  دیکھیں، یا Google میں کھولیں۔
                </p>
              ) : (
                <ul className="uside-browser-results" data-testid="side-browser-results">
                  {results.map((r) => (
                    <li key={r.url} className="uside-browser-result">
                      <button
                        type="button"
                        className="uside-browser-result-title"
                        onClick={() => openResult(r.url, r.title)}
                        dir="auto"
                      >
                        {r.title}
                      </button>
                      {r.desc ? (
                        <span className="uside-browser-result-desc">{r.desc}</span>
                      ) : null}
                      <span className="uside-browser-result-src">Wikipedia سے — لائیو</span>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>
        )}

        {view.kind === 'blocked' && (
          <div className="uside-browser-blocked" data-testid="side-browser-blocked">
            <p className="uside-browser-blocked-title">یہ سائٹ اپنے اندر کھلنے نہیں دیتی</p>
            <p className="uside-browser-blocked-text" dir="auto">
              {view.displayName} ({view.url}) نے اپنے صفحے کو کسی اور سائٹ کے
              اندر کھلنے سے منع کیا ہوا ہے — یہ اس سائٹ کا اپنا اصول ہے،
              یونیکا اسے بدل نہیں سکتی۔
            </p>
            <button
              type="button"
              className="uside-browser-open-tab"
              onClick={() => openInNewTab(view.url)}
              data-testid="button-side-browser-open-tab-blocked"
            >
              ↗ نئے ٹیب میں کھولیں
            </button>
            <button
              type="button"
              className="uside-browser-back-home"
              onClick={() => navigate({ kind: 'home' })}
            >
              واپس — براؤزر ہوم
            </button>
          </div>
        )}

        {view.kind === 'site' && (
          <div className="uside-browser-frame-wrap">
            {frameSlow && !frameLoaded && (
              <p className="uside-browser-slow" data-testid="side-browser-slow">
                یہ صفحہ اندر کھلنے میں دیر کر رہا ہے — ہو سکتا ہے اس سائٹ نے
                اندر کھلنے سے منع کیا ہو۔{' '}
                <button type="button" onClick={() => openInNewTab(view.url)}>
                  نئے ٹیب میں کھولیں
                </button>
              </p>
            )}
            <iframe
              key={view.url}
              className="uside-browser-frame"
              src={view.url}
              title={view.displayName}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              referrerPolicy="no-referrer"
              onLoad={() => {
                frameLoadedRef.current = true;
                setFrameLoaded(true);
              }}
              data-testid="side-browser-frame"
            />
          </div>
        )}
      </div>
    </div>
  );
}
