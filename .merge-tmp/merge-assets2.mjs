// 补全 data/assets.json：fork 的 7 名联动干员的 chars / 技能图标 / 技能 sfx 条目 + 统计数字。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const IDS = ['char_456_ash', 'char_1029_yato2', 'char_1048_orchd2', 'char_4123_ela', 'char_4141_marcil', 'char_4182_oblvns', 'char_4217_makoto'];

const cur = JSON.parse(readFileSync('data/assets.json', 'utf8'));
const fork = JSON.parse(execFileSync('git', ['show', 'HEAD:data/assets.json'], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }));
const backups = JSON.parse(readFileSync('data/backups.json', 'utf8'));

const added = { chars: [], skills: [], skillsById: [], sfx: [], modules: [] };
const put = (obj, key, val, bucket) => { if (val !== undefined && obj[key] === undefined) { obj[key] = val; added[bucket].push(key); } };

for (const id of IDS) {
  put(cur.chars, id, fork.chars?.[id], 'chars');
  // 技能图标：该干员各形态的 skillId / iconId
  const forms = backups.units?.[id]?.forms || {};
  for (const f of Object.values(forms)) {
    for (const s of f.skills || []) {
      const icon = s.iconId || fork.skillsById?.[s.skillId];
      if (icon && fork.skills?.[icon]) put(cur.skills, icon, fork.skills[icon], 'skills');
      if (s.skillId) put(cur.skillsById, s.skillId, fork.skillsById?.[s.skillId] || icon, 'skillsById');
    }
  }
  put(cur.audio?.sfx?.units || {}, id, fork.audio?.sfx?.units?.[id], 'sfx');
  for (const [key, bucket] of [['voice', 'voice'], ['voiceJp', 'voiceJp']]) {
    if (!cur.audio[key]) cur.audio[key] = {};
    const v = fork.audio?.[key]?.[id];
    if (v && cur.audio[key][id] === undefined) { cur.audio[key][id] = v; (added[bucket] = added[bucket] || []).push(id); }
  }
}

// 模组类型图标：fork 清单里有而我们缺的（联动干员的模组类型）
for (const [type, file] of Object.entries(fork.modules || {})) put(cur.modules, type, file, 'modules');

// 统计数字（测试会核对好几个）
cur.stats.chars = Object.keys(cur.chars).length;
cur.stats.charsWithBack = Object.values(cur.chars).filter((c) => c && c.spine?.back).length;
cur.stats.skills = Object.keys(cur.skills).length;
cur.stats.sfxUnits = Object.keys(cur.audio.sfx.units || {}).length;
cur.stats.voiceChars = Object.keys(cur.audio.voice || {}).length;
cur.stats.voiceJpChars = Object.keys(cur.audio.voiceJp || {}).length;
cur.stats.modules = Object.keys(cur.modules).length;
cur.stats.ui = Object.keys(cur.ui).length;
cur.stats.enemies = Object.keys(cur.enemies).length;
cur.stats.tokens = Object.keys(cur.tokens).length;

writeFileSync('data/assets.json', JSON.stringify(cur));
console.log('added:', JSON.stringify(added));
console.log('stats:', JSON.stringify(cur.stats));
