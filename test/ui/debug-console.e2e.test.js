// test/ui/debug-console.e2e.test.js — 开发控制台 in a real browser (the mock harness, public/dev/game-mock.html):
// the button is drawn for the debug nickname only, the panel opens from it, `help` prints the usage, a typed command
// sends one `g.debug` and reports what the server answered (ok and error alike), and the corner buttons do not overlap
// the 设置 / 玩法说明 ones. Opt-in: SP_E2E=1 (needs Chrome; CHROME_PATH overrides).
//
//   SP_E2E=1 node --test test/ui/debug-console.e2e.test.js
//
// The mock answers no `g.debug` of its own: the test patches net.request like the refresh-tap e2e does — the console's
// client half is what is under test here, the server half is test/match/debug-console.test.js.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DEBUG_NAME } from '../../shared/constants.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const MOCK = '?shot=1&phase=PREP&render=fallback';

describe('开发控制台 (mock harness, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
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

  /** Open the mock and hand the game to the test: `net.request` answers g.debug from `reply` and records the calls. */
  const open = async (reply = 'ok') => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`${base}/dev/game-mock.html${MOCK}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)') && !!globalThis.__SP_VIEW__, { timeout: 20000 });
    await page.evaluate(async (opts) => {
      const { net } = await import('/js/net.js');
      const orig = net.request.bind(net);
      globalThis.__DBG__ = [];
      net.request = (t, ...rest) => {
        if (t !== 'g.debug') return orig(t, ...rest);
        globalThis.__DBG__.push(rest[0]);
        if (opts.reply === 'ok') return Promise.resolve({});
        return Promise.reject(new Error('无效的请求'));
      };
      // the seat name is what the server gates on: publish it into the store the way a m.public push would
      const { store } = await import('/js/store.js');
      store.set((s) => ({
        ...s,
        me: { ...s.me, name: opts.name },
        match: { ...s.match, public: { ...s.match.public, players: (s.match.public.players || []).map((p) => (p.playerId === s.me.playerId ? { ...p, name: opts.name } : p)) } },
      }));
    }, { reply, name: DEBUG_NAME });
    return page;
  };

  const logLines = (page) => page.$$eval('.dbgconsole__line', (els) => els.map((e) => e.textContent));

  test('the console appears for the debug nickname, opens, runs a command and prints the answer', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`${base}/dev/game-mock.html${MOCK}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout: 20000 });
    // the mock's seat is 凯尔希: no console button at all
    assert.equal(await page.$('.dbgconsole'), null, 'a normal nickname gets no console');

    // rename the own seat and give the console its own answers
    await page.evaluate(async (debugName) => {
      const { net } = await import('/js/net.js');
      const orig = net.request.bind(net);
      globalThis.__DBG__ = [];
      net.request = (t, ...rest) => {
        if (t !== 'g.debug') return orig(t, ...rest);
        globalThis.__DBG__.push(rest[0]);
        return Promise.resolve({});
      };
      const { store } = await import('/js/store.js');
      store.set((s) => ({
        ...s,
        me: { ...s.me, name: debugName },
        match: { ...s.match, public: { ...s.match.public, players: (s.match.public.players || []).map((p) => (p.playerId === s.me.playerId ? { ...p, name: debugName } : p)) } },
      }));
    }, DEBUG_NAME);
    await page.waitForSelector('.dbgconsole__toggle', { timeout: 10000 });

    // the panel is closed until the button is pressed, and the button carries the state
    assert.equal(await page.$('.dbgconsole__panel'), null, 'closed at first');
    await page.click('.dbgconsole__toggle');
    await page.waitForSelector('.dbgconsole__panel');
    assert.equal(await page.$eval('.dbgconsole__toggle', (b) => b.getAttribute('aria-expanded')), 'true');

    // typed input runs through the panel: `help` lists the commands
    await page.click('.dbgconsole__input');
    await page.keyboard.type('help');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.dbgconsole__line').length > 4, { timeout: 10000 });
    const help = (await logLines(page)).join('\n');
    assert.match(help, /> help/);
    assert.match(help, /funds \[n\]/);
    assert.match(help, /clear/, 'the whole usage is printed');

    // a real command sends one g.debug per copy and reports it
    await page.click('.dbgconsole__input');
    await page.keyboard.type('chess 隐现 2');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => globalThis.__DBG__.length === 2, { timeout: 10000 });
    assert.deepEqual(await page.evaluate(() => globalThis.__DBG__), [
      { op: 'chess', id: 'chess_char_1_01_a' },
      { op: 'chess', id: 'chess_char_1_01_a' },
    ]);
    assert.match((await logLines(page)).join('\n'), /获得 干员 隐现（chess_char_1_01_a） ×2/);

    // ↑ recalls the last line
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(() => document.querySelector('.dbgconsole__input')?.value === 'chess 隐现 2', { timeout: 5000 });

    // an error the server answers is printed instead of a success line
    await page.evaluate(async () => {
      const { net } = await import('/js/net.js');
      net.request = (t, ...rest) => (t === 'g.debug' ? Promise.reject(new Error('无效的请求')) : Promise.resolve({}));
    });
    await page.$eval('.dbgconsole__input', (i) => { i.value = ''; });
    await page.click('.dbgconsole__input');
    await page.keyboard.type('funds 50');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('.dbgconsole__line.is-error')].some((e) => e.textContent.includes('资金')), { timeout: 10000 });

    // Esc closes the panel, the log stays (the component is not unmounted)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.dbgconsole__panel'), { timeout: 5000 });
    assert.equal(await page.$eval('.dbgconsole__toggle', (b) => b.getAttribute('aria-expanded')), 'false');
    await page.click('.dbgconsole__toggle');
    await page.waitForSelector('.dbgconsole__panel');
    assert.ok((await logLines(page)).length > 4, 'the scrollback survived the close');
    await page.close();
  });

  test('the corner row: 控制台 and 伤害 never cover 设置 / 玩法说明, and the panel opens above its own button', async () => {
    const page = await open();
    await page.waitForSelector('.dbgconsole__toggle');
    const boxes = await page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
      };
      return { toggle: box('.dbgconsole__toggle'), gear: box('.gm__gear'), corner: box('.gm__corner') };
    });
    const overlap = (a, b) => a && b && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
    assert.ok(boxes.gear, 'the 设置 button is there');
    assert.equal(overlap(boxes.toggle, boxes.gear), false, 'the 控制台 button does not cover 设置');
    assert.ok(boxes.toggle.x >= boxes.corner.x, 'it sits in the corner row');

    await page.click('.dbgconsole__toggle');
    await page.waitForSelector('.dbgconsole__panel');
    const above = await page.evaluate(() => {
      const panel = document.querySelector('.dbgconsole__panel').getBoundingClientRect();
      const button = document.querySelector('.dbgconsole__toggle').getBoundingClientRect();
      const gear = document.querySelector('.gm__gear').getBoundingClientRect();
      return { panelBottom: panel.bottom, buttonTop: button.top, panelLeft: panel.left, panelRight: panel.right, gearRight: gear.right, w: innerWidth };
    });
    assert.ok(above.panelBottom <= above.buttonTop + 1, 'the panel opens upwards from its button');
    assert.ok(above.panelRight <= above.w, 'and stays inside the viewport');
    await page.close();
  });
});
