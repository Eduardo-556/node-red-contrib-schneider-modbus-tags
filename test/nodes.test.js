'use strict';
// Needs the dev dependencies: npm install, then npm run test:nodes
const test = require('node:test');
const assert = require('node:assert');
const helper = require('node-red-node-test-helper');
const ModbusRTU = require('modbus-serial');
const PKG = '..';
const plcNode = require(PKG + '/nodes/plc.js');
const readNode = require(PKG + '/nodes/read.js');
const decodeNode = require(PKG + '/nodes/decode.js');

helper.init(require.resolve('node-red'));
const PORT = 15030;
const mem = new Uint16Array(65536);
const b = Buffer.alloc(4); b.writeFloatBE(87.5); mem[100] = b.readUInt16BE(2); mem[101] = b.readUInt16BE(0);
mem[102] = 'A'.charCodeAt(0) | ('B'.charCodeAt(0) << 8); mem[103] = 'C'.charCodeAt(0);
mem[104] = 1;

let server;
test.before(async () => {
    server = new ModbusRTU.ServerTCP({ getMultipleHoldingRegisters: (a, l) => Array.from(mem.slice(a, a + l)), getHoldingRegister: a => mem[a] },
        { host: '127.0.0.1', port: PORT, unitID: 1 });
    await new Promise(r => server.on('initialized', r));
    await new Promise(r => helper.startServer(r));
});
test.after(async () => { await new Promise(r => server.close(r)); await new Promise(r => helper.stopServer(r)); });
test.afterEach(() => helper.unload());

const TAGS = 'MW100 float vel\nMW102 string[4] lote\nMW104 bool run';

test('read node sends decoded values on input', async () => {
    const flow = [
        { id: 'p', type: 'schneider-plc', host: '127.0.0.1', port: PORT, unitId: 1, timeout: 2000, reconnectDelay: 1000, maxQuantity: 120 },
        { id: 'r', type: 'schneider-read', plc: 'p', tags: TAGS, interval: 0, wordOrder: 'low', byteOrder: 'low', decimals: '', wires: [['h']] },
        { id: 'h', type: 'helper' }
    ];
    await helper.load([plcNode, readNode], flow);
    const got = new Promise(r => helper.getNode('h').on('input', r));
    helper.getNode('r').receive({ payload: 'go' });
    const msg = await got;
    assert.deepStrictEqual(msg.payload, { vel: 87.5, lote: 'ABC', run: true });
});

test('read node polls on its own interval', async () => {
    const flow = [
        { id: 'p', type: 'schneider-plc', host: '127.0.0.1', port: PORT, unitId: 1 },
        { id: 'r', type: 'schneider-read', plc: 'p', tags: TAGS, interval: 1, wires: [['h']] },
        { id: 'h', type: 'helper' }
    ];
    await helper.load([plcNode, readNode], flow);
    const msg = await new Promise(r => helper.getNode('h').on('input', r));
    assert.strictEqual(msg.payload.vel, 87.5);
});

test('decode node works on a flex-getter style array', async () => {
    const flow = [
        { id: 'd', type: 'schneider-decode', start: '', tags: TAGS, wires: [['h']] },
        { id: 'h', type: 'helper' }
    ];
    await helper.load([decodeNode], flow);
    const got = new Promise(r => helper.getNode('h').on('input', r));
    helper.getNode('d').receive({ payload: Array.from(mem.slice(100, 105)), modbusRequest: { address: 100 } });
    const msg = await got;
    assert.deepStrictEqual(msg.payload, { vel: 87.5, lote: 'ABC', run: true });
});

test('read node reports an error when the PLC is offline', async () => {
    const flow = [
        { id: 'p', type: 'schneider-plc', host: '127.0.0.1', port: PORT + 1, unitId: 1, timeout: 500 },
        { id: 'r', type: 'schneider-read', plc: 'p', tags: TAGS, interval: 0, wires: [['h']] },
        { id: 'c', type: 'catch', scope: null, wires: [['h']] },
        { id: 'h', type: 'helper' }
    ];
    const catchNode = require('@node-red/nodes/core/common/25-catch.js');
    await helper.load([plcNode, readNode, catchNode], flow);
    const got = new Promise(r => helper.getNode('h').on('input', r));
    helper.getNode('r').receive({ payload: 'go' });
    const msg = await got;
    assert.ok(msg.error, 'catch node got the error');
});
