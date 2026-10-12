'use strict';

const { parseTags, decodeAll } = require('../lib/tags');

// Decodes a register array already read by another node (for example the
// node-red-contrib-modbus flex getter) using the same tag list as the read node.
module.exports = function (RED) {
    function SchneiderDecodeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const opts = {
            lowWordFirst: config.wordOrder !== 'high',
            lowByteFirst: config.byteOrder !== 'high',
            decimals: config.decimals === '' || config.decimals === undefined ? undefined : Number(config.decimals)
        };
        const { tags, errors } = parseTags(config.tags, { model: config.model });
        if (errors.length) {
            node.warn('Tag list: ' + errors.join('; '));
            node.status({ fill: 'yellow', shape: 'ring', text: `${errors.length} line(s) ignored: ${errors[0]}` });
        }
        const configStart = config.start === '' || config.start === undefined ? undefined : Number(config.start);

        node.on('input', (msg, send, done) => {
            const regs = msg.payload;
            if (!Array.isArray(regs)) { done(new Error('msg.payload must be an array of registers')); return; }
            let start = configStart;
            if (start === undefined) start = msg.modbusRequest && msg.modbusRequest.address;
            if (start === undefined) start = msg.address;
            start = Number(start);
            if (!Number.isInteger(start)) { done(new Error('set the start address in the node or in msg.address')); return; }

            const { values, missing } = decodeAll(tags, regs, start, opts);
            if (missing.length) node.warn('Outside the registers received: ' + missing.join(', '));
            msg.payload = values;
            node.status({ fill: missing.length ? 'yellow' : 'green', shape: 'dot', text: `${Object.keys(values).length}/${tags.length} tags` });
            send(msg);
            done();
        });
    }
    RED.nodes.registerType('schneider-decode', SchneiderDecodeNode);
};
