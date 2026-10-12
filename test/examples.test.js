'use strict';

// Same check as the flows.nodered.org scorecard: every non-config node is used in an example.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

test('every node appears in an example flow', () => {
    const dir = path.join(__dirname, '..', 'examples');
    const used = new Set();
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
        for (const n of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) used.add(n.type);
    }
    const configNodes = ['schneider-plc'];
    for (const type of Object.keys(pkg['node-red'].nodes).filter(t => !configNodes.includes(t))) {
        assert.ok(used.has(type), `${type} has no example`);
    }
});
