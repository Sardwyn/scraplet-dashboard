import { E as EventEmitter, u as uid, a as Bounds } from "./LeaferGraphicCore-34oWQc8w.js";
var BufferUsage = /* @__PURE__ */ ((BufferUsage2) => {
  BufferUsage2[BufferUsage2["MAP_READ"] = 1] = "MAP_READ";
  BufferUsage2[BufferUsage2["MAP_WRITE"] = 2] = "MAP_WRITE";
  BufferUsage2[BufferUsage2["COPY_SRC"] = 4] = "COPY_SRC";
  BufferUsage2[BufferUsage2["COPY_DST"] = 8] = "COPY_DST";
  BufferUsage2[BufferUsage2["INDEX"] = 16] = "INDEX";
  BufferUsage2[BufferUsage2["VERTEX"] = 32] = "VERTEX";
  BufferUsage2[BufferUsage2["UNIFORM"] = 64] = "UNIFORM";
  BufferUsage2[BufferUsage2["STORAGE"] = 128] = "STORAGE";
  BufferUsage2[BufferUsage2["INDIRECT"] = 256] = "INDIRECT";
  BufferUsage2[BufferUsage2["QUERY_RESOLVE"] = 512] = "QUERY_RESOLVE";
  BufferUsage2[BufferUsage2["STATIC"] = 1024] = "STATIC";
  return BufferUsage2;
})(BufferUsage || {});
class Buffer extends EventEmitter {
  /**
   * Creates a new Buffer with the given options
   * @param options - the options for the buffer
   */
  constructor(options) {
    let { data, size } = options;
    const { usage, label, shrinkToFit } = options;
    super();
    this._gpuData = /* @__PURE__ */ Object.create(null);
    this._gcLastUsed = -1;
    this.autoGarbageCollect = true;
    this.uid = uid("buffer");
    this._resourceType = "buffer";
    this._resourceId = uid("resource");
    this._touched = 0;
    this._updateID = 1;
    this._dataInt32 = null;
    this.shrinkToFit = true;
    this.destroyed = false;
    if (data instanceof Array) {
      data = new Float32Array(data);
    }
    this._data = data;
    size ?? (size = data?.byteLength);
    const mappedAtCreation = !!data;
    this.descriptor = {
      size,
      usage,
      mappedAtCreation,
      label
    };
    this.shrinkToFit = shrinkToFit ?? true;
  }
  /** the data in the buffer */
  get data() {
    return this._data;
  }
  set data(value) {
    this.setDataWithSize(value, value.length, true);
  }
  get dataInt32() {
    if (!this._dataInt32) {
      this._dataInt32 = new Int32Array(this.data.buffer);
    }
    return this._dataInt32;
  }
  /** whether the buffer is static or not */
  get static() {
    return !!(this.descriptor.usage & BufferUsage.STATIC);
  }
  set static(value) {
    if (value) {
      this.descriptor.usage |= BufferUsage.STATIC;
    } else {
      this.descriptor.usage &= ~BufferUsage.STATIC;
    }
  }
  /**
   * Sets the data in the buffer to the given value. This will immediately update the buffer on the GPU.
   * If you only want to update a subset of the buffer, you can pass in the size of the data.
   * @param value - the data to set
   * @param size - the size of the data in bytes
   * @param syncGPU - should the buffer be updated on the GPU immediately?
   */
  setDataWithSize(value, size, syncGPU) {
    this._updateID++;
    this._updateSize = size * value.BYTES_PER_ELEMENT;
    if (this._data === value) {
      if (syncGPU) this.emit("update", this);
      return;
    }
    const oldData = this._data;
    this._data = value;
    this._dataInt32 = null;
    if (!oldData || oldData.length !== value.length) {
      if (!this.shrinkToFit && oldData && value.byteLength < oldData.byteLength) {
        if (syncGPU) this.emit("update", this);
      } else {
        this.descriptor.size = value.byteLength;
        this._resourceId = uid("resource");
        this.emit("change", this);
      }
      return;
    }
    if (syncGPU) this.emit("update", this);
  }
  /**
   * updates the buffer on the GPU to reflect the data in the buffer.
   * By default it will update the entire buffer. If you only want to update a subset of the buffer,
   * you can pass in the size of the buffer to update.
   * @param sizeInBytes - the new size of the buffer in bytes
   */
  update(sizeInBytes) {
    this._updateSize = sizeInBytes ?? this._updateSize;
    this._updateID++;
    this.emit("update", this);
  }
  /** Unloads the buffer from the GPU */
  unload() {
    this.emit("unload", this);
    for (const key in this._gpuData) {
      this._gpuData[key]?.destroy();
    }
    this._gpuData = /* @__PURE__ */ Object.create(null);
  }
  /** Destroys the buffer */
  destroy() {
    this.destroyed = true;
    this.unload();
    this.emit("destroy", this);
    this.emit("change", this);
    this._data = null;
    this.descriptor = null;
    this.removeAllListeners();
  }
}
function ensureIsBuffer(buffer, index) {
  if (!(buffer instanceof Buffer)) {
    let usage = index ? BufferUsage.INDEX : BufferUsage.VERTEX;
    if (buffer instanceof Array) {
      if (index) {
        buffer = new Uint32Array(buffer);
        usage = BufferUsage.INDEX | BufferUsage.COPY_DST;
      } else {
        buffer = new Float32Array(buffer);
        usage = BufferUsage.VERTEX | BufferUsage.COPY_DST;
      }
    }
    buffer = new Buffer({
      data: buffer,
      label: index ? "index-mesh-buffer" : "vertex-mesh-buffer",
      usage
    });
  }
  return buffer;
}
function getGeometryBounds(geometry, attributeId, bounds) {
  const attribute = geometry.getAttribute(attributeId);
  if (!attribute) {
    bounds.minX = 0;
    bounds.minY = 0;
    bounds.maxX = 0;
    bounds.maxY = 0;
    return bounds;
  }
  const data = attribute.buffer.data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const byteSize = data.BYTES_PER_ELEMENT;
  const offset = (attribute.offset || 0) / byteSize;
  const stride = (attribute.stride || 2 * 4) / byteSize;
  for (let i = offset; i < data.length; i += stride) {
    const x = data[i];
    const y = data[i + 1];
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
  }
  bounds.minX = minX;
  bounds.minY = minY;
  bounds.maxX = maxX;
  bounds.maxY = maxY;
  return bounds;
}
function ensureIsAttribute(attribute) {
  if (attribute instanceof Buffer || Array.isArray(attribute) || attribute.BYTES_PER_ELEMENT) {
    attribute = {
      buffer: attribute
    };
  }
  attribute.buffer = ensureIsBuffer(attribute.buffer, false);
  return attribute;
}
class Geometry extends EventEmitter {
  /**
   * Create a new instance of a geometry
   * @param options - The options for the geometry.
   */
  constructor(options = {}) {
    super();
    this._gpuData = /* @__PURE__ */ Object.create(null);
    this.autoGarbageCollect = true;
    this._gcLastUsed = -1;
    this.uid = uid("geometry");
    this._layoutKey = 0;
    this.instanceCount = 1;
    this._bounds = new Bounds();
    this._boundsDirty = true;
    const { attributes, indexBuffer, topology } = options;
    this.buffers = [];
    this.attributes = {};
    if (attributes) {
      for (const i in attributes) {
        this.addAttribute(i, attributes[i]);
      }
    }
    this.instanceCount = options.instanceCount ?? 1;
    if (indexBuffer) {
      this.addIndex(indexBuffer);
    }
    this.topology = topology || "triangle-list";
  }
  onBufferUpdate() {
    this._boundsDirty = true;
    this.emit("update", this);
  }
  /**
   * Returns the requested attribute.
   * @param id - The name of the attribute required
   * @returns - The attribute requested.
   */
  getAttribute(id) {
    return this.attributes[id];
  }
  /**
   * Returns the index buffer
   * @returns - The index buffer.
   */
  getIndex() {
    return this.indexBuffer;
  }
  /**
   * Returns the requested buffer.
   * @param id - The name of the buffer required.
   * @returns - The buffer requested.
   */
  getBuffer(id) {
    return this.getAttribute(id).buffer;
  }
  /**
   * Used to figure out how many vertices there are in this geometry
   * @returns the number of vertices in the geometry
   */
  getSize() {
    for (const i in this.attributes) {
      const attribute = this.attributes[i];
      const buffer = attribute.buffer;
      return buffer.data.length / (attribute.stride / 4 || attribute.size);
    }
    return 0;
  }
  /**
   * Adds an attribute to the geometry.
   * @param name - The name of the attribute to add.
   * @param attributeOption - The attribute option to add.
   */
  addAttribute(name, attributeOption) {
    const attribute = ensureIsAttribute(attributeOption);
    const bufferIndex = this.buffers.indexOf(attribute.buffer);
    if (bufferIndex === -1) {
      this.buffers.push(attribute.buffer);
      attribute.buffer.on("update", this.onBufferUpdate, this);
      attribute.buffer.on("change", this.onBufferUpdate, this);
    }
    this.attributes[name] = attribute;
  }
  /**
   * Adds an index buffer to the geometry.
   * @param indexBuffer - The index buffer to add. Can be a Buffer, TypedArray, or an array of numbers.
   */
  addIndex(indexBuffer) {
    this.indexBuffer = ensureIsBuffer(indexBuffer, true);
    this.buffers.push(this.indexBuffer);
  }
  /** Returns the bounds of the geometry. */
  get bounds() {
    if (!this._boundsDirty) return this._bounds;
    this._boundsDirty = false;
    return getGeometryBounds(this, "aPosition", this._bounds);
  }
  /** Unloads the geometry from the GPU. */
  unload() {
    this.emit("unload", this);
    for (const key in this._gpuData) {
      this._gpuData[key]?.destroy();
    }
    this._gpuData = /* @__PURE__ */ Object.create(null);
  }
  /**
   * destroys the geometry.
   * @param destroyBuffers - destroy the buffers associated with this geometry
   */
  destroy(destroyBuffers = false) {
    this.emit("destroy", this);
    this.removeAllListeners();
    if (destroyBuffers) {
      this.buffers.forEach((buffer) => buffer.destroy());
    }
    this.unload();
    this.indexBuffer?.destroy();
    this.attributes = null;
    this.buffers = null;
    this.indexBuffer = null;
    this._bounds = null;
  }
}
export {
  Buffer as B,
  Geometry as G,
  BufferUsage as a
};
//# sourceMappingURL=Geometry-CmNk7Wpu.js.map
