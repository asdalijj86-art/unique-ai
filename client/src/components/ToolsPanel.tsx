/**
 * ToolsPanel — grid of all Unique AI tools with Urdu titles.
 * Clicking a tool opens it via onSelect(tool).
 */
import type { MediaToolName } from './MediaTools';
import { TOOL_TITLES } from './MediaTools';

const TOOL_ORDER: MediaToolName[] = [
  'quran',
  'whatsapp_send',
  'phone_lookup',
  'background_remover',
  'ocr',
  'upscaler',
  'resize',
  'image_compress',
  'pdf',
  'audio_to_text',
  'email',
  'video_upload',
  'video_creator',
  'password_gen',
  'emi_calc',
  'resume_builder',
  'invoice_gen',
];

export default function ToolsPanel({ onSelect }: { onSelect: (tool: MediaToolName) => void }) {
  return (
    <div dir="rtl" className="tools-panel">
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#e9d5ff' }}>🧰 ٹولز</div>
        <div className="tool-small-note">کوئی ٹول چنیں</div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10, maxHeight: 440, overflowY: 'auto', paddingLeft: 4,
      }}>
        {TOOL_ORDER.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onSelect(tool)}
            style={{
              background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.22)',
              borderRadius: 14, padding: '14px 10px', cursor: 'pointer', color: '#e9d5ff',
              fontSize: 14, fontWeight: 600, lineHeight: 1.7,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              transition: 'transform 0.15s, background 0.15s',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.16)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.07)'; }}
          >
            <span style={{ fontSize: 26 }}>{TOOL_TITLES[tool].split(' ')[0]}</span>
            <span>{TOOL_TITLES[tool].split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
