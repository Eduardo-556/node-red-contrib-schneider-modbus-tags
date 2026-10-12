'use strict';

const { parseTags, planReads, decodeAll } = require('../lib/tags');

module.exports = function (RED) {
    function SchneiderReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const plc = RED.nodes.getNode(config.plc);
        const opts = {
            lowWordFirst: config.wordOrder !== 'high',
            lowByteFirst: config.byteOrder !== 'high',
            decimals: config.decimals === '' || config.decimals === undefined ? undefined : Number(config.decimals)
        };

        if (!plc) { node.status({ fill: 'red', shape: 'ring', text: 'no PLC configured' }); return; }
        const { tags, errors } = parseTags(config.tags, { model: plc.model });
        if (errors.length) node.warn('Tag list: ' + errors.join('; '));
        if (!tags.length) { node.status({ fill: 'red', shape: 'ring', text: errors[0] || 'no tags' }); return; }

        let blocks;
        try {
            blocks = planReads(tags, plc.maxQuantity);
        } catch (err) {
            node.status({ fill: 'red', shape: 'ring', text: err.message });
            node.error(err.message);
            return;
        }

        let busy = false;
        async function poll(msg, send, done) {
            if (busy) { if (done) done(); return; }
            busy = true;
            try {
                const values = {};
                for (const b of blocks) {
                    const regs = await plc.connection.readHoldingRegisters(b.start, b.quantity);
                    Object.assign(values, decodeAll(b.tags, regs, b.start, opts).values);
                }
                const out = msg || {};
                out.topic = out.topic || config.topic || plc.name || plc.connection.host;
                out.payload = values;
                out.timestamp = Date.now();
                node.status({ fill: 'green', shape: 'dot', text: `${tags.length} tags · ${new Date().toLocaleTimeString()}` });
                send(out);
                if (done) done();
            } catch (err) {
                node.status({ fill: 'red', shape: 'ring', text: err.message });
                if (done) done(err); else node.error(err.message, msg || {});
            } finally {
                busy = false;
            }
        }

        node.status(errors.length
            ? { fill: 'yellow', shape: 'ring', text: `${errors.length} line(s) ignored: ${errors[0]}` }
            : { fill: 'grey', shape: 'ring', text: `${tags.length} tags in ${blocks.length} read(s)` });

        const interval = Number(config.interval) || 0;
        let timer = null;
        if (interval > 0) {
            timer = setInterval(() => poll(null, m => node.send(m)), interval * 1000);
            setTimeout(() => poll(null, m => node.send(m)), 500);
        }

        node.on('input', (msg, send, done) => poll(msg, send || (m => node.send(m)), done));
        node.on('close', () => { if (timer) clearInterval(timer); });
    }
    RED.nodes.registerType('schneider-read', SchneiderReadNode);
};
