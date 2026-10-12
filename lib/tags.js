'use strict';

// Tag list parsing, read planning and decoding for Schneider M221/M241 memory.
// %MWn is holding register n (base 0). 32-bit values store the low word first,
// strings store the first character in the low byte of each word.

const TYPES = {
    bool: 1, int: 1, uint: 1, word: 1,
    dint: 2, udint: 2, dword: 2, float: 2, real: 2
};
const ALIASES = { word: 'uint', dword: 'udint', real: 'float' };
// Type used when a line has only the address, e.g. "MF0 temperatura".
const DEFAULT_TYPE = { W: 'int', F: 'float', D: 'dint' };

const ADDRESS_RE = /^%?M([WFD])(\d+)(?:\.(\d+))?$/i;
const TYPE_RE = /^([a-z]+)(?:\.(\d+)|\[(\d+)\])?$/i;

// Register that holds %MFn / %MDn. On the M221 they overlap %MWn and %MWn+1;
// on the M241 (IEC addressing) %MDn sits on %MW(2n) and %MW(2n+1).
function doubleWordRegister(index, model) {
    return String(model).toUpperCase() === 'M241' ? index * 2 : index;
}

// Accepted lines (case-insensitive, % optional, ":" ";" "," ignored):
//   MW100 float nome    MF0 nome    MD4 nome    MW10.3 nome    MW20 string[10] nome    MW5
function parseTags(text, options = {}) {
    const model = options.model || 'M221';
    const tags = [];
    const errors = [];
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
        const line = raw.replace(/(#|\/\/).*$/, '').replace(/[;:,]/g, ' ').trim();
        if (!line) return;
        const fail = msg => errors.push(`line ${i + 1}: ${msg}`);
        const tokens = line.split(/\s+/);

        const a = ADDRESS_RE.exec(tokens.shift());
        if (!a) { fail(`cannot read the address in "${raw.trim()}" (use MW, MF or MD)`); return; }
        const area = a[1].toUpperCase();
        const index = Number(a[2]);
        const label = `M${area}${index}` + (a[3] !== undefined ? `.${a[3]}` : '');

        let type = DEFAULT_TYPE[area];
        let bit = a[3] !== undefined ? Number(a[3]) : undefined;
        let size;
        if (bit !== undefined) {
            if (area !== 'W') { fail('a bit (.N) only works on MW'); return; }
            type = 'bool';
        }
        const t = tokens.length ? TYPE_RE.exec(tokens[0]) : null;
        if (t && (TYPES[t[1].toLowerCase()] || t[1].toLowerCase() === 'string')) {
            tokens.shift();
            type = t[1].toLowerCase();
            type = ALIASES[type] || type;
            if (t[2] !== undefined) {
                if (type !== 'bool' || bit !== undefined) { fail('bit index only works as bool.0 to bool.15'); return; }
                bit = Number(t[2]);
            }
            if (t[3] !== undefined) {
                if (type !== 'string') { fail('[size] only applies to string'); return; }
                size = Number(t[3]);
            }
        }
        if (tokens.length > 1) { fail(`too many words in "${raw.trim()}"`); return; }
        const name = tokens[0] || label;

        const tag = { address: index, type, name, label };
        if (area !== 'W') {
            if (TYPES[type] !== 2) { fail(`M${area} holds 32-bit values, use float, dint or udint`); return; }
            tag.address = doubleWordRegister(index, model);
        }
        if (type === 'string') {
            if (!size) { fail('string needs a size, e.g. string[20]'); return; }
            tag.chars = size;
            tag.length = Math.ceil(size / 2);
        } else {
            tag.length = TYPES[type];
        }
        if (bit !== undefined) {
            if (bit > 15) { fail('bit index only works as bool.0 to bool.15'); return; }
            tag.bit = bit;
        }
        if (tag.address + tag.length - 1 > 65535) { fail('address out of range'); return; }
        tags.push(tag);
    });
    return { tags, errors };
}

// Groups tags into as few reads as possible. A gap is read through when the
// block still fits in maxQuantity and the gap is at most maxGap registers.
function planReads(tags, maxQuantity = 120, maxGap = 20) {
    const sorted = [...tags].sort((a, b) => a.address - b.address);
    const blocks = [];
    let cur = null;
    for (const tag of sorted) {
        const end = tag.address + tag.length;
        if (cur && tag.address - cur.end <= maxGap && Math.max(end, cur.end) - cur.start <= maxQuantity) {
            cur.end = Math.max(end, cur.end);
            cur.tags.push(tag);
        } else {
            if (tag.length > maxQuantity) throw new Error(`${tag.name} needs ${tag.length} registers, more than the ${maxQuantity} per read`);
            cur = { start: tag.address, end, tags: [tag] };
            blocks.push(cur);
        }
    }
    return blocks.map(b => ({ start: b.start, quantity: b.end - b.start, tags: b.tags }));
}

function u16(w) { return Number(w) & 0xFFFF; }

function decodeTag(tag, words, opts = {}) {
    const lowWordFirst = opts.lowWordFirst !== false;
    const lowByteFirst = opts.lowByteFirst !== false;
    const w = words.map(u16);
    if (w.length < tag.length) return undefined;
    switch (tag.type) {
        case 'bool': return tag.bit === undefined ? w[0] !== 0 : ((w[0] >> tag.bit) & 1) === 1;
        case 'int': return w[0] >= 0x8000 ? w[0] - 0x10000 : w[0];
        case 'uint': return w[0];
        case 'dint':
        case 'udint':
        case 'float': {
            const lo = lowWordFirst ? w[0] : w[1];
            const hi = lowWordFirst ? w[1] : w[0];
            const b = Buffer.alloc(4);
            b.writeUInt16BE(hi, 0);
            b.writeUInt16BE(lo, 2);
            if (tag.type === 'dint') return b.readInt32BE(0);
            if (tag.type === 'udint') return b.readUInt32BE(0);
            const f = b.readFloatBE(0);
            return opts.decimals === undefined || !isFinite(f) ? f : Number(f.toFixed(opts.decimals));
        }
        case 'string': {
            let s = '';
            for (const x of w) {
                const pair = lowByteFirst ? [x & 0xFF, x >> 8] : [x >> 8, x & 0xFF];
                for (const c of pair) {
                    if (c === 0 || s.length >= tag.chars) return opts.trim === false ? s : s.trimEnd();
                    s += String.fromCharCode(c);
                }
            }
            return opts.trim === false ? s : s.trimEnd();
        }
    }
    return undefined;
}

// Decodes every tag from a register array that starts at address `start`.
function decodeAll(tags, registers, start, opts) {
    const values = {};
    const missing = [];
    for (const tag of tags) {
        const i = tag.address - start;
        const words = i >= 0 ? registers.slice(i, i + tag.length) : [];
        const v = decodeTag(tag, words, opts);
        if (v === undefined) missing.push(tag.name);
        else values[tag.name] = v;
    }
    return { values, missing };
}

module.exports = { doubleWordRegister, parseTags, planReads, decodeTag, decodeAll };
