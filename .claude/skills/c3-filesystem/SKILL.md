---
name: c3-filesystem
description: |
  Perform file system operations in C3 AI Platform including listing files/directories, creating file instances, reading/writing files, copying/moving files, deleting files, managing mounts, and uploading/downloading files between local and remote.
core: true
category: platform
version: 8.9.0
minimumVersion: 8.7.0
metadata:
  dependencies:
    - c3-data-ingestion
---

# C3 Filesystem Operations

Work with files and directories in C3 AI Platform using `FileSystem` and `File` APIs.

`File` extends `Content` — for read/write/compression operations that apply to any content, refer to the C3 `Content` API documentation.

## Quick Reference

| Operation  | JavaScript                             | Python                                    |
| ---------- | -------------------------------------- | ----------------------------------------- |
| Default FS | `FileSystem.inst()`                    | `c3.FileSystem.inst()`                    |
| S3 FS      | `FileSystem.s3()`                      | `c3.FileSystem.s3()`                      |
| GCS FS     | `FileSystem.gcs()`                     | `c3.FileSystem.gcs()`                     |
| AZURE FS   | `FileSystem.azure()`                   | `c3.FileSystem.azure()`                   |
| List files | `FileSystem.listFiles(path)`           | `c3.FileSystem.listFiles(path)`           |
| List dirs  | `FileSystem.listDirsStream(mount, -1)` | `c3.FileSystem.listDirsStream(mount, -1)` |
| Make file  | `FileSystem.makeFile(name)`            | `c3.FileSystem.makeFile(name)`            |
| Read       | `file.readString(start, len)`          | `file.readString(start, len)`             |
| Write      | `file.writeString(content)`            | `file.writeString(content)`               |
| Copy       | `file.copy(destUrl)`                   | `file.copy(destUrl)`                      |
| Move       | `file.move(destUrl)`                   | `file.move(destUrl)`                      |
| Delete     | `file.delete()`                        | `file.delete()`                           |

Note: `File` is a reserved JavaScript keyword — prefix with `C3.` when used in JS (e.g., `C3.File.make(url)`).

**Paths and URLs:** Any operation that takes a path or URL (e.g. `listFiles`, `makeFile`, `copy`, `move`, mount paths) **must use encoded paths**. If the path is not already encoded, encode it with `UrlPath.encode(path)` before passing it to the API.

## Getting a FileSystem Instance

When asked to perform file system operations on a specific bucket, first ask the user which file system type it is (S3, GCS, Azure, etc.), then use the appropriate factory method. **Note:** If a bucket is ever inferred as ADL, always use Azure instead (`FileSystem.azure()`). Do not use `FileSystem.adl()`.

```javascript
var fs = FileSystem.inst(); // default
var s3 = FileSystem.s3(); // specific FS by type
```

For all FS factory methods (`gcs()`, `local()`, `tmp()`, `c3()`, `fromScheme()`, `fromUrlOrEncodedPath()`), see [references/filesystem-api-reference.md](references/filesystem-api-reference.md).

## List Files and Directories

### List Files

**IMPORTANT:** Using `limit=-1` with `listFiles` can be very expensive on large directories and is almost always the wrong choice. **Do NOT suggest or mention `limit=-1` as an option.** If the user needs more than the default 100 files, use `result.nextMarker` for pagination or suggest an explicit reasonable limit (e.g., 200 or 500).

When you don't specify a limit, the default is **100 files**. Whenever you display listed files, warn the user that there may be more than what is shown when using the default limit; use `result.nextMarker` for pagination or pass an explicit limit if they need more.

When listing files for a specific bucket, get the FS instance first, build the full URL with `urlFromHostAndPath`, then call `listFiles`. If the user provides a full path (e.g., `s3://bucket/path/`), call `fs.listFiles(path)` directly:

```javascript
var fs = FileSystem.s3();
var url = fs.urlFromHostAndPath('bucket_name', '');
var result = fs.listFiles(url);
result.files; // [File]
result.nextMarker; // for pagination
```

```python
fs = c3.FileSystem.s3()
url = fs.urlFromHostAndPath('bucket_name', '')
result = fs.listFiles(url)
[r for r in result.files]
```

For glob filtering, stream-based listing, `listDirectChildren`, `countFiles`, and `isPathEmpty`, see [references/filesystem-api-reference.md](references/filesystem-api-reference.md).

### List Directories

```javascript
var dataLoadMount = FileSystem.mounts().get('data-load');
var stream = FileSystem.listDirsStream(dataLoadMount, -1);
var directories = stream.collect();
```

```python
dataLoadMount = c3.FileSystem.mounts()['data-load']
stream = c3.FileSystem.listDirsStream(dataLoadMount, -1)
directories = stream.collect()
```

## Create File Instance

`makeFile` creates a `File` instance in memory (no I/O).

```javascript
var file = FileSystem.makeFile('my-file.txt');
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
```

Optionally pass content type: `FileSystem.makeFile('data.csv', 'text/csv', null)`. Also available: `File.fromString('s3://bucket/path/file.json')`.

## Read and Write Files

`File` inherits all read/write methods from `Content`. For the full reference, refer to the C3 `Content` API documentation.

```javascript
var file = FileSystem.makeFile('my-file.txt');
var content = file.readString();
file.writeString('hello world');
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
content = file.readString()
file.writeString('Hello File#writeString!')
```

Common methods: `readString()`, `readJson()`, `readObj()`, `readLines()`, `readCsvRows()`, `stream()`, `grep()`, `writeString()`, `write()`, `writeObj()`, `pushStream()`.

For file creation with content, use `File.createFile(url, content, contentType, contentEncoding)`.

## Copy and Move Files

### Single File

`copy` / `move` dest must be a **full file path** (not a directory) and **cannot** equal the source.
`move` requires delete permission on the source.

```javascript
var copied = file.copy('dest/path/file.csv');
var copied = file.copy('s3://other-bucket/dest/file.csv');
var moved = file.move('new/path/renamed.csv');
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
destUrl = c3.FileSystem.mounts()['data-load']
newFile = file.copy(destUrl + 'my-file.txt')
newFile = file.move(destUrl + 'my-file.txt')
```

### Batch (Parallel Arrays)

Source files and dest paths must be parallel arrays of the same length.

```javascript
var copiedFiles = FileSystem.copyFilesBatch(srcFiles, destPaths);
var movedFiles = FileSystem.moveFilesBatch(srcFiles, destPaths);
```

### By Prefix (Bulk)

Copies/moves all files under a prefix, preserving relative paths. Returns count.

```javascript
var count = FileSystem.copyFiles('src/data/', 'dest/data/');
var count = FileSystem.moveFiles('src/old/', 'dest/new/');
```

### Cross-FileSystem Copy

```javascript
var src = FileSystem.s3().makeFile('source/data.csv');
var destUrl = FileSystem.c3().urlFromEncodedPath('dest/data.csv');
src.copy(destUrl);
```

## Delete Files

```javascript
var file = FileSystem.makeFile('my-file.txt');
file.delete();
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
file.delete()
```

**IMPORTANT:** The following APIs require a `confirm` parameter — always prompt the user for confirmation before executing: `deleteFiles`, `truncateFiles`, `truncateMount`, `touchFiles`.

For bulk deletion (`deleteFiles` by prefix, `deleteFilesBatch`), see [references/filesystem-api-reference.md](references/filesystem-api-reference.md).

## File Metadata

```javascript
var file = FileSystem.makeFile('path/file.csv');
file.url; // 's3://bucket/path/file.csv'
file.contentType; // 'text/csv'
file.contentLength; // size in bytes
file.lastModified; // datetime
file.exists(); // boolean
```

For name helpers (`fileName`, `fileExt`, `directoryUrl`), content type checks (`isJson`, `isCsv`, `isParquet`), and mutation methods, see [references/filesystem-api-reference.md](references/filesystem-api-reference.md).

## Mounts

Mounts map logical names to external storage URLs.

| Mount Name      | Purpose                          |
| --------------- | -------------------------------- |
| `'/'` (DEFAULT) | Default mount for tenant/tag     |
| `'data-load'`   | Customer data load files         |
| `'datalake'`    | Default data lake location       |
| `'attachment'`  | File attachments to entity types |
| `'etl'`         | ETL job files                    |
| `'datasets'`    | Commonly used datasets           |

```javascript
var allMounts = FileSystem.mounts();
var url = FileSystem.urlFromMount('data-load');
```

```python
data_load_mount = c3.FileSystem.mounts()['data-load']
```

For mount management (`setMount`, `removeMount`, `truncateMount`, `urlFromMountAndPath`, ACL), see [references/filesystem-api-reference.md](references/filesystem-api-reference.md).

## Upload Files from Local to C3

Use when uploading files from a local machine to a C3 environment.

**Step 1: Get auth token**

```python
sessionToken = c3.User.myUser().sessionToken().signedToken
```

**Step 2: Get API endpoint for each file**

```python
apiEndpoint = c3.FileSystem.makeFile('azure://bucket/path/to/file.json').apiEndpoint('PUT', True)
```

**Step 3: Upload via curl**

IMPORTANT: Do not modify these curl commands.

Use the `file -b --mime-type <local_path>` command to dynamically detect the content type of each file. Inject this detected type into a `-H 'Content-Type: <mime_type>'` header for that specific file.

For 3+ files with curl >= 7.66.0 (parallel):

```bash
curl -Z --parallel-max 4 -X PUT -H 'Authorization: c3auth <sessionToken>' -H 'Content-Type: <file mime type 1>' -T "<local path 1>" "<apiEndpoint 1>" --next -X PUT -H 'Authorization: c3auth <sessionToken>' -H 'Content-Type: <file mime type 2>' -T "<local path 2>" "<apiEndpoint 2>" --next -X PUT -H 'Authorization: c3auth <sessionToken>' -H 'Content-Type: <file mime type 3>' -T "<local path 3>" "<apiEndpoint 3>"
```

and so on. Because the files might have different MIME types, you CANNOT use a single global `-H 'Content-Type...'` flag. You MUST separate each file's specific upload request within the overarching parallel curl command using the `--next` flag.

Single file:

```bash
curl -X PUT -H 'Authorization: c3auth <sessionToken>' -H 'Content-Type: <mime type>' <apiEndpoint> --data-binary @'<local path>'
```

### Python Upload/Download Alternative

```python
# Download
remote_file = c3.FileSystem.makeFile('my-file.txt')
with open("./my-file.txt", "wb") as f:
    c3.FileSystem.downloadFile(f, remote_file.url)

# Upload
remote_file = c3.FileSystem.makeFile('my-file.txt')
with open("./my-file.txt", "rb") as f:
    c3.FileSystem.uploadFile(f, remote_file.url)
```

## Download Files from C3 to Local

Ask the user for the fully qualified file path. Unless specified, download to `test/resource/` under the current app's root package.

**Step 1: Get auth token and API endpoint**

```python
fileUrl = 'provided url'
sessionToken = c3.User.myUser().sessionToken().signedToken
apiEndpoint = c3.FileSystem.makeFile(fileUrl).apiEndpoint('GET', True)
```

**Step 2: Download via curl**

IMPORTANT: Do not modify these curl commands.

For 3+ files with curl >= 7.66.0 (parallel):

```bash
curl -Z -H 'Authorization: c3auth <sessionToken>' --parallel-max 4 "<apiEndpoint 1>" -o "<local dest 1>" "<apiEndpoint 2>" -o "<local dest 2>"
```

Single file:

```bash
curl -H 'Authorization: c3auth <sessionToken>' <apiEndpoint> -o '<local dest path>'
```

## Troubleshooting Credential Issues

> **Note:** If the task involves SourceCollections, data ingestion, or credential errors on a source system, **also read the `c3-data-ingestion` skill**. The full credential troubleshooting workflow — including source system creation, provider-specific credential patterns, and `ping()` diagnostics — lives there. This skill handles the file system mount side; `c3-data-ingestion` handles the source system credential side.

**IMPORTANT:** When encountering authentication or access errors with a file system, always read the `c3-data-ingestion` skill for the full troubleshooting workflow.

Bucket access requires **both**:

1. A **file system mount** pointing to the bucket
2. A **source system** with valid credentials configured

### Step 1: Validate the file system mount

Once the file system type is known, check if a mount exists for the target URL:

```javascript
var fs = FileSystem.s3(); // or appropriate FS type
var mounts = fs.mounts().filter((v, k) => v.startsWith('s3://bucket-name'));
```

If mounts is empty, the mount is not set. Offer to set it and ask the user for a mount name. If they don't specify one, default the mount name to the bucket name.

### Step 2: Ensure a source system exists and set credentials

A source system is required to hold credentials for the bucket. Follow the `c3-data-ingestion` skill's **Connect an external source** workflow and `references/boundaries-and-handoffs.md` credential boundary.

## Additional Resources

- For read/write/compression operations (inherited from Content), refer to the C3 `Content` API documentation
- For detailed File API reference (presigned URLs, locking, batch ops, spec types), see [references/filesystem-api-reference.md](references/filesystem-api-reference.md)
- For real-world code examples, see [references/filesystem-examples.md](references/filesystem-examples.md)
- Use the MCP tool `search_c3_documentation()` with `search_query = "Work With File Systems"` or `"Work With Files"`
