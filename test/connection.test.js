'use strict';

// Reads from a local Modbus TCP simulator that stores values like a Schneider PLC.
const test = require('node:test');
const assert = require('node:assert');
const ModbusRTU = require('modbus-serial');
const Connection = require('../lib/connection');
const { parseTags, planReads, decodeAll } = require('../lib/tags');

const PORT = 15020;
const memory = new Uint16Array(65536);
function putFloat(addr, v) { const b = Buffer.alloc(4); b.writeFloatBE(v); memory[addr] = b.readUInt16BE(2); memory[addr + 1] = b.readUInt16BE(0); }
function putDint(addr, v) { const b = Buffer.alloc(4); b.writeInt32BE(v); memory[addr] = b.readUInt16BE(2); memory[addr + 1] = b.readUInt16BE(0); }
function putString(addr, s, regs) { for (let i = 0; i < regs; i++) memory[addr + i] = (s.charCodeAt(2 * i + 1) || 0) << 8 | (s.charCodeAt(2 * i) || 0); }

test('reads and decodes from a simulated PLC', async (t) => {
    let requests = 0;
    const server = new ModbusRTU.ServerTCP({
        getHoldingRegister: (addr) => memory[addr],
        getMultipleHoldingRegisters: (addr, len) => { requests++; return Array.from(memory.slice(addr, addr + len)); }
    }, { host: '127.0.0.1', port: PORT, unitID: 1 });
    await new Promise(r => server.on('initialized', r));
    t.after(() => new Promise(r => server.close(r)));

    memory[60200] = 1;
    putFloat(60206, 87.5);
    putString(60210, 'BOB-77812A', 10);
    memory[60222] = 0xFFFF;
    putDint(60238, 1750);
    putFloat(61000, -2.5);

    const conn = new Connection({ host: '127.0.0.1', port: PORT, unitId: 1, timeout: 2000 });
    t.after(() => conn.close());

    const { tags } = parseTags('MW60200 bool run\nMW60206 float vel\nMW60210 string[20] bobina\nMW60222 int prontas\nMW60238 dint rpm\nMW61000 float outro');
    const blocks = planReads(tags, 120);
    assert.strictEqual(blocks.length, 2);

    const values = {};
    await Promise.all(blocks.map(async b => {
        const regs = await conn.readHoldingRegisters(b.start, b.quantity);
        Object.assign(values, decodeAll(b.tags, regs, b.start).values);
    }));
    assert.deepStrictEqual(values, { run: true, vel: 87.5, bobina: 'BOB-77812A', prontas: -1, rpm: 1750, outro: -2.5 });
    assert.strictEqual(requests, 2);
});

test('fails cleanly when the PLC is not there', async () => {
    const conn = new Connection({ host: '127.0.0.1', port: PORT + 1, timeout: 500, reconnectDelay: 60000 });
    await assert.rejects(conn.readHoldingRegisters(0, 1));
    await assert.rejects(conn.readHoldingRegisters(0, 1), /waiting/);
    await conn.close();
});
