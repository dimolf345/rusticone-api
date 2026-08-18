import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { Writable } from "node:stream";

import express from "express";
import pino from "pino";

import { createLoggingMiddleware } from "./middleware.js";
import { redaction } from "./redactor.js";

test("logs requests with generated request IDs, status levels, and redaction", async () => {
  const records: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      records.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    }
  });
  const testLogger = pino({ redact: redaction }, stream);
  const app = express();

  app.use(createLoggingMiddleware(testLogger));
  app.use(express.json());
  app.post("/:status", (request, response) => {
    request.log.info(
      {
        body: request.body,
        payment: { creditCard: "4111111111111111" }
      },
      "Handling request payload"
    );
    response.sendStatus(Number(request.params.status));
  });

  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine test server address");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const generatedIdResponse = await fetch(`${baseUrl}/201`, {
      method: "POST",
      headers: {
        authorization: "Bearer secret-access-token",
        cookie: "session=secret-session",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        password: "secret-password",
        token: "secret-token"
      })
    });
    assert.equal(generatedIdResponse.headers.get("x-correlation-id"), null);
    await generatedIdResponse.text();

    const suppliedId = "client-correlation-id";
    const warningResponse = await fetch(`${baseUrl}/404`, {
      method: "POST",
      headers: { "x-correlation-id": suppliedId }
    });
    assert.equal(warningResponse.headers.get("x-correlation-id"), null);
    await warningResponse.text();

    const errorResponse = await fetch(`${baseUrl}/500`, { method: "POST" });
    await errorResponse.text();
    await setImmediate();

    const completionRecords = records.filter(
      (record) =>
        typeof record.msg === "string" &&
        (record.msg === "request errored" || /^POST \/.* \d{3} - \d+ms$/.test(record.msg))
    );
    assert.deepEqual(completionRecords.map((record) => record.level), [30, 30, 30]);
    assert.deepEqual(
      completionRecords.map(
        (record) => record.req && (record.req as Record<string, unknown>).id
      ),
      [1, 2, 3]
    );

    const serializedRecords = JSON.stringify(records);
    assert.doesNotMatch(
      serializedRecords,
      /secret-access-token|secret-session/
    );
    assert.doesNotMatch(
      serializedRecords,
      /secret-password|secret-token|4111111111111111/
    );
    assert.match(serializedRecords, /\[REDACTED\]/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
