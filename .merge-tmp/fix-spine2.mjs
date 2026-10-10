// 一次性解决 public/js/render/spine.js 的 6 个冲突（锚点精确替换，失败即报错）。
import { readFileSync, writeFileSync } from 'node:fs';

const file = 'public/js/render/spine.js';
const raw = readFileSync(file, 'utf8');
const crlf = raw.includes('\r\n');
let text = raw.replace(/\r\n/g, '\n');

const fix = (startText, endText, newText, label) => {
  const s = text.indexOf(startText);
  if (s < 0) throw new Error(`[${label}] 起始锚点缺失: ${JSON.stringify(startText.slice(0, 40))}`);
  if (text.indexOf(startText, s + 1) >= 0) throw new Error(`[${label}] 起始锚点重复`);
  const e = text.indexOf(endText, s + startText.length);
  if (e < 0) throw new Error(`[${label}] 结束锚点缺失: ${JSON.stringify(endText.slice(0, 40))}`);
  text = text.slice(0, s) + newText + text.slice(e);
  console.log(`[${label}] ${e - s} -> ${newText.length} 字符`);
};

// ---- h1：文件头说明：两段都保留，只去掉三个标记行 ------------------------------------------------
fix('<<<<<<< HEAD\n//\n// As the original (', '//   - the renderer draws', '//\n// As the original (', 'h1a');
fix('=======\n//   poseHeld()', '//   poseHeld()', '//   poseHeld()', 'h1b');
fix('// attacks while it runs.\n>>>>>>> upstream/master', '//   sample(', '// attacks while it runs.\n', 'h1c');

// ---- h2：构造函数的 clipped / clipOn / clipping 补丁 / defaultMix --------------------------------
fix('    /**\n<<<<<<< HEAD\n     * Clipping attachments (the eye clips', '    this.base = \'idle\';',
  '    /**\n'
  + '     * Clipping attachments (the eye clips a blink switches) render as stencil masks: such skeletons are drawn through\n'
  + '     * the impostor atlas (units.js), never unclipped — the eyeballs would show over closed eyelids. approx. 1.5 ms of\n'
  + '     * GPU each per frame on tiled GPUs, so clipping is switched off when too many of them share a field (app.js\n'
  + '     * pickClipping) — then _eyeMaskFallback hides what a closed eyelid would cut (GitHub #177; PR #384).\n'
  + '     */\n'
  + '    this.clipped = hasClipping(spineData);\n'
  + '    this.clipOn = true;\n'
  + '    this._clipHidden = new Set(); // slot indexes the eyelid fallback hid in its last pass (_eyeMaskFallback)\n'
  + '    if (this.clipped) {\n'
  + '      const sp = this.spine;\n'
  + '      const orig = typeof sp.createGraphics === \'function\' ? sp.createGraphics.bind(sp) : null;\n'
  + '      if (orig) sp.createGraphics = (slot, att) => { const g = orig(slot, att); if (!this.clipOn && slot.clippingContainer) { slot.clippingContainer.mask = null; g.renderable = false; } return g; };\n'
  + '    }\n'
  + '    this.rate = 2;                // game seconds per real second (setRate): blends are real-time\n'
  + '    try { this.spine.stateData.defaultMix = MIX.base * this.rate; } catch { /* ignore */ }\n',
  'h2');

// ---- h3：构造函数尾部（fork 的 hitData + 上游的 wound/_applied 与 setClipping）--------------------
fix('    this.clipPerAttack = false;\n<<<<<<< HEAD\n', '  /**',
  '    this.clipPerAttack = false;\n'
  + '    // strike frames known for this skeleton (manifest `hits`); a skeleton without any keeps the old rule\n'
  + '    this.hitData = !!entry.hits && Object.keys(entry.hits).length > 0;\n'
  + '    this.wound = false;           // clipPerAttack: wound up for the coming attack (windUp -> attack)\n'
  + '    this._applied = false;        // an update has posed the skeleton since its clip last changed (poseHeld)\n'
  + '    this._appliedTint = undefined; // the tint that update put on the slots (pixi-spine applies `tint` in update)\n'
  + '    this._play(this._idleName(), true);\n'
  + '  }\n'
  + '\n'
  + '  /** Enable / disable the skeleton\'s clipping masks. */\n'
  + '  setClipping(on) {\n'
  + '    on = !!on;\n'
  + '    if (!this.clipped || on === this.clipOn) return;\n'
  + '    this.clipOn = on;\n'
  + '    if (on) this._showClipHidden();   // the stencil takes over from the eyelid fallback\n'
  + '    for (const slot of this.spine?.skeleton?.slots || []) {\n'
  + '      if (!slot.clippingContainer) continue;\n'
  + '      slot.clippingContainer.mask = on ? slot.currentGraphics || null : null;\n'
  + '      // PIXI makes a released mask renderable again: the clip polygon must never draw as a white shape\n'
  + '      if (slot.currentGraphics) slot.currentGraphics.renderable = false;\n'
  + '    }\n'
  + '  }\n'
  + '\n'
  + '  ',
  'h3');

// ---- h4：_play（fork 的接管时机 + 上游的 _applied）------------------------------------------------
fix('<<<<<<< HEAD\n    const st = this.spine.state;', '    return true;',
  '    const st = this.spine.state;\n'
  + '    const prev = st.tracks?.[0];\n'
  + '    let blend = mix != null ? mix : this._m(MIX.base);\n'
  + '    let delay = 0;\n'
  + '    if (prev && prev.animation && !prev.loop) {\n'
  + '      // a positive delay is the previous clip\'s track time (clip seconds) at which this one takes over; the blend (game\n'
  + '      // seconds) covers blend x its time scale of the previous clip, so it ends with it\n'
  + '      const dur = prev.animation.duration, pts = Math.max(0.05, prev.timeScale || 1);\n'
  + '      blend = Math.max(0, Math.min(blend, ((dur - notBefore) * 0.9) / pts));\n'
  + '      delay = Math.max(1e-6, dur - blend * pts);\n'
  + '    }\n'
  + '    const e = st.addAnimation(0, name, loop, delay);\n'
  + '    if (e) { e.timeScale = timeScale; e.mixDuration = blend; }\n'
  + '    this._applied = false;\n'
  + '    return true;',
  'h4');

// ---- h5：attack（fork 的挥砍计划；合并后的实现由 _swingSet 驱动）----------------------------------
fix('<<<<<<< HEAD\n    this.down = !!down;\n', '      return;\n', '    this.down = !!down;\n', 'h5a');
fix('      return;\n=======\n', '>>>>>>> upstream/master\n', '      return;\n', 'h5b');

// ---- h6：update 的收尾（上游的 _eyeMaskFallback + fork 的 shown 记录）与两个方法 -----------------
fix('<<<<<<< HEAD\n    // the clip on screen:', '  }\n\n  /** Model height in skeleton units',
  '    if (this.clipped && !this.clipOn) this._eyeMaskFallback();\n'
  + '    // the clip on screen: a queued clip (the base after a swing, a loop after its begin clip) takes over by itself\n'
  + '    const shown = this.spine.state.tracks?.[0]?.animation?.name;\n'
  + '    if (shown) this.current = shown;\n'
  + '    this._applied = true;\n'
  + '    this._appliedTint = this.spine.tint;\n'
  + '  }\n'
  + '\n'
  + '  /**\n'
  + '   * The eyelids without the stencil masks (GitHub #177; PR #384 by @Convey123, re-implemented). On this roster the\n'
  + '   * clipping attachments are eyelids: the polygon is the eye\'s opening and the eyeball / eye-white meshes drawn after\n'
  + '   * it are clipped to it, so a closing eye (a blink, a knock-down) is hidden by the mask, not by the art. The masks\n'
  + '   * are off on a crowded field or below high quality (render/app.js pickClipping), and the eyeballs showed through\n'
  + '   * the closed lids (佩佩, 仇白, 隐德来希, 琳琅诗怀雅 ...). While they are off, every slot a clip covers — walked in draw\n'
  + '   * order from the clipping slot to its endSlot, with the attachments in force (any skin), as pixi-spine does — is\n'
  + '   * hidden for the frame when the centre of what it draws lies outside the clip polygon [ASSUMED: all or nothing per\n'
  + '   * slot, an approximation of the mask\'s cut]. pixi-spine shows every attached slot container again on each update.\n'
  + '   */\n'
  + '  _eyeMaskFallback() {\n'
  + '    const sp = this.spine, skel = sp && sp.skeleton, boxes = sp && sp.slotContainers;\n'
  + '    if (!skel || !Array.isArray(skel.drawOrder) || !boxes) return;\n'
  + '    this._showClipHidden();   // undo the last pass (a pixi-spine update re-shows them anyway; a frozen one does not)\n'
  + '    try {\n'
  + '      const buf = this._clipBuf || (this._clipBuf = { v: new Float32Array(64), poly: new Float32Array(16), c: [0, 0] });\n'
  + '      let pn = -1, end = null;   // pn: points of the clip in force (-1: none; < 3: degenerate, hides nothing)\n'
  + '      for (const slot of skel.drawOrder) {\n'
  + '        const att = typeof slot.getAttachment === \'function\' ? slot.getAttachment() : slot.attachment;\n'
  + '        if (isClip(att)) {\n'
  + '          const n = att.worldVerticesLength | 0;\n'
  + '          if (buf.poly.length < n) buf.poly = new Float32Array(n);\n'
  + '          if (n >= 6) att.computeWorldVertices(slot, 0, n, buf.poly, 0, 2);\n'
  + '          pn = n >> 1;\n'
  + '          end = att.endSlot && att.endSlot !== slot.data ? att.endSlot : null;\n'
  + '          continue;\n'
  + '        }\n'
  + '        if (pn < 0) continue;\n'
  + '        const box = boxes[slot.data.index];\n'
  + '        if (pn >= 3 && att && box && slotCentre(slot, att, buf, buf.c) && !pointInPolygon(buf.c[0], buf.c[1], buf.poly, pn)) {\n'
  + '          box.visible = false;\n'
  + '          this._clipHidden.add(slot.data.index);\n'
  + '        }\n'
  + '        if (end && slot.data === end) { pn = -1; end = null; }\n'
  + '      }\n'
  + '    } catch { /* an unknown runtime shape must never stop the frame */ }\n'
  + '  }\n'
  + '\n'
  + '  /** Show the slot containers the fallback hid (those still drawing an attachment). */\n'
  + '  _showClipHidden() {\n'
  + '    if (!this._clipHidden.size) return;\n'
  + '    const slots = this.spine?.skeleton?.slots, boxes = this.spine?.slotContainers;\n'
  + '    for (const i of this._clipHidden) {\n'
  + '      const slot = slots && slots[i];\n'
  + '      if (boxes && boxes[i] && slot && (typeof slot.getAttachment === \'function\' ? slot.getAttachment() : slot.attachment)) boxes[i].visible = true;\n'
  + '    }\n'
  + '    this._clipHidden.clear();\n'
  + '  ',
  'h6');

writeFileSync(file, crlf ? text.replace(/\n/g, '\r\n') : text);
console.log('spine.js 6 块处理完成');
