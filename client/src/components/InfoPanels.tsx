/**
 * InfoPanels — the four new information panels (Phase 2):
 *  - PlansPanel: Stonic's tiers as DISPLAY ONLY (no payment here).
 *  - HelpPanel: real FAQ answers from the app's own behaviour.
 *  - ChangelogPanel: the real change history (lib/changelog).
 *  - BuildGuidePanel: "build your own" — how this app really works.
 *
 * Each renders inside a NodeDialog from chat.tsx (infoPanel state).
 * Every line is real; nothing is invented, nothing is a dead button.
 */

import { BUILD_GUIDE_SECTIONS } from '@/lib/build-guide';
import { CHANGELOG } from '@/lib/changelog';
import { HELP_FAQ } from '@/lib/help';
import { PLAN_TIERS, PLANS_NOTE, usageSummaryLine, type UsageSummaryInput } from '@/lib/plans';

export function PlansPanel({ usage }: { usage: UsageSummaryInput }) {
  return (
    <div className="upanel" data-testid="panel-plans" dir="rtl">
      <p className="upanel-intro">{PLANS_NOTE}</p>
      <div className="uplan-list">
        {PLAN_TIERS.map((tier) => (
          <div key={tier.id} className="uplan-card" data-testid={`plan-card-${tier.id}`}>
            <div className="uplan-head">
              <span className="uplan-name">{tier.name}</span>
              <span className="uplan-price">{tier.price}</span>
            </div>
            <span className="uplan-tag">{tier.tag}</span>
            <ul className="uplan-points">
              {tier.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="upanel-section-title">📊 آپ کا استعمال (اسی ڈیوائس سے)</div>
      <p className="upanel-empty" data-testid="plans-usage">{usageSummaryLine(usage)}</p>
      <p className="upanel-empty">
        ادائیگی کا کوئی بٹن یہاں نہیں ہے — یہ صفحہ صرف معلومات کے لیے ہے۔ اگر کبھی Unique AI کو بیچنا ہو تو وہ الگ کام ہوگا۔
      </p>
    </div>
  );
}

export function HelpPanel() {
  return (
    <div className="upanel" data-testid="panel-help" dir="rtl">
      <p className="upanel-intro">
        مدد یہیں سے — عام سوالوں کے جواب۔ کوئی سپورٹ ڈیسک نہیں ہے؛ جواب اسی ایپ کے اصل رویے سے لکھے گئے ہیں۔
      </p>
      <div className="uhelp-list">
        {HELP_FAQ.map((f, i) => (
          <div key={i} className="uhelp-item" data-testid={`help-faq-${i}`}>
            <div className="uhelp-q">❓ {f.q}</div>
            <div className="uhelp-a">{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChangelogPanel() {
  return (
    <div className="upanel" data-testid="panel-changelog" dir="rtl">
      <p className="upanel-intro">
        Unique AI میں کیا کیا نیا آیا — ہر تبدیلی اصلی ہے، اسی پروجیکٹ کی تاریخ سے۔
      </p>
      <div className="uchlog-list">
        {CHANGELOG.map((entry) => (
          <div key={entry.id} className="uchlog-entry" data-testid={`changelog-entry-${entry.id}`}>
            <div className="uchlog-head">
              <span className="uchlog-title">{entry.title}</span>
              <span className="uchlog-date">{entry.date}</span>
            </div>
            <ul className="uchlog-notes">
              {entry.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BuildGuidePanel() {
  return (
    <div className="upanel" data-testid="panel-build-guide" dir="rtl">
      <p className="upanel-intro">
        اپنا AI خود بنائیں — یہ گائیڈ بتاتا ہے کہ Unique AI اندر سے کیسے کام کرتا ہے، اور آپ اپنا کردار یا مہارت خود کیسے بنا سکتے ہیں۔ سب کچھ اصلی ہے — کوئی بناوٹی قدم نہیں۔
      </p>
      <div className="uguide-list">
        {BUILD_GUIDE_SECTIONS.map((s) => (
          <div key={s.id} className="uguide-section" data-testid={`guide-section-${s.id}`}>
            <div className="upanel-section-title">{s.title}</div>
            <ul className="uguide-lines">
              {s.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
