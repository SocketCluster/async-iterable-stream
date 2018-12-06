const AsyncIterableStream = require('../index');
const assert = require('assert');

let pendingTimeoutSet = new Set();

function wait(duration) {
  return new Promise((resolve) => {
    let timeout = setTimeout(() => {
      pendingTimeoutSet.clear(timeout);
      resolve();
    }, duration);
    pendingTimeoutSet.add(timeout);
  });
}

function cancelAllPendingWaits() {
  for (let timeout of pendingTimeoutSet) {
    clearTimeout(timeout);
  }
}

class AsyncIterableStreamSubclass extends AsyncIterableStream {
  constructor(dataPromiseList) {
    super();
    this._dataPromiseList = dataPromiseList;
  }

  async next() {
    let value = await this._dataPromiseList[this._dataPromiseList.length - 1];
    return {value, done: !this._dataPromiseList.length};
  }

  async *createAsyncIterator() {
    while (this._dataPromiseList.length) {
      let result = await this._dataPromiseList[this._dataPromiseList.length - 1];
      yield result;
    }
  }
}

describe('AsyncIterableStream', () => {

  describe('AsyncIterableStream abstract class', () => {
    let abstractStream;

    beforeEach(async () => {
      abstractStream = new AsyncIterableStream();
    });

    afterEach(async () => {
      cancelAllPendingWaits();
    });

    it('should throw error if createAsyncIterator() is invoked directly on the abstract class', async () => {
      let result;
      let error;
      try {
        result = abstractStream.createAsyncIterator();
      } catch (err) {
        error = err;
      }
      assert.equal(error.name, 'TypeError');
      assert.equal(error.message, 'Method must be overriden by subclass');
    });
  });

  describe('AsyncIterableStream subclass', () => {
    let streamData;
    let stream;

    beforeEach(async () => {
      streamData = [...Array(10).keys()]
      .map(async (value, index) => {
        await wait(10 * (index + 1));
        streamData.pop();
        return value;
      })
      .reverse();

      stream = new AsyncIterableStreamSubclass(streamData);
    });

    afterEach(async () => {
      cancelAllPendingWaits();
    });

    it('should receive packets asynchronously', async () => {
      let receivedPackets = [];
      for await (let packet of stream) {
        receivedPackets.push(packet);
      }
      assert.equal(receivedPackets.length, 10);
      assert.equal(receivedPackets[0], 0);
      assert.equal(receivedPackets[1], 1);
      assert.equal(receivedPackets[9], 9);
    });

    it('should receive packets asynchronously from multiple concurrent for-await-of loops', async () => {
      let receivedPacketsA = [];
      let receivedPacketsB = [];

      await Promise.all([
        (async () => {
          for await (let packet of stream) {
            receivedPacketsA.push(packet);
          }
        })(),
        (async () => {
          for await (let packet of stream) {
            receivedPacketsB.push(packet);
          }
        })()
      ]);

      assert.equal(receivedPacketsA.length, 10);
      assert.equal(receivedPacketsA[0], 0);
      assert.equal(receivedPacketsA[1], 1);
      assert.equal(receivedPacketsA[9], 9);
    });

    it('should receive next packet asynchronously when once() method is used', async () => {
      let nextPacket = await stream.once();
      assert.equal(nextPacket, 0);

      nextPacket = await stream.once();
      assert.equal(nextPacket, 1);

      nextPacket = await stream.once();
      assert.equal(nextPacket, 2);
    });
  });
});
