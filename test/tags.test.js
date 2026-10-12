'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseTags, planReads, decodeTag, decodeAll } = require('../lib/tags');

// Writes values the way a Schneider M221/M241 stores them in %MW.
function floatWords(v) { const b = Buffer.alloc(4); b.writeFloatBE(v); return [b.readUInt16BE(2), b.readUInt16BE(0)]; }
function dintWords(v) { const b = Buffer.alloc(4); b.writeInt32BE(v); return [b.readUInt16BE(2), b.readUInt16BE(0)]; }
function stringWords(s, regs) {
    const out = [];
    for (let i = 0; i < regs; i++) out.push((s.charCodeAt(2 * i + 1) || 0) << 8 | (s.charCodeAt(2 * i) || 0));
    return out;
}

test('parses every type, aliases and comments', () => {
    const { tags, errors } = parseTags(`
        # comment
        %MW60200 bool plc_run
        MW60206 : float velocidade
        MW60210 string[20] codigo
        MW60222 int prontas
        MW60226 dint horas
        MW5 bool.3 motor
        MW6 word
        MW7 real temp // trailing comment
    `);
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(tags.map(t => [t.address, t.type, t.name, t.length]), [
        [60200, 'bool', 'plc_run', 1],
        [60206, 'float', 'velocidade', 2],
        [60210, 'string', 'codigo', 10],
        [60222, 'int', 'prontas', 1],
        [60226, 'dint', 'horas', 2],
        [5, 'bool', 'motor', 1],
        [6, 'uint', 'MW6', 1],
        [7, 'float', 'temp', 2]
    ]);
    assert.strictEqual(tags[5].bit, 3);
});

test('accepts SoMachine addresses without a type (M221)', () => {
    const { tags, errors } = parseTags('mf0 testeFloat\nmd0 testeDouble\nmw0 testeNormal\n%MW12.3 motor\nMD10 udint total');
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(tags.map(t => [t.name, t.type, t.address, t.length, t.bit]), [
        ['testeFloat', 'float', 0, 2, undefined],
        ['testeDouble', 'dint', 0, 2, undefined],
        ['testeNormal', 'int', 0, 1, undefined],
        ['motor', 'bool', 12, 1, 3],
        ['total', 'udint', 10, 2, undefined]
    ]);
    assert.strictEqual(parseTags('MF8').tags[0].name, 'MF8');
});

test('M241 places %MD/%MF on %MW(2n)', () => {
    const { tags } = parseTags('MF0 a\nMD3 b\nMW7 c', { model: 'M241' });
    assert.deepStrictEqual(tags.map(t => t.address), [0, 6, 7]);
});

test('rejects 16-bit types on MF/MD', () => {
    assert.strictEqual(parseTags('MD0 int x').errors.length, 1);
    assert.strictEqual(parseTags('MF0.2 x').errors.length, 1);
});

test('reports bad lines without stopping', () => {
    const { tags, errors } = parseTags('MW1 float a\nMW2 banana b\nMW3 string c\nMW4 bool.16 d\nhello');
    assert.strictEqual(tags.length, 1);
    assert.strictEqual(errors.length, 4);
});

test('decodes Schneider order (low word first, low byte first)', () => {
    assert.strictEqual(decodeTag({ type: 'float', length: 2 }, floatWords(23.5)), 23.5);
    assert.strictEqual(decodeTag({ type: 'dint', length: 2 }, dintWords(-123456)), -123456);
    assert.strictEqual(decodeTag({ type: 'udint', length: 2 }, dintWords(-1)), 4294967295);
    assert.strictEqual(decodeTag({ type: 'int', length: 1 }, [0xFFFE]), -2);
    assert.strictEqual(decodeTag({ type: 'uint', length: 1 }, [0xFFFE]), 65534);
    assert.strictEqual(decodeTag({ type: 'bool', length: 1 }, [1]), true);
    assert.strictEqual(decodeTag({ type: 'bool', length: 1, bit: 3 }, [0b1000]), true);
    assert.strictEqual(decodeTag({ type: 'bool', length: 1, bit: 2 }, [0b1000]), false);
    assert.strictEqual(decodeTag({ type: 'string', length: 10, chars: 20 }, stringWords('B2026-0412', 10)), 'B2026-0412');
    assert.strictEqual(decodeTag({ type: 'string', length: 2, chars: 3 }, stringWords('ABCD', 2)), 'ABC');
});

test('other orders when asked', () => {
    const [lo, hi] = floatWords(1.5);
    assert.strictEqual(decodeTag({ type: 'float', length: 2 }, [hi, lo], { lowWordFirst: false }), 1.5);
    assert.strictEqual(decodeTag({ type: 'string', length: 1, chars: 2 }, [0x4142], { lowByteFirst: false }), 'AB');
    assert.strictEqual(decodeTag({ type: 'float', length: 2 }, floatWords(1.23456), { decimals: 2 }), 1.23);
});

// Same algorithm as the OP1475 flow that was validated on the real slitter PLC.
function op1475Decode(tipo, w) {
    const b32 = (lo, hi) => { const b = Buffer.alloc(4); b.writeUInt16BE(hi, 0); b.writeUInt16BE(lo, 2); return b; };
    switch (tipo) {
        case 'REAL': return b32(w[0], w[1]).readFloatBE(0);
        case 'DINT': return b32(w[0], w[1]).readInt32BE(0);
        case 'STRING': {
            let s = '';
            for (const x of w) for (const c of [x & 0xFF, x >> 8]) { if (c === 0) return s; s += String.fromCharCode(c); }
            return s;
        }
    }
}

test('matches the OP1475 decode function on its address map', () => {
    const BASE = 60200;
    const regs = new Array(46).fill(0);
    const put = (addr, words) => words.forEach((w, i) => { regs[addr - BASE + i] = w; });
    put(60200, [1]); put(60201, [0]);
    put(60206, floatWords(87.5)); put(60208, floatWords(152.25));
    put(60210, stringWords('BOB-77812A', 10));
    put(60220, floatWords(4321.75)); put(60222, [12]);
    put(60224, floatWords(18.375)); put(60226, dintWords(5)); put(60228, dintWords(42));
    put(60238, dintWords(1750)); put(60244, dintWords(-300));

    const { tags } = parseTags(`
        MW60200 bool run
        MW60201 bool emergencia
        MW60206 float vel_pct
        MW60208 float vel_mmin
        MW60210 string[20] bobina
        MW60220 float peso
        MW60222 int prontas
        MW60224 float ton
        MW60226 dint horas
        MW60228 dint minutos
        MW60238 dint rpm_desb
        MW60244 dint rpm_bob
    `);
    const { values, missing } = decodeAll(tags, regs, BASE);
    assert.deepStrictEqual(missing, []);
    const w = (a, n) => regs.slice(a - BASE, a - BASE + n);
    assert.strictEqual(values.vel_pct, op1475Decode('REAL', w(60206, 2)));
    assert.strictEqual(values.peso, op1475Decode('REAL', w(60220, 2)));
    assert.strictEqual(values.bobina, op1475Decode('STRING', w(60210, 10)));
    assert.strictEqual(values.rpm_bob, op1475Decode('DINT', w(60244, 2)));
    assert.deepStrictEqual(values, {
        run: true, emergencia: false, vel_pct: 87.5, vel_mmin: 152.25, bobina: 'BOB-77812A',
        peso: 4321.75, prontas: 12, ton: 18.375, horas: 5, minutos: 42, rpm_desb: 1750, rpm_bob: -300
    });
});

test('groups close addresses into few reads', () => {
    const { tags } = parseTags('MW0 int a\nMW10 float b\nMW30 int c\nMW200 string[10] d\nMW204 int e');
    const blocks = planReads(tags, 120, 20);
    assert.deepStrictEqual(blocks.map(b => [b.start, b.quantity, b.tags.length]), [[0, 31, 3], [200, 5, 2]]);
    assert.deepStrictEqual(planReads(tags, 12, 20).map(b => [b.start, b.quantity]), [[0, 12], [30, 1], [200, 5]]);
});
