# DateTime API Reference

Method signatures from https://docs.c3.ai/docs/platform/8.9/type/DateTime.
For more information and functionality please search the `DateTime` type via the `search_c3_documentation` MCP tool

## Instance Properties

| Property   | Type       | Description               |
| ---------- | ---------- | ------------------------- |
| `.millis`  | `!int`     | Epoch milliseconds        |
| `.seconds` | `!int`     | Epoch seconds             |
| `.micros`  | `!int`     | Epoch microseconds        |
| `.nanos`   | `double`   | Epoch nanoseconds         |
| `.zone`    | `TimeZone` | Timezone of this DateTime |

## Instance Methods — Arithmetic

| Method             | Returns    | Description             |
| ------------------ | ---------- | ----------------------- |
| `.plusYears(n)`    | `datetime` | Add n years             |
| `.minusYears(n)`   | `datetime` | Subtract n years        |
| `.plusMonths(n)`   | `datetime` | Add n months            |
| `.minusMonths(n)`  | `datetime` | Subtract n months       |
| `.plusWeeks(n)`    | `datetime` | Add n weeks             |
| `.minusWeeks(n)`   | `datetime` | Subtract n weeks        |
| `.plusDays(n)`     | `datetime` | Add n days              |
| `.minusDays(n)`    | `datetime` | Subtract n days         |
| `.plusHours(n)`    | `datetime` | Add n hours             |
| `.minusHours(n)`   | `datetime` | Subtract n hours        |
| `.plusMinutes(n)`  | `datetime` | Add n minutes           |
| `.minusMinutes(n)` | `datetime` | Subtract n minutes      |
| `.plusSeconds(n)`  | `datetime` | Add n seconds           |
| `.minusSeconds(n)` | `datetime` | Subtract n seconds      |
| `.plusMillis(n)`   | `datetime` | Add n milliseconds      |
| `.minusMillis(n)`  | `datetime` | Subtract n milliseconds |

## Instance Methods — Comparison

| Method           | Returns   | Description                               |
| ---------------- | --------- | ----------------------------------------- |
| `.isAfter(dt)`   | `boolean` | True if this is after dt                  |
| `.isBefore(dt)`  | `boolean` | True if this is before dt                 |
| `.isAfterNow()`  | `boolean` | Shorthand for `.isAfter(DateTime.now())`  |
| `.isBeforeNow()` | `boolean` | Shorthand for `.isBefore(DateTime.now())` |
| `.isEqual(dt)`   | `boolean` | Equality check                            |
| `.compareTo(dt)` | `int`     | Standard compare: -1 / 0 / 1              |

## Instance Methods — Field Access

| Method              | Returns | Description                 |
| ------------------- | ------- | --------------------------- |
| `.year()`           | `int`   | Year                        |
| `.monthOfYear()`    | `int`   | Month (1–12)                |
| `.dayOfMonth()`     | `int`   | Day of month (1–31)         |
| `.dayOfWeek()`      | `int`   | Day of week (1=Mon, 7=Sun)  |
| `.hourOfDay()`      | `int`   | Hour (0–23)                 |
| `.minuteOfHour()`   | `int`   | Minute (0–59)               |
| `.secondOfMinute()` | `int`   | Second (0–59)               |
| `.millisOfDay()`    | `int`   | Milliseconds since midnight |

## Instance Methods — Formatting & Conversion

| Method                 | Returns  | Description                                                          |
| ---------------------- | -------- | -------------------------------------------------------------------- |
| `.toString()`          | `string` | Full ISO 8601 string                                                 |
| `.toStringNoMillis()`  | `string` | ISO 8601 without milliseconds                                        |
| `.toStringNo0Millis()` | `string` | ISO 8601, omits millis if zero                                       |
| `.format(pattern)`     | `string` | Format using DateTimeFormat pattern                                  |
| `.toNative()`          | native   | JS `Date` / Python `datetime` — use only for bridging to non-C3 code |

> ⚠️ `.toNative()` converts to a native date object. Only use it when explicitly bridging to a non-C3 library. Never use it as a substitute for C3's DateTime API.

## Instance Methods — Timezone

| Method                          | Returns    | Description                     |
| ------------------------------- | ---------- | ------------------------------- |
| `.withZoneUtc()`                | `datetime` | Convert to UTC                  |
| `.withZoneOffset(offsetMillis)` | `datetime` | Apply UTC offset                |
| `.withoutZone()`                | `datetime` | Remove timezone info            |
| `.hasZone()`                    | `boolean`  | True if timezone is set         |
| `.zoneOffsetMillis(dt)`         | `int32`    | Offset from UTC in milliseconds |
| `.withTimeAtStartOfDay()`       | `datetime` | Midnight of the same day        |

## Static Methods

| Method                        | Returns    | Description                             |
| ----------------------------- | ---------- | --------------------------------------- |
| `DateTime.now()`              | `datetime` | Current time with timezone              |
| `DateTime.nowNoZone()`        | `datetime` | Current time without timezone           |
| `DateTime.nowWithMillis()`    | `datetime` | Current time with millisecond precision |
| `DateTime.fromString(s)`      | `datetime` | Parse ISO 8601 string                   |
| `DateTime.fromMillis(ms)`     | `datetime` | From epoch milliseconds                 |
| `DateTime.fromMillisUtc(ms)`  | `datetime` | From epoch ms, forced to UTC            |
| `DateTime.fromNanos(ns)`      | `datetime` | From epoch nanoseconds                  |
| `DateTime.fromMicros(us)`     | `datetime` | From epoch microseconds                 |
| `DateTime.deltaSeconds(a, b)` | `double`   | Time difference in seconds (b - a)      |
| `DateTime.deltaMillis(a, b)`  | `double`   | Time difference in milliseconds (b - a) |
| `DateTime.deltaMicros(a, b)`  | `double`   | Time difference in microseconds (b - a) |
| `DateTime.max(a, b)`          | `datetime` | Later of two datetimes                  |
| `DateTime.min(a, b)`          | `datetime` | Earlier of two datetimes                |

## There is significantly more `DateTime` functionality, search the `DateTime` type via the `search_c3_documentation` MCP tool

## DateTimeFormat API

Use `DateTimeFormat` for parsing and formatting with custom pattern strings.

```js
// Infer format pattern from a sample string
var fmt = DateTimeFormat.infer('13-07-29 06:35:40');
// Returns: "yy-MM-dd HH:mm:ss"

// Parse using a known format
var dtFmt = DateTimeFormat.fromString('yyyy-MM-dd HH:mm:ss');
var dt = dtFmt.parse('2024-01-15 10:30:00');

// Check if format includes timezone
var hasZone = dtFmt.hasTimeZone(); // true if 'z' or 'Z' in pattern
```

### Format Symbol Reference

text.SimpleDateFormat` except timezone names cannot be parsed.

| Symbol | Meaning                     | Presentation | Example                                         |
| ------ | --------------------------- | ------------ | ----------------------------------------------- |
| `G`    | Era                         | text         | `AD`                                            |
| `C`    | Century of era (>=0)        | number       | `20`                                            |
| `Y`    | Year of era (>=0)           | year         | `1996`                                          |
| `y`    | Year                        | year         | `1996`                                          |
| `x`    | Weekyear                    | year         | `1996`                                          |
| `w`    | Week of weekyear            | number       | `27`                                            |
| `D`    | Day of year                 | number       | `189`                                           |
| `M`    | Month of year               | month        | `July`; `Jul`; `07`                             |
| `d`    | Day of month                | number       | `10`                                            |
| `e`    | Day of week                 | number       | `2`                                             |
| `E`    | Day of week                 | text         | `Tuesday`; `Tue`                                |
| `a`    | Halfday of day              | text         | `PM`                                            |
| `K`    | Hour of halfday (0–11)      | number       | `0`                                             |
| `h`    | Clockhour of halfday (1–12) | number       | `12`                                            |
| `H`    | Hour of day (0–23)          | number       | `0`                                             |
| `k`    | Clockhour of day (1–24)     | number       | `24`                                            |
| `m`    | Minute of hour              | number       | `30`                                            |
| `s`    | Second of minute            | number       | `55`                                            |
| `S`    | Fraction of second          | number       | `978`                                           |
| `z`    | Time zone name              | text         | `Pacific Standard Time`; `PST`                  |
| `Z`    | Time zone offset/id         | zone         | `-0800`; `-08:00`; `America/Los_Angeles` (ZZZ+) |

---

## TimeZone API

Supported zones: `TimeZone.NONE` (logical time, no zone info), `TimeZone.UTC`, any offset string (e.g. `"GMT-07:00"`, `"-07:00"`), or any IANA id (e.g. `"America/Los_Angeles"`).

```js
// Create timezone from an IANA identifier or offset string
var tz = TimeZone.fromString('America/Los_Angeles');
var utc = TimeZone.fromString('UTC');

// Convert: adjusts the instant, preserving the same point in time
var converted = tz.convert(myDateTime);

// Replace: keeps date/time fields identical, just swaps the zone label
var replaced = tz.replace(myDateTime);
// Example: replace("2010-01-01T12:12:12-08:00") with offset -07:00
//       => "2010-01-01T12:12:12-07:00"

// Get UTC offset in milliseconds at a specific datetime (DST-aware)
var offsetMs = tz.offsetMillis(myDateTime);

// Check zone mode
tz.isUtc(); // true if UTC
tz.isNone(); // true if timezone-free (logical time, e.g. "2010-01-01T00:00:00")
tz.isOffset(); // true if a fixed offset zone
tz.isId(); // true if an IANA id zone

// List all valid IANA timezone IDs
var ids = TimeZone.listIds(); // returns set<string>
```

---

## Genai.DateTimeGranularityFormat Constants

Standard format strings for common time granularities (used in GenAI and reporting contexts):

| Granularity | Format String         |
| ----------- | --------------------- |
| `seconds`   | `'%Y-%m-%d %H:%M:%S'` |
| `minutes`   | `'%Y-%m-%d %H:%M:00'` |
| `hours`     | `'%Y-%m-%d %H:00:00'` |
| `days`      | `'%Y-%m-%d 00:00:00'` |
| `weeks`     | `'%Y-%m-%d 00:00:00'` |
| `months`    | `'%Y-%m-01 00:00:00'` |
| `years`     | `'%Y-01-01 00:00:00'` |
