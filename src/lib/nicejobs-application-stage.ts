export function applicationStage(status: string) {
  if (status === "DRAFT") return "Draft";
  if (status === "REJECTED") return "Declined";
  if (status === "CLOSED") return "Closed";
  if (status === "WITHDRAWN") return "Withdrawn";
  if (status === "OFFER_DECLINED") return "Offer declined";
  if (["APPROVED", "OFFER", "OFFER_ACCEPTED"].includes(status)) return "Approved";
  return "Pending";
}
