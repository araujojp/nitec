'use strict';
class Unsupported { constructor() { throw new Error('Scripts isolados (isolated-vm) não estão disponíveis nesta hospedagem.'); } }
module.exports = { Isolate: Unsupported, Context: Unsupported, Reference: Unsupported, ExternalCopy: Unsupported, Callback: Unsupported, Script: Unsupported, Module: Unsupported };
module.exports.default = module.exports;
