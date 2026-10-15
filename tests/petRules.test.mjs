// tests/petRules.test.mjs - run: node --test tests/petRules.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { petCharges } from "../lib/petRules.js";

const EMPTY = { pet_fee: null, pet_deposit: null, pet_rent_monthly: null };
const SET = { pet_fee: 100, pet_deposit: 250, pet_rent_monthly: 30 };

test("empty settings charge nothing, even for a pet", () => {
    const r = petCharges(EMPTY, { status: "pet" });
    assert.equal(r.allowed, false);
    assert.deepEqual(r.charges, []);
});
test("service animal is never charged, even with amounts set", () => {
    assert.deepEqual(petCharges(SET, { status: "service_trained" }).charges, []);
});
test("assistance animal (ESA) is blocked", () => {
    assert.deepEqual(petCharges(SET, { status: "esa_untrained" }).charges, []);
});
test("pending accommodation request is never charged", () => {
    assert.deepEqual(petCharges(SET, { status: "request_pending" }).charges, []);
});
test("pet with amounts set gets exactly those amounts", () => {
    assert.deepEqual(petCharges(SET, { status: "pet" }).charges, [
        { type: "pet_fee", amount: 100 },
        { type: "pet_deposit", amount: 250 },
        { type: "pet_rent_monthly", amount: 30 },
    ]);
});
test("only the amounts that are set are charged", () => {
    assert.deepEqual(petCharges({ pet_rent_monthly: 30 }, { status: "pet" }).charges, [
        { type: "pet_rent_monthly", amount: 30 },
    ]);
});
test("no pet fee or deposit mid-lease", () => {
    const r = petCharges({ pet_fee: 100, pet_deposit: 250 }, { status: "pet" }, { midLease: true });
    assert.deepEqual(r.charges, []);
    assert.match(r.reason, /mid-lease/);
});
test("zero, negative or junk amounts count as not set", () => {
    assert.deepEqual(petCharges({ pet_fee: 0, pet_deposit: -5, pet_rent_monthly: "abc" }, { status: "pet" }).charges, []);
});
test("unknown status charges nothing", () => {
    assert.deepEqual(petCharges(SET, { status: "horse" }).charges, []);
});
