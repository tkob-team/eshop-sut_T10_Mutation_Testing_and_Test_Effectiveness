// Load server.js without opening a port: capture the Express app passed to listen().
const express = require('express');

function loadApp() {
  let captured;
  const spy = jest.spyOn(express.application, 'listen').mockImplementation(function () {
    captured = this;
    return { close() {} };
  });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  require('../server');
  spy.mockRestore();
  log.mockRestore();
  return captured;
}

// Fake only Date (not timers) so supertest/sqlite callbacks keep running.
const DONT_FAKE = ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'];
const freezeClock = (iso) => jest.useFakeTimers({ now: Date.parse(iso), doNotFake: DONT_FAKE });
const advanceClock = (ms) => jest.setSystemTime(Date.now() + ms);

module.exports = { loadApp, freezeClock, advanceClock };
