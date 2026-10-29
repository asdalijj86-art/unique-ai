// Server-side routing for video orders (DENIAL FIX + CHAT-ONLY FLOW,
// 2026-10-29): classifyIntent must return media_tool/video_maker for
// a video order at ANY length, from any persona (classifyIntent
// takes no persona argument), and for a story prompt pasted in chat.
// Run: node scripts/test-video-maker-routing.mjs (from the repo root)
import { classifyIntent, isVideoMakerOrder } from '../server/brain.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra); }
};
const route = (msg) => {
  const c = classifyIntent(msg);
  return c.intent === 'media_tool' ? c.tool : c.intent;
};

const SCREENSHOT = 'ابھی جو کچھ کہ میں نے بھیجا ہے نا ٹھیک ہے یہ ویڈیو بنا کے دو مجھے';
check('server: screenshot order routes to video_maker', route(SCREENSHOT) === 'video_maker', JSON.stringify(classifyIntent(SCREENSHOT)));
check('server: screenshot order matcher agrees', isVideoMakerOrder(SCREENSHOT) === true);
check('server: short order routes', route('یہ ویڈیو بنا کے دو') === 'video_maker');
check('server: referential order routes', route('جو بھیجا ہے اس کی ویڈیو بناؤ') === 'video_maker');
check('server: roman order routes', route('video bana do') === 'video_maker');
check('server: story prompt pasted in chat routes', route('شاہ: یاد رکھو! اس جنگل میں میری اجازت کے بغیر کوئی فیصلہ نہیں ہوگا!\nزال: بادشاہ سلامت! آپ کی حکومت کا سورج اب ڈوبنے والا ہے!') === 'video_maker');
check('server: package order still goes to video_creator', route('ویڈیو کا پلان بتاؤ') === 'video_creator');
check('server: upload order still goes to video_upload', route('ویڈیو اپلوڈ کرو') === 'video_upload');
check('server: long conversational message stays chat', route('مجھے بتاؤ کہ ویڈیو بنانے کا کام کیسے ہوتا ہے اور اس میں کیا کیا چیزیں ہوتی ہیں اور لوگ اسے کیوں پسند کرتے ہیں') === 'chat');
check('server: ordinary chat stays chat', route('آج موسم کیسا ہے') !== 'video_maker');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
