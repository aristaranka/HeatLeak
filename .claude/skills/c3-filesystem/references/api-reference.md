# C3 FileSystem & File API Reference

Detailed API reference for file system operations. For common operations, see the main [SKILL.md](../SKILL.md).

For Content-level operations (read/write methods, compression, transcoding, streams, grep), refer to the C3 `Content` API documentation.

---

## FileSystem Factory Methods

```javascript
var fs = FileSystem.inst(); // default file system
var s3 = FileSystem.s3(); // S3
var gcs = FileSystem.gcs(); // GCS
var azure = FileSystem.azure(); // Azure (use this instead of adl())
var local = FileSystem.local(); // local
var tmp = FileSystem.tmp(); // temp
var c3fs = FileSystem.c3(); // C3 FS

var fs = FileSystem.fromScheme('s3');
var fs = FileSystem.fromUrlOrEncodedPath('s3://bucket/path/file.csv');

FileSystem.inst().type().name(); // check default FS type name
```

### FileSystem Type Checks

```javascript
fs.isS3(); // boolean
fs.asS3(); // S3FileSystem or null
fs.isAzure(); // boolean
fs.asAzure(); // AzureFileSystem or null
fs.isGcs(); // boolean
fs.asGcs(); // GcsFileSystem or null
```

## Open File (Read Metadata)

```javascript
var file = FileSystem.openFile(file); // returns null if missing
var file = FileSystem.openFile(file, FileOperationSpec.make({ failIfMissing: true }));
var files = FileSystem.openFiles([file1, file2]); // batch, null elements if missing
```

## Read C3 Objects by Prefix

```javascript
FileSystem.readObjs('path/prefix/', FileObjsOperSpec.make({ serType: MyType }));
```

## Create File / Directory

```javascript
FileSystem.createFile(file); // truncates if exists
C3.File.createFile('path/to/file.txt', Bin.wrap('hello'), 'text/plain', null);
FileSystem.createDir('path/to/dir/');
```

## List Files — Advanced

### Glob Filtering

**IMPORTANT:** `limit=-1` lists all files and can be very expensive. Always warn the user and get confirmation before using it.

```javascript
var result = FileSystem.listFiles('path/', -1, null, false, ListFilesOperationSpec.make({ globPattern: '*.csv' }));
```

### Direct Children / Directories (One Level)

```javascript
var result = FileSystem.listDirectChildren('path/');
result.files; // direct child files
result.dirs; // direct child directory paths
```

### Stream-Based Listing

**IMPORTANT:** `limit=-1` streams all files and can be very expensive. Always warn the user and get confirmation before using it.

```javascript
var fileStream = FileSystem.listFilesStream('path/', 100);
var dirStream = FileSystem.listDirsStream('path/', 100);
```

### Count and Emptiness

```javascript
FileSystem.countFiles('path/');
FileSystem.isPathEmpty('path/');
```

## Delete — Bulk Operations

**IMPORTANT:** Always prompt the user for confirmation before executing `deleteFiles` (requires `confirm=true`).

```javascript
FileSystem.deleteFiles('path/prefix/', true); // by prefix (confirm=true required)
FileSystem.deleteFilesBatch([file1, file2]); // batch

FileSystem.deleteFiles(
  'path/',
  true,
  DeleteFileOperationSpec.make({
    forceBreakLock: true,
    deleteSnapshots: true,
  })
);
```

## File Metadata — Full Reference

```javascript
file.url; // 's3://bucket/path/file.csv'
file.contentType; // 'text/csv'
file.contentEncoding; // 'gzip' or null
file.contentLength; // size in bytes
file.lastModified; // datetime
file.eTag; // ETag string
```

### Name Helpers

```javascript
file.fileName(); // 'file.csv'
file.fileNameNoExt(); // 'file'
file.fileExt(); // '.csv' (with dot)
file.fileExtWithoutDot(); // 'csv'
file.hasFileExt('csv'); // true (case-insensitive, dot optional)
file.directoryUrl(); // parent directory URL
file.parentDirectories(); // [string] list of parent dir names
file.isHidden(); // true if starts with '.'
```

### Content Type Checks

```javascript
file.isJson();
file.isCsv();
file.isXml();
file.isText();
file.isParquet();
file.isAvro();
file.safeContentType(); // never null (guesses from extension)
file.safeContentEncoding();
```

### File Type Checks

```javascript
file.isS3File(); // boolean
file.asS3File(); // S3File or null
file.isAzureFile(); // boolean
file.asAzureFile(); // AzureFile or null
file.isZipFile(); // boolean
file.asZipFile(); // ZipFile or null
```

## Mount Management

### Query Mounts

```javascript
var allMounts = FileSystem.mounts();
var url = FileSystem.urlFromMount('data-load');
var url = FileSystem.urlFromMountAndPath('DEFAULT', 'my-dir', 'file.txt');
var url = FileSystem.urlFromMountAndRelativeEncodedPath('DEFAULT', '/my-dir/my-file.txt');
```

### Add / Remove Mounts

```javascript
var fs = FileSystem.fromUrlOrEncodedPath('s3://bucket/path/');
fs.setMount('my-data', 's3://bucket/path/', 'APP');
fs.mounts(); // confirm mount was set — display result to user as a structured table

fs.removeMount('my-data', 'APP');
fs.mounts(); // confirm mount was removed — display result to user as a structured table
```

### Truncate a Mount

**IMPORTANT:** Always prompt the user for confirmation before executing `truncateMount` (requires `confirm=true`).

```javascript
FileSystem.truncateMount('data-load', true); // deletes ALL files, returns count
```

---

## File-Specific Compression & Archives

For general compression/uncompress operations, refer to the C3 `Content` API documentation. File adds zip-specific methods:

```javascript
file.zip(); // create zip from file
FileSystem.zipFiles('out.zip', [f1, f2]);
file.unzip('extract/root/'); // extract all entries
file.unzipFirst('extract/root/'); // extract first entry only
```

## Presigned URLs

```javascript
var url = file.generatePresignedUrl('GET', '1h');
var url = file.generatePresignedUrl('PUT', '30m');
var url = FileSystem.generatePresignedUrl('path/to/file.csv', 'GET', '2h');
```

## File Locking

```javascript
file.isLocked();
file.breakLock();
FileSystem.isFileLocked(file);
FileSystem.breakLockOnFile(file);
```

## Cached File Access

```javascript
var localFile = file.cachedFile();

var file = FileSystem.openFile(
  file,
  FileOperationSpec.make({
    cacheUrlOrEncodedPath: 'cache/prefix/',
    cacheTtlSec: 3600,
  })
);
```

## Batch / Distributed Operations

```javascript
// Per-file lambda (distributed)
FileSystem.eachFile('path/', Lambda.make({
    typeName: 'MyType', methodName: 'processFile'
}), BatchFileOperationSpec.make({ batchSize: 100 }))

// Per-batch lambda (distributed)
FileSystem.eachFileBatch('path/', Lambda.make({
    typeName: 'MyType', methodName: 'processFiles'
}), BatchFileOperationSpec.make({ batchSize: 50 }))

// Map-reduce over files
FileSystem.mapReduceFiles('path/', mapperLambda, reducerLambda, MapReduceFilesOptions.make({ ... }))
```

## URL Construction

**IMPORTANT:** Any operation involving a URL or path expects **encoded** paths. If a path is not encoded, use `UrlPath.encode(path)` before passing it to URL or path-taking APIs.

```javascript
var encodedPath = UrlPath.encode('path/with spaces & special.txt');
```

```javascript
FileSystem.rootUrl();
FileSystem.urlFromEncodedPath('rel/path');
FileSystem.urlFromMount('DEFAULT');
FileSystem.urlFromMountAndPath('DEFAULT', 'dir', 'file.txt');
FileSystem.urlFromMountAndRelativeEncodedPath('DEFAULT', '/my-dir/my-file.txt');
FileSystem.urlFromHostAndPath('my-bucket', 'path/to/file.txt');
```

## URL Validation

```javascript
FileSystem.isValidUrl('s3://bucket/path');
FileSystem.validateUrl('s3://bucket/path'); // throws if invalid
```

## URL Parsing

```javascript
FileSystem.parseUrlOrEncodedPath('path'); // FileUrl
file.parseUrl(); // Url
FileSystem.mountUrlAndEncodedPathFromUrl(url, true); // Pair<mountUrl, encodedPath>
FileSystem.mountFromUrl(url, true); // mount name string
```

## Path Checks

```javascript
FileSystem.isPathDirectory('some/path/');
file.isChildOf('s3://bucket/parent/');
```

## Mount Properties (ACL, Read-Only)

```javascript
FileSystem.isAclEnabled('/');
FileSystem.isReadOnly('data-load');
```

### Mount Config Access

```javascript
var config = FileSystem.fileSystemConfig(false); // false = no secrets
var childConfig = config.childConfig('s3');
childConfig.mounts; // map<string, string>
childConfig.readOnlyMounts; // set<string>
childConfig.aclEnabledMounts; // set<string>
```

### Enable / Disable ACL and Read-Only

```javascript
childConfig.enableAcl('/', 'APP');
childConfig.disableAcl('/', 'APP');
childConfig.setReadOnly('data-load', 'APP');
childConfig.unsetReadOnly('data-load', 'APP');
```

### Change Default FileSystem

```javascript
FileSystem.fileSystemConfig(false).setDefault('s3', 'APP');
FileSystem.s3().makeDefault('APP');
```

### Mount URL Templates

Mount URLs support variable substitution:

```
{ "/":      "s3://c3--${cluster}-${env}/fs/${app}/" }
{ "public": "s3://c3--${cluster}-public/" }
```

### Additional Pre-defined Mounts

| Mount Name    | Purpose                           |
| ------------- | --------------------------------- |
| `'artifact'`  | C3 artifacts (shared across pods) |
| `'key-value'` | KvStore.FileSystem                |
| `'vault'`     | Secrets                           |
| `'telemetry'` | Metrics collected in the cluster  |
| `'system'`    | System jobs (e.g. MapReduce)      |

## Detect File Changes

```javascript
var changes = FileSystem.listChanges('path/', lastSeenMap);
changes.added; // new files
changes.modified; // changed files
changes.removed; // deleted files
```

## File Touch and Truncate

```javascript
file.touch(); // update access/modification times
file.truncate(); // make file empty
```

## File API Endpoint

```javascript
file.apiEndpoint('GET', true); // fully qualified endpoint for download
file.apiEndpoint('PUT', true); // fully qualified endpoint for upload
```

## File Existence and Child Check

```javascript
file.exists(); // boolean
file.isChildOf('s3://bucket/parent/'); // boolean
```
