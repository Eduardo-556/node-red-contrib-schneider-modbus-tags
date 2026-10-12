'use strict';

const ModbusRTU = require('modbus-serial');

// One Modbus TCP connection per config node. Reads are queued so that several
// read nodes can share it, and a failed read drops the socket so the next read
// reconnects.
class Connection {
    constructor({ host, port = 502, unitId = 1, timeout = 3000, reconnectDelay = 5000 }) {
        this.host = host;
        this.port = Number(port) || 502;
        this.unitId = Number(unitId);
        this.timeout = Number(timeout) || 3000;
        this.reconnectDelay = Number(reconnectDelay) || 0;
        this.client = new ModbusRTU();
        this.queue = Promise.resolve();
        this.lastFailure = 0;
        this.closed = false;
    }

    readHoldingRegisters(start, quantity) {
        const job = this.queue.then(() => this._read(start, quantity));
        this.queue = job.catch(() => {});
        return job;
    }

    async _read(start, quantity) {
        if (this.closed) throw new Error('connection closed');
        await this._ensureOpen();
        try {
            const res = await this.client.readHoldingRegisters(start, quantity);
            return res.data;
        } catch (err) {
            this._drop();
            throw err;
        }
    }

    async _ensureOpen() {
        if (this.client.isOpen) return;
        const wait = this.lastFailure + this.reconnectDelay - Date.now();
        if (wait > 0) throw new Error(`waiting ${Math.ceil(wait / 1000)} s to reconnect`);
        try {
            await this.client.connectTCP(this.host, { port: this.port });
            this.client.setID(this.unitId);
            this.client.setTimeout(this.timeout);
        } catch (err) {
            this._drop();
            throw err;
        }
    }

    _drop() {
        this.lastFailure = Date.now();
        try { this.client.close(() => {}); } catch (e) { /* already closed */ }
        this.client = new ModbusRTU();
    }

    close() {
        this.closed = true;
        return new Promise(resolve => {
            if (!this.client.isOpen) return resolve();
            this.client.close(() => resolve());
        });
    }
}

module.exports = Connection;
