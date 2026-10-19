# C3 Filesystem Examples

## Real-world examples from the c3 codebase.

## List Files

### Basic List Files

```javascript
// List all files at a path
var result = FileSystem.listFiles();
console.log(result.files);

// List files with path and depth
allFiles = FileSystem.listFiles(FileSystem.mountUrl('/')).files;
```

```python
result = c3.FileSystem.listFiles()
[r for r in result.files]

# Count files at a path
def count_files_in_c3fs(path: str) -> int:
    return len(c3.FileSystem.listFiles(path).files)
```

### List Files with Filtering

```javascript
// Remove stale files older than 12 hours
function removeStaleFiles() {
  var cutoffTimestamp = DateTime.now().minusHours(12);
  FileSystem.listFiles(`${CodeAnalytics.VersionDiff.FileManager.TEMP_DIRECTORY}`)
    .files.filter((file) => {
      return file.lastModified?.isBefore(cutoffTimestamp);
    })
    .each((file) => {
      file.delete();
    });
}
```

### Helper Functions

```javascript
function listFilesAtPath(path) {
  return FileSystem.listFiles(path).files;
}

function getFileEndpoint(filePath) {
  return FileSystem.listFiles(filePath).files[0].apiEndpoint();
}

function getFileLastUpdated(filePath) {
  return FileSystem.listFiles(filePath).files[0].lastModified;
}
```

---

## List Directories

```javascript
// Ping test using listDirsStream
function ping(_credentials) {
  var reachable = false;
  var errorMsg = '';

  try {
    FileSystem.listDirsStream(FileSystem.mounts().get(FileSystemMount.DATA_LOAD), 1);
    reachable = true;
  } catch (e) {
    errorMsg = e;
  }
  return { reachable: reachable, errorMsg: errorMsg };
}

// List directories with depth
var dataLoadMount = FileSystem.mounts().get('data-load');
var stream = FileSystem.listDirsStream(dataLoadMount, -1);
var directories = stream.collect();
```

```python
dataLoadMount = c3.FileSystem.mounts()['data-load']
stream = c3.FileSystem.listDirsStream(dataLoadMount, -1)
directories = stream.collect()
```

---

## Make File

### Basic File Creation

```javascript
// Create temp zip file
function tempZipFileForPkgVersion(rootPkgName, semanticVersion) {
  var tmpDirectory = `${CodeAnalytics.VersionDiff.FileManager.TEMP_DIRECTORY}/${Uuid.create()}`;
  return FileSystem.makeFile(`${tmpDirectory}/${rootPkgName}__${semanticVersion}.zip`);
}
```

```python
# Create file and write content in one line
c3.FileSystem.makeFile(fsc.inboxUrl() + FILE_NAME).writeString(csv_content)
```

---

## Read Files

```javascript
// Read first 100 characters
var file = FileSystem.makeFile('my-file.txt');
console.log(file.readString(0, 100));

// Read entire file content
var currentContent = file.readString();

// Read JSON lines from file (from CodinatorAppManager.js)
var fileContentMap = testContentMapFile.readJsonLines().collect()[0];
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
print(file.readString(0, 100))

# Read file contents
file_contents = file_contents_obj.readString()
```

---

## Write Files

### Basic Write

```javascript
var testContentMapFile = FileSystem.makeFile(testContentMapFileName);
testContentMapFile.writeString(Jsn.stringify(testContentMap));
```

```python
SYSTEM_NAME = "MyDataSystem"
COLLECTION_NAME = "MyCollection"
FILE_NAME = "data.csv"
csv_content = """id,name,value
1,Item A,100
2,Item B,200"""

source_system = c3.FileSourceSystem(name=SYSTEM_NAME).upsert()
fsc = c3.FileSourceCollection(name=COLLECTION_NAME, sourceSystem=source_system).upsert()
c3.FileSystem.makeFile(fsc.inboxUrl() + FILE_NAME).writeString(csv_content)
```

### Write to File Helper

```javascript
function writeToFile(fileName, content) {
  FileSystem.makeFile(fileName).writeString(content);
}
```

### Append Content to File

```javascript
function addFileContent(fileUrl, newContent) {
  var file = C3.File.make(fileUrl);
  var currentContent = file.readString();
  file.writeString(currentContent + newContent);
  return file;
}
```

### Add File to Source Collection

```javascript
function addFileToCollection(fileName, content, sourceCollection) {
  var fileSourceCollection = FileSourceCollection.forName(sourceCollection.name);
  var fileUrl = fileSourceCollection.inboxUrl() + fileName;

  SourceFile.syncFileMetadata(
    C3.File.make(
      {
        url: fileUrl,
        contentType: 'text/csv;',
      },
      true
    ).writeString(content, {
      retryOnNotFound: true,
    })
  );

  return true;
}
```

---

## Copy Files

```javascript
var file = FileSystem.makeFile('my-file.txt');
var destUrl = FileSystem.mounts().get('data-load');
var newFile = file.copy(destUrl + 'my-file.txt');
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
destUrl = c3.FileSystem.mounts()['data-load']
newFile = file.copy(destUrl + 'my-file.txt')
```

---

## Move Files

```javascript
file.move(<destinationUrl>)

var file = FileSystem.makeFile('my-file.txt');
var destUrl = FileSystem.mounts().get('data-load');
var newFile = file.move(destUrl + 'my-file.txt');
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
destUrl = c3.FileSystem.mounts()['data-load']
newFile = file.move(destUrl + 'my-file.txt')
```

---

## Delete Files

### Delete Single File

```javascript
file.delete();

// Delete file at path
function deleteFileAtPath(path) {
  FileSystem.listFiles(path).files[0].delete();
}
```

```python
file = c3.FileSystem.makeFile('my-file.txt')
file.delete()
```

### Delete Files in Batch

```javascript
// Delete all files in FileSystem
allFiles = FileSystem.listFiles().files;
FileSystem.deleteFilesBatch(allFiles, {});
```

```python
def clearFileSystem(cls):
    startTime = time.time()
    try:
        log.debug("Removing files from File System")
        allFiles = c3.FileSystem.listFiles().files
        c3.FileSystem.deleteFilesBatch(allFiles, {})
        log.debug(f"Time taken for clearing File Source: {time.time() - startTime}")
    except Exception as e:
        log.error(f"Error removing files from File System.\nError: {e}")

# Delete hidden files (starting with .)
files_to_remove = []
for file in rootFiles.files:
    splitFileName = file.url.split("/")
    if splitFileName[-1].startswith("."):
        files_to_remove.append(file)

c3.FileSystem.deleteFilesBatch(files_to_remove)
```

---

## Upload and Download Files (Python)

### Download Remote File

```python
remote_file = c3.FileSystem.makeFile('my-file.txt')
local_file_path = "./my-file.txt"
with open(local_file_path, "wb") as f:
    c3.FileSystem.downloadFile(f, remote_file.url)
```

### Upload Local File

```python
local_file_path = "./my-file.txt"
with open(local_file_path, "w") as f:
    f.write('Hello FileSystem#uploadFile!')

remote_file = c3.FileSystem.makeFile('my-file.txt')
with open(local_file_path, "rb") as f:
    c3.FileSystem.uploadFile(f, remote_file.url)
```

### Upload with StringIO

```python
from io import StringIO
import json

def _save_output(output):
    """Save output to etl mount."""
    etl_path = c3.FileSystem.mounts().get("etl")
    if etl_path:
        file_path = etl_path + "/<Domain>Output.json"
        c3_file = c3.FileSystem.makeFile(file_path)
        c3.FileSystem.uploadFile(StringIO(json.dumps(output, indent=2)), c3_file)
```

---

## Directory Operations

### Create Directory

```javascript
function tempUploadEndpoint() {
  var tmpDirectory = `${CodeAnalytics.VersionDiff.FileManager.TEMP_DIRECTORY}/${Uuid.create()}`;
  FileSystem.createDir(tmpDirectory);
  return ApiUrl.forFile(tmpDirectory);
}
```

```python
# Create directory for seed data
LocalFileSystem.createDir(path)
```

---

## Working with Mounts

```javascript
// Get mount URL
var mountUrl = FileSystem.mounts().get('/');
var dataLoadMount = FileSystem.mounts().get('data-load');
var etlMount = FileSystem.mounts().get('etl');

// Build URL from mount and path
var url = FileSystem.urlFromMountAndRelativeEncodedPath('datasets', 'path/to/file');
```

```python
mount_url = c3.FileSystem.mounts().get('/')
data_load_mount = c3.FileSystem.mounts()['data-load']
etl_path = c3.FileSystem.mounts().get("etl")
```

---

## Complete Workflow Examples

### Data Loading Workflow

```python
SYSTEM_NAME = "MyDataSystem"
COLLECTION_NAME = "MyCollection"
FILE_NAME = "data.csv"
csv_content = """id,name,value
1,Item A,100"""

# Step 1: Create source system and collection
source_system = c3.FileSourceSystem(name=SYSTEM_NAME).upsert()
fsc = c3.FileSourceCollection(name=COLLECTION_NAME, sourceSystem=source_system).upsert()

# Step 2: Upload file
c3.FileSystem.makeFile(fsc.inboxUrl() + FILE_NAME).writeString(csv_content)

# Step 3: Sync files
c3.SourceFile.syncAll(fsc.inboxUrl(), {"process": False})
```

### Test File Management

```javascript
// Setup - create test file
beforeAll(function () {
  this.file = FileSystem.makeFile('testFile.txt');
  this.file.writeString('test content');
});

// Teardown - delete test file
afterAll(function () {
  this.file.delete();
});
```
