import assert from "node:assert/strict";
import test from "node:test";
import { balanceState } from "../src/account_lifecycle.js";

test("marks a storefront balance at the trigger as due for recharge", () => {
  assert.equal(balanceState(20, 20), "recharge_due");
  assert.equal(balanceState(20.01, 20), "healthy");
});
