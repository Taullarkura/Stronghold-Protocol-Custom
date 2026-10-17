// The title card's connection row in Chrome: ● state text · ping, then 玩法说明 · ⚙ · ⛶.
//
//   SP_E2E=1 [CHROME_PATH=…] node --test test/ui/title-conn.e2e.test.js
//
// The row carries no 资源管理 button: the title screen's one resource entry is 下载完整素材 under the login box, which
// opens the same dialog 资源管理 opens from the 大厅 and the 房间 (ui/assetDownload.js; test/client-static.test.js).
// #183's ⚙ still sits next to ⛶, and the row was measured because it stopped fitting the card: the state text broke
// onto two lines ("已连接服务/器") and ⚙ / ⛶ went out of square. Asserted on a 1080p desktop (mouse) and a landscape
// phone (touch), for the usual state and the longest one (登录已失效，请重新登录):
//   * the state text stays on one line, ⚙ / ⛶ are .4rem squares, 玩法说明 keeps its padding, nothing overflows, and the
//     whole row stays on one line;
//   * touch: a tap on the centre of ⚙, ⛶ and 玩法说明 reaches that control (the 44 px hit areas).

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH
  || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  phone: { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true },
};

describe('title connection row', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  });
  after(async () => {
    await browser?.close();
    await srv?.close();
  });

  /** The row's geometry, in rem where it is a design size. */
  const measure = () => {
    const row = document.querySelector('.title-conn');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const q = (s) => row.querySelector(s);
    const text = q('.status-dot').nextElementSibling;
    const range = document.createRange();
    range.selectNodeContents(text);
    const mid = (el) => { const b = el.getBoundingClientRect(); return Math.round(b.top + b.height / 2); };
    const tools = ['.title-guide', '.title-settings', '.title-fs'].map(q).filter(Boolean);
    const sq = (el) => { const b = el.getBoundingClientRect(); return [+(b.width / rem).toFixed(3), +(b.height / rem).toFixed(3)]; };
    const pad = (b) => {
      const r = document.createRange();
      r.selectNodeContents(b);
      const c = r.getBoundingClientRect(), o = b.getBoundingClientRect();
      return +(Math.min(c.left - o.left, o.right - c.right) / rem).toFixed(3);
    };
    return {
      text: text.textContent,
      textLines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
      stateMid: mid(q('.status-dot')),
      toolMids: [...new Set(tools.map(mid))],
      gear: sq(q('.title-settings')),
      fs: sq(q('.title-fs')),
      textPads: ['.title-guide'].map(q).filter(Boolean).map(pad),
      overflow: row.scrollWidth - row.clientWidth,
      kids: [...row.children].map((k) => k.className),
      tools: tools.length,
    };
  };

  /** The control a tap on the centre of each of the row's tools reaches. */
  const tapTargets = () => ['.title-guide', '.title-settings', '.title-fs'].map((sel) => {
    const el = document.querySelector(`.title-conn ${sel}`);
    if (!el) return [sel, null];
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return [sel, !!hit && (hit === el || el.contains(hit))];
  });

  for (const [vp, viewport] of Object.entries(VIEWPORTS)) {
    test(`${vp}: one-line state, square ⚙ / ⛶, nothing squeezed`, async () => {
      const page = await browser.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      await page.emulate({ viewport, userAgent: await browser.userAgent() });
      await page.goto(`${base}/`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForSelector('.title-conn .title-fs', { timeout: 30000 });
      await sleep(400);
      // the phone's taps go through the touch screen's hit areas (a desktop may report a touch screen too: not asserted)
      if (vp === 'phone') assert.equal(await page.evaluate(() => document.documentElement.classList.contains('sp-coarse')), true);

      for (const state of ['usual', 'longest']) {
        if (state === 'longest') {
          await page.evaluate(async () => {
            const { store } = await import('/js/store.js');
            store.patch('connection', { status: 'closed', lastError: { code: 'LOGIN_REQUIRED', text: '登录已失效，请重新登录' } });
          });
          await page.waitForFunction(() => document.querySelector('.title-conn').textContent.includes('登录已失效'));
        }
        const m = await page.evaluate(measure);
        const at = `${vp} ${state}: ${JSON.stringify(m)}`;
        assert.equal(m.tools, 3, `玩法说明, ⚙ and ⛶ are the row's tools — ${at}`);
        assert.deepEqual(m.kids, ['title-conn__state', 'title-conn__tools'], at);
        assert.equal(m.textLines, 1, `the state text is one line — ${at}`);
        assert.deepEqual(m.gear, [0.4, 0.4], `⚙ is a .4rem square — ${at}`);
        assert.deepEqual(m.fs, [0.4, 0.4], `⛶ is a .4rem square — ${at}`);
        // .btn--sm pads .16rem (at least, a phone's minimums aside): 玩法说明 is never squeezed into it
        for (const p of m.textPads) assert.ok(p >= 0.15, `a text button keeps its padding (${p}rem) — ${at}`);
        assert.ok(m.overflow <= 0, `nothing overflows the row — ${at}`);
        assert.equal(m.toolMids.length, 1, `the tools share one line — ${at}`);
        assert.equal(m.toolMids[0], m.stateMid, `the row is one line — ${at}`);
        if (vp === 'phone') {
          for (const [sel, ok] of await page.evaluate(tapTargets)) {
            if (ok !== null) assert.equal(ok, true, `a tap on ${sel} reaches it — ${at}`);
          }
        }
      }
      assert.deepEqual(problems, []);
      await page.close();
    });
  }
});
