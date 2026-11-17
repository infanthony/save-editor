// Character, creature and object models: reads the game's text model files (.nat), texture packs (.cnk)
// and textures (.ink), and draws a model in its rest pose with WebGL. Z is up; one bone moves each vertex.
(function (root) {
  'use strict';

  // ---- .nat text models ----------------------------------------------------------------------

  function tokenize(text) {
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '').trim();
      if (line) lines.push(line.split(/\s+/));
    }
    return lines;
  }

  function parseNat(text) {
    const lines = tokenize(text);
    if (!lines.length || lines[0][0] !== 'NAT') throw new Error('not a model file');
    let i = 1;
    const bones = [];
    const meshes = [];
    const peek = () => lines[i];
    const expect = (tok) => {
      if (!lines[i] || lines[i][0] !== tok) throw new Error('model file: expected "' + tok + '" at line ' + (i + 1));
      i += 1;
    };
    const parseBone = (parent) => {
      const name = lines[i][1];
      i += 1;
      expect('{');
      const bone = { name, parent, t: [0, 0, 0], e: [0, 0, 0] };
      const index = bones.length;
      bones.push(bone);
      while (i < lines.length && lines[i][0] !== '}') {
        const l = lines[i];
        if (l[0] === 't') { bone.t = [Number(l[1]), Number(l[2]), Number(l[3])]; i += 1; }
        else if (l[0] === 'e') { bone.e = [Number(l[1]), Number(l[2]), Number(l[3])]; i += 1; }
        else if (l[0] === 'bone') parseBone(index);
        else i += 1;
      }
      expect('}');
    };
    // Faces, texture coordinates and material commands shared by both geometry kinds.
    const parseBody = (mesh, vertexLine) => {
      expect('{');
      let material = null;
      while (i < lines.length && lines[i][0] !== '}') {
        const l = lines[i];
        if (l[0] === 'vertList') {
          i += 1;
          expect('{');
          while (lines[i][0] !== '}') vertexLine(mesh);
          expect('}');
        } else if (l[0] === 'textList') {
          i += 1;
          expect('{');
          while (lines[i][0] !== '}') { mesh.uvs.push([Number(lines[i][1]), Number(lines[i][2])]); i += 1; }
          expect('}');
        } else if (l[0] === 'texture') {
          material = { texture: l.slice(1).join(' '), groups: [] };
          mesh.materials.push(material);
          i += 1;
        } else if (l[0] === 'polyStrip' || l[0] === 'polyList') {
          const strip = l[0] === 'polyStrip';
          i += 1;
          expect('{');
          const corners = [];
          while (lines[i][0] !== '}') {
            if (lines[i][0] === 'f') corners.push([Number(lines[i][1]), Number(lines[i][2])]);
            i += 1;
          }
          expect('}');
          if (!material) { material = { texture: '', groups: [] }; mesh.materials.push(material); }
          material.groups.push({ strip, corners });
        } else if (lines[i + 1] && lines[i + 1][0] === '{') {
          i += 1;
          let depth = 0;
          do {
            if (lines[i][0] === '{') depth += 1;
            else if (lines[i][0] === '}') depth -= 1;
            i += 1;
          } while (depth > 0 && i < lines.length);
        } else i += 1;
      }
      expect('}');
    };
    while (i < lines.length) {
      const l = peek();
      if (l[0] === 'hierarchy') {
        i += 1;
        expect('[');
        while (lines[i][0] !== ']') {
          if (lines[i][0] === 'bone') parseBone(-1);
          else i += 1;
        }
        expect(']');
      } else if (l[0] === 'geometry_physique') {
        i += 1;
        expect('[');
        while (lines[i][0] !== ']') {
          if (lines[i][0] === 'physique') {
            i += 1;
            const mesh = { kind: 'physique', verts: [], uvs: [], materials: [] };
            parseBody(mesh, (m) => {
              if (lines[i][0] !== 'v_phys') { i += 1; return; }
              i += 1;
              expect('{');
              let best = null;
              while (lines[i][0] !== '}') {
                const x = lines[i];
                if (x[0] === 'xyz') {
                  const w = Number(x[2]);
                  if (!best || w > best.w) best = { bone: x[1], w, p: [Number(x[3]), Number(x[4]), Number(x[5])] };
                }
                i += 1;
              }
              expect('}');
              m.verts.push(best ? { bone: best.bone, p: best.p } : { bone: null, p: [0, 0, 0] });
            });
            meshes.push(mesh);
          } else i += 1;
        }
        expect(']');
      } else if (l[0] === 'geometry_seg') {
        i += 1;
        expect('[');
        while (lines[i][0] !== ']') {
          if (lines[i][0] === 'seg') {
            const mesh = { kind: 'seg', bone: lines[i][1], verts: [], uvs: [], materials: [] };
            i += 1;
            parseBody(mesh, (m) => {
              const x = lines[i];
              if (x[0] === 'v') m.verts.push({ bone: mesh.bone, p: [Number(x[1]), Number(x[2]), Number(x[3])] });
              i += 1;
            });
            meshes.push(mesh);
          } else i += 1;
        }
        expect(']');
      } else i += 1;
    }
    return { bones, meshes };
  }

  // ---- matrices (row-major 4x4, multiplying column vectors) ----------------------------------

  function mul(a, b) {
    const o = new Array(16);
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
      }
    }
    return o;
  }
  const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const rad = (d) => (d * Math.PI) / 180;
  function rotX(d) { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]; }
  function rotY(d) { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]; }
  function rotZ(d) { const c = Math.cos(rad(d)); const s = Math.sin(rad(d)); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function trans(t) { return [1, 0, 0, t[0], 0, 1, 0, t[1], 0, 0, 1, t[2], 0, 0, 0, 1]; }
  function apply(m, p) {
    return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]];
  }

  // Rest pose: each bone's local transform is T * Rz * Ry * Rx, applied below its parent.
  function restPose(bones) {
    const world = [];
    bones.forEach((b, k) => {
      const local = mul(trans(b.t), mul(rotZ(b.e[2]), mul(rotY(b.e[1]), rotX(b.e[0]))));
      world[k] = b.parent >= 0 ? mul(world[b.parent], local) : local;
    });
    return world;
  }

  // Triangles per texture: {texture, positions: Float32Array, uvs: Float32Array}, plus the bounds.
  function buildGeometry(nat) {
    const world = restPose(nat.bones);
    const byName = new Map(nat.bones.map((b, k) => [b.name.toLowerCase(), k]));
    const out = [];
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const mesh of nat.meshes) {
      const placed = mesh.verts.map((v) => {
        const k = v.bone ? byName.get(v.bone.toLowerCase()) : undefined;
        const p = k === undefined ? v.p : apply(world[k], v.p);
        for (let a = 0; a < 3; a += 1) { if (p[a] < min[a]) min[a] = p[a]; if (p[a] > max[a]) max[a] = p[a]; }
        return p;
      });
      for (const mat of mesh.materials) {
        const pos = [];
        const uv = [];
        const corner = (c) => {
          const p = placed[c[0]] || [0, 0, 0];
          const t = mesh.uvs[c[1]] || [0, 0];
          pos.push(p[0], p[1], p[2]);
          uv.push(t[0], t[1]);
        };
        for (const g of mat.groups) {
          const c = g.corners;
          if (g.strip) {
            for (let k = 2; k < c.length; k += 1) {
              if (k % 2 === 0) { corner(c[k - 2]); corner(c[k - 1]); corner(c[k]); }
              else { corner(c[k - 1]); corner(c[k - 2]); corner(c[k]); }
            }
          } else {
            for (let k = 0; k + 2 < c.length; k += 3) { corner(c[k]); corner(c[k + 1]); corner(c[k + 2]); }
          }
        }
        if (pos.length) out.push({ texture: mat.texture, positions: new Float32Array(pos), uvs: new Float32Array(uv) });
      }
    }
    return { parts: out, min, max };
  }

  // ---- textures ------------------------------------------------------------------------------

  // Pack directory: u32 count, u32 total size, then 56-byte entries {name[52], u32 offset}.
  function parsePack(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = new Map();
    if (bytes.length < 8) return entries;
    const n = dv.getUint32(0, true);
    for (let k = 0; k < n && 8 + (k + 1) * 56 <= bytes.length; k += 1) {
      const at = 8 + k * 56;
      let end = at;
      while (end < at + 52 && bytes[end]) end += 1;
      const name = String.fromCharCode.apply(null, bytes.subarray(at, end)).toLowerCase();
      entries.set(name, dv.getUint32(at + 52, true));
    }
    return { bytes, entries };
  }

  const INK_HEADER = 68;
  // .ink: 68-byte header (alpha, red, green and blue masks at +0x10..+0x1C, width +0x34, height +0x38),
  // then 16-bit pixels.
  function decodeInk(bytes, offset) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset + (offset || 0));
    const masks = [dv.getUint32(0x14, true), dv.getUint32(0x18, true), dv.getUint32(0x1C, true), dv.getUint32(0x10, true)];
    const w = dv.getUint32(0x34, true);
    const h = dv.getUint32(0x38, true);
    if (!w || !h || w > 4096 || h > 4096) throw new Error('unreadable texture');
    const shifts = masks.map((m) => { let s = 0; if (!m) return 0; while (!((m >> s) & 1)) s += 1; return s; });
    const maxes = masks.map((m, k) => (m ? m >>> shifts[k] : 0));
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p += 1) {
      const v = dv.getUint16(INK_HEADER + p * 2, true);
      for (let c = 0; c < 4; c += 1) {
        rgba[p * 4 + c] = maxes[c] ? Math.round((((v & masks[c]) >>> shifts[c]) * 255) / maxes[c]) : 255;
      }
    }
    return { w, h, rgba };
  }

  // The texture a part wears for a look: the one or two digits before the extension become the
  // look number (one digit below 10). Returns candidate names, best first, without extension.
  function lookNames(texture, look, overlays) {
    const base = texture.replace(/\.[^.]*$/, '').toLowerCase();
    const m = /^(.*?)(\d{1,2})$/.exec(base);
    const names = [];
    if (m) for (const v of overlays || []) names.push(m[1] + String(v));
    if (m && look > 0) names.push(m[1] + String(look));
    names.push(base);
    return names;
  }

  // ---- WebGL viewer --------------------------------------------------------------------------

  const VS = 'attribute vec3 aPos; attribute vec2 aUv; attribute vec3 aNrm; uniform mat4 uMvp; uniform mat4 uRot;'
    + 'varying vec2 vUv; varying float vLight;'
    + 'void main() { gl_Position = uMvp * vec4(aPos, 1.0); vUv = aUv;'
    + ' vec3 n = normalize((uRot * vec4(aNrm, 0.0)).xyz); vLight = 0.45 + 0.55 * abs(dot(n, normalize(vec3(0.4, -0.5, 0.75)))); }';
  const FS = 'precision mediump float; varying vec2 vUv; varying float vLight; uniform sampler2D uTex; uniform float uHasTex;'
    + 'void main() { vec4 c = uHasTex > 0.5 ? texture2D(uTex, vUv) : vec4(0.7, 0.7, 0.72, 1.0); if (c.a < 0.3) discard;'
    + ' gl_FragColor = vec4(c.rgb * vLight, 1.0); }';

  function normals(pos) {
    const n = new Float32Array(pos.length);
    for (let k = 0; k < pos.length; k += 9) {
      const ax = pos[k + 3] - pos[k]; const ay = pos[k + 4] - pos[k + 1]; const az = pos[k + 5] - pos[k + 2];
      const bx = pos[k + 6] - pos[k]; const by = pos[k + 7] - pos[k + 1]; const bz = pos[k + 8] - pos[k + 2];
      const nx = ay * bz - az * by; const ny = az * bx - ax * bz; const nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (let v = 0; v < 3; v += 1) { n[k + v * 3] = nx / l; n[k + v * 3 + 1] = ny / l; n[k + v * 3 + 2] = nz / l; }
    }
    return n;
  }

  function perspective(fovDeg, aspect, near, far) {
    const f = 1 / Math.tan(rad(fovDeg) / 2);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), (2 * far * near) / (near - far), 0, 0, -1, 0];
  }
  const colMajor = (m) => new Float32Array([m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]]);

  // A canvas that shows one model; drag to turn it, scroll to zoom.
  function createViewer(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.className = 'model-canvas';
    const gl = canvas.getContext('webgl', { antialias: true });
    if (!gl) return { el: canvas, supported: false, show() {}, clear() {} };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    const loc = {
      pos: gl.getAttribLocation(prog, 'aPos'), uv: gl.getAttribLocation(prog, 'aUv'), nrm: gl.getAttribLocation(prog, 'aNrm'),
      mvp: gl.getUniformLocation(prog, 'uMvp'), rot: gl.getUniformLocation(prog, 'uRot'), tex: gl.getUniformLocation(prog, 'uTex'),
      hasTex: gl.getUniformLocation(prog, 'uHasTex'),
    };
    let parts = [];
    let centre = [0, 0, 0];
    let radius = 50;
    let yaw = -30;
    let pitch = 12;
    let zoom = 1;
    const release = () => {
      for (const p of parts) { gl.deleteBuffer(p.pb); gl.deleteBuffer(p.ub); gl.deleteBuffer(p.nb); if (p.tex) gl.deleteTexture(p.tex); }
      parts = [];
    };
    const draw = () => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!parts.length) return;
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.useProgram(prog);
      const dist = (radius * 2.6) / zoom;
      // View: turn about Z (up), tilt, then look down the -Z axis of the camera.
      const rot = mul(rotX(-90 + pitch), rotZ(-yaw));
      const view = mul(trans([0, 0, -dist]), mul(rot, trans([-centre[0], -centre[1], -centre[2]])));
      const proj = perspective(35, canvas.width / canvas.height, Math.max(0.1, dist - radius * 3), dist + radius * 3);
      gl.uniformMatrix4fv(loc.mvp, false, colMajor(mul(proj, view)));
      gl.uniformMatrix4fv(loc.rot, false, colMajor(rot));
      for (const p of parts) {
        gl.bindBuffer(gl.ARRAY_BUFFER, p.pb); gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.ub); gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, p.nb); gl.enableVertexAttribArray(loc.nrm); gl.vertexAttribPointer(loc.nrm, 3, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, p.tex);
        gl.uniform1i(loc.tex, 0);
        gl.uniform1f(loc.hasTex, p.tex ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, p.count);
      }
    };
    let drag = null;
    canvas.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY }; canvas.setPointerCapture(ev.pointerId); });
    canvas.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      yaw += (ev.clientX - drag.x) * 0.6;
      pitch = Math.max(-80, Math.min(80, pitch + (ev.clientY - drag.y) * 0.4));
      drag = { x: ev.clientX, y: ev.clientY };
      draw();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); zoom = Math.max(0.4, Math.min(6, zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12))); draw(); }, { passive: false });
    return {
      el: canvas,
      supported: true,
      // geometry from buildGeometry; images: Map texture name -> {w, h, rgba} or missing.
      show(geometry, images) {
        release();
        for (const g of geometry.parts) {
          const mk = (data) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; };
          let tex = null;
          const img = images.get(g.texture);
          if (img) {
            tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.w, img.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.rgba.buffer));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          }
          parts.push({ pb: mk(g.positions), ub: mk(g.uvs), nb: mk(normals(g.positions)), tex, count: g.positions.length / 3 });
        }
        centre = [0, 1, 2].map((a) => (geometry.min[a] + geometry.max[a]) / 2);
        radius = Math.max(1, Math.hypot(geometry.max[0] - geometry.min[0], geometry.max[1] - geometry.min[1], geometry.max[2] - geometry.min[2]) / 2);
        zoom = 1;
        draw();
      },
      clear() { release(); draw(); },
    };
  }

  // ---- loading from a game folder ------------------------------------------------------------

  // assets.read(path below the data folder) -> Promise<Uint8Array | null>.
  function createLoader(assets, decodeText) {
    const packs = new Map();
    const loosePack = { entries: new Map() };
    const pack = (tag) => {
      const key = tag.toLowerCase();
      if (!packs.has(key)) packs.set(key, assets.read('INK/' + tag + '.cnk').then((b) => (b ? parsePack(b) : loosePack)).catch(() => loosePack));
      return packs.get(key);
    };
    // A texture from the model's pack, or a loose file in data/INK when looseToo is set.
    const texture = async (p, name, looseToo) => {
      const off = p.entries ? p.entries.get(name + '.ink') : undefined;
      if (off !== undefined) return decodeInk(p.bytes, off);
      if (!looseToo) return null;
      const loose = await assets.read('INK/' + name + '.ink');
      return loose ? decodeInk(loose, 0) : null;
    };
    return {
      // model path below data/Anims, look number and overlay looks (98 gloves, 99 boots).
      async load(modelPath, look, overlays) {
        const text = await assets.read('Anims/' + modelPath);
        if (!text) throw new Error('data/Anims/' + modelPath + ' was not found');
        const nat = parseNat(decodeText(text));
        const geometry = buildGeometry(nat);
        const tag = (modelPath.split('/')[1] || modelPath).replace(/\.nat$/i, '');
        const p = await pack(tag);
        const images = new Map();
        let found = 0;
        for (const part of geometry.parts) {
          if (images.has(part.texture)) continue;
          let img = null;
          const names = lookNames(part.texture, look, overlays);
          for (let k = 0; k < names.length && !img; k += 1) {
            try { img = await texture(p, names[k], k === names.length - 1); } catch (error) { img = null; }
          }
          if (img) found += 1;
          images.set(part.texture, img);
        }
        return { geometry, images, textures: images.size, found };
      },
    };
  }

  const api = { parseNat, buildGeometry, restPose, parsePack, decodeInk, lookNames, createViewer, createLoader };
  root.PorModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
