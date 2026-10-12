'use strict';

const Connection = require('../lib/connection');

module.exports = function (RED) {
    function SchneiderPlcNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.model = config.model || 'M221';
        this.maxQuantity = Number(config.maxQuantity) || 120;
        this.connection = new Connection({
            host: config.host,
            port: config.port,
            unitId: config.unitId,
            timeout: config.timeout,
            reconnectDelay: config.reconnectDelay
        });
        this.on('close', done => { this.connection.close().then(() => done(), () => done()); });
    }
    RED.nodes.registerType('schneider-plc', SchneiderPlcNode);
};
