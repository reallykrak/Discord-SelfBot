if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {
    constructor(chunks, filename, options = {}) {
      this.name = filename;
      this.size = 0;
      this.type = options.type || '';
      this.lastModified = options.lastModified || Date.now();
      this.webkitRelativePath = '';
      
      if (Array.isArray(chunks)) {
        this.size = chunks.reduce((acc, chunk) => acc + (chunk.length || 0), 0);
      }
    }
    
    slice(start, end, contentType) {
      return new File([], this.name, {
        type: contentType || this.type,
        lastModified: this.lastModified
      });
    }
    
    stream() {
      return new ReadableStream({
        start(controller) {
          controller.close();
        }
      });
    }
    
    text() {
      return Promise.resolve('');
    }
    
    arrayBuffer() {
      return Promise.resolve(new ArrayBuffer(0));
    }
  };
}

if (typeof globalThis.Blob === 'undefined') {
  globalThis.Blob = class Blob {
    constructor(chunks = [], options = {}) {
      this.size = 0;
      this.type = options.type || '';
      
      if (Array.isArray(chunks)) {
        this.size = chunks.reduce((acc, chunk) => acc + (chunk.length || 0), 0);
      }
    }
    
    slice(start, end, contentType) {
      return new Blob([], {
        type: contentType || this.type
      });
    }
    
    stream() {
      return new ReadableStream({
        start(controller) {
          controller.close();
        }
      });
    }
    
    text() {
      return Promise.resolve('');
    }
    
    arrayBuffer() {
      return Promise.resolve(new ArrayBuffer(0));
    }
  };
}
