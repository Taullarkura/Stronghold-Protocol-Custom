// 打印上游 game.js 里结算语音相关的段落。
import { execFileSync } from 'node:child_process';
const src = execFileSync('git', ['show', 'upstream/master:public/js/screens/game.js'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const lines = src.split('\n');
for (const key of ['resultSpeaker', 'resultVoiceSlot', 'audio.voice(']) {
  const at = lines.findIndex((l) => l.includes(key));
  console.log(`\n===== ${key} @ ${at + 1} =====`);
  if (at < 0) continue;
  for (let i = Math.max(0, at - 16); i < Math.min(lines.length, at + 12); i++) console.log(`${i + 1}: ${lines[i]}`);
}
