import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UPDATE_NOTICE_CONTENT, UPDATE_NOTICE_ID, hasSeenUpdateNotice, rememberUpdateNotice,
} from '../../public/js/screens/title.js';

test('update notice shows once per notice id and can be reopened from its title-screen entry', () => {
  assert.equal(hasSeenUpdateNotice([]), false);
  const seen = rememberUpdateNotice([]);
  assert.deepEqual(seen, [UPDATE_NOTICE_ID]);
  assert.equal(hasSeenUpdateNotice(seen), true);
  assert.deepEqual(UPDATE_NOTICE_CONTENT, [
    {
      title: '阿戈尔',
      items: [
        '新干员「克莱门莎」加入(VI阶,阿戈尔/坚守/不屈)',
        '干员「乌尔比安」特质变更',
      ],
    },
    {
      title: '叙拉古',
      items: [
        '移除干员「缄默德克萨斯」,变为自选干员',
        '干员「安洁莉娜」等阶V => IV,特质变更',
        '新干员「予愿安洁莉娜」加入(V阶,叙拉古)',
      ],
    },
    {
      title: '谢拉格',
      items: [
        '干员「银灰」「灵知」「凛御银灰」特质变更',
        '策略「休露丝」效果变更',
      ],
    },
    {
      title: '拉特兰',
      items: [
        '移除干员「莫斯提玛」「塑心」,变为自选干员',
        '新干员「结成理」(V阶,拉特兰/不屈)「维伊」(IV阶,拉特兰/奥术)加入',
        '「拉特兰」盟约效果变更：任意【拉特兰】干员每消耗1发弹药，全体【拉特兰】干员攻击力+3%，至多+150%',
      ],
      detail: '<在场6名不同【拉特兰】干员>【拉特兰】干员开启技能时获得的弹药量+(5+1.5×层数)%（会取整），对未携带弹药类技能的拉特兰干员，改为攻速+(10+0.7x层数)(向下取整)',
    },
    {
      title: '萨尔贡',
      items: [
        '移除干员「卡涅利安」,变为自选干员',
        '新干员「真言」(V阶,萨尔贡/迅捷)加入',
        '干员「佩佩」等阶VI => V',
      ],
    },
  ]);
});

test('update notice keeps prior ids and treats invalid values as unseen', () => {
  assert.deepEqual(rememberUpdateNotice(['previous-notice']), ['previous-notice', UPDATE_NOTICE_ID]);
  assert.equal(hasSeenUpdateNotice(null), false);
  assert.deepEqual(rememberUpdateNotice(null), [UPDATE_NOTICE_ID]);
});
