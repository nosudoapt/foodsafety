import test from "node:test";
import assert from "node:assert/strict";
import {
  TRAINING_AUDIENCE_LABELS,
  trainingAudienceVisible,
  trainingCompletionAllowed,
  trainingReviewerRole,
} from "../src/lib/btb-training";

test("week 4 manager training is hidden from staff and supervisors", () => {
  for (const role of ["staff", "supervisor", "designer"]) {
    assert.equal(trainingAudienceVisible("staff", role), true, role);
    assert.equal(trainingAudienceVisible("manager", role), false, role);
  }
  for (const role of ["manager", "corporate", "owner"]) assert.equal(trainingAudienceVisible("manager", role), true, role);
  assert.equal(trainingAudienceVisible("manager", null), false);
});

test("only managers complete manager training", () => {
  assert.equal(trainingCompletionAllowed("staff", "staff"), true);
  assert.equal(trainingCompletionAllowed("staff", "owner"), true);
  assert.equal(trainingCompletionAllowed("manager", "manager"), true);
  for (const role of ["staff", "supervisor", "corporate", "owner", null]) assert.equal(trainingCompletionAllowed("manager", role), false, String(role));
});

test("manager training is approved by the owner; team training by a manager", () => {
  assert.equal(trainingReviewerRole("staff"), "manager");
  assert.equal(trainingReviewerRole("manager"), "owner");
  assert.match(TRAINING_AUDIENCE_LABELS.manager, /owner approval/);
});
