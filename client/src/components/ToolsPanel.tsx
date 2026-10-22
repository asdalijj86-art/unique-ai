/**
 * ToolsPanel — grid of ALL Unique AI tools with Urdu titles.
 * Media tools open their UI via onSelect(tool).
 * Brain tools (chat-based) insert an example query via onBrainTool(example).
 */
import type { MediaToolName } from './MediaTools';
import { TOOL_TITLES } from './MediaTools';

// All image features live inside the single 'image_tools' hub and all
// video features inside 'video_tools' (user decision 2026-10-22).
const MEDIA_TOOL_ORDER: MediaToolName[] = [
  'quran',
  'whatsapp_send',
  'phone_lookup',
  'image_tools',
  'pdf',
  'audio_to_text',
  'email',
  'video_tools',
  'password_gen',
  'emi_calc',
  'resume_builder',
  'invoice_gen',
  'assignment_maker',
];

// Brain tools — triggered via chat. Clicking inserts an example query.
const BRAIN_TOOLS: { id: string; icon: string; title: string; example: string }[] = [
  { id: 'calculator', icon: '🧮', title: 'کیلکولیٹر', example: '25 * 4 + 10 حساب کرو' },
  { id: 'weather', icon: '🌤️', title: 'موسم', example: 'لاہور کا موسم بتاؤ' },
  { id: 'currency', icon: '💱', title: 'کرنسی کنورٹر', example: '100 ڈالر کتنے روپے بنتے ہیں؟' },
  { id: 'unit_convert', icon: '📏', title: 'یونٹ کنورٹر', example: '5 کلو گرام کتنے پاؤنڈ ہوتے ہیں؟' },
  { id: 'translate', icon: '🌐', title: 'ترجمہ', example: 'Hello کا اردو ترجمہ بتاؤ' },
  { id: 'news', icon: '📰', title: 'خبریں', example: 'آج کی اہم خبریں بتاؤ' },
  { id: 'youtube_search', icon: '🎬', title: 'یوٹیوب تلاش', example: 'یوٹیوب پر نعت تلاش کرو' },
  { id: 'youtube_trending', icon: '🔥', title: 'ٹرینڈنگ ویڈیوز', example: 'آج کی ٹرینڈنگ ویڈیوز دکھاؤ' },
  { id: 'web_search', icon: '🔍', title: 'ویب تلاش', example: 'پاکستان کی آبادی کتنی ہے؟' },
  { id: 'read_webpage', icon: '📖', title: 'ویب پیج پڑھو', example: 'یہ لنک پڑھ کر سناؤ: ' },
  { id: 'world_clock', icon: '🕐', title: 'دنیا بھر کا وقت', example: 'دبئی میں ابھی کیا وقت ہے؟' },
  { id: 'prayer_times', icon: '🕌', title: 'نماز کے اوقات', example: 'آج لاہور میں نماز کے اوقات بتاؤ' },
  { id: 'timer', icon: '⏲️', title: 'ٹائمر', example: '5 منٹ کا ٹائمر لگاؤ' },
  { id: 'qr_code', icon: '📱', title: 'QR کوڈ بنائیں', example: 'میرے نمبر کا QR کوڈ بناؤ' },
  { id: 'android_app', icon: '🤖', title: 'ایپ تجویز', example: 'اچھی قرآن ایپ بتاؤ' },
  { id: 'study', icon: '📚', title: 'پڑھائی مدد', example: 'فوٹو سنتھیسز کیا ہے؟ آسان الفاظ میں سمجھاؤ' },
  // تصویر تلاش moved into the 🖼️ تصویر ٹولز hub as its image_search section.
];

export default function ToolsPanel({ onSelect, onBrainTool }: {
  onSelect: (tool: MediaToolName) => void;
  onBrainTool: (example: string) => void;
}) {
  const toolButtonStyle = {
    background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.22)',
    borderRadius: 14, padding: '14px 10px', cursor: 'pointer', color: '#e9d5ff',
    fontSize: 14, fontWeight: 600, lineHeight: 1.7,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    transition: 'transform 0.15s, background 0.15s',
  } as const;
  return (
    <div dir="rtl" className="tools-panel">
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#e9d5ff' }}>🧰 ٹولز ({MEDIA_TOOL_ORDER.length + BRAIN_TOOLS.length})</div>
        <div className="tool-small-note">کوئی ٹول چنیں</div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 10, maxHeight: 440, overflowY: 'auto', paddingLeft: 4,
      }}>
        {MEDIA_TOOL_ORDER.map((tool) => (
          <button
            key={tool}
            type="button"
            onClick={() => onSelect(tool)}
            style={toolButtonStyle}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.16)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.07)'; }}
          >
            <span style={{ fontSize: 26 }}>{TOOL_TITLES[tool].split(' ')[0]}</span>
            <span>{TOOL_TITLES[tool].split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
        {BRAIN_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onBrainTool(tool.example)}
            style={toolButtonStyle}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.16)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.07)'; }}
            title="چیٹ میں استعمال کریں"
          >
            <span style={{ fontSize: 26 }}>{tool.icon}</span>
            <span>{tool.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
