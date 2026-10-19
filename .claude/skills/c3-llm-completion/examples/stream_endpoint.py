# Backend for a stream<string> endpoint.
#
# Declare the C3 type method as a MEMBER function returning stream<string>. If the model's native
# runtime is installed, PIN the method to it so completion(stream=True) yields real provider chunks:
#     streamAnalysis: member function(): stream<string> py-vertexai_litellm_312-server-py4j
# Otherwise declare it against a stock runtime (`... : stream<string> py`) and use the portable
# stdlib generator path shown in _stream_tokens.
#
# WIRE CONTRACT (see references/streaming.md — this is the #1 source of streaming bugs):
# The C3 stream<string> transport JSON-encodes each string you yield AND appends the NDJSON "\n"
# framing itself. So the generator yields RAW, already-decoded text (`yield delta`) exactly once.
#   * Do NOT json.dumps() what you yield — that double-encodes and leaks literal quotes into the UI.
#   * Do NOT yield a metadata/error OBJECT — a stream<string> only carries strings; an object gets
#     stringified and collides with your first token. Run status and error detail belong on the
#     PERSISTED ENTITY (write them in `finally`); the client reads them back after the stream ends.
# Persisting the full answer only in `finally` keeps the DB write atomic and still runs if the
# client disconnects mid-stream.


def _generate(this, question, settings):
    """Yield raw token deltas as the provider produces them; persist once when exhausted.

    No metadata line, no json.dumps — just the plain token text. The full answer and terminal
    status are written to the entity in `finally`, so the client reads status/errors from the
    persisted entity rather than from the stream.
    """
    chunks = []
    error_message = None
    try:
        for tok in _stream_tokens(question, settings):
            if tok:
                chunks.append(tok)
                yield tok                       # RAW text — the transport JSON-encodes + frames it
    except Exception as e:                       # noqa: BLE001 - record any provider error on the run
        error_message = str(e)
    finally:
        _save_answer(this, "".join(chunks), error_message)


def streamAnalysis(this, question, settings):
    """Return a c3.Stream of NDJSON lines produced by the token generator."""
    gen = _generate(this, question, settings)
    return c3.Stream.make(c3.PrimitiveType.ofStr(), lambda: next(gen, None))


def _stream_tokens(question, settings):
    """Yield token strings as the provider produces them.

    Pinned-native approach (method pinned to the model's runtime in the .c3typ):
        client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("claude_4.5_sonnet")
        for chunk in client.completion(messages=..., options={"stream": True}):
            yield _delta_text(chunk)             # extract choices[0].delta.content, tolerate shapes

    Portable stdlib approach (stock runtime): open an http.client.HTTPSConnection to the provider
    with the streaming flag set, readline() the `data:` SSE lines, and yield each delta's text. This
    needs only Python stdlib plus the genaiPlatform types — no provider-pinned custom runtime.
    """
    raise NotImplementedError("Implement provider streaming here; see references/streaming.md")


def _save_answer(this, full_text, error_message):
    """Persist the fully-assembled answer + terminal status once, after the stream is exhausted."""
    raise NotImplementedError("Persist full_text and status (Completed/Error, errorMessage) here")
