import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { Writable } from "node:stream";

import express from "express";
import pino from "pino";

import { createLoggingMiddleware } from "./middleware.js";
import { redaction } from "./redactor.js";

test("logs requests with correlation IDs, status levels, and redaction", async () => {
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
    const generatedId = generatedIdResponse.headers.get("x-correlation-id");
    assert.match(generatedId ?? "", /^[0-9a-f-]{36}$/i);
    await generatedIdResponse.text();

    const suppliedId = "client-correlation-id";
    const warningResponse = await fetch(`${baseUrl}/404`, {
      method: "POST",
      headers: { "x-correlation-id": suppliedId }
    });
    assert.equal(warningResponse.headers.get("x-correlation-id"), suppliedId);
    await warningResponse.text();

    const errorResponse = await fetch(`${baseUrl}/500`, { method: "POST" });
    await errorResponse.text();
    await setImmediate();

    const completionRecords = records.filter(
      (record) =>
        record.msg === "request completed" || record.msg === "request errored"
    );
    assert.deepEqual(
      completionRecords.map((record) => record.level),
      [30, 40, 50]
    );
    assert.equal(completionRecords[1]?.correlationId, suppliedId);

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
