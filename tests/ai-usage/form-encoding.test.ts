import assert from "node:assert/strict";
import { test } from "node:test";
import { formEncode } from "../../AI Usage/services/form-encoding";

test("encodes OAuth form fields without relying on URLSearchParams", () => {
  assert.equal(
    formEncode({
      client_id: "id with space",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      refresh_token: "a+b/c=",
    }),
    "client_id=id%20with%20space&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&refresh_token=a%2Bb%2Fc%3D",
  );
});
