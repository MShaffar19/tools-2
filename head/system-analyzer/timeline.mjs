// Copyright 2020 the V8 project authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

class Timeline {
  // Class:
  _model;
  // Array of #model instances:
  _values;
  // Current selection, subset of #values:
  _selection;
  _uniqueTypes;

  constructor(model) {
    this._model = model;
    this._values = [];
    this.startTime = 0;
    this.endTime = 0;
  }

  get model() {
    return this._model;
  }

  get all() {
    return this._values;
  }

  get selection() {
    return this._selection;
  }

  set selection(value) {
    this._selection = value;
  }

  selectTimeRange(startTime, endTime) {
    this._selection = this.range(startTime, endTime);
  }

  getChunks(windowSizeMs) {
    // TODO(zcankara) Fill this one
    return this.chunkSizes(windowSizeMs);
  }

  get values() {
    // TODO(zcankara) Not to break something delete later
    return this._values;
  }

  count(filter) {
    return this.all.reduce((sum, each) => {
      return sum + (filter(each) === true ? 1 : 0);
    }, 0);
  }

  filter(predicate) {
    return this.all.filter(predicate);
  }

  push(event) {
    let time = event.time;
    if (!this.isEmpty() && this.last().time > time) {
      // Invalid insertion order, might happen without --single-process,
      // finding insertion point.
      let insertionPoint = this.find(time);
      this._values.splice(insertionPoint, event);
    } else {
      this._values.push(event);
    }
    if (time > 0) {
      this.endTime = Math.max(this.endTime, time);
      if (this.startTime === 0) {
        this.startTime = time;
      } else {
        this.startTime = Math.min(this.startTime, time);
      }
    }
  }

  at(index) {
    return this._values[index];
  }

  isEmpty() {
    return this.size() === 0;
  }

  size() {
    return this._values.length;
  }

  get length() {
    return this._values.length;
  }

  first() {
    return this._values[0];
  }

  last() {
    return this._values[this._values.length - 1];
  }

  duration() {
    return this.last().time - this.first().time;
  }

  forEachChunkSize(count, fn) {
    const increment = this.duration() / count;
    let currentTime = this.first().time + increment;
    let index = 0;
    for (let i = 0; i < count; i++) {
      let nextIndex = this.find(currentTime, index);
      let nextTime = currentTime + increment;
      fn(index, nextIndex, currentTime, nextTime);
      index = nextIndex;
      currentTime = nextTime;
    }
  }

  chunkSizes(count) {
    let chunks = [];
    this.forEachChunkSize(count, (start, end) => chunks.push(end - start));
    return chunks;
  }

  chunks(count) {
    let chunks = [];
    this.forEachChunkSize(count, (start, end, startTime, endTime) => {
      let items = this._values.slice(start, end);
      chunks.push(new Chunk(chunks.length, startTime, endTime, items));
    });
    return chunks;
  }

  // Return all entries in ({startTime}, {endTime}]
  range(startTime, endTime) {
    const firstIndex = this.find(startTime);
    if (firstIndex < 0) return [];
    const lastIndex = this.find(endTime, firstIndex + 1);
    return this._values.slice(firstIndex, lastIndex);
  }

  // Return the first index for the first element at {time}.
  find(time, offset = 0) {
    return this._find(this._values, each => each.time - time, offset);
  }

  // Return the first index for which compareFn(item) is >= 0;
  _find(array, compareFn, offset = 0) {
    let minIndex = offset;
    let maxIndex = array.length - 1;
    while (minIndex < maxIndex) {
      const midIndex = minIndex + (((maxIndex - minIndex) / 2) | 0);
      if (compareFn(array[midIndex]) < 0) {
        minIndex = midIndex + 1;
      } else {
        maxIndex = midIndex;
      }
    }
    return minIndex;
  }

  _initializeTypes() {
    const types = new Map();
    let index = 0;
    for (const entry of this.all) {
      let entries = types.get(entry.type);
      if (entries != undefined) {
        entries.push(entry)
      } else {
        entries = [entry];
        entries.index = index++;
        types.set(entry.type, entries)
      }
    }
    return this._uniqueTypes = types;
  }

  get uniqueTypes() {
    return this._uniqueTypes ?? this._initializeTypes();
  }

  depthHistogram() {
    return this._values.histogram(each => each.depth);
  }

  fanOutHistogram() {
    return this._values.histogram(each => each.children.length);
  }

  forEach(fn) {
    return this._values.forEach(fn);
  }
}

// ===========================================================================
class Chunk {
  constructor(index, start, end, items) {
    this.index = index;
    this.start = start;
    this.end = end;
    this.items = items;
    this.height = 0;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  last() {
    return this.at(this.size() - 1);
  }

  first() {
    return this.at(0);
  }

  at(index) {
    return this.items[index];
  }

  size() {
    return this.items.length;
  }

  yOffset(event) {
    // items[0]   == oldest event, displayed at the top of the chunk
    // items[n-1] == youngest event, displayed at the bottom of the chunk
    return (1 - (this.indexOf(event) + 0.5) / this.size()) * this.height;
  }

  indexOf(event) {
    return this.items.indexOf(event);
  }

  has(event) {
    if (this.isEmpty()) return false;
    return this.first().time <= event.time && event.time <= this.last().time;
  }

  next(chunks) {
    return this.findChunk(chunks, 1);
  }

  prev(chunks) {
    return this.findChunk(chunks, -1);
  }

  findChunk(chunks, delta) {
    let i = this.index + delta;
    let chunk = chunks[i];
    while (chunk && chunk.size() === 0) {
      i += delta;
      chunk = chunks[i];
    }
    return chunk;
  }

  getBreakdown(keyFunction) {
    if (this.items.length === 0) return [];
    if (keyFunction === void 0) {
      keyFunction = each => each;
    }
    const typeToindex = new Map();
    const breakdown = [];
    // This is performance critical, resorting to for-loop
    for (let i = 0; i < this.items.length; i++) {
      const each = this.items[i];
      const type = keyFunction(each);
      const index = typeToindex.get(type);
      if (index === void 0) {
        typeToindex.set(type, breakdown.length);
        breakdown.push([type, 0]);
      } else {
        breakdown[index][1]++;
      }
    }
    // Sort by count
    return breakdown.sort((a, b) => a[1] - b[1]);
  }

  filter() {
    return this.items.filter(map => !map.parent() || !this.has(map.parent()));
  }
}

export {Timeline, Chunk};
