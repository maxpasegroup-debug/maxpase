import { describe, expect, it } from "vitest";
import { participantEntry } from "@/lib/participant-navigation";

describe("Shared corporate and portal participant entry routing", () => {
  it("opens authorized trainees on Today without production-work authority", () => {
    expect(participantEntry(false, true)).toBe("TRAINING");
    expect(participantEntry(false, true, "my-day")).toBe("TRAINING");
    for (const view of ["my-work", "worker-reports", "worker-wallet", "worker-resources", "worker-help"]) expect(participantEntry(false, true, view)).toBe("PENDING");
  });
  it("leaves activated worker views and wallets with the existing authorized services", () => {
    for (const view of [undefined, "my-day", "my-work", "worker-wallet"]) expect(participantEntry(true, true, view)).toBeNull();
  });
  it("does not admit unauthorized candidates or intercept management views", () => {
    expect(participantEntry(false, false)).toBeNull();
    for (const view of ["onboarding", "applications", "finance-wallets", "activation"]) expect(participantEntry(false, true, view)).toBeNull();
  });
});
