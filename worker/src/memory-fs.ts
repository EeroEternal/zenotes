import { fs as memfs } from 'memfs';
import { promisify } from 'util';

export class MemoryFS {
  public fs: typeof memfs;
  public promises: any;

  constructor() {
    this.fs = memfs;
    this.promises = {
      readFile: promisify(memfs.readFile.bind(memfs)),
      writeFile: promisify(memfs.writeFile.bind(memfs)),
      readdir: promisify(memfs.readdir.bind(memfs)),
      mkdir: promisify(memfs.mkdir.bind(memfs)),
      rmdir: promisify(memfs.rmdir.bind(memfs)),
      stat: promisify(memfs.stat.bind(memfs)),
      unlink: promisify(memfs.unlink.bind(memfs)),
      lstat: promisify(memfs.lstat.bind(memfs)),
      readlink: promisify(memfs.readlink.bind(memfs)),
      symlink: promisify(memfs.symlink.bind(memfs)),
    };
  }

  // isomorphic-git expects these on the fs object itself for some versions,
  // or via the promises property.
  readFile(...args: any[]) { return (this.fs.readFile as any)(...args); }
  writeFile(...args: any[]) { return (this.fs.writeFile as any)(...args); }
  readdir(...args: any[]) { return (this.fs.readdir as any)(...args); }
  mkdir(...args: any[]) { return (this.fs.mkdir as any)(...args); }
  rmdir(...args: any[]) { return (this.fs.rmdir as any)(...args); }
  stat(...args: any[]) { return (this.fs.stat as any)(...args); }
  unlink(...args: any[]) { return (this.fs.unlink as any)(...args); }
  lstat(...args: any[]) { return (this.fs.lstat as any)(...args); }
  readlink(...args: any[]) { return (this.fs.readlink as any)(...args); }
  symlink(...args: any[]) { return (this.fs.symlink as any)(...args); }
}
